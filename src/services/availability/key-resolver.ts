/**
 * Key Resolver Module
 *
 * Fast key selection for the unified LLM client.
 * Provides O(1) key lookup using the availability cache.
 *
 * Main Flow:
 * 1. Check cache for usable models
 * 2. Apply safety guards (disabled providers/keys, circuit breakers)
 * 3. Return best key by priority
 */

import type { AIProviderId, KeyMetadata } from "../../models/types";
import { availabilityCache, type CachedModelState } from "./availability.cache";
import { safetyGuard } from "../safety";
import { vaultService } from "../vault/vault.service";
import { resolveProviderId } from "../../providers";

// ============================================
// TYPES
// ============================================

export interface ResolvedKey {
  keyId: string;
  modelId: string;
  providerId: AIProviderId;
  apiKey: string;
  keyMetadata: KeyMetadata;
}

export interface ResolveOptions {
  providerId?: AIProviderId;
  excludeKeyIds?: string[];
  preferredModelId?: string;
  preferredKeyId?: string; // Support for session stickiness
}

// ============================================
// KEY RESOLVER CLASS
// ============================================

class KeyResolver {
  /**
   * Resolve the best available key for a model request.
   * Uses in-memory cache for speed - O(1) to O(n) where n = usable models.
   */
  async resolve(
    modelIdOrAlias: string,
    options: ResolveOptions = {},
  ): Promise<ResolvedKey | null> {
    // 1. Infer provider from model ID
    const providerId = options.providerId || resolveProviderId(modelIdOrAlias);
    if (!providerId) {
      console.warn(
        `[KeyResolver] Could not infer provider for: ${modelIdOrAlias}`,
      );
      return null;
    }

    // 2. Safety check: Provider disabled or circuit open?
    if (safetyGuard.isProviderDisabled(providerId)) {
      console.log(`[KeyResolver] Provider ${providerId} is disabled`);
      return null;
    }
    if (safetyGuard.isProviderCircuitOpen(providerId)) {
      console.log(`[KeyResolver] Provider ${providerId} circuit is OPEN`);
      return null;
    }

    // 3. Check forced fallback
    const fallback = safetyGuard.getForcedFallback();
    if (fallback && (!fallback.provider || fallback.provider === providerId)) {
      const fallbackResult = await this.findKeyForModel(
        fallback.model,
        providerId,
        options.excludeKeyIds,
      );
      if (fallbackResult) {
        console.log(`[KeyResolver] Using forced fallback: ${fallback.model}`);
        return fallbackResult;
      }
    }

    // 4. Get usable models from cache
    const usableModels = availabilityCache.getUsableModels(providerId);

    if (usableModels.length === 0) {
      // Fallback to DB if cache is empty (might be during initialization)
      await availabilityCache.syncFromDB();
      const retryModels = availabilityCache.getUsableModels(providerId);
      if (retryModels.length === 0) {
        console.log(`[KeyResolver] No usable models for ${providerId}`);
        return null;
      }
    }

    // 5. If a specific model is requested, find keys that have it
    const targetModelId = options.preferredModelId || modelIdOrAlias;
    const matchingModels = this.filterByModel(
      usableModels,
      targetModelId,
      options.excludeKeyIds,
    );

    if (matchingModels.length > 0) {
      // STICKINESS: If we have a preferred key and it's in the matching set, use it!
      if (options.preferredKeyId) {
        const sticky = matchingModels.find((m) => m.keyId === options.preferredKeyId);
        if (sticky) return this.resolveFromCached(sticky);
      }

      // Sort by Effective Score descending with deterministic tie-breaker
      matchingModels.sort((a, b) => {
        if (b.effectiveScore !== a.effectiveScore) {
          return b.effectiveScore - a.effectiveScore;
        }
        return a.keyId.localeCompare(b.keyId);
      });

      return this.resolveFromCached(matchingModels[0]);
    }

    // [STRICT MODE CHANGE]
    // If we specifically requested a model (via options.preferredModelId or implicit alias),
    // and we found NO matching keys for it, we must return NULL.
    // We should NOT fallback to "anyUsable" here because that would select a different model.
    // The UnifiedLLMClient loop handles trying the next model in the chain.
    if (targetModelId) {
      console.log(`[KeyResolver] No match for ${targetModelId} on ${providerId}. Available for this provider:`, usableModels.map(m => m.modelId));
      return null;
    }

    // 6. Only for generic requests (no specific model needed), pick any usable key
    // This typically shouldn't happen in the new flow as we always have a model chain.
    const anyUsable = this.filterByExclusions(
      usableModels,
      options.excludeKeyIds,
    );
    if (anyUsable.length > 0) {
      return this.resolveFromCached(anyUsable[0]);
    }

    console.warn(`[KeyResolver] No usable models found for ${providerId} after all filters.`);
    return null;
  }

