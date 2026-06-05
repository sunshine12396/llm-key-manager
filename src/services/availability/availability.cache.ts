/**
 * Availability Cache Module
 *
 * Provides in-memory caching for model availability status.
 * Eliminates expensive IndexedDB queries on the hot path of chat requests.
 *
 * Features:
 * - O(1) lookup for usable models per provider
 * - Automatic sync with IndexedDB on changes
 * - Priority-sorted results for key selection
 * - TTL-based staleness detection
 */

import { db } from "../../db";
import type {
  AIProviderId,
  VerifiedModelMetadata,
  ModelPriority,
} from "../../models/types";
import type { ModelState } from "./state-machine";

// ============================================
// CACHE TYPES
// ============================================

export interface CachedModelState {
  keyId: string;
  modelId: string;
  providerId: AIProviderId;
  isUsable: boolean;
  priority: ModelPriority;
  state: ModelState;
  lastUpdated: number;

  // Runtime Routing Metadata
  effectiveScore: number;
  averageLatency: number;
  keyPriority: "high" | "medium" | "low";
  recentFailures: number;
}

interface KeyModelPair {
  keyId: string;
  modelId: string;
}

// ============================================
// CACHE CONFIGURATION
// ============================================

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SYNC_DEBOUNCE_MS = 100;

// ============================================
// AVAILABILITY CACHE CLASS
// ============================================

class AvailabilityCache {
  // Primary cache: (modelId, keyId) -> CachedModelState
  private cache: Map<string, CachedModelState> = new Map();

  // Index: providerId -> Set of cache keys (for fast provider lookup)
  private usableByProvider: Map<AIProviderId, Set<string>> = new Map();

  // Index: modelId -> Pre-sorted array of usable keys (for O(1) resolution)
  private sortedByModel: Map<string, CachedModelState[]> = new Map();

  // Index: keyId -> Set of cache keys (for fast key lookup)
  private modelsByKey: Map<string, Set<string>> = new Map();

  // Sync state
  private isInitialized = false;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSyncTime = 0;

  /**
   * Generate cache key from keyId and modelId
   */
  private getCacheKey(keyId: string, modelId: string): string {
    return `${modelId}:${keyId}`;
  }

  /**
   * Initialize cache from IndexedDB
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const models = await db.modelCache.toArray();
      const keys = await db.keys.toArray();
      this.rebuildFromModels(models, keys);
      this.isInitialized = true;
      this.lastSyncTime = Date.now();
      console.log(
        `[AvailabilityCache] Initialized with ${models.length} models across ${keys.length} keys`,
      );
    } catch (e) {
      console.error("[AvailabilityCache] Failed to initialize:", e);
    }
  }

  /**
   * Rebuild entire cache from model list
   */
  private rebuildFromModels(models: VerifiedModelMetadata[], keys: import('../../models/types').StoredKey[]): void {
    this.cache.clear();
    this.usableByProvider.clear();
    this.modelsByKey.clear();
    this.sortedByModel.clear();

    const keyMetaMap = new Map(keys.map(k => [k.id, k]));

    // Hardcoded model power scores for Phase 1
    const MODEL_POWER_SCORES: Record<string, number> = {
      "o3": 100,
      "gpt-4.5": 90,
      "claude-3-5-sonnet-latest": 85,
      "gpt-4o": 80,
      "gemini-2.5-pro": 85,
      "gemini-1.5-pro": 80,
      "gemini-2.5-flash": 75,
      "gemini-2.0-flash": 70,
    };

    for (const model of models) {
      if (!model.keyId || !model.modelId) continue;

      const cacheKey = this.getCacheKey(model.keyId, model.modelId);
      const isUsable = model.state === "AVAILABLE";

      const keyMeta = keyMetaMap.get(model.keyId);
      const keyPriority = keyMeta?.priority || "medium";
      const averageLatency = keyMeta?.averageLatency || 0;

      // Calculate Effective Score
      const basePowerScore = MODEL_POWER_SCORES[model.modelId] ?? 50;
      const priorityBonus = keyPriority === 'high' ? 20 : (keyPriority === 'low' ? -20 : 0);
      const latencyPenalty = Math.min(Math.floor(averageLatency / 10), 30);
      const healthBonus = !isUsable ? -10 : 10;

      const effectiveScore = basePowerScore + priorityBonus + healthBonus - latencyPenalty;

      const cached: CachedModelState = {
        keyId: model.keyId,
        modelId: model.modelId,
        providerId: model.providerId,
        isUsable,
        priority: model.modelPriority ?? 1,
        state: model.state ?? "NEW",
        lastUpdated: Date.now(),
        effectiveScore,
        averageLatency,
        keyPriority,
        recentFailures: 0,
      };

      this.cache.set(cacheKey, cached);
      this.updateIndices(cacheKey, cached);
    }

    // FINAL STEP: Pre-sort all model lists to achieve O(1) resolution
    this.rebuildSortedIndex();
  }

