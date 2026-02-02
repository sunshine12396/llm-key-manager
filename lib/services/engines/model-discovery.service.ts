/**
 * Model Metadata Service
 *
 * Centralized service for managing model metadata cache.
 * Provides methods to query, update, and refresh model availability data.
 */

import { db } from "../../db";
import { AIProviderId, VerifiedModelMetadata, ModelCapability } from "../../models/types";

export interface ModelFilter {
  provider?: string;
  capabilities?: ModelCapability[];
  priority?: number;
}

class ModelMetadataService {
  /**
   * Query available models based on rich filters
   */
  async queryAvailableModels(filter: ModelFilter): Promise<VerifiedModelMetadata[]> {
    return db.modelCache
      .filter((m: VerifiedModelMetadata) => {
        if (!m.isAvailable) return false;
        if (filter.provider && m.providerId !== filter.provider) return false;
        if (filter.priority !== undefined && (m.modelPriority || 0) < filter.priority) return false;
        if (filter.capabilities && filter.capabilities.length > 0) {
          const modelCaps = m.capabilities || [];
          return filter.capabilities.every(cap => modelCaps.includes(cap));
        }
        return true;
      })
      .toArray();
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

  /**
   * Get all cached models for a specific key
   */
  async getModelsForKey(keyId: string): Promise<VerifiedModelMetadata[]> {
    return db.modelCache.where("keyId").equals(keyId).toArray();
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

  /**
   * Check if a specific model is available for a key
   */
  async isModelAvailable(keyId: string, modelId: string): Promise<boolean> {
    const meta = await this.getModelMetadata(keyId, modelId);
    return meta?.isAvailable ?? false;
  }

  /**
   * Save or update model metadata
   */
  async saveModelMetadata(metadata: VerifiedModelMetadata): Promise<void> {
    await db.modelCache.put(metadata);
  }

  /**
   * Batch save model metadata
   */
  async saveModelMetadataBatch(
    metadataList: VerifiedModelMetadata[],
  ): Promise<void> {
    await db.modelCache.bulkPut(metadataList);
  }

  /**
   * Delete all cached models for a key (used when key is deleted)
   */
  async deleteModelsForKey(keyId: string): Promise<number> {
    return db.modelCache.where("keyId").equals(keyId).delete();
  }

  /**
   * Get models that need re-verification (older than maxAge)
   */
  async getStaleModels(
    maxAgeMs: number = 24 * 60 * 60 * 1000,
  ): Promise<VerifiedModelMetadata[]> {
    const cutoff = Date.now() - maxAgeMs;
    return db.modelCache.where("lastCheckedAt").below(cutoff).toArray();
  }

  /**
   * Clear entire model cache
   */
  async clearCache(): Promise<void> {
    await db.modelCache.clear();
  }

  /**
   * Get statistics about the model cache
   */
  async getCacheStats(): Promise<{
    totalModels: number;
    availableModels: number;
    unavailableModels: number;
    byProvider: Record<AIProviderId, number>;
  }> {
    const all = await db.modelCache.toArray();
    const available = all.filter((m: VerifiedModelMetadata) => m.isAvailable);

    const byProvider: Record<string, number> = {};
    for (const model of all) {
      byProvider[model.providerId] = (byProvider[model.providerId] || 0) + 1;
    }

    return {
      totalModels: all.length,
      availableModels: available.length,
      unavailableModels: all.length - available.length,
      byProvider: byProvider as Record<AIProviderId, number>,
    };
  }

  // ============================================
  // RUNTIME STATUS UPDATE API
  // ============================================

  /**
   * Mark a model as unavailable (called when UnifiedLLM encounters errors)
   * @param keyId - The key ID
   * @param modelId - The model ID
   * @param errorCode - HTTP status code or error type
   * @param errorMessage - Error message
   */
  async markModelUnavailable(
    keyId: string,
    modelId: string,
    errorCode: number | string,
    errorMessage: string,
  ): Promise<void> {
    const existing = await this.getModelMetadata(keyId, modelId);
    if (existing) {
      // Determine state based on error code
      const code =
        typeof errorCode === "number" ? errorCode : parseInt(errorCode, 10);
      const isPermanent = code === 401 || code === 403 || code === 404;

      await db.modelCache.update([modelId, keyId], {
        isAvailable: false,
        state: isPermanent ? "PERM_FAILED" : "COOLDOWN",
        errorMessage: `[${errorCode}] ${errorMessage}`,
        lastErrorCode: isNaN(code) ? undefined : code,
        lastCheckedAt: Date.now(),
      });
      console.log(
        `[ModelMetadata] Marked ${modelId} as UNAVAILABLE for key ${keyId}: ${errorCode}`,
      );
    }
  }

  /**
   * Mark a model as available (called when retry succeeds)
   */
  async markModelAvailable(keyId: string, modelId: string): Promise<void> {
    const existing = await this.getModelMetadata(keyId, modelId);
    if (existing) {
      await db.modelCache.update([modelId, keyId], {
        isAvailable: true,
        state: "AVAILABLE",
        errorMessage: undefined,
        lastErrorCode: undefined,
        retryCount: 0,
        nextRetryAt: null,
        lastCheckedAt: Date.now(),
      });
      console.log(
        `[ModelMetadata] Marked ${modelId} as AVAILABLE for key ${keyId}`,
      );
    }
  }

  /**
   * Get unavailable models that are due for retry (nextRetryAt <= now or null)
   */
  async getModelsDueForRetry(
    limit: number = 50,
  ): Promise<VerifiedModelMetadata[]> {
    const now = Date.now();

    // 1. Get models where nextRetryAt is set and has passed
    const due = await db.modelCache
      .where("nextRetryAt")
      .belowOrEqual(now)
      .and((m) => !m.isAvailable && !/-\d{10,}$/.test(m.modelId))
      .limit(limit)
      .toArray();

    // 2. Also get models that are unavailable but have NO nextRetryAt (legacy or edge cases)
    if (due.length < limit) {
      const unset = await db.modelCache
        .filter(
          (m) =>
            !m.isAvailable &&
            m.nextRetryAt === null &&
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
   * Get all unavailable models (for retry job)
   */
  async getUnavailableModels(): Promise<VerifiedModelMetadata[]> {
    // Garbage collect dated snapshots while we're here
    const dated = await db.modelCache
      .filter((m: VerifiedModelMetadata) => /-\d{10,}$/.test(m.modelId))
      .toArray();
    if (dated.length > 0) {
      const keysToDelete = dated
        .filter((m) => m.modelId && m.keyId)
        .map((m) => [m.modelId, m.keyId]);

      if (keysToDelete.length > 0) {
        // Parallel delete is safe here
        await Promise.all(
          keysToDelete.map((k) => db.modelCache.delete(k as any)),
        );
      }
      console.log(
        `[ModelDiscovery] Garbage collected ${dated.length} dated snapshot models.`,
      );
    }

    return db.modelCache
      .filter(
        (m: VerifiedModelMetadata) =>
          !m.isAvailable && !/-\d{10,}$/.test(m.modelId), // Only skip true timestamped snapshots
      )
      .toArray();
  }

  /**
   * Get unavailable models for a specific key
   */
  async getUnavailableModelsForKey(
    keyId: string,
  ): Promise<VerifiedModelMetadata[]> {
    return db.modelCache
      .where("keyId")
      .equals(keyId)
      .and((m: VerifiedModelMetadata) => !m.isAvailable)
      .toArray();
  }

  /**
   * Update model availability based on error code
   * - 401/403: Mark unavailable (auth issue)
   * - 429: Keep available (temporary rate limit)
   * - 404: Mark unavailable (model not found)
   * - 500+: Keep available (server issue, temporary)
   */
  async handleModelError(
    keyId: string,
    modelId: string,
    errorCode: number,
    errorMessage: string,
  ): Promise<"unavailable" | "temporary" | "unknown"> {
    // Permanent failures - mark as unavailable
    if (errorCode === 401 || errorCode === 403 || errorCode === 404) {
      await this.markModelUnavailable(keyId, modelId, errorCode, errorMessage);
      return "unavailable";
    }

    // Temporary failures - don't change status
    if (errorCode === 429 || errorCode >= 500) {
      console.log(
        `[ModelMetadata] Temporary error ${errorCode} for ${modelId}, keeping status`,
      );
      return "temporary";
    }

    return "unknown";
  }
}

export const modelMetadataService = new ModelMetadataService();
