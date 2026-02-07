import { KeyMetadata, AIProviderId } from "../../models/metadata";

export enum RoutingStrategy {
  PRIORITY = "PRIORITY", // Use highest priority key first
  ROUND_ROBIN = "ROUND_ROBIN", // Distribute load across keys
  LEAST_USED = "LEAST_USED", // Use least used key
  FAILOVER = "FAILOVER", // Primary + fallbacks
}

interface RouterConfig {
  strategy: RoutingStrategy;
  stickyDuration?: number; // How long to stick with a key (ms)
  rotationCooldown?: number; // How long before a rotated-out key can be primary again (ms)
}

interface KeyUsageStats {
  lastUsed: number;
  requestCount: number;
  errorCount: number;
  rateLimitedUntil?: number; // Timestamp when key can be used again
  lastRateLimited?: number; // When key was last rate-limited
}

interface RotationState {
  promotedKeyId: string | null; // Currently promoted key (temporary primary)
  promotedAt: number; // When the key was promoted
  rotatedOutKeyId: string | null; // Key that was rotated out due to rate limit
}

export interface RotationEvent {
  type: "key_rotated_out" | "key_promoted" | "key_restored";
  keyId: string;
  providerId: AIProviderId;
  reason?: "rate_limited" | "error" | "manual";
  retryAfterMs?: number;
}

/**
 * Key Router for Multi-Key Round Robin and Priority Routing
 * Intelligently selects the best key based on strategy and health.
 *
 * NEW: Automatic Key Rotation
 * - When a key is rate-limited, it's automatically deprioritized
 * - A healthy key is "promoted" to act as temporary primary
 * - Original key is restored after cooldown period
 */
export class KeyRouter {
  private config: RouterConfig;
  private usageStats: Map<string, KeyUsageStats> = new Map();
  private roundRobinIndex: Map<string, number> = new Map(); // Per provider

  // Automatic Rotation State
  private rotationState: Map<AIProviderId, RotationState> = new Map();
  private rotationListeners: Array<(event: RotationEvent) => void> = [];

  constructor(config: Partial<RouterConfig> = {}) {
    this.config = {
      strategy: RoutingStrategy.PRIORITY,
      stickyDuration: 60000, // 1 minute default
      rotationCooldown: 300000, // 5 minutes before rotated key can be primary again
      ...config,
    };
  }

  private getStats(keyId: string): KeyUsageStats {
    if (!this.usageStats.has(keyId)) {
      this.usageStats.set(keyId, {
        lastUsed: 0,
        requestCount: 0,
        errorCount: 0,
      });
    }
    return this.usageStats.get(keyId)!;
  }

  /**
   * Subscribe to rotation events
   */
  onRotation(listener: (event: RotationEvent) => void): () => void {
    this.rotationListeners.push(listener);
    return () => {
      this.rotationListeners = this.rotationListeners.filter(
        (l) => l !== listener,
      );
    };
  }

  private emitRotation(event: RotationEvent): void {
    this.rotationListeners.forEach((l) => l(event));
  }

  /**
   * Mark a key as rate-limited and trigger automatic rotation
   */
  markRateLimited(
    keyId: string,
    providerId: AIProviderId,
    retryAfterMs: number,
  ): void {
    const stats = this.getStats(keyId);
    stats.rateLimitedUntil = Date.now() + retryAfterMs;
    stats.lastRateLimited = Date.now();

    // Get current rotation state for this provider
    const currentState = this.rotationState.get(providerId);

    // If this was the promoted key, we need to find another one
    if (currentState?.promotedKeyId === keyId || !currentState?.promotedKeyId) {
      console.log(
        `[KeyRouter] Key ${keyId} rate-limited. Initiating automatic rotation...`,
      );

      // Mark as rotated out
      this.rotationState.set(providerId, {
        promotedKeyId: null, // Will be set by next selectKey call
        promotedAt: 0,
        rotatedOutKeyId: keyId,
      });

      this.emitRotation({
        type: "key_rotated_out",
        keyId,
        providerId,
        reason: "rate_limited",
        retryAfterMs,
      });
    }
  }

  /**
   * Mark a key as healthy (successful request)
   */
  markHealthy(keyId: string, providerId: AIProviderId): void {
    const stats = this.getStats(keyId);

    // Clear rate limit if it was set
    if (stats.rateLimitedUntil && Date.now() >= stats.rateLimitedUntil) {
      stats.rateLimitedUntil = undefined;
    }

    // If no key is currently promoted, promote this one
    const currentState = this.rotationState.get(providerId);
    if (!currentState?.promotedKeyId) {
      this.rotationState.set(providerId, {
        promotedKeyId: keyId,
        promotedAt: Date.now(),
        rotatedOutKeyId: currentState?.rotatedOutKeyId || null,
      });

      console.log(
        `[KeyRouter] Key ${keyId} promoted as primary for ${providerId}`,
      );
      this.emitRotation({
        type: "key_promoted",
        keyId,
        providerId,
      });
    }
  }

