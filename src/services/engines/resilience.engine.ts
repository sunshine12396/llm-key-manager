/**
 * Resilience Engine
 *
 * Provides resilient API request handling with:
 * - Key resolution via keyResolver (uses availability cache)
 * - Circuit breaker integration via safetyGuard
 * - Retry logic via retryService
 * - Error handling and key rotation
 *
 * Phase 6 Refactoring: Simplified to use keyResolver instead of manual key iteration
 */

import { KeyMetadata, AIProviderId } from "../../models";
import { vaultService } from "../vault/vault.service";
import { safetyGuard, type CircuitState } from "../safety";
import { retryService } from "../policies/retry.policy";
import { quotaManager } from "../policies/quota.policy";
import { extractErrorCode } from "../../core/errors";
import { keyResolver } from "../availability";
import { availabilityManager } from "../availability";

// ============================================
// TYPES
// ============================================

interface RequestOptions {
  maxRetries?: number;
  timeout?: number;
  skipCircuitBreaker?: boolean;
  modelId?: string;
}

interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: Error;
  keyUsed?: string;
  attempts: number;
  duration?: number;
}

// ============================================
// RESILIENT REQUEST HANDLER
// ============================================

/**
 * Resilient Request Handler
 * Combines circuit breaker, retry, and key resolution for robust API calls.
 *
 * Simplified flow:
 * 1. Use keyResolver for fast key selection (O(1) cache lookup)
 * 2. Execute request with retry
 * 3. Handle errors and update availability
 */
export class ResilientRequestHandler {
  /**
   * Execute a request with full resilience features
   * Uses keyResolver for efficient key selection
   */
  async executeRequest<T>(
    providerId: AIProviderId,
    requestFn: (apiKey: string, key: KeyMetadata) => Promise<T>,
    options: RequestOptions = {},
  ): Promise<APIResponse<T>> {
    // 1. Global Safety Check: Is provider disabled?
    if (safetyGuard.isProviderDisabled(providerId)) {
      return {
        success: false,
        attempts: 0,
        error: new Error(
          `Provider ${providerId} is temporarily disabled by global safety guard.`,
        ),
      };
    }

    if (safetyGuard.isProviderCircuitOpen(providerId)) {
      return {
        success: false,
        attempts: 0,
        error: new Error(
          `Provider ${providerId} circuit breaker is OPEN. Please wait before retrying.`,
        ),
      };
    }

    const excludedKeys: string[] = [];
    let lastError: Error | undefined;
    let totalAttempts = 0;
    const maxKeys = 5; // Limit key attempts to prevent infinite loops

    // 2. Key Selection Loop
    while (excludedKeys.length < maxKeys) {
      // Use keyResolver for fast key selection
      const resolved = await keyResolver.resolve(options.modelId || "", {
        providerId,
        excludeKeyIds: excludedKeys,
      });

      if (!resolved) {
        break; // No more keys available
      }

      excludedKeys.push(resolved.keyId);
      totalAttempts++;

      try {
        const startTime = Date.now();

        // Execute with retry & timeout
        const result = await retryService.execute(
          () =>
            this.withTimeout(
              requestFn(resolved.apiKey, resolved.keyMetadata),
              options.timeout || 60000,
            ),
          {
            onRetry: (attempt, delay, error) => {
              console.log(
                `Retry ${attempt} for key ${resolved.keyMetadata.label} after ${delay}ms: ${error.message}`,
              );
            },
            shouldRetry: (error) => {
              // Don't retry on Auth/Quota/RateLimit errors - switch key immediately
              if (error instanceof Error) {
                const msg = error.message;
                const code = extractErrorCode(msg);
                if (code === 401 || code === 403 || code === 429) {
                  return false;
                }
              }
              return true;
            },
          },
        );

        const duration = Date.now() - startTime;
        totalAttempts += result.attempts - 1; // Adjust for initial attempt

        // Update persistent stats
        vaultService
          .updateUsageStats(resolved.keyId, duration, result.success)
          .catch(console.error);

        // Record quota usage if available
        if (result.success && result.data && (result.data as any).usage) {
          const usage = (result.data as any).usage;
          const usedModel = (result.data as any).model;
          quotaManager.recordUsage(
            resolved.keyId,
            resolved.providerId,
            usage.promptTokens || 0,
            usage.completionTokens || 0,
            usedModel,
          );
        }

        if (result.success) {
          // Record success
          safetyGuard.recordKeySuccess(resolved.keyId);
          keyResolver.markSuccess(
            resolved.keyId,
            resolved.modelId,
            resolved.providerId,
          );

          return {
            success: true,
            data: result.data,
            keyUsed: resolved.keyId,
            attempts: totalAttempts,
            duration,
          };
        } else {
          lastError = result.error || new Error("Unknown error");
          await this.handleError(resolved.keyMetadata, lastError, resolved.modelId);
        }
      } catch (error) {
        totalAttempts++;
        lastError = error instanceof Error ? error : new Error(String(error));
        await this.handleError(resolved.keyMetadata, lastError, resolved.modelId);
      }
    }

    // 3. Build informative error message
    let errorMessage = `No available keys for provider ${providerId}`;
    if (options.modelId) {
      errorMessage = `No available keys for model ${options.modelId} on ${providerId}`;
    }
    if (lastError) {
      errorMessage = lastError.message;
    }

    return {
      success: false,
      error: new Error(errorMessage),
      attempts: totalAttempts,
    };
  }

