/**
 * Key-Model Availability Manager
 *
 * Core service for managing model availability per API key.
 * Implements data-driven retry logic, priority-based selection,
 * and background validation without blocking the request path.
 *
 * IMPORTANT: All state changes MUST go through ModelStateMachine.transition()
 */

import { db } from "../../db";
import {
  AIProviderId,
  VerifiedModelMetadata,
  ModelState,
  ModelPriority,
  ModelCapability,
} from "../../models/types";
import { ModelStateMachine } from "./state-machine";
import {
  calculateRetry,
} from "./retry-strategy";
import { safetyGuard } from "../safety";
import { availabilityCache } from "./availability.cache";

// ============================================
// MODEL PRIORITY CONFIGURATION
// ============================================

/**
 * Model priority assignments by model ID pattern.
 * Higher priority = tried first, retried sooner.
 */
const MODEL_PRIORITY_PATTERNS: Array<{
  pattern: RegExp;
  priority: ModelPriority;
}> = [
    // Priority 5: Flagship models
    { pattern: /gpt-4\.5/, priority: 5 },
    { pattern: /gpt-4o(?!-mini)/, priority: 5 },
    { pattern: /claude-3-5-sonnet/, priority: 5 },
    { pattern: /gemini-2\.5-pro/, priority: 5 },
    { pattern: /o1(?!-mini)/, priority: 5 },
    { pattern: /o3(?!-mini)/, priority: 5 },

    // Priority 4: Strong models
    { pattern: /o3-mini/, priority: 4 },
    { pattern: /gpt-4-turbo/, priority: 4 },
    { pattern: /claude-3-opus/, priority: 4 },
    { pattern: /gemini-2\.0-flash/, priority: 4 },
    { pattern: /gemini-1\.5-pro/, priority: 4 },

    // Priority 3: Good everyday models
    { pattern: /gpt-4o-mini/, priority: 3 },
    { pattern: /gpt-3\.5-turbo/, priority: 3 },
    { pattern: /claude-3-haiku/, priority: 3 },
    { pattern: /gemini-2\.5-flash/, priority: 3 },
    { pattern: /gemini-1\.5-flash/, priority: 3 },

    // Priority 2: Lightweight/experimental
    { pattern: /o1-mini/, priority: 2 },
    { pattern: /gemini-2\.0-flash-lite/, priority: 2 },
    { pattern: /gemma/, priority: 2 },

    // Priority 1: Specialized/legacy (default)
  ];

// ============================================
// TYPES
// ============================================

export interface ModelFilter {
  provider?: string;
  capabilities?: ModelCapability[];
  priority?: number;
}

// ============================================
// AVAILABILITY MANAGER CLASS
// ============================================

export class KeyModelAvailabilityManager {
  private updateListeners: Array<() => void> = [];

  /**
   * Subscribe to general status updates
   */
  onUpdate(callback: () => void): () => void {
    this.updateListeners.push(callback);
    return () => {
      this.updateListeners = this.updateListeners.filter((l) => l !== callback);
    };
  }

  private emitUpdate(): void {
    this.updateListeners.forEach((l) => l());
  }

  /**
   * Get model priority based on model ID patterns.
   */
  getModelPriority(modelId: string): ModelPriority {
    for (const { pattern, priority } of MODEL_PRIORITY_PATTERNS) {
      if (pattern.test(modelId)) {
        return priority;
      }
    }
    return 1; // Default lowest priority
  }

  /**
   * Get cached metadata for a specific model
   */
  async getModelMetadata(
    keyId: string,
    modelId: string,
  ): Promise<VerifiedModelMetadata | undefined> {
    return db.modelCache.get([modelId, keyId]);
  }

  // ============================================
  // RE-VALIDATION LOGIC
  // ============================================

  /**
   * Triggers a re-validation for a specific model key pair.
   * This is called by the UI or manually to force a check.
   */
  async triggerModelRevalidation(
    keyId: string,
    modelId: string,
  ): Promise<void> {
    // 1. Mark as checking to provide immediate UI feedback
    await db.modelCache.update([modelId, keyId], {
      state: "CHECKING",
      nextRetryAt: null, // Clear it so it doesn't get picked up by periodic jobs while we're checking
      lastCheckedAt: Date.now(),
    });

    try {
      // 2. Clear any circuit breakers for this key
      safetyGuard.recordKeySuccess(keyId);

      // 3. The actual check should be performed by the validator service
      // to avoid duplicate logic and circular dependencies.
      const { validatorService } =
        await import("../validation/validator.service");
      await validatorService.queueValidation(keyId, 2); // Priority 2 = High (User triggered)
    } catch (e) {
      console.error(
        `[Availability] Manual revalidation failed for ${modelId}:`,
        e,
      );
      // If we failed to even trigger it, move back to failure state after some time
      await this.handleRuntimeError(
        keyId,
        modelId,
        500,
        "Revalidation trigger failed",
      );
    }
  }

