/**
 * Background Key Validator Job
 *
 * Handles async validation of API keys after they are added to the vault.
 */

import {
  AIProviderId,
  KeyVerificationStatus,
  VerifiedModelMetadata,
  RateLimitData,
} from "../models/metadata";
import { vaultService } from "../services/vault/vault.service";
import { getProviderAdapter } from "../providers";
import { modelMetadataService } from "../services/engines/model-discovery.service";
import { extractErrorCode } from "../core/errors";

export type BackgroundValidationErrorType =
  | "authentication_failed"
  | "quota_exceeded"
  | "network_error"
  | "invalid_format"
  | "no_models"
  | "unknown";

export interface BackgroundValidationResult {
  keyId: string;
  providerId: AIProviderId;
  status: KeyVerificationStatus;
  models: string[];
  quota?: RateLimitData;
  errorType?: BackgroundValidationErrorType;
  errorMessage?: string;
  responseTime?: number;
  validatedAt: number;
}

export type ValidationEventType =
  | "validation_started"
  | "validation_progress"
  | "validation_complete"
  | "validation_failed";

export interface ValidationEvent {
  type: ValidationEventType;
  keyId: string;
  label: string;
  providerId: AIProviderId;
  progress?: number; // 0-100
  result?: BackgroundValidationResult;
}

type ValidationListener = (event: ValidationEvent) => void;

class BackgroundValidatorJob {
  private listeners: ValidationListener[] = [];
  private validationQueue: Map<string, AbortController> = new Map();
  private validationResults: Map<string, BackgroundValidationResult> =
    new Map();
  private taskQueue: Array<() => Promise<void>> = [];
  private isProcessing = false;

