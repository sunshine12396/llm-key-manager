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
  ModelPriority,
} from "../../models/types";
import { ModelStateMachine, ModelState } from "./state-machine";
import {
  calculateRetry,
  calculateQuotaRetry,
  type RetryDecision,
} from "./retry-strategy";
import { safetyGuard } from "./safety-guard";

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
    // Priority 5: flagship models
    { pattern: /gpt-4o(?!-mini)/, priority: 5 },
    { pattern: /claude-3-5-sonnet/, priority: 5 },
    { pattern: /o1(?!-mini)/, priority: 5 },

    // Priority 4: Strong models
    { pattern: /o3-mini/, priority: 4 },
    { pattern: /o1-mini/, priority: 4 },
    { pattern: /gpt-4-turbo/, priority: 4 },
    { pattern: /claude-3-opus/, priority: 4 },
    { pattern: /gemini-2\.0-flash/, priority: 4 },
    { pattern: /gemini-1\.5-pro/, priority: 4 },

    // Priority 3: Good everyday models
    { pattern: /gpt-4o-mini/, priority: 3 },
    { pattern: /gpt-3\.5-turbo/, priority: 3 },
    { pattern: /claude-3-5-haiku/, priority: 3 },
    { pattern: /claude-3-haiku/, priority: 3 },
    { pattern: /gemini-1\.5-flash/, priority: 3 },

    // Priority 2: Lightweight/experimental
    { pattern: /gemini-2\.0-flash-lite/, priority: 2 },
    { pattern: /gemma/, priority: 2 },

    // Priority 1: Specialized/legacy (default)
  ];

// ============================================
// AVAILABILITY MANAGER CLASS
// ============================================

export class KeyModelAvailabilityManager {
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
   * Calculate smart retry using error-aware strategy.
   * Returns retry decision with timing, reason, and suggested next state.
   */
  calculateSmartRetry(
    errorCode: number | undefined,
    errorMessage: string | undefined,
    retryCount: number,
    modelPriority: ModelPriority = 3,
  ): RetryDecision {
    return calculateRetry(errorCode, errorMessage, retryCount, modelPriority);
  }

  /**
   * Calculate retry for quota exhaustion with optional provider reset time.
   */
  calculateQuotaRetry(
    quotaResetAt?: number,
    modelPriority: ModelPriority = 3,
  ): RetryDecision {
    return calculateQuotaRetry(quotaResetAt, modelPriority);
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

      // 3. The actual check should be performed by the validator job
      // to avoid duplicate logic and circular dependencies.
      // We'll import it dynamically to avoid issues.
      const { validatorJob } = await import("../../lifecycle/validator.job");
      await validatorJob.retryKeyModels(keyId, [modelId]);
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
    const entries: VerifiedModelMetadata[] = candidateModels.map((modelId) => ({
      modelId,
      providerId,
      keyId,
      isAvailable: false, // Start as unavailable until validated
      state: "NEW" as ModelState, // Use state machine
      lastCheckedAt: 0, // Never checked
      modelPriority: this.getModelPriority(modelId),
      retryCount: 0,
      nextRetryAt: now, // Ready for immediate validation
    }));

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
   * Get all available models for a specific key.
   */
  async getAvailableModelsForKey(
    keyId: string,
  ): Promise<VerifiedModelMetadata[]> {
    return db.modelCache
      .where("keyId")
      .equals(keyId)
      .and((m: VerifiedModelMetadata) => ModelStateMachine.isUsable(m.state))
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
    const retryDecision = this.calculateSmartRetry(
      errorCode,
      errorMessage,
      existing.retryCount,
      existing.modelPriority,
    );

    // Determine new state based on retry decision
    let newState: ModelState = retryDecision.nextState;
    const newRetryCount = existing.retryCount + 1;

    await db.modelCache.update([modelId, keyId], {
      isAvailable: false,
      state: newState,
      retryCount: newRetryCount,
      nextRetryAt: retryDecision.nextRetryAt,
      lastErrorCode: errorCode,
      errorMessage: retryDecision.reason, // Include retry reasoning
      lastCheckedAt: Date.now(),
    });

    console.log(
      `[Availability] ${modelId} -> ${newState} | ${retryDecision.reason}`,
    );

    return newState;
  }

  /**
   * Handle quota exhaustion for a key.
   * Marks all models for this key as in COOLDOWN state.
   */
  async handleQuotaExhausted(keyId: string, resetAt?: number): Promise<void> {
    const models = await db.modelCache.where("keyId").equals(keyId).toArray();

    const updates = models.map((m) => ({
      ...m,
      isAvailable: false,
      state: "COOLDOWN" as ModelState,
      quotaRemaining: 0,
      quotaResetAt: resetAt,
      nextRetryAt: resetAt || Date.now() + 60 * 60 * 1000, // Default 1 hour
      lastCheckedAt: Date.now(),
    }));

    await db.modelCache.bulkPut(updates);
    console.log(
      `[Availability] Marked ${models.length} models as quota exhausted (COOLDOWN) for key ${keyId}`,
    );
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