  // ============================================
  // KEY LIFECYCLE: Adding new keys
  // ============================================

  /**
   * Initialize model entries for a new key.
   * Called when a key is first added to the vault.
   */
  async initializeKeyModels(
    keyId: string,
    providerId: AIProviderId,
    candidateModels: string[],
  ): Promise<void> {
    const now = Date.now();
    // Get existing models to avoid overwriting current status
    const existing = await db.modelCache.where("keyId").equals(keyId).toArray();
    const existingMap = new Map(existing.map((m) => [m.modelId, m]));

    const entries: VerifiedModelMetadata[] = candidateModels.map((modelId) => {
      const current = existingMap.get(modelId);
      if (current) return current; // Keep existing status

      return {
        modelId,
        providerId,
        keyId,
        isAvailable: false,
        state: "NEW" as ModelState,
        lastCheckedAt: 0,
        modelPriority: this.getModelPriority(modelId),
        retryCount: 0,
        nextRetryAt: now,
      };
    });

    await db.modelCache.bulkPut(entries);
    console.log(
      `[Availability] Initialized ${entries.length} model entries for key ${keyId}`,
    );
  }

  /**
   * Delete all model entries for a key.
   * Called when a key is deleted from the vault.
   */
  async deleteKeyModels(keyId: string): Promise<number> {
    if (!keyId) return 0;
    const count = await db.modelCache.where("keyId").equals(keyId).delete();
    console.log(
      `[Availability] Deleted ${count} model entries for key ${keyId}`,
    );
    return count;
  }

  // ============================================
  // RUNTIME: Model selection
  // ============================================

  /**
   * Get the best available model for a provider.
   * Filters by availability, quota, and safety guards. Sorts by priority.
   */
  async getBestAvailableModel(
    providerId: AIProviderId,
    excludeKeyIds: string[] = [],
    requiredCapabilities?: string[],
  ): Promise<VerifiedModelMetadata | null> {
    // Safety check: Is provider disabled or circuit open?
    if (safetyGuard.isProviderDisabled(providerId)) {
      console.log(
        `[Availability] Provider ${providerId} is disabled, skipping`,
      );
      return null;
    }
    if (safetyGuard.isProviderCircuitOpen(providerId)) {
      console.log(
        `[Availability] Provider ${providerId} circuit is OPEN, skipping`,
      );
      return null;
    }

    // Check forced fallback
    const fallback = safetyGuard.getForcedFallback();
    if (fallback && (!fallback.provider || fallback.provider === providerId)) {
      // Find the forced model
      const forced = await db.modelCache
        .where("modelId")
        .equals(fallback.model)
        .first();
      if (forced) {
        console.log(`[Availability] Using forced fallback: ${fallback.model}`);
        return forced;
      }
    }

    const query = db.modelCache
      .where("providerId")
      .equals(providerId)
      .and((m: VerifiedModelMetadata): boolean => {
        // Only AVAILABLE state is usable
        if (!ModelStateMachine.isUsable(m.state)) return false;

        // Check key-level safety
        if (safetyGuard.isKeyDisabled(m.keyId)) return false;
        if (safetyGuard.isKeyCircuitOpen(m.keyId)) return false;

        if (excludeKeyIds.includes(m.keyId)) return false;
        if (m.quotaRemaining !== undefined && m.quotaRemaining <= 0)
          return false;
        // Filter by capabilities if specified
        if (requiredCapabilities && requiredCapabilities.length > 0) {
          if (!m.capabilities) return false;
          if (
            !requiredCapabilities.every((cap) =>
              m.capabilities!.includes(cap as any),
            )
          )
            return false;
        }
        return true;
      });

    const candidates = await query.toArray();

    if (candidates.length === 0) {
      return null;
    }

    // Sort by model priority DESC, then by key priority (via latency as proxy)
    candidates.sort((a, b) => {
      // Higher model priority first
      if (a.modelPriority !== b.modelPriority) {
        return b.modelPriority - a.modelPriority;
      }
      // If same priority, prefer recently successful (lower retry count)
      return a.retryCount - b.retryCount;
    });

    return candidates[0];
  }