  /**
   * Subscribe to validation events
   */
  subscribe(listener: ValidationListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Resumes any pending validations found in the vault.
   */
  async resumePendingValidations() {
    const keys = await vaultService.listKeys();
    // Also resume retry_scheduled if time has passed
    const now = Date.now();
    const pending = keys.filter(
      (k) =>
        k.verificationStatus === "untested" ||
        k.verificationStatus === "testing" ||
        (k.verificationStatus === "retry_scheduled" &&
          (!k.nextRetryAt || now >= k.nextRetryAt)),
    );

    if (pending.length > 0) {
      console.log(
        `[ValidatorJob] Resuming ${pending.length} pending validations...`,
      );
    }

    for (const key of pending) {
      try {
        const apiKey = await vaultService.getKey(key.id);
        this.validateKey(key.id, key.providerId, apiKey, key.label);
      } catch (e) {
        console.error(`Failed to resume validation for ${key.label}`, e);
      }
    }
  }

  private async processQueue() {
    if (this.isProcessing || this.taskQueue.length === 0) return;

    this.isProcessing = true;
    const task = this.taskQueue.shift();

    if (task) {
      try {
        await task();
      } catch (e) {
        console.error("[ValidatorJob] Task error:", e);
      } finally {
        this.isProcessing = false;
        setTimeout(() => this.processQueue(), 500);
      }
    } else {
      this.isProcessing = false;
    }
  }

  private emit(event: ValidationEvent) {
    this.listeners.forEach((l) => l(event));
  }

  getValidationResult(keyId: string): BackgroundValidationResult | undefined {
    return this.validationResults.get(keyId);
  }

  isValidating(keyId: string): boolean {
    return this.validationQueue.has(keyId);
  }

  cancelValidation(keyId: string): void {
    const controller = this.validationQueue.get(keyId);
    if (controller) {
      controller.abort();
      this.validationQueue.delete(keyId);
    }
  }

  async validateKey(
    keyId: string,
    providerId: AIProviderId,
    apiKey: string,
    label: string,
  ): Promise<BackgroundValidationResult> {
    return new Promise((resolve, reject) => {
      const task = async () => {
        try {
          const result = await this.executeValidation(
            keyId,
            providerId,
            apiKey,
            label,
          );
          resolve(result);
        } catch (e) {
          reject(e);
        }
      };
      this.taskQueue.push(task);
      this.processQueue();
    });
  }

  private readonly BATCH_SIZE = 5;
  private readonly BATCH_DELAY_MS = 500;

  private async executeValidation(
    keyId: string,
    providerId: AIProviderId,
    apiKey: string,
    label: string,
  ): Promise<BackgroundValidationResult> {
    const startTime = Date.now();
    this.cancelValidation(keyId);

    const abortController = new AbortController();
    this.validationQueue.set(keyId, abortController);

    const checkAborted = () => {
      if (abortController.signal.aborted)
        throw new Error("Validation cancelled");
    };

    const progress = (percent: number) => {
      this.emit({
        type: "validation_progress",
        keyId,
        label,
        providerId,
        progress: percent,
      });
    };

    this.emit({
      type: "validation_started",
      keyId,
      label,
      providerId,
      progress: 0,
    });

    try {
      await vaultService.updateKey(keyId, { verificationStatus: "testing" });
      progress(10);
      checkAborted();

      const adapter = getProviderAdapter(providerId);
      // Removed testConnection call as requested
      progress(25);
      checkAborted();

      const [discoveredModels, quota] = await Promise.all([
        adapter.listModels(apiKey).catch(() => []),
        adapter.checkRateLimits(apiKey).catch(() => undefined),
      ]);
      progress(50);
      checkAborted();

      let verifiedModels = discoveredModels;
      if (discoveredModels.length > 0) {
        verifiedModels = await this.verifyModels(
          apiKey,
          discoveredModels,
          keyId,
          label,
          providerId,
          abortController,
        );
      }
      progress(85);

      const status: KeyVerificationStatus =
        verifiedModels.length > 0 ? "valid" : "invalid";
      const tier = adapter.detectTier(quota);
      const responseTime = Date.now() - startTime;

      const result: BackgroundValidationResult = {
        keyId,
        providerId,
        status,
        models: verifiedModels,
        quota,
        errorType: verifiedModels.length === 0 ? "no_models" : undefined,
        errorMessage:
          verifiedModels.length === 0
            ? "No usable models found for this key"
            : undefined,
        responseTime,
        validatedAt: Date.now(),
      };

      await vaultService.updateKey(keyId, {
        verifiedModels,
        verificationStatus: status,
        tier,
        rateLimits: quota,
      });

      this.validationResults.set(keyId, result);
      this.emit({
        type: "validation_complete",
        keyId,
        label,
        providerId,
        progress: 100,
        result,
      });
      this.validationQueue.delete(keyId);

      return result;
    } catch (error: any) {
      return this.handleValidationFailure(keyId, label, providerId, error);
    }
  }

  private async verifyModels(
    apiKey: string,
    models: string[],
    keyId: string,
    label: string,
    providerId: AIProviderId,
    controller: AbortController,
  ) {
    const adapter = getProviderAdapter(providerId);
    const verifiedModels: string[] = [];
    const modelMetadataList: VerifiedModelMetadata[] = [];

    // Hoist imports outside the loop for performance
    const { availabilityManager } = await import("../services/availability");
    const { calculateRetry } =
      await import("../services/availability/retry-strategy");

    for (let i = 0; i < models.length; i += this.BATCH_SIZE) {
      if (controller.signal.aborted) throw new Error("Validation cancelled");
      const batch = models.slice(i, i + this.BATCH_SIZE);

      this.emit({
        type: "validation_progress",
        keyId,
        label,
        providerId,
        progress: 75 + Math.floor((i / models.length) * 20),
      });

      const results = await Promise.all(
        batch.map(async (model) => {
          const metadata: VerifiedModelMetadata = {
            modelId: model,
            providerId,
            keyId,
            isAvailable: false,
            state: "NEW", // Start in NEW state
            lastCheckedAt: Date.now(),
            modelPriority: availabilityManager.getModelPriority(model),
            retryCount: 0,
            nextRetryAt: null,
          };

          try {
            await adapter.chat(apiKey, {
              model,
              messages: [{ role: "user", content: "Hi" }],
              maxTokens: 1,
              timeout: 10000,
            });
            metadata.isAvailable = true;
            metadata.state = "AVAILABLE";
            // Reset any previous retry status on success
            metadata.errorMessage = undefined;
            metadata.nextRetryAt = null;
            metadata.retryCount = 0;

            const limits = await adapter
              .checkRateLimits(apiKey, model)
              .catch(() => undefined);
            if (limits) metadata.rateLimits = limits;
          } catch (e: any) {
            const code = extractErrorCode(e.message || "");

            // Use smart retry strategy based on error type (calculateRetry hoisted above)
            const retryDecision = calculateRetry(
              code ?? undefined,
              e.message,
              0, // Initial retry count
              metadata.modelPriority,
            );

            metadata.lastErrorCode = code ?? undefined;
            metadata.state = retryDecision.nextState;
            metadata.nextRetryAt = retryDecision.nextRetryAt;
            metadata.errorMessage = retryDecision.reason;

            // Special case: 429 means key is valid but quota exceeded
            if (code === 429) {
              metadata.state = "COOLDOWN";
              metadata.isAvailable = false;
              // Retry should be handled by nextRetryAt from calculateRetry
            } else {
              metadata.retryCount = retryDecision.shouldRetry ? 1 : 0;
            }
          }
          return metadata;
        }),
      );

      results.forEach((meta) => {
        modelMetadataList.push(meta);
        // Include COOLDOWN models as verified since we know they exist and auth works
        if (meta.isAvailable || meta.state === "COOLDOWN")
          verifiedModels.push(meta.modelId);
      });

      if (i + this.BATCH_SIZE < models.length) {
        await new Promise((r) => setTimeout(r, this.BATCH_DELAY_MS));
      }
    }

    if (modelMetadataList.length > 0) {
      await modelMetadataService.saveModelMetadataBatch(modelMetadataList);
    }
    return verifiedModels;
  }

  private async handleValidationFailure(
    keyId: string,
    label: string,
    providerId: AIProviderId,
    error: any,
  ) {
    const code = extractErrorCode(error.message || "");

    // Use smart retry strategy for consistency with model-level error handling
    const { calculateRetry } =
      await import("../services/availability/retry-strategy");
    const retryDecision = calculateRetry(code ?? undefined, error.message, 0);

    let status: KeyVerificationStatus = "invalid";
    let errorType: BackgroundValidationErrorType = "unknown";
    let nextRetryAt: number | undefined;

    if (retryDecision.shouldRetry) {
      status = "retry_scheduled";
      errorType =
        retryDecision.category === "RATE_LIMITED"
          ? "quota_exceeded"
          : retryDecision.category === "NETWORK_ERROR" ||
              retryDecision.category === "SERVER_ERROR"
            ? "network_error"
            : "unknown";
      nextRetryAt = retryDecision.nextRetryAt ?? undefined;
      console.log(
        `[ValidatorJob] ${retryDecision.reason} for ${label}. Scheduling retry at ${nextRetryAt ? new Date(nextRetryAt).toLocaleTimeString() : "N/A"}`,
      );
    } else {
      // Permanent failure - map category to error type
      errorType =
        retryDecision.category === "AUTH_INVALID"
          ? "authentication_failed"
          : retryDecision.category === "NOT_FOUND"
            ? "invalid_format"
            : "unknown";
      console.log(
        `[ValidatorJob] Permanent failure for ${label}: ${retryDecision.reason}`,
      );
    }

    const result: BackgroundValidationResult = {
      keyId,
      providerId,
      status,
      models: [],
      errorType,
      errorMessage: error.message || "Validation failed",
      validatedAt: Date.now(),
    };

    await vaultService.updateKey(keyId, {
      verificationStatus: status,
      verifiedModels: [],
      nextRetryAt,
    });

    this.validationResults.set(keyId, result);
    this.emit({
      type: "validation_failed",
      keyId,
      label,
      providerId,
      progress: 100,
      result,
    });
    this.validationQueue.delete(keyId);
    return result;
  }

  // Model Discovery Methods (moved from engine)
  async getModelsForKey(keyId: string) {
    return modelMetadataService.getModelsForKey(keyId);
  }
  async isModelAvailable(keyId: string, modelId: string) {
    return modelMetadataService.isModelAvailable(keyId, modelId);
  }
  async getAllAvailableModels() {
    const [openai, anthropic, gemini] = await Promise.all([
      modelMetadataService.getAvailableModels("openai"),
      modelMetadataService.getAvailableModels("anthropic"),
      modelMetadataService.getAvailableModels("gemini"),
    ]);
    return { openai, anthropic, gemini };
  }

  /**
   * Targeted retry for specific models of a key
   */
  async retryKeyModels(keyId: string, modelIds: string[]) {
    const keyMeta = (await vaultService.listKeys()).find((k) => k.id === keyId);
    if (!keyMeta || keyMeta.isRevoked) return { retried: 0, recovered: 0 };

    const apiKey = await vaultService.getKey(keyId);
    const adapter = getProviderAdapter(keyMeta.providerId);
    const { availabilityManager } = await import("../services/availability");

    let retried = 0;
    let recovered = 0;

    for (const modelId of modelIds) {
      retried++;
      try {
        await adapter.chat(apiKey, {
          model: modelId,
          messages: [{ role: "user", content: "ping" }],
          maxTokens: 1,
          temperature: 0,
          timeout: 10_000,
        });

        await availabilityManager.markModelAvailable(keyId, modelId);
        await vaultService.updateKey(keyId, { verificationStatus: "valid" });
        recovered++;
      } catch (e: any) {
        const message = e?.message ?? String(e);
        const code = extractErrorCode(message) ?? 500;
        await availabilityManager.handleRuntimeError(
          keyId,
          modelId,
          code,
          message,
        );
      }
    }
    return { retried, recovered };
  }

  /**
   * Periodic Retry Core Logic (called by scheduler)
   */
  async retryUnavailableModels() {
    const { REVALIDATION_CONFIG } =
      await import("../services/availability/retry-strategy");

    // 1. Fetch models due for retry (failed/cooldown)
    const due = await modelMetadataService.getModelsDueForRetry(50);

    // 2. Fetch models that are available but haven't been checked in a while (stale)
    let stale: VerifiedModelMetadata[] = [];
    if (REVALIDATION_CONFIG.ENABLED) {
      stale = await modelMetadataService.getStaleModels(
        REVALIDATION_CONFIG.MAX_AGE_MS,
      );
      // Limit stale checks to avoid bursty traffic
      stale = stale.slice(0, REVALIDATION_CONFIG.BATCH_SIZE);
    }

    const allToCheck = [...due, ...stale];
    if (allToCheck.length === 0) {
      return { retried: 0, recovered: 0 };
    }

    const { availabilityManager } = await import("../services/availability");

    let retried = 0;
    let recovered = 0;

    // Group models by keyId
    const byKey = new Map<string, VerifiedModelMetadata[]>();
    for (const m of allToCheck) {
      if (!m.keyId) continue; // Safety guard against corrupt records
      const list = byKey.get(m.keyId) ?? [];
      list.push(m);
      byKey.set(m.keyId, list);
    }

    for (const [keyId, models] of byKey) {
      try {
        const keyMeta = (await vaultService.listKeys()).find(
          (k) => k.id === keyId,
        );
        if (!keyMeta || keyMeta.isRevoked) continue;

        const apiKey = await vaultService.getKey(keyId);
        const adapter = getProviderAdapter(keyMeta.providerId);

        for (let i = 0; i < models.length; i++) {
          const model = models[i];
          retried++;

          try {
            /**
             * Minimal probe request:
             * - 1 token
             * - shortest prompt
             * - hard timeout
             */
            await adapter.chat(apiKey, {
              model: model.modelId,
              messages: [{ role: "user", content: "ping" }],
              maxTokens: 1,
              temperature: 0,
              timeout: 10_000,
            });

            // Mark available
            await availabilityManager.markModelAvailable(keyId, model.modelId);

            // Explicitly mark key as valid if we recovered a model
            await vaultService.updateKey(keyId, {
              verificationStatus: "valid",
            });

            recovered++;
          } catch (e: any) {
            const message = e?.message ?? String(e);
            const code = extractErrorCode(message) ?? 500;

            await availabilityManager.handleRuntimeError(
              keyId,
              model.modelId,
              code,
              message,
            );

            /**
             * Rate limit handling:
             * Stop immediately for this key and back off remaining models.
             */
            if (code === 429) {
              console.warn(
                `[ValidatorJob] Rate limit hit for key ${keyId}, backing off remaining models`,
              );

              const backoffUntil = Date.now() + 60 * 60 * 1000; // 1 hour

              const remaining = models.slice(i + 1).map((m) => ({
                ...m,
                nextRetryAt: backoffUntil,
                lastCheckedAt: Date.now(),
              }));

              if (remaining.length > 0) {
                await modelMetadataService.saveModelMetadataBatch(remaining);
              }

              break; // stop processing this key entirely
            }
          }

          // Gentle throttle between probes
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (e) {
        console.warn(`[ValidatorJob] Retry failed for key ${keyId}`, e);
      }
    }

    return { retried, recovered };
  }
}

export const validatorJob = new BackgroundValidatorJob();
