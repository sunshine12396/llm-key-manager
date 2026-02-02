import { KeyMetadata, AIProviderId } from "../../models/metadata";
import { vaultService } from "../vault/vault.service";
import { safetyGuard } from "../availability/safety-guard"; // Use new SafetyGuard
import { type CircuitState } from "../availability/safety-guard";
import { retryService } from "../policies/retry.policy";
import { keyRouter } from "./routing.engine";
import { quotaManager } from "../policies/quota.policy";
import { extractErrorCode } from "../../core/errors";

/**
 * Provider-specific rate limit configurations
 * These are default retry times when the API doesn't provide a specific retry-after value
 */
const PROVIDER_RATE_LIMIT_DEFAULTS: Record<
  AIProviderId,
  {
    defaultRetryMs: number; // Default retry time for generic 429
    quotaExhaustedRetryMs: number; // Retry time when quota is exhausted (usually longer)
    dailyLimitRetryMs: number; // Retry time for daily limit hit
  }
> = {
  gemini: {
    defaultRetryMs: 60_000, // 1 minute for RPM limits
    quotaExhaustedRetryMs: 60_000, // 1 minute for free tier (resets per-minute)
    dailyLimitRetryMs: 86_400_000, // 24 hours for daily quota
  },
  openai: {
    defaultRetryMs: 60_000, // 1 minute for RPM/TPM limits
    quotaExhaustedRetryMs: 3_600_000, // 1 hour for quota
    dailyLimitRetryMs: 86_400_000, // 24 hours for daily limits
  },
  anthropic: {
    defaultRetryMs: 60_000, // 1 minute for rate limits
    quotaExhaustedRetryMs: 3_600_000, // 1 hour for quota
    dailyLimitRetryMs: 86_400_000, // 24 hours for daily limits
  },
};

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

/**
 * Resilient Request Handler
 * Combines circuit breaker, retry, and key routing for robust API calls.
 */
export class ResilientRequestHandler {
  /**
   * Check if a key is currently rate-limited based on retryAfter timestamp
   */
  private isRateLimited(key: KeyMetadata): boolean {
    if (!key.retryAfter) return false;
    const now = Date.now();
    if (now < key.retryAfter) {
      const waitSecs = Math.ceil((key.retryAfter - now) / 1000);
      console.log(
        `[RateLimitSkip] Key ${key.label} is rate-limited. Retry in ${waitSecs}s. Skipping.`,
      );
      return true;
    }
    return false;
  }
  /**
   * Helper: Check if a key is usable
   */
  private isKeyUsable(
    key: KeyMetadata,
    skipCircuitBreaker: boolean,
    skipReasons: any,
  ): boolean {
    // Check global/manual key disable
    if (safetyGuard.isKeyDisabled(key.id)) {
      return false;
    }

    // Check rate-limit (retryAfter timestamp)
    if (this.isRateLimited(key)) {
      const retryIn = Math.ceil((key.retryAfter! - Date.now()) / 1000);
      skipReasons.rateLimited.push({ label: key.label, retryIn });
      return false;
    }

    // Check circuit breaker (SafetyGuard)
    if (!skipCircuitBreaker && safetyGuard.isKeyCircuitOpen(key.id)) {
      skipReasons.circuitOpen.push(key.label);
      return false;
    }

    // Check quota
    if (!quotaManager.hasAvailableQuota(key.id)) {
      skipReasons.quotaExhausted.push(key.label);
      return false;
    }

    return true;
  }

