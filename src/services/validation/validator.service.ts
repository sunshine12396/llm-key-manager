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
import { availabilityManager } from "../availability";
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
  private activeJobs = new Set<string>();
  private validationResults = new Map<string, ValidationEvent>();
  private discoveryCache = new Map<string, { models: string[]; expiresAt: number }>();
  private readonly DISCOVERY_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

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
    if (this.isValidating(keyId)) {
      console.log(`[ValidatorService] Key ${keyId} is already in validation pipeline, skipping queue`);
      return;
    }

    try {
      const keyMeta = await vaultService.getKeyMetadata(keyId);
      if (!keyMeta) {
        console.warn(`[ValidatorService] Key ${keyId} not found, cannot validate`);
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
    } catch (e) {
      console.error(`[ValidatorService] Failed to queue validation for ${keyId}:`, e);
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

      console.log(`[ValidatorService] Resuming ${pending.length} pending validations...`);

      // Queue all pending validations in parallel without awaiting each individual queue
      await Promise.all(pending.map(key => this.queueValidation(key.id, 2)));
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
    return availabilityManager.queryAvailableModels({});
  }

  async getModelsForKey(keyId: string) {
    return availabilityManager.getModelsForKey(keyId);
  }

  async isModelAvailable(keyId: string, modelId: string) {
    return availabilityManager.isModelUsable(keyId, modelId);
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
    const startTime = Date.now();
    this.emit({
      type: "validation:start",
      keyId: task.keyId,
      provider: task.providerId,
      label: task.label,
      totalModels: 0,
    });

    try {
      // 1. Mark as verifying
      await vaultService.updateKey(task.keyId, { verificationStatus: "testing" });

      // 2. Resolve models
      const modelsForProvider = await this.resolveModelsForProviderCached(task);
      if (modelsForProvider.length === 0) {
        await this.handleNoModels(task);
        return;
      }

      // 3. Initialize availability trackers
      await this.initAvailability(task, modelsForProvider);

      // 4. Run verification
      const results = await modelVerifier.verifyBatch(
        task.keyId,
        task.apiKey,
        modelsForProvider,
        task.providerId,
        task.label,
        this.config.batchSize,
        undefined,
        (result, current, total) => this.handleBatchProgress(task, result, current, total)
      );

      // 5. Finalize
      await this.finalizeValidation(task, results, modelsForProvider.length);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[ValidatorService] Validation completed for ${task.label} in ${duration}s`);
    } catch (e) {
      await this.handleTaskError(task, e);
    }
  }

  private async handleNoModels(task: ValidationTask) {
    console.warn(`[ValidatorService] No models for ${task.providerId}, marking key untested`);
    await vaultService.updateKey(task.keyId, { verificationStatus: "untested" });
    this.emit({
      type: "validation:error",
      keyId: task.keyId,
      provider: task.providerId,
      label: task.label,
      error: new Error(`No models configured for provider ${task.providerId}`),
    });
  }

  private async initAvailability(task: ValidationTask, models: string[]) {
    // DEXIE Sync
    const { availabilityManager } = await import("../availability");
    await availabilityManager.initializeKeyModels(task.keyId, task.providerId, models);

    // Initial state setup for Batch UI
    await db.modelCache.where("keyId").equals(task.keyId).modify({ state: "CHECKING" });

    // Memory Cache
    availabilityCache.initializeKey(task.keyId, task.providerId, models);
  }

  private async handleBatchProgress(task: ValidationTask, result: import("../../models/types").VerifiedModelMetadata, current: number, total: number) {
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

    // Save increment + Update Availability
    const { availabilityManager } = await import("../availability/availability.manager");
    if (result.isAvailable) {
      await availabilityManager.markModelAvailable(task.keyId, result.modelId);
    } else {
      // For background validation, 429 is handled by markUnusable globally
      // but here we just update the specific model if it failed for other reasons
      await availabilityManager.handleRuntimeError(
        task.keyId,
        result.modelId,
        result.lastErrorCode || 0,
        result.errorMessage || "Validation failed"
      );
    }

    // Quick Activate: mark key 'valid' if any model works
    if (result.isAvailable) {
      vaultService.updateKey(task.keyId, { verificationStatus: "valid" }).catch(() => { });
    }
  }

  private async finalizeValidation(task: ValidationTask, results: import("../../models/types").VerifiedModelMetadata[], totalDiscovered: number) {
    await availabilityManager.saveModelMetadataBatch(results);

    const successCount = results.filter(r => r.state === "AVAILABLE").length;
    const isValid = successCount > 0;

    await vaultService.updateKey(task.keyId, {
      verificationStatus: isValid ? "valid" : "invalid",
      verifiedModels: results.filter(m => m.isAvailable).map(m => m.modelId),
      retryAfter: undefined,
    });

    this.emit({
      type: "validation:complete",
      keyId: task.keyId,
      provider: task.providerId,
      label: task.label,
      success: isValid,
      modelsFound: successCount,
      totalModels: totalDiscovered,
    });
  }

  private async handleTaskError(task: ValidationTask, e: any) {
    console.error(`[ValidatorService] Task failed for ${task.keyId}:`, e);

    try {
      await vaultService.updateKey(task.keyId, { verificationStatus: "invalid" });
    } catch { }

    this.emit({
      type: "validation:error",
      keyId: task.keyId,
      provider: task.providerId,
      label: task.label,
      error: e as Error,
    });
  }

  private async resolveModelsForProviderCached(task: ValidationTask): Promise<string[]> {
    // 1. Check Config
    const configured = this.config.modelsByProvider?.[task.providerId];
    if (configured && configured.length > 0) return configured;

    // 2. Check Discovery Cache
    const cached = this.discoveryCache.get(task.providerId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.models;
    }

    // 3. Dynamic Discovery
    const { getProviderAdapter } = await import("../../providers/provider.registry");
    const adapter = getProviderAdapter(task.providerId);

    try {
      const discovered = await adapter.listModels(task.apiKey);
      if (discovered.length > 0) {
        this.discoveryCache.set(task.providerId, {
          models: discovered,
          expiresAt: Date.now() + this.DISCOVERY_CACHE_TTL
        });
      }
      return discovered;
    } catch (e: any) {
      this.handleDiscoveryError(task, e);
      throw e;
    }
  }

  private handleDiscoveryError(task: ValidationTask, e: any) {
    const errorCode = e.status || e.code;
    const decision = calculateRetry(
      errorCode ? Number(errorCode) : undefined,
      e.message,
      0
    );

    if (decision.shouldRetry) {
      vaultService.updateKey(task.keyId, {
        verificationStatus: "retry_scheduled",
        retryAfter: decision.nextRetryAt || undefined,
      }).catch(() => { });
    } else {
      vaultService.updateKey(task.keyId, { verificationStatus: "invalid" }).catch(() => { });
    }
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
