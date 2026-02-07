/**
 * Error-Aware Retry Strategy
 *
 * Different error types require different retry approaches:
 * - Auth errors (401/403/404): Stop immediately, don't waste API calls
 * - Rate limits (429): Long backoff, wait for quota reset
 * - Server errors (5xx): Fast retry, usually transient
 * - Network/Timeout: Limited retries, may be local issue
 */

import type { ModelPriority } from "../../models/types";
import type { ModelState } from "./state-machine";

// ============================================
// ERROR CLASSIFICATION
// ============================================

/**
 * Error categories for retry decisions.
 */
export type ErrorCategory =
  | "AUTH_INVALID" // 401, 403 - Bad key or no access
  | "NOT_FOUND" // 404 - Model doesn't exist
  | "RATE_LIMITED" // 429 - Quota exhausted
  | "SERVER_ERROR" // 5xx - Provider issue
  | "NETWORK_ERROR" // Connection/timeout issues
  | "CLIENT_ERROR" // Other 4xx
  | "UNKNOWN"; // Can't determine

/**
 * Classify an error based on HTTP code and message.
 */
export function classifyError(
  errorCode?: number,
  errorMessage?: string,
): ErrorCategory {
  if (!errorCode && !errorMessage) return "UNKNOWN";

  // HTTP code based classification
  if (errorCode) {
    if (errorCode === 401 || errorCode === 403) return "AUTH_INVALID";
    if (errorCode === 404) return "NOT_FOUND";
    if (errorCode === 429) return "RATE_LIMITED";
    if (errorCode >= 500 && errorCode < 600) return "SERVER_ERROR";
    if (errorCode >= 400 && errorCode < 500) return "CLIENT_ERROR";
  }

  // Message based classification (for non-HTTP errors)
  if (errorMessage) {
    const msg = errorMessage.toLowerCase();
    if (msg.includes("timeout") || msg.includes("timed out"))
      return "NETWORK_ERROR";
    if (
      msg.includes("network") ||
      msg.includes("econnrefused") ||
      msg.includes("enotfound")
    )
      return "NETWORK_ERROR";
    if (msg.includes("fetch failed") || msg.includes("connection"))
      return "NETWORK_ERROR";
    if (
      msg.includes("unauthorized") ||
      msg.includes("invalid key") ||
      msg.includes("api key")
    )
      return "AUTH_INVALID";
    if (
      msg.includes("rate limit") ||
      msg.includes("quota") ||
      msg.includes("too many")
    )
      return "RATE_LIMITED";
    if (msg.includes("not found") || msg.includes("does not exist"))
      return "NOT_FOUND";
    if (msg.includes("server error") || msg.includes("internal error"))
      return "SERVER_ERROR";
  }

  return "UNKNOWN";
}

// ============================================
// RETRY STRATEGIES
// ============================================

interface RetryConfig {
  /** Base delay in milliseconds */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds */
  maxDelayMs: number;
  /** Maximum number of retries before giving up */
  maxRetries: number;
  /** Backoff multiplier (e.g., 2 for exponential) */
  backoffMultiplier: number;
  /** Add jitter to prevent thundering herd */
  jitterPercent: number;
}

/**
 * Retry configurations per error category.
 * Designed to minimize wasted API calls while maximizing recovery chances.
 */