  /**
   * Find a key that has a specific model available
   */
  private filterByModel(
    models: CachedModelState[],
    modelId: string,
    excludeKeyIds?: string[],
  ): CachedModelState[] {
    return models.filter((m) => {
      if (excludeKeyIds?.includes(m.keyId)) return false;
      if (!this.isKeySafe(m.keyId)) return false;

      // 1. Exact match
      if (m.modelId === modelId) return true;

      // 2. Substring match
      if (m.modelId.includes(modelId) || modelId.includes(m.modelId)) return true;

      return false;
    });
  }

  /**
   * Filter out excluded keys and unsafe keys
   */
  private filterByExclusions(
    models: CachedModelState[],
    excludeKeyIds?: string[],
  ): CachedModelState[] {
    return models.filter((m) => {
      if (excludeKeyIds?.includes(m.keyId)) return false;
      return this.isKeySafe(m.keyId);
    });
  }

  /**
   * Check if a key is safe to use (not disabled, circuit not open)
   */
  private isKeySafe(keyId: string): boolean {
    if (safetyGuard.isKeyDisabled(keyId)) return false;
    if (safetyGuard.isKeyCircuitOpen(keyId)) return false;
    return true;
  }

  /**
   * Convert cached state to resolved key with API key
   */
  private async resolveFromCached(
    cached: CachedModelState,
  ): Promise<ResolvedKey | null> {
    try {
      const apiKey = await vaultService.getKey(cached.keyId);
      const keyMetadata = await vaultService.getKeyMetadata(cached.keyId);

      if (!keyMetadata) return null;

      return {
        keyId: cached.keyId,
        modelId: cached.modelId,
        providerId: cached.providerId,
        apiKey,
        keyMetadata,
      };
    } catch (e) {
      console.error(`[KeyResolver] Failed to resolve key ${cached.keyId}:`, e);
      return null;
    }
  }

  /**
   * Find a specific key for a model (for fallback scenarios)
   */
  private async findKeyForModel(
    modelId: string,
    providerId: AIProviderId,
    excludeKeyIds?: string[],
  ): Promise<ResolvedKey | null> {
    const usable = availabilityCache.getUsableKeysForModel(providerId, modelId);
    const filtered = this.filterByExclusions(usable, excludeKeyIds);
    if (filtered.length === 0) return null;
    return this.resolveFromCached(filtered[0]);
  }

  // ============================================
  // CACHE UPDATES
  // ============================================

  /**
   * Mark a model as successfully used (update cache)
   */
  markSuccess(keyId: string, modelId: string, providerId: AIProviderId): void {
    availabilityCache.markUsable(keyId, modelId, providerId);
  }

  /**
   * Mark a model as failed (update cache)
   */
  markFailure(keyId: string, modelId: string): void {
    availabilityCache.markUnusable(keyId, modelId);
  }

  /**
   * Handle key deletion
   */
  handleKeyDeleted(keyId: string): void {
    availabilityCache.removeKey(keyId);
  }

  /**
   * Handle new key added
   */
  handleKeyAdded(
    keyId: string,
    providerId: AIProviderId,
    modelIds: string[],
  ): void {
    availabilityCache.initializeKey(keyId, providerId, modelIds);
  }

  // ============================================
  // STATS
  // ============================================

  /**
   * Get resolver statistics
   */
  getStats() {
    return availabilityCache.getStats();
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const keyResolver = new KeyResolver();
export { KeyResolver };