  /**
   * Execute a request with full resilience features
   */
  async executeRequest<T>(
    providerId: AIProviderId,
    requestFn: (apiKey: string, key: KeyMetadata) => Promise<T>,
    options: RequestOptions = {},
  ): Promise<APIResponse<T>> {
    // Global Safety Check: Is provider disabled?
    if (safetyGuard.isProviderDisabled(providerId)) {
      return {
        success: false,
        attempts: 0,
        error: new Error(
          `Provider ${providerId} is temporarily disabled by global safety guard.`,
        ),
      };
    }

    const allKeys = await vaultService.listKeys(providerId);
    // Exclude revoked and disabled keys
    const keys = allKeys.filter((k) => !k.isRevoked && k.isEnabled !== false);

    const triedKeys: string[] = [];
    let lastError: Error | undefined;
    let totalAttempts = 0;

    // Track skip reasons for better error messages
    const skipReasons = {
      rateLimited: [] as { label: string; retryIn: number }[],
      circuitOpen: [] as string[],
      quotaExhausted: [] as string[],
      noMatchingModels: [] as string[],
    };

    while (triedKeys.length < keys.length) {
      // Select next best key
      const selectedKey = keyRouter.selectKey(
        keys,
        providerId,
        triedKeys,
        options.modelId,
      );

      if (!selectedKey) {
        break;
      }

      // Check usability
      if (
        !this.isKeyUsable(
          selectedKey,
          !!options.skipCircuitBreaker,
          skipReasons,
        )
      ) {
        triedKeys.push(selectedKey.id);
        continue;
      }

      try {
        // Get decrypted key
        const apiKey = await vaultService.getKey(selectedKey.id);
        const startTime = Date.now();

        // Execute with retry & timeout
        const result = await retryService.execute(
          () =>
            this.withTimeout(
              requestFn(apiKey, selectedKey),
              options.timeout || 60000,
            ),
          {
            onRetry: (attempt, delay, error) => {
              console.log(
                `Retry ${attempt} for key ${selectedKey.label} after ${delay}ms: ${error.message}`,
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
        totalAttempts += result.attempts;

        // Update persistent stats (latency, usage count)
        vaultService
          .updateUsageStats(selectedKey.id, duration, result.success)
          .catch(console.error);

        if (result.success && result.data && (result.data as any).usage) {
          const usage = (result.data as any).usage;
          const usedModel = (result.data as any).model;
          quotaManager.recordUsage(
            selectedKey.id,
            selectedKey.providerId,
            usage.promptTokens || 0,
            usage.completionTokens || 0,
            usedModel,
          );
        }

        if (result.success) {
          // Record success to SafetyGuard
          safetyGuard.recordKeySuccess(selectedKey.id);
          keyRouter.recordSuccess(selectedKey.id);

          // Mark key as healthy for rotation system
          keyRouter.markHealthy(selectedKey.id, selectedKey.providerId);

          // Clear rate-limit flag on success (key recovered)
          if (selectedKey.retryAfter) {
            vaultService
              .updateKey(selectedKey.id, { retryAfter: undefined })
              .catch(console.error);
          }

          return {
            success: true,
            data: result.data,
            keyUsed: selectedKey.id,
            attempts: totalAttempts,
            duration,
          };
        } else {
          lastError = result.error || new Error("Unknown error");
          await this.handleError(selectedKey, lastError);
          triedKeys.push(selectedKey.id);
        }
      } catch (error) {
        totalAttempts++;
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if it's a "no matching models" error
        if (lastError.message.includes("no verified models")) {
          skipReasons.noMatchingModels.push(selectedKey.label);
        }

        await this.handleError(selectedKey, lastError);
        triedKeys.push(selectedKey.id);
      }
    }

    // Build informative error message
    let errorMessage = "No available keys";
    const parts: string[] = [];

    if (keys.length === 0) {
      errorMessage = `No ${providerId} keys configured. Please add a key in the vault.`;
    } else {
      if (skipReasons.rateLimited.length > 0) {
        const shortest = Math.min(
          ...skipReasons.rateLimited.map((r) => r.retryIn),
        );
        parts.push(
          `${skipReasons.rateLimited.length} key(s) rate-limited (retry in ${shortest}s)`,
        );
      }
      if (skipReasons.quotaExhausted.length > 0) {
        parts.push(
          `${skipReasons.quotaExhausted.length} key(s) quota exhausted`,
        );
      }
      if (skipReasons.circuitOpen.length > 0) {
        parts.push(
          `${skipReasons.circuitOpen.length} key(s) circuit-breaker open`,
        );
      }
      if (skipReasons.noMatchingModels.length > 0) {
        parts.push(
          `${skipReasons.noMatchingModels.length} key(s) have no matching models`,
        );
      }

      if (parts.length > 0) {
        errorMessage = `All ${providerId} keys unavailable: ${parts.join(", ")}`;
      } else if (lastError) {
        errorMessage = lastError.message;
      }
    }

    return {
      success: false,
      error: new Error(errorMessage),
      attempts: totalAttempts,
    };
  }

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
      // Use SafetyGuard for circuit state
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
   * Handle errors encountered during request execution
   */
  private async handleError(key: KeyMetadata, error: Error): Promise<void> {
    const errorMsg = error.message || "";
    const errorCode = extractErrorCode(errorMsg);
    let errorType:
      | "rate_limit"
      | "auth"
      | "server"
      | "network"
      | "quota"
      | "unknown" = "unknown";

    // 1. Handle Rate Limits (429) -> Record Failure (SafetyGuard handles threshold)
    if (errorCode === 429) {
      const providerDefaults = PROVIDER_RATE_LIMIT_DEFAULTS[key.providerId];

      // Determine the type of rate limit from error message
      const isDailyLimit =
        errorMsg.includes("PerDay") ||
        errorMsg.includes("daily") ||
        errorMsg.includes("per day");
      const isQuotaExhausted =
        errorMsg.includes("insufficient_quota") ||
        errorMsg.includes("limit: 0") ||
        errorMsg.includes("quota");

      // Only set retryAfter cooldown for quota exhaustion (no models available)
      // For simple rate limits, just skip to next key without persistent cooldown
      if (isQuotaExhausted || isDailyLimit) {
        // Parse retryAfter from error message
        let retryAfterMs: number;
        const retryMatch = errorMsg.match(/retry in ([\d.]+)s/i);
        const delayMatch = errorMsg.match(/"retryDelay"\s*:\s*"(\d+)s"/i);

        if (retryMatch) {
          retryAfterMs = Math.ceil(parseFloat(retryMatch[1]) * 1000);
        } else if (delayMatch) {
          retryAfterMs = parseInt(delayMatch[1]) * 1000;
        } else {
          retryAfterMs = isDailyLimit
            ? providerDefaults.dailyLimitRetryMs
            : providerDefaults.quotaExhaustedRetryMs;
        }

        const retryAfterTimestamp = Date.now() + retryAfterMs;
        errorType = "quota";
        console.warn(
          `Key ${key.label} has Exhausted Quota. Marking unavailable for ${retryAfterMs / 1000}s...`,
        );

        // Record to Safety Guard
        safetyGuard.recordKeyFailure(key.id, key.providerId);
        keyRouter.recordError(key.id);

        // Trigger automatic key rotation
        keyRouter.markRateLimited(key.id, key.providerId, retryAfterMs);

        await vaultService.updateKey(key.id, {
          retryAfter: retryAfterTimestamp,
        });
      } else {
        // Simple rate limit
        errorType = "rate_limit";
        console.warn(
          `Key ${key.label} hit rate limit. Switching to next key...`,
        );
        // Record to Safety Guard
        safetyGuard.recordKeyFailure(key.id, key.providerId);
        keyRouter.recordError(key.id);
      }
    }
    // 2. Handle Quota/Auth (401/403) -> Revoke or Disable
    else if (errorCode === 401 || errorCode === 403) {
      errorType = "auth";
      console.warn(
        `Key ${key.label} Auth/Quota Failed: ${errorMsg}. Revoking...`,
      );
      await vaultService.revokeKey(key.id);
      quotaManager.setLimit(key.id, 0);
      await vaultService.updateKey(key.id, { verificationStatus: "invalid" });
      // Also record failure to trip circuit if needed (though revoking is stronger)
      safetyGuard.recordKeyFailure(key.id, key.providerId);
    }
    // 3. Other Errors (5xx, Network) -> Record error to deprioritize
    else {
      errorType = errorMsg.toLowerCase().includes("timeout")
        ? "network"
        : "server";
      safetyGuard.recordKeyFailure(key.id, key.providerId);
      // Also record to provider circuit
      safetyGuard.recordProviderFailure(key.providerId);
      keyRouter.recordError(key.id);
    }

    // Persistent analytics logging
    try {
      const { analyticsService } = await import("../analytics.service");
      await analyticsService.recordError({
        keyId: key.id,
        providerId: key.providerId,
        errorType,
        message: errorMsg,
        retryCount: 0,
      });
    } catch (e) {
      console.error("Analytics recording failed", e);
    }
  }
}

export const resilientHandler = new ResilientRequestHandler();