const RETRY_STRATEGIES: Record<ErrorCategory, RetryConfig | null> = {
  // ❌ No retry - permanent failures
  AUTH_INVALID: null,
  NOT_FOUND: null,

  // ⏳ Balanced backoff - wait for quota reset
  RATE_LIMITED: {
    baseDelayMs: 60 * 60 * 1000, // 1 hour (was 3h)
    maxDelayMs: 24 * 60 * 60 * 1000, // 24 hours (was 3d)
    maxRetries: 5, // Was 3
    backoffMultiplier: 2,
    jitterPercent: 10,
  },

  // 🔁 Responsive retry - server errors are usually quick to resolve
  SERVER_ERROR: {
    baseDelayMs: 2 * 60 * 1000, // 2 minutes (was 5m)
    maxDelayMs: 30 * 60 * 1000, // 30 minutes (was 1h)
    maxRetries: 7, // Was 5
    backoffMultiplier: 2,
    jitterPercent: 20,
  },

  // 🔁 Active retry - connection issues
  NETWORK_ERROR: {
    baseDelayMs: 5 * 60 * 1000, // 5 minutes (was 15m)
    maxDelayMs: 2 * 60 * 60 * 1000, // 2 hours (was 3h)
    maxRetries: 8, // Was 5
    backoffMultiplier: 1.5,
    jitterPercent: 15,
  },

  // 🔁 Conservative retry - unknown cause
  CLIENT_ERROR: {
    baseDelayMs: 30 * 60 * 1000, // 30 minutes (was 1h)
    maxDelayMs: 4 * 60 * 60 * 1000, // 4 hours (was 6h)
    maxRetries: 3, // Was 2
    backoffMultiplier: 2,
    jitterPercent: 10,
  },

  // 🔁 Default strategy
  UNKNOWN: {
    baseDelayMs: 30 * 60 * 1000, // 30 minutes (was 1h)
    maxDelayMs: 8 * 60 * 60 * 1000, // 8 hours (was 12h)
    maxRetries: 5, // Was 3
    backoffMultiplier: 2,
    jitterPercent: 10,
  },
};

/**
 * Global configuration for re-validating healthy models.
 */
export const REVALIDATION_CONFIG = {
  ENABLED: true,
  MAX_AGE_MS: 12 * 60 * 60 * 1000, // Re-verify healthy models every 12 hours
  BATCH_SIZE: 5,
};

// ============================================
// PRIORITY ADJUSTMENTS
// ============================================

/**
 * Priority multipliers for retry delays.
 * Higher priority models get faster retries.
 */
const PRIORITY_MULTIPLIERS: Record<ModelPriority, number> = {
  5: 0.5, // GPT-4o, Claude Sonnet - 50% faster
  4: 0.7, // GPT-4 Turbo - 30% faster
  3: 1.0, // Default
  2: 1.3, // Older models - 30% slower
  1: 1.5, // Low priority - 50% slower
};

// ============================================
// RETRY CALCULATION
// ============================================

export interface RetryDecision {
  /** Should we retry? */
  shouldRetry: boolean;
  /** Next retry timestamp (null if no retry) */
  nextRetryAt: number | null;
  /** Delay in milliseconds */
  delayMs: number;
  /** Category of the error */
  category: ErrorCategory;
  /** Human-readable explanation */
  reason: string;
  /** Suggested next state */
  nextState: ModelState;
}

/**
 * Calculate intelligent retry decision based on error type.
 */
export function calculateRetry(
  errorCode: number | undefined,
  errorMessage: string | undefined,
  retryCount: number,
  modelPriority: ModelPriority = 3,
): RetryDecision {
  const category = classifyError(errorCode, errorMessage);
  const strategy = RETRY_STRATEGIES[category];

  // No retry for permanent failures
  if (!strategy) {
    return {
      shouldRetry: false,
      nextRetryAt: null,
      delayMs: 0,
      category,
      reason: getPermanentFailureReason(category),
      nextState: "PERM_FAILED",
    };
  }

  // Check max retries
  if (retryCount >= strategy.maxRetries) {
    return {
      shouldRetry: false,
      nextRetryAt: null,
      delayMs: 0,
      category,
      reason: `Max retries (${strategy.maxRetries}) exceeded for ${category}`,
      nextState: "PERM_FAILED",
    };
  }

  // Calculate delay with exponential backoff
  let delay =
    strategy.baseDelayMs * Math.pow(strategy.backoffMultiplier, retryCount);

  // Apply priority multiplier
  delay *= PRIORITY_MULTIPLIERS[modelPriority];

  // Cap at max delay
  delay = Math.min(delay, strategy.maxDelayMs);

  // Add jitter to prevent thundering herd
  const jitterRange = delay * (strategy.jitterPercent / 100);
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;
  delay = Math.round(delay + jitter);

  const nextRetryAt = Date.now() + delay;

  return {
    shouldRetry: true,
    nextRetryAt,
    delayMs: delay,
    category,
    reason: getRetryReason(category, retryCount, strategy.maxRetries, delay),
    nextState: "COOLDOWN",
  };
}

