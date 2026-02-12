/**
 * Retry Scheduler Module
 *
 * Manages periodic retries for unavailable models.
 * Finds stale or cooldown models and re-verifies them.
 */

import { modelVerifier } from "./model-verifier";
import { vaultService } from "../vault/vault.service";
import { availabilityManager } from "../availability";
import type { VerifiedModelMetadata } from "../../models/types";

interface RetryStats {
  retried: number;
  recovered: number;
}

export class RetryScheduler {
  /**
   * Run a pass of retries for all eligible models
   */
  async failoverRetry(): Promise<RetryStats> {
    const stats: RetryStats = { retried: 0, recovered: 0 };

    // 1. Fetch models due for retry (COOLDOWN with passed retry time)
    // We use the service method instead of direct DB access for consistency
    const dueModels = await availabilityManager.getModelsDueForRetry(50);

    if (dueModels.length === 0) return stats;

    console.log(
      `[RetryScheduler] Found ${dueModels.length} models due for retry`,
    );

    // 2. Group by key for efficient processing
    const byKey = new Map<string, VerifiedModelMetadata[]>();
    for (const m of dueModels) {
      if (!m.keyId) continue;
      const list = byKey.get(m.keyId) ?? [];
      list.push(m);
      byKey.set(m.keyId, list);
    }

    // 3. Process each key's retries
    for (const [keyId, models] of byKey.entries()) {
      try {
        const keys = await vaultService.listKeys();
        const keyMeta = keys.find((k) => k.id === keyId);

        // Skip if key revoked or deleted
        if (!keyMeta || keyMeta.isRevoked) continue;

        const apiKey = await vaultService.getKey(keyId);

        // Get the provider adapter to validate model ownership
        const { getProviderAdapter } =
          await import("../../providers/provider.registry");
        const adapter = getProviderAdapter(keyMeta.providerId);

        // Process sequentially to be gentle
        for (const model of models) {
          // IMPORTANT: Skip models that don't belong to this key's provider
          // This can happen with stale DB entries from before the ownsModel fix
          if (!adapter.ownsModel(model.modelId)) {
            console.log(
              `[RetryScheduler] Removing orphaned model ${model.modelId} from key ${keyId} (provider mismatch)`,
            );
            // Targeted delete of ONLY this model/key entry
            const { db } = await import("../../db");
            await db.modelCache.delete([model.modelId, keyId]);
            continue;
          }

          stats.retried++;

          const result = await modelVerifier.verifyModel(
            keyId,
            apiKey,
            model.modelId,
            keyMeta.providerId, // Use the key's providerId, not stored model.providerId
            keyMeta.label,
          );

          // Update DB with result
          await availabilityManager.saveModelMetadata(result);

          if (result.state === "AVAILABLE") {
            stats.recovered++;
            console.log(
              `[RetryScheduler] Recovered model: ${result.modelId} on key ${keyMeta.label}`,
            );
          } else {
            // Still failed - recalculate next retry with updated count
            const { calculateRetry } = await import("../availability");
            const newRetryCount = (model.retryCount ?? 0) + 1;
            const decision = calculateRetry(
              result.lastErrorCode,
              result.errorMessage,
              newRetryCount,
              result.modelPriority ?? 3,
            );

            const updated = {
              ...result,
              retryCount: newRetryCount,
              nextRetryAt: decision.nextRetryAt, // Properly recalculated!
              state: decision.nextState,
            };

            console.log(
              `[RetryScheduler] Model ${result.modelId} still failed (attempt ${newRetryCount}), ` +
              `next retry at ${decision.nextRetryAt ? new Date(decision.nextRetryAt).toISOString() : "never"}`,
            );

            await availabilityManager.saveModelMetadata(updated);
          }
        }
      } catch (e) {
        console.error(`[RetryScheduler] Failed retrying key ${keyId}:`, e);
      }
    }

    return stats;
  }
}

// Singleton instance
export const retryScheduler = new RetryScheduler();