  /**
   * Update provider and key indices
   */
  private updateIndices(cacheKey: string, cached: CachedModelState): void {
    // Update provider index
    if (!this.usableByProvider.has(cached.providerId)) {
      this.usableByProvider.set(cached.providerId, new Set());
    }
    if (cached.isUsable) {
      this.usableByProvider.get(cached.providerId)!.add(cacheKey);
    } else {
      this.usableByProvider.get(cached.providerId)!.delete(cacheKey);
    }

    // Update key index
    if (!this.modelsByKey.has(cached.keyId)) {
      this.modelsByKey.set(cached.keyId, new Set());
    }
    this.modelsByKey.get(cached.keyId)!.add(cacheKey);
  }

  /**
   * Rebuild the sorted index for O(1) lookup
   */
  private rebuildSortedIndex(): void {
    const newSortedIndex = new Map<string, CachedModelState[]>();

    this.cache.forEach((cached) => {
      if (!cached.isUsable) return;
      
      if (!newSortedIndex.has(cached.modelId)) {
        newSortedIndex.set(cached.modelId, []);
      }
      newSortedIndex.get(cached.modelId)!.push(cached);
    });

    // Sort each model group by Effective Score
    newSortedIndex.forEach((list) => {
      list.sort((a, b) => {
        if (b.effectiveScore !== a.effectiveScore) {
          return b.effectiveScore - a.effectiveScore;
        }
        return a.keyId.localeCompare(b.keyId);
      });
    });

    this.sortedByModel = newSortedIndex;
  }

  // ============================================
  // FAST LOOKUPS
  // ============================================

  /**
   * Get all usable models for a provider
   */
  getUsableModels(providerId: AIProviderId): CachedModelState[] {
    const keys = this.usableByProvider.get(providerId);
    if (!keys || keys.size === 0) return [];

    const models = Array.from(keys)
      .map((key) => this.cache.get(key))
      .filter((m): m is CachedModelState => m !== undefined && m.isUsable);

    // Sort by effectiveScore descending
    return models.sort((a, b) => {
      if (b.effectiveScore !== a.effectiveScore) {
        return b.effectiveScore - a.effectiveScore;
      }
      return a.keyId.localeCompare(b.keyId);
    });
  }

  /**
   * Get all usable key-model pairs for a specific model ID
   * ACHIEVES O(1) via pre-sorted map lookup
   */
  getUsableKeysForModel(modelId: string): CachedModelState[] {
    return this.sortedByModel.get(modelId) || [];
  }

  /**
   * Check if a specific key+model pair is usable (O(1))
   */
  isModelUsable(keyId: string, modelId: string): boolean {
    const cacheKey = this.getCacheKey(keyId, modelId);
    const cached = this.cache.get(cacheKey);
    return cached?.isUsable ?? false;
  }

  /**
   * Get all models for a key
   */
  getModelsForKey(keyId: string): CachedModelState[] {
    const keys = this.modelsByKey.get(keyId);
    if (!keys) return [];

    return Array.from(keys)
      .map((key) => this.cache.get(key))
      .filter((m): m is CachedModelState => m !== undefined);
  }

  /**
   * Get available model count for a provider
   */
  getAvailableCount(providerId: AIProviderId): number {
    return this.usableByProvider.get(providerId)?.size ?? 0;
  }

  /**
   * Check if cache has any usable models for a provider
   */
  hasUsableModels(providerId: AIProviderId): boolean {
    return this.getAvailableCount(providerId) > 0;
  }

  // ============================================
  // CACHE UPDATES (for runtime events)
  // ============================================

  /**
   * Mark a model as usable
   */
  markUsable(
    keyId: string,
    modelId: string,
    providerId: AIProviderId,
    priority: ModelPriority = 3,
  ): void {
    const cacheKey = this.getCacheKey(keyId, modelId);
    const existing = this.cache.get(cacheKey);

    const cached: CachedModelState = {
      keyId,
      modelId,
      providerId: existing?.providerId ?? providerId,
      isUsable: true,
      priority: existing?.priority ?? priority,
      state: "AVAILABLE",
      lastUpdated: Date.now(),
      effectiveScore: existing?.effectiveScore ?? 50,
      averageLatency: existing?.averageLatency ?? 0,
      keyPriority: existing?.keyPriority ?? "medium",
      recentFailures: existing ? Math.max(0, existing.recentFailures - 1) : 0,
    };

    this.cache.set(cacheKey, cached);
    this.updateIndices(cacheKey, cached);
    this.rebuildSortedIndex();
  }

