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

interface CachedModelState {
  keyId: string;
  modelId: string;
  providerId: AIProviderId;
  isUsable: boolean;
  priority: ModelPriority;
  state: ModelState;
  lastUpdated: number;
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
      this.rebuildFromModels(models);
      this.isInitialized = true;
      this.lastSyncTime = Date.now();
      console.log(
        `[AvailabilityCache] Initialized with ${models.length} models`,
      );
    } catch (e) {
      console.error("[AvailabilityCache] Failed to initialize:", e);
    }
  }

  /**
   * Rebuild entire cache from model list
   */
  private rebuildFromModels(models: VerifiedModelMetadata[]): void {
    this.cache.clear();
    this.usableByProvider.clear();
    this.modelsByKey.clear();

    for (const model of models) {
      if (!model.keyId || !model.modelId) continue;

      const cacheKey = this.getCacheKey(model.keyId, model.modelId);
      const isUsable = model.state === "AVAILABLE";

      const cached: CachedModelState = {
        keyId: model.keyId,
        modelId: model.modelId,
        providerId: model.providerId,
        isUsable,
        priority: model.modelPriority ?? 1,
        state: model.state ?? "NEW",
        lastUpdated: Date.now(),
      };

      this.cache.set(cacheKey, cached);
      this.updateIndices(cacheKey, cached);
    }
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

  // ============================================
  // FAST LOOKUPS
  // ============================================

  /**
   * Get all usable models for a provider (O(n) where n = usable models)
   * Sorted by priority (highest first)
   */
  getUsableModels(providerId: AIProviderId): CachedModelState[] {
    const keys = this.usableByProvider.get(providerId);
    if (!keys || keys.size === 0) return [];

    const models = Array.from(keys)
      .map((key) => this.cache.get(key))
      .filter((m): m is CachedModelState => m !== undefined && m.isUsable);

    // Sort by priority descending
    return models.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get all usable key-model pairs for a specific model ID
   */
  getUsableKeysForModel(
    providerId: AIProviderId,
    modelId: string,
  ): CachedModelState[] {
    return this.getUsableModels(providerId).filter(
      (m) => m.modelId === modelId,
    );
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
    };

    this.cache.set(cacheKey, cached);
    this.updateIndices(cacheKey, cached);
  }

  /**
   * Mark a model as unusable
   */
  markUnusable(
    keyId: string,
    modelId: string,
    newState: ModelState = "TEMP_FAILED",
  ): void {
    const cacheKey = this.getCacheKey(keyId, modelId);
    const existing = this.cache.get(cacheKey);
    if (!existing) return;

    existing.isUsable = false;
    existing.state = newState;
    existing.lastUpdated = Date.now();

    // Remove from usable index
    this.usableByProvider.get(existing.providerId)?.delete(cacheKey);
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
      this.rebuildFromModels(models);
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
export type { CachedModelState, KeyModelPair };