  /**
   * Check if a specific model of a key is usable.
   * Checks both state machine status and safety guards.
   */
  async isModelUsable(keyId: string, modelId: string): Promise<boolean> {
    const model = await db.modelCache.get([modelId, keyId]);
    if (!model) return false;

    // 1. Check state machine
    if (!ModelStateMachine.isUsable(model.state)) return false;

    // 2. Check safety guards (Circuit breaker, manual disable)
    if (safetyGuard.isKeyDisabled(keyId)) return false;
    if (safetyGuard.isKeyCircuitOpen(keyId)) return false;

    return true;
  }

  /**
   * Get all available models for a provider (across all keys)
   */
  async getAvailableModels(
    providerId: AIProviderId,
  ): Promise<VerifiedModelMetadata[]> {
    return db.modelCache
      .where("providerId")
      .equals(providerId)
      .and((m: VerifiedModelMetadata) => m.isAvailable)
      .toArray();
  }

  // ============================================
  // RUNTIME: Error handling
  // ============================================

  /**
   * Handle a runtime error for a (key, model) pair.
   * Uses state machine for proper transitions.
   */
  async handleRuntimeError(
    keyId: string,
    modelId: string,
    errorCode: number,
    errorMessage: string,
  ): Promise<ModelState> {
    const existing = await db.modelCache.get([modelId, keyId]);

    // 1. Detect Rate Limit (429) - Apply to ALL models for this key
    if (errorCode === 429) {
      console.warn(`[Availability] Rate limit detected for ${keyId}. marking ALL models as COOLDOWN.`);

      const retryDecision = calculateRetry(
        429,
        errorMessage,
        existing?.retryCount || 0,
        existing?.modelPriority || 3
      );

      await db.modelCache.where("keyId").equals(keyId).modify({
        isAvailable: false,
        state: "COOLDOWN",
        nextRetryAt: retryDecision.nextRetryAt,
        lastErrorCode: 429,
        errorMessage: retryDecision.reason,
        lastCheckedAt: Date.now(),
      });

      availabilityCache.markUnusable(keyId, "", "COOLDOWN");

      const { vaultService } = await import("../vault/vault.service");
      await vaultService.updateKey(keyId, {
        verificationStatus: "retry_scheduled",
        retryAfter: retryDecision.nextRetryAt || undefined,
      }).catch(() => { });

      return "COOLDOWN";
    }

    if (!existing) {
      console.warn(
        `[Availability] Cannot update non-existent entry: ${keyId}/${modelId}`,
      );
      return "NEW";
    }

    // Record failure to circuit breakers
    safetyGuard.recordKeyFailure(keyId, existing.providerId);
    safetyGuard.recordProviderFailure(existing.providerId);

    // Use smart retry strategy based on error type
    const retryDecision = calculateRetry(
      errorCode,
      errorMessage,
      existing.retryCount,
      existing.modelPriority,
    );

    // Determine new state based on retry decision
    let newState: ModelState = retryDecision.nextState;
    const newRetryCount = existing.retryCount + 1;

    // Transition model status
    await db.modelCache.update([modelId, keyId], {
      isAvailable: false,
      state: newState,
      retryCount: newRetryCount,
      nextRetryAt: retryDecision.nextRetryAt,
      lastErrorCode: errorCode,
      errorMessage: retryDecision.reason, // Include retry reasoning
      lastCheckedAt: Date.now(),
    });

    // Sync Cache
    availabilityCache.markUnusable(keyId, modelId, newState);

    // ============================================
    // FLOW CORRECTNESS: Propagate to Key Status
    // ============================================
    // If we get a fatal error (401/403), we should mark the WHOLE key as invalid
    // so the dashboard reflects reality immediately.
    if (
      newState === "PERM_FAILED" &&
      (errorCode === 401 || errorCode === 403)
    ) {
      const { vaultService } = await import("../vault/vault.service");
      await vaultService.updateKey(keyId, {
        verificationStatus: "invalid",
      });
    }

    console.log(
      `[Availability] ${modelId} -> ${newState} | ${retryDecision.reason}`,
    );

    this.emitUpdate();
    return newState;
  }