  /**
   * Check if automatic rotation should restore the original key
   */
  private checkRotationRecovery(
    providerId: AIProviderId,
    keys: KeyMetadata[],
  ): void {
    const state = this.rotationState.get(providerId);
    if (!state?.rotatedOutKeyId) return;

    const rotatedOutKey = keys.find((k) => k.id === state.rotatedOutKeyId);
    if (!rotatedOutKey) return;

    const stats = this.getStats(state.rotatedOutKeyId);

    // Check if cooldown has passed and key is no longer rate-limited
    const now = Date.now();
    const cooldownPassed =
      !stats.lastRateLimited ||
      now - stats.lastRateLimited >= this.config.rotationCooldown!;
    const notRateLimited =
      !stats.rateLimitedUntil || now >= stats.rateLimitedUntil;

    if (cooldownPassed && notRateLimited) {
      console.log(
        `[KeyRouter] Restoring ${rotatedOutKey.label} as primary for ${providerId} after cooldown`,
      );

      // Clear rotation state - let normal priority selection take over
      this.rotationState.delete(providerId);

      // Clear rate limit tracking
      stats.rateLimitedUntil = undefined;
      stats.lastRateLimited = undefined;

      this.emitRotation({
        type: "key_restored",
        keyId: state.rotatedOutKeyId,
        providerId,
      });
    }
  }

  /**
   * Check if a key is currently rate-limited
   */
  isKeyRateLimited(keyId: string): boolean {
    const stats = this.getStats(keyId);
    if (!stats.rateLimitedUntil) return false;
    return Date.now() < stats.rateLimitedUntil;
  }

  /**
   * Get the currently promoted key for a provider (if any)
   */
  getPromotedKey(providerId: AIProviderId): string | null {
    return this.rotationState.get(providerId)?.promotedKeyId || null;
  }

  /**
   * Get rotation status for a provider
   */
  getRotationStatus(providerId: AIProviderId): RotationState | null {
    return this.rotationState.get(providerId) || null;
  }

  /**
   * Select the best key from available keys based on the routing strategy
   */
  selectKey(
    keys: KeyMetadata[],
    providerId: AIProviderId,
    excludeKeyIds: string[] = [],
    modelId?: string,
  ): KeyMetadata | null {
    // Check if we should restore a previously rotated-out key
    this.checkRotationRecovery(providerId as AIProviderId, keys);

    // Filter out excluded and revoked keys
    let availableKeys = keys.filter(
      (k) =>
        k.providerId === providerId &&
        !k.isRevoked &&
        !excludeKeyIds.includes(k.id),
    );

    // Filter by requested model availability
    if (modelId) {
      availableKeys = availableKeys.filter((k) => {
        // Check legacy simple list
        if (k.verifiedModels?.includes(modelId)) return true;
        // Check new detailed metadata
        if (k.verifiedModelsMeta?.some((m) => m.modelId === modelId))
          return true;
        return false;
      });
    }

    if (availableKeys.length === 0) {
      return null;
    }

    // AUTO-ROTATION: Deprioritize rate-limited keys
    const healthyKeys = availableKeys.filter(
      (k) => !this.isKeyRateLimited(k.id),
    );
    const rateLimitedKeys = availableKeys.filter((k) =>
      this.isKeyRateLimited(k.id),
    );

    // Prefer healthy keys, but keep rate-limited as fallback
    if (healthyKeys.length > 0) {
      availableKeys = healthyKeys;
    } else {
      console.log(
        `[KeyRouter] All ${providerId} keys are rate-limited. Using least-restricted one.`,
      );
      // Sort by shortest remaining cooldown
      availableKeys = rateLimitedKeys.sort((a, b) => {
        const statsA = this.getStats(a.id);
        const statsB = this.getStats(b.id);
        return (statsA.rateLimitedUntil || 0) - (statsB.rateLimitedUntil || 0);
      });
    }

    // Check if there's a promoted key that should be preferred
    const rotationState = this.rotationState.get(providerId as AIProviderId);
    if (rotationState?.promotedKeyId) {
      const promotedKey = availableKeys.find(
        (k) => k.id === rotationState.promotedKeyId,
      );
      if (promotedKey && !this.isKeyRateLimited(promotedKey.id)) {
        return promotedKey;
      }
    }

    switch (this.config.strategy) {
      case RoutingStrategy.PRIORITY:
        return this.selectByPriority(availableKeys, modelId);

      case RoutingStrategy.ROUND_ROBIN:
        return this.selectRoundRobin(availableKeys, providerId);

      case RoutingStrategy.LEAST_USED:
        return this.selectLeastUsed(availableKeys);

      case RoutingStrategy.FAILOVER:
        return this.selectFailover(availableKeys, modelId);

      default:
        return availableKeys[0];
    }
  }