/**
 * Get human-readable reason for permanent failure.
 */
function getPermanentFailureReason(category: ErrorCategory): string {
  switch (category) {
    case "AUTH_INVALID":
      return "Authentication failed. Check API key validity and permissions.";
    case "NOT_FOUND":
      return "Model not found. It may not exist or not be available for this key.";
    default:
      return "Permanent failure. No retry scheduled.";
  }
}

/**
 * Get human-readable reason for retry.
 */
function getRetryReason(
  category: ErrorCategory,
  retryCount: number,
  maxRetries: number,
  delayMs: number,
): string {
  const delayStr = formatDelay(delayMs);
  const attempt = retryCount + 1;

  switch (category) {
    case "RATE_LIMITED":
      return `Rate limited. Retry ${attempt}/${maxRetries} in ${delayStr} (waiting for quota reset)`;
    case "SERVER_ERROR":
      return `Server error. Fast retry ${attempt}/${maxRetries} in ${delayStr}`;
    case "NETWORK_ERROR":
      return `Network issue. Retry ${attempt}/${maxRetries} in ${delayStr}`;
    case "CLIENT_ERROR":
      return `Client error. Conservative retry ${attempt}/${maxRetries} in ${delayStr}`;
    default:
      return `Unknown error. Retry ${attempt}/${maxRetries} in ${delayStr}`;
  }
}

/**
 * Format delay in human-readable form.
 */
function formatDelay(ms: number): string {
  if (ms < 60_000) {
    return `${Math.round(ms / 1000)}s`;
  } else if (ms < 3600_000) {
    return `${Math.round(ms / 60_000)}m`;
  } else {
    const hours = Math.floor(ms / 3600_000);
    const mins = Math.round((ms % 3600_000) / 60_000);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
}

// ============================================
// QUOTA HANDLING
// ============================================

/**
 * Calculate retry for quota exhaustion with optional reset time.
 * If provider tells us when quota resets, use that instead of guessing.
 */
export function calculateQuotaRetry(
  quotaResetAt?: number,
  modelPriority: ModelPriority = 3,
): RetryDecision {
  const now = Date.now();

  // If we know when quota resets, use that
  if (quotaResetAt && quotaResetAt > now) {
    const delayMs = quotaResetAt - now;
    return {
      shouldRetry: true,
      nextRetryAt: quotaResetAt,
      delayMs,
      category: "RATE_LIMITED",
      reason: `Quota exhausted. Retry when quota resets in ${formatDelay(delayMs)}`,
      nextState: "COOLDOWN",
    };
  }

  // Otherwise use default rate limit strategy
  return calculateRetry(429, "quota exhausted", 0, modelPriority);
}

// ============================================
// SUMMARY UTILITIES
// ============================================

/**
 * Get retry strategy summary for a category.
 */
export function getStrategySummary(category: ErrorCategory): string {
  const strategy = RETRY_STRATEGIES[category];
  if (!strategy) {
    return `${category}: No retry (permanent failure)`;
  }
  return `${category}: ${strategy.maxRetries} retries, ${formatDelay(strategy.baseDelayMs)} base, ${formatDelay(strategy.maxDelayMs)} max`;
}

/**
 * Get all strategy summaries for documentation/debugging.
 */
export function getAllStrategySummaries(): Record<ErrorCategory, string> {
  return Object.fromEntries(
    (Object.keys(RETRY_STRATEGIES) as ErrorCategory[]).map((cat) => [
      cat,
      getStrategySummary(cat),
    ]),
  ) as Record<ErrorCategory, string>;
}
