/**
 * Validator Service
 *
 * Orchestrates key validation and model discovery.
 * Coordinates background checks and manages the validation queue.
 *
 * Replaces the old monolithic ValidatorJob.
 */

import { modelVerifier } from "./model-verifier";
import { retryScheduler } from "./retry-scheduler";
import { vaultService } from "../vault/vault.service";
import { db } from "../../db";
import type {
  ValidationEvent,
  ValidationEventListener,
  ValidationTask,
} from "./validation.types";
import { DEFAULT_VALIDATION_CONFIG } from "./validation.types";
import { modelMetadataService } from "../engines/model-discovery.service";
import { availabilityCache } from "../availability/availability.cache";
import { calculateRetry } from "../availability/retry-strategy";

// ============================================
// VALIDATOR SERVICE
// ============================================

export class ValidatorService {
  private queue: ValidationTask[] = [];
  private activeCount = 0;
  private listeners: ValidationEventListener[] = [];
  private schedulerInterval: ReturnType<typeof setTimeout> | null = null;
  private config = DEFAULT_VALIDATION_CONFIG;
  private validationResults = new Map<string, ValidationEvent>();
  private activeJobs = new Set<string>();

  constructor() {
    // Start processing loop
    this.startWorker();

    // Start retry scheduler (runs every minute)
    if (typeof window !== "undefined") {
      this.startScheduler();
    }
  }

  /**
   * Queue a key for validation
   */
  async queueValidation(keyId: string, priority: number = 1): Promise<void> {
    try {
      const keys = await vaultService.listKeys();
      const keyMeta = keys.find((k) => k.id === keyId);
      if (!keyMeta) {
        console.warn(
          `[ValidatorService] Key ${keyId} not found, cannot validate`,
        );
        return;
      }

      const apiKey = await vaultService.getKey(keyId);

      this.pushTask({
        keyId,
        providerId: keyMeta.providerId,
        label: keyMeta.label,
        apiKey,
        isRetry: false,
        priority,
        queuedAt: Date.now(),
      });

      console.log(`[ValidatorService] Queued validation for ${keyMeta.label}`);
    } catch (e) {
      console.error(
        `[ValidatorService] Failed to queue validation for ${keyId}:`,
        e,
      );
    }
  }

  /**
   * Resume any pending validations from previous session
   */
  async resumePendingValidations(): Promise<void> {
    try {
      const keys = await vaultService.listKeys();
      const pending = keys.filter((k) => k.verificationStatus === "testing");

      if (pending.length === 0) return;

      console.log(
        `[ValidatorService] Resuming ${pending.length} pending validations...`,
      );

      for (const key of pending) {
        // Re-queue with high priority
        await this.queueValidation(key.id, 2);
      }
    } catch (e) {
      console.error("[ValidatorService] Failed to resume validations:", e);
    }
  }

  /**
   * Force run the retry scheduler
   */
  async retryUnavailableModels(): Promise<{
    retried: number;
    recovered: number;
  }> {
    return retryScheduler.failoverRetry();
  }