  /**
   * Execute with timeout
   */
  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Request timed out after ${ms}ms`)),
        ms,
      );
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  /**
   * Get health status of all keys for a provider
   */
  getKeysHealth(keys: KeyMetadata[]): Array<{
    key: KeyMetadata;
    circuitState: CircuitState;
    quotaUsage: number;
    isHealthy: boolean;
  }> {
    return keys.map((key) => {
      const circuitState = safetyGuard.getKeyCircuitState(key.id);
      const quotaUsage = quotaManager.getUsagePercentage(key.id);
      const isDisabled = safetyGuard.isKeyDisabled(key.id);

      return {
        key,
        circuitState,
        quotaUsage,
        isHealthy:
          circuitState === "CLOSED" &&
          !isDisabled &&
          quotaUsage < 1 &&
          !key.isRevoked &&
          key.isEnabled !== false,
      };
    });
  }

  /**
   * Handle errors - update availability and safety state
   */
  private async handleError(key: KeyMetadata, error: Error, modelId?: string): Promise<void> {
    const errorMsg = error.message || "";
    const errorCode = extractErrorCode(errorMsg);

    // 1. Handle Rate Limits (429)
    if (errorCode === 429) {
      console.warn(`Key ${key.label} hit rate limit. Marking unavailable...`);
      safetyGuard.recordKeyFailure(key.id, key.providerId);
      keyResolver.markFailure(key.id, modelId || "");

      // Use availabilityManager for consistent state updates
      await availabilityManager.handleRuntimeError(
        key.id,
        modelId || "",
        errorCode,
        errorMsg,
      );
    }
    // 2. Handle Auth errors (401/403) -> Revoke
    else if (errorCode === 401 || errorCode === 403) {
      console.warn(`Key ${key.label} Auth Failed. Revoking...`);
      await vaultService.revokeKey(key.id);
      quotaManager.setLimit(key.id, 0);
      await vaultService.updateKey(key.id, { verificationStatus: "invalid" });
      safetyGuard.recordKeyFailure(key.id, key.providerId);
    }
    // 3. Other Errors (5xx, Network)
    else {
      console.warn(`Key ${key.label} encountered error: ${errorMsg}`);
      safetyGuard.recordKeyFailure(key.id, key.providerId);
      safetyGuard.recordProviderFailure(key.providerId);
      keyResolver.markFailure(key.id, modelId || "");

      // Ensure state machine is updated even for unknown/network errors
      await availabilityManager.handleRuntimeError(
        key.id,
        modelId || "",
        errorCode || 0,
        errorMsg,
      );
    }

    // Analytics logging
    try {
      const { analyticsService } = await import("../analytics.service");
      await analyticsService.recordError({
        keyId: key.id,
        providerId: key.providerId,
        errorType: this.categorizeError(errorCode),
        message: errorMsg,
        retryCount: 0,
      });
    } catch {
      // Ignore analytics errors
    }
  }

  /**
   * Categorize error type from error code
   */
  private categorizeError(
    errorCode: number | null,
  ): "rate_limit" | "auth" | "server" | "network" | "quota" | "unknown" {
    if (errorCode === 429) return "rate_limit";
    if (errorCode === 401 || errorCode === 403) return "auth";
    if (errorCode && errorCode >= 500) return "server";
    return "unknown";
  }
}

export const resilientHandler = new ResilientRequestHandler();