  /**
   * Mark a model as unusable
   */
  markUnusable(
    keyId: string,
    modelId: string,
    newState: ModelState = "TEMP_FAILED",
  ): void {
    if (!modelId) {
      // Mark ALL models for this key as unusable
      const modelKeys = this.modelsByKey.get(keyId);
      if (modelKeys) {
        for (const cacheKey of modelKeys) {
          const entry = this.cache.get(cacheKey);
          if (entry) {
            entry.isUsable = false;
            entry.state = newState;
            entry.lastUpdated = Date.now();
            this.usableByProvider.get(entry.providerId)?.delete(cacheKey);
          }
        }
      }
      this.rebuildSortedIndex();
      return;
    }

    const cacheKey = this.getCacheKey(keyId, modelId);
    const existing = this.cache.get(cacheKey);
    if (!existing) return;

    existing.isUsable = false;
    existing.state = newState;
    existing.lastUpdated = Date.now();
    existing.recentFailures = (existing.recentFailures || 0) + 1;
    existing.effectiveScore = Math.max(0, existing.effectiveScore - 10); // Failure penalty

    // Remove from usable index
    this.usableByProvider.get(existing.providerId)?.delete(cacheKey);
    this.rebuildSortedIndex();
  }

  /**
   * Remove all entries for a key
   */
  removeKey(keyId: string): void {
    const keys = this.modelsByKey.get(keyId);
    if (!keys) return;

    for (const cacheKey of keys) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.usableByProvider.get(cached.providerId)?.delete(cacheKey);
      }
      this.cache.delete(cacheKey);
    }

    this.modelsByKey.delete(keyId);
  }

  /**
   * Initialize entries for a new key (all as checking)
   */
  initializeKey(
    keyId: string,
    providerId: AIProviderId,
    modelIds: string[],
    priority: ModelPriority = 3,
  ): void {
    for (const modelId of modelIds) {
      const cacheKey = this.getCacheKey(keyId, modelId);
      const cached: CachedModelState = {
        keyId,
        modelId,
        providerId,
        isUsable: false,
        priority,
        state: "CHECKING",
        lastUpdated: Date.now(),
        effectiveScore: 50,
        averageLatency: 0,
        keyPriority: "medium",
        recentFailures: 0,
      };
      this.cache.set(cacheKey, cached);
      this.updateIndices(cacheKey, cached);
    }
  }

  // ============================================
  // SYNC WITH DB
  // ============================================

  /**
   * Sync cache with IndexedDB (debounced)
   */
  requestSync(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    this.syncTimer = setTimeout(() => this.syncFromDB(), SYNC_DEBOUNCE_MS);
  }

  /**
   * Force immediate sync with IndexedDB
   */
  async syncFromDB(): Promise<void> {
    try {
      const models = await db.modelCache.toArray();
      const keys = await db.keys.toArray();
      this.rebuildFromModels(models, keys);
      this.lastSyncTime = Date.now();
    } catch (e) {
      console.error("[AvailabilityCache] Sync failed:", e);
    }
  }

  /**
   * Check if cache is stale
   */
  isStale(): boolean {
    return Date.now() - this.lastSyncTime > CACHE_TTL_MS;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalEntries: number;
    usableCount: number;
    byProvider: Record<string, number>;
    isInitialized: boolean;
    lastSyncTime: number;
  } {
    const byProvider: Record<string, number> = {};
    this.usableByProvider.forEach((set, provider) => {
      byProvider[provider] = set.size;
    });

    return {
      totalEntries: this.cache.size,
      usableCount: Array.from(this.usableByProvider.values()).reduce(
        (sum, set) => sum + set.size,
        0,
      ),
      byProvider,
      isInitialized: this.isInitialized,
      lastSyncTime: this.lastSyncTime,
    };
  }

  /**
   * Clear all cache data
   */
  clear(): void {
    this.cache.clear();
    this.usableByProvider.clear();
    this.modelsByKey.clear();
    this.isInitialized = false;
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const availabilityCache = new AvailabilityCache();
export { AvailabilityCache };
export type { KeyModelPair };