  /**
   * Subscribe to validation events
   */
  subscribe(listener: ValidationEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Check if a specific key is currently being validated.
   */
  isValidating(keyId: string): boolean {
    return (
      this.activeJobs.has(keyId) || this.queue.some((t) => t.keyId === keyId)
    );
  }

  /**
   * Cancel an ongoing validation task.
   */
  cancelValidation(keyId: string): void {
    // Remove from queue
    this.queue = this.queue.filter((t) => t.keyId !== keyId);
    // Note: We cannot easily cancel an in-flight verification batch (executeTask),
    // but removing from queue prevents it from starting.
  }

  /**
   * Get the last validation outcome for a key.
   */
  getValidationResult(keyId: string): ValidationEvent | undefined {
    return this.validationResults.get(keyId);
  }

  // ============================================
  // MODEL METADATA PROXIES
  // ============================================

  async getAllAvailableModels() {
    return modelMetadataService.queryAvailableModels({});
  }

  async getModelsForKey(keyId: string) {
    return modelMetadataService.getModelsForKey(keyId);
  }

  async isModelAvailable(keyId: string, modelId: string) {
    return modelMetadataService.isModelAvailable(keyId, modelId);
  }

  /**
   * Force run the retry scheduler
   */
  async runRetryPass(): Promise<{ retried: number; recovered: number }> {
    return retryScheduler.failoverRetry();
  }

  // ============================================
  // INTERNAL WORKER LOGIC
  // ============================================

  private pushTask(task: ValidationTask) {
    this.queue.push(task);
    // Sort by priority (desc) then time (asc)
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.queuedAt - b.queuedAt;
    });
    this.processQueue();
  }

  private async processQueue() {
    if (this.activeCount >= this.config.maxConcurrency) return;
    if (this.queue.length === 0) return;

    const task = this.queue.shift();
    if (!task) return;

    this.activeCount++;

    try {
      await this.executeTask(task);
    } catch (e) {
      console.error(`[ValidatorService] Task failed for ${task.keyId}:`, e);

      // CRITICAL: Ensure key is not stuck in 'testing' state if worker crashes
      try {
        await vaultService.updateKey(task.keyId, {
          verificationStatus: "invalid",
        });
      } catch (vaultErr) {
        console.error(
          `[ValidatorService] Failed to clear testing status for ${task.keyId}:`,
          vaultErr,
        );
      }

      this.emit({
        type: "validation:error",
        keyId: task.keyId,
        provider: task.providerId,
        label: task.label,
        error: e as Error,
      });
    } finally {
      this.activeCount--;
      // Continue processing
      this.processQueue();
    }
  }

  private async executeTask(task: ValidationTask) {
    this.emit({
      type: "validation:start",
      keyId: task.keyId,
      provider: task.providerId,
      label: task.label,
      totalModels: 0, // Will be updated after discovery
    });

    // Mark key as verifying in vault
    await vaultService.updateKey(task.keyId, { verificationStatus: "testing" });

    // Get the provider adapter
    const { getProviderAdapter } =
      await import("../../providers/provider.registry");
    const adapter = getProviderAdapter(task.providerId);

    // Determine which models to check for this provider
    // Priority: 1) modelsByProvider config, 2) dynamic discovery
    let modelsForProvider: string[] = [];
    try {
      modelsForProvider = await this.resolveModelsForProvider(
        task.providerId,
        task.apiKey,
        adapter,
      );
    } catch (e: any) {
      console.error(
        `[ValidatorService] Discovery failed for ${task.label}:`,
        e,
      );

      const errorCode =
        e.status ||
        e.code ||
        (typeof e.message === "string" && e.message.includes("429")
          ? 429
          : undefined);
      const decision = calculateRetry(
        errorCode ? Number(errorCode) : undefined,
        e.message,
        0, // Discovery retry count starts at 0
      );

      if (decision.shouldRetry) {
        console.log(
          `[ValidatorService] Scheduling retry for key ${task.label} in ${Math.round(decision.delayMs / 1000)}s`,
        );
        await vaultService.updateKey(task.keyId, {
          verificationStatus: "retry_scheduled",
          retryAfter: decision.nextRetryAt || undefined,
        });
      } else {
        await vaultService.updateKey(task.keyId, {
          verificationStatus: "invalid",
        });
      }

      this.emit({
        type: "validation:error",
        keyId: task.keyId,
        provider: task.providerId,
        label: task.label,
        error: e as Error,
      });
      return;
    }

    // Handle case where no models to check
    if (modelsForProvider.length === 0) {
      console.warn(
        `[ValidatorService] No models configured for ${task.providerId}, marking key as untested`,
      );
      await vaultService.updateKey(task.keyId, {
        verificationStatus: "untested",
      });
      this.emit({
        type: "validation:error",
        keyId: task.keyId,
        provider: task.providerId,
        label: task.label,
        error: new Error(
          `No models configured for provider ${task.providerId}`,
        ),
      });
      return;
    }

    console.log(
      `[ValidatorService] Provider ${task.providerId} discovered ${modelsForProvider.length} models, initializing cache...`,
    );

    // Initialize in Dexie immediately so UI shows total model count during verification
    const { availabilityManager } = await import("../availability");
    await availabilityManager.initializeKeyModels(
      task.keyId,
      task.providerId,
      modelsForProvider,
    );

    // Mark them as CHECKING in the DB since executeTask is now verifying them
    await db.modelCache
      .where("keyId")
      .equals(task.keyId)
      .modify({ state: "CHECKING" });

    // Initialize in-memory cache for the router
    availabilityCache.initializeKey(
      task.keyId,
      task.providerId,
      modelsForProvider,
    );

    // Run verification with only provider-appropriate models
    const results = await modelVerifier.verifyBatch(
      task.keyId,
      task.apiKey,
      modelsForProvider,
      task.providerId,
      task.label,
      this.config.batchSize,
      undefined,
      (result, current, total) => {
        this.emit({
          type: "validation:model",
          keyId: task.keyId,
          provider: task.providerId,
          label: task.label,
          model: result.modelId,
          status: result,
          current,
          total,
        });
      },
    );

    // Save results
    await modelMetadataService.saveModelMetadataBatch(results);

    // Analyze outcome
    const successCount = results.filter((r) => r.state === "AVAILABLE").length;
    const isValid = successCount > 0;

    // Update key status
    await vaultService.updateKey(task.keyId, {
      verificationStatus: isValid ? "valid" : "invalid",
      verifiedModels: results
        .filter((m) => m.isAvailable)
        .map((m) => m.modelId),
      retryAfter: undefined, // Clear any discovery retry
    });

    this.emit({
      type: "validation:complete",
      keyId: task.keyId,
      provider: task.providerId,
      label: task.label,
      success: isValid,
      modelsFound: successCount,
      totalModels: modelsForProvider.length,
    });
  }

  private emit(event: ValidationEvent) {
    // Record last result for successful/terminal events
    if (
      event.type === "validation:complete" ||
      event.type === "validation:error"
    ) {
      this.validationResults.set(event.keyId, event);
      this.activeJobs.delete(event.keyId);
    } else if (event.type === "validation:start") {
      this.activeJobs.add(event.keyId);
    }

    this.listeners.forEach((l) => l(event));
  }

  private startWorker() {
    // Worker loop is event-driven by processQueue calls
  }

  private startScheduler() {
    if (this.schedulerInterval) clearInterval(this.schedulerInterval);
    // Run every minute
    this.schedulerInterval = setInterval(() => {
      retryScheduler.failoverRetry().catch((e) => {
        console.error("[ValidatorService] Scheduler run failed:", e);
      });
    }, 60 * 1000);
  }

  // ============================================
  // MODEL RESOLUTION
  // ============================================

  /**
   * Resolve which models to check for a provider.
   * 2-tier fallback:
   *   1) modelsByProvider config (preferred)
   *   2) Dynamic discovery via adapter.listModels() (auto-discovery)
   */
  private async resolveModelsForProvider(
    providerId: import("../../models/types").AIProviderId,
    apiKey: string,
    adapter: import("../../providers/types").IProviderAdapter,
  ): Promise<string[]> {
    // 1) Check provider-specific config
    const configuredModels = this.config.modelsByProvider?.[providerId];
    if (configuredModels && configuredModels.length > 0) {
      console.log(
        `[ValidatorService] Using configured models for ${providerId}:`,
        configuredModels,
      );
      return configuredModels;
    }

    // 2) Dynamic discovery via API
    console.log(
      `[ValidatorService] No models configured for ${providerId}, attempting dynamic discovery...`,
    );
    try {
      const discoveredModels = await adapter.listModels(apiKey);
      if (discoveredModels.length > 0) {
        console.log(
          `[ValidatorService] Discovered ${discoveredModels.length} models for ${providerId}:`,
          discoveredModels,
        );
        return discoveredModels;
      }
    } catch (error) {
      console.error(
        `[ValidatorService] Dynamic model discovery failed for ${providerId}:`,
        error,
      );
      throw error; // Rethrow to allow executeTask to handle retry logic
    }

    // No models found
    return [];
  }

  // ============================================
  // CONFIGURATION
  // ============================================

  /**
   * Update validation configuration at runtime.
   * Allows adding/modifying provider model lists without restart.
   */
  updateConfig(
    partialConfig: Partial<import("./validation.types").ValidationConfig>,
  ): void {
    this.config = { ...this.config, ...partialConfig };
    console.log("[ValidatorService] Config updated:", this.config);
  }

  /**
   * Add or update models for a specific provider.
   */
  setModelsForProvider(
    providerId: import("../../models/types").AIProviderId,
    models: string[],
  ): void {
    this.config.modelsByProvider = {
      ...this.config.modelsByProvider,
      [providerId]: models,
    };
    console.log(`[ValidatorService] Updated models for ${providerId}:`, models);
  }

  /**
   * Get current configuration (for debugging/inspection)
   */
  getConfig(): import("./validation.types").ValidationConfig {
    return { ...this.config };
  }
}

// Singleton instance
export const validatorService = new ValidatorService();