  /**
   * Mark a model as successful (AVAILABLE state).
   * Resets retry count and updates state.
   */
  async markModelAvailable(keyId: string, modelId: string): Promise<void> {
    // Record success to circuit breakers
    const existing = await db.modelCache.get([modelId, keyId]);
    if (existing) {
      safetyGuard.recordKeySuccess(keyId);
      safetyGuard.recordProviderSuccess(existing.providerId);
    }

    await db.modelCache.update([modelId, keyId], {
      isAvailable: true,
      state: "AVAILABLE" as ModelState,
      retryCount: 0,
      nextRetryAt: null,
      lastErrorCode: undefined,
      errorMessage: undefined,
      lastCheckedAt: Date.now(),
    });

    if (existing) {
      availabilityCache.markUsable(keyId, modelId, existing.providerId, existing.modelPriority);
    }
    this.emitUpdate();
  }

  // ============================================
  // UTILITIES
  // ============================================

  /**
   * Get all model entries for a specific key (available and unavailable).
   */
  async getModelsForKey(keyId: string): Promise<VerifiedModelMetadata[]> {
    return db.modelCache.where("keyId").equals(keyId).toArray();
  }

  /**
   * Query available models based on rich filters
   */
  async queryAvailableModels(
    filter: ModelFilter,
  ): Promise<VerifiedModelMetadata[]> {
    return db.modelCache
      .filter((m: VerifiedModelMetadata) => {
        if (!m.isAvailable) return false;
        if (filter.provider && m.providerId !== filter.provider) return false;
        if (
          filter.priority !== undefined &&
          (m.modelPriority || 0) < filter.priority
        )
          return false;
        if (filter.capabilities && filter.capabilities.length > 0) {
          const modelCaps = m.capabilities || [];
          return filter.capabilities.every((cap) => modelCaps.includes(cap));
        }
        return true;
      })
      .toArray();
  }

  /**
   * Save or update model metadata
   */
  async saveModelMetadata(metadata: VerifiedModelMetadata): Promise<void> {
    await db.modelCache.put(metadata);
    availabilityCache.requestSync();
    this.emitUpdate();
  }

  /**
   * Batch save model metadata
   */
  async saveModelMetadataBatch(
    metadataList: VerifiedModelMetadata[],
  ): Promise<void> {
    await db.modelCache.bulkPut(metadataList);
    availabilityCache.requestSync();
    this.emitUpdate();
  }

  /**
   * Get models due for retry
   */
  async getModelsDueForRetry(
    limit: number = 50,
  ): Promise<VerifiedModelMetadata[]> {
    const now = Date.now();
    const due = await db.modelCache
      .where("nextRetryAt")
      .belowOrEqual(now)
      .and((m) => !m.isAvailable && !/-\d{10,}$/.test(m.modelId))
      .limit(limit)
      .toArray();

    if (due.length < limit) {
      const unset = await db.modelCache
        .filter(
          (m) =>
            !m.isAvailable &&
            m.nextRetryAt === null &&
            m.state !== "PERM_FAILED" &&
            !!m.keyId &&
            !/-\d{10,}$/.test(m.modelId),
        )
        .limit(limit - due.length)
        .toArray();
      return [...due, ...unset];
    }
    return due;
  }

  /**
   * Clear entire cache
   */
  async clearCache(): Promise<void> {
    await db.modelCache.clear();
    availabilityCache.clear();
  }

  /**
   * Get availability statistics.
   */
  async getStats(): Promise<{
    total: number;
    available: number;
    temporaryFailed: number;
    permanentFailed: number;
    unknown: number;
    byProvider: Record<AIProviderId, { total: number; available: number }>;
  }> {
    const all = await db.modelCache.toArray();

    const stats = {
      total: all.length,
      available: 0,
      temporaryFailed: 0,
      permanentFailed: 0,
      unknown: 0,
      byProvider: {} as Record<string, { total: number; available: number }>,
    };

    for (const model of all) {
      // Count by state (using state machine states)
      switch (model.state) {
        case "AVAILABLE":
          stats.available++;
          break;
        case "TEMP_FAILED":
        case "COOLDOWN":
          stats.temporaryFailed++;
          break;
        case "PERM_FAILED":
          stats.permanentFailed++;
          break;
        case "NEW":
        case "CHECKING":
        default:
          stats.unknown++;
      }

      // Count by provider
      if (!stats.byProvider[model.providerId]) {
        stats.byProvider[model.providerId] = { total: 0, available: 0 };
      }
      stats.byProvider[model.providerId].total++;
      if (model.state === "AVAILABLE") {
        stats.byProvider[model.providerId].available++;
      }
    }

    return stats as {
      total: number;
      available: number;
      temporaryFailed: number;
      permanentFailed: number;
      unknown: number;
      byProvider: Record<AIProviderId, { total: number; available: number }>;
    };
  }
}

export const availabilityManager = new KeyModelAvailabilityManager();
