/**
 * Model Verifier Module
 *
 * Handles the actual API requests to verify if a model works with a specific API key.
 * Used by the background validator service.
 */

import { getProviderAdapter } from "../../providers/provider.registry";
import type { AIProviderId, VerifiedModelMetadata } from "../../models/types";
import { calculateRetry } from "../availability";
import { availabilityCache } from "../availability/availability.cache";
import { getModelCapabilities } from "../../services/model-capabilities";

// ============================================
// HELPERS
// ============================================

/**
 * Extract error code from error object or message
 */
function extractErrorCode(error: unknown): string | undefined {
  if (typeof error === "string") return undefined;
  if (error && typeof error === "object" && "code" in error) {
    return String((error as any).code);
  }
  if (error && typeof error === "object" && "status" in error) {
    return String((error as any).status);
  }
  return undefined;
}

// ============================================
// MODEL VERIFIER CLASS
// ============================================

export class ModelVerifier {
  /**
   * Verified a single model using the provider adapter
   */
  async verifyModel(
    keyId: string,
    apiKey: string,
    modelId: string,
    providerId: AIProviderId,
    _label: string,
    abortSignal?: AbortSignal,
  ): Promise<VerifiedModelMetadata> {
    const adapter = getProviderAdapter(providerId);

    try {
      if (abortSignal?.aborted) {
        throw new Error("Validation aborted");
      }

      await adapter.chat(apiKey, {
        messages: [{ role: "user", content: "Hello" }],
        model: modelId,
        maxTokens: 5,
        temperature: 0,
      });

      availabilityCache.markUsable(keyId, modelId, providerId);

      return {
        modelId,
        providerId,
        keyId,
        state: "AVAILABLE",
        isAvailable: true, // Required by type
        lastCheckedAt: Date.now(), // Changed from lastChecked to match type
        modelPriority: 3, // Default priority
        retryCount: 0,
        nextRetryAt: null,
        errorMessage: undefined,
        capabilities: getModelCapabilities(modelId),
      };
    } catch (error: any) {
      const code = extractErrorCode(error);
      const message = error.message || String(error);

      const decision = calculateRetry(
        code ? parseInt(code) : undefined,
        message,
        0,
        3,
      );

      if (!decision.shouldRetry) {
        availabilityCache.markUnusable(keyId, modelId, "PERM_FAILED");
      } else {
        availabilityCache.markUnusable(keyId, modelId, "COOLDOWN");
      }

      return {
        modelId,
        providerId,
        keyId,
        state: decision.nextState,
        isAvailable: false,
        lastCheckedAt: Date.now(),
        modelPriority: 3,
        lastErrorCode: code ? parseInt(code) : undefined,
        errorMessage: message,
        retryCount: 0,
        nextRetryAt: decision.nextRetryAt, // This matches number | null
      } as VerifiedModelMetadata;
    }
  }

  /**
   * Verify a batch of models
   */
  async verifyBatch(
    keyId: string,
    apiKey: string,
    models: string[],
    providerId: AIProviderId,
    label: string,
    concurrency: number = 3,
    abortSignal?: AbortSignal,
    onProgress?: (
      result: VerifiedModelMetadata,
      current: number,
      total: number,
    ) => void,
  ): Promise<VerifiedModelMetadata[]> {
    const results: VerifiedModelMetadata[] = [];
    const queue = [...models];
    const total = models.length;
    let current = 0;
    const inFlight = new Set<Promise<void>>();

    while (queue.length > 0 || inFlight.size > 0) {
      if (abortSignal?.aborted) break;

      while (queue.length > 0 && inFlight.size < concurrency) {
        const modelId = queue.shift()!;
        const promise = this.verifyModel(
          keyId,
          apiKey,
          modelId,
          providerId,
          label,
          abortSignal,
        )
          .then((result) => {
            current++;
            results.push(result);
            onProgress?.(result, current, total);
          })
          .catch((err) => {
            current++;
            console.error(
              `[ModelVerifier] Unexpected error verifying ${modelId}:`,
              err,
            );
          })
          .finally(() => {
            inFlight.delete(promise);
          });

        inFlight.add(promise);
      }

      if (inFlight.size > 0) {
        await Promise.race(inFlight);
      }
    }

    return results;
  }
}

// Singleton instance
export const modelVerifier = new ModelVerifier();