  private selectByPriority(keys: KeyMetadata[], modelId?: string): KeyMetadata {
    // Priority map (lower number = higher priority)
    const priorityMap = { high: 1, medium: 2, low: 3 };

    // Verification status map (lower = better)
    const statusMap = {
      valid: 1,
      testing: 2,
      untested: 3,
      retry_scheduled: 4,
      invalid: 5,
    };

    const sorted = [...keys].sort((a, b) => {
      // 0. Check Verification Status (Critical for reliability)
      const sA = statusMap[a.verificationStatus || "untested"];
      const sB = statusMap[b.verificationStatus || "untested"];
      if (sA !== sB) return sA - sB;

      // 0.5 Check Model Specific Priority (Higher is better)
      if (modelId) {
        const metaA = a.verifiedModelsMeta?.find((m) => m.modelId === modelId);
        const metaB = b.verifiedModelsMeta?.find((m) => m.modelId === modelId);

        // Higher number = higher priority
        const mpA = metaA?.modelPriority || 0;
        const mpB = metaB?.modelPriority || 0;

        if (mpA !== mpB) return mpB - mpA; // Descending
      }

      // 1. Check User-Assigned Priority
      const pA = priorityMap[a.priority || "medium"];
      const pB = priorityMap[b.priority || "medium"];

      if (pA !== pB) return pA - pB;

      // 2. Check Latency (if available) - Prefer faster keys
      const latA = a.averageLatency || 9999;
      const latB = b.averageLatency || 9999;

      // Only compare latency if there's a significant difference (> 50ms)
      if (Math.abs(latA - latB) > 50) return latA - latB;

      // 3. Check Error Rate
      const statsA = this.getStats(a.id);
      const statsB = this.getStats(b.id);
      const errorRateA =
        statsA.requestCount > 0 ? statsA.errorCount / statsA.requestCount : 0;
      const errorRateB =
        statsB.requestCount > 0 ? statsB.errorCount / statsB.requestCount : 0;

      if (errorRateA !== errorRateB) return errorRateA - errorRateB;

      // 4. Load Balancing (Usage Count)
      return (a.usageCount || 0) - (b.usageCount || 0);
    });

    return sorted[0];
  }

  private selectRoundRobin(
    keys: KeyMetadata[],
    providerId: string,
  ): KeyMetadata {
    const currentIndex = this.roundRobinIndex.get(providerId) || 0;
    const nextIndex = (currentIndex + 1) % keys.length;
    this.roundRobinIndex.set(providerId, nextIndex);

    return keys[currentIndex];
  }

  private selectLeastUsed(keys: KeyMetadata[]): KeyMetadata {
    const sorted = [...keys].sort((a, b) => {
      const statsA = this.getStats(a.id);
      const statsB = this.getStats(b.id);
      return statsA.requestCount - statsB.requestCount;
    });

    return sorted[0];
  }

  private selectFailover(keys: KeyMetadata[], modelId?: string): KeyMetadata {
    // Select the key with lowest error rate, falling back to oldest
    return this.selectByPriority(keys, modelId);
  }

  /**
   * Record a successful request for a key
   */
  recordSuccess(keyId: string): void {
    const stats = this.getStats(keyId);
    stats.lastUsed = Date.now();
    stats.requestCount++;
  }

  /**
   * Record a failed request for a key
   */
  recordError(keyId: string): void {
    const stats = this.getStats(keyId);
    stats.lastUsed = Date.now();
    stats.requestCount++;
    stats.errorCount++;
  }

  /**
   * Get usage statistics for a key
   */
  getKeyStats(keyId: string): KeyUsageStats {
    return { ...this.getStats(keyId) };
  }

  /**
   * Reset statistics for all keys
   */
  resetStats(): void {
    this.usageStats.clear();
    this.roundRobinIndex.clear();
  }

  /**
   * Set the routing strategy
   */
  setStrategy(strategy: RoutingStrategy): void {
    this.config.strategy = strategy;
  }
}

export const keyRouter = new KeyRouter();
