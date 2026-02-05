/**
 * Error Handling Module
 *
 * Provides typed error classes and utility functions for parsing and handling
 * LLM API errors across all providers.
 */

import { AIProviderId } from "../models/metadata";

// ============================================
// CUSTOM ERROR CLASSES
// ============================================

/**
 * Base error class for all LLM-related errors.
 * Provides structured error information including HTTP status codes and retry hints.
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly provider?: AIProviderId,
    public readonly isRetryable: boolean = false,
  ) {
    super(message);
    this.name = "LLMError";
    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LLMError);
    }
  }

  /**
   * Create an LLMError from any error type
   */
  static from(error: unknown, provider?: AIProviderId): LLMError {
    if (error instanceof LLMError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const code = extractErrorCode(message);
    const isRetryable = isTemporaryError(code);

    return new LLMError(message, code ?? undefined, provider, isRetryable);
  }
}

/**
 * Rate limit error (HTTP 429)
 * Indicates the API is temporarily throttling requests.
 */
export class RateLimitError extends LLMError {
  constructor(
    message: string,
    provider?: AIProviderId,
    public readonly retryAfterMs?: number,
  ) {
    super(message, 429, provider, true);
    this.name = "RateLimitError";
  }

  /**
   * Get the timestamp when retrying is recommended
   */
  get retryAt(): number | undefined {
    return this.retryAfterMs ? Date.now() + this.retryAfterMs : undefined;
  }
}

/**
 * Authentication error (HTTP 401, 403)
 * Indicates the API key is invalid or lacks permissions.
 */
export class AuthenticationError extends LLMError {
  constructor(message: string, provider?: AIProviderId, code: 401 | 403 = 401) {
    super(message, code, provider, false);
    this.name = "AuthenticationError";
  }
}

/**
 * Model not found error (HTTP 404)
 * Indicates the requested model doesn't exist or isn't accessible.
 */
export class ModelNotFoundError extends LLMError {
  constructor(
    message: string,
    public readonly modelId: string,
    provider?: AIProviderId,
  ) {
    super(message, 404, provider, false);
    this.name = "ModelNotFoundError";
  }
}

/**
 * Quota exhausted error (HTTP 403/429 with quota message)
 * Indicates the account has exceeded its usage quota.
 */
export class QuotaExhaustedError extends LLMError {
  constructor(
    message: string,
    provider?: AIProviderId,
    public readonly resetAt?: number,
  ) {
    super(message, 403, provider, false);
    this.name = "QuotaExhaustedError";
  }
}

/**
 * Unsupported operation error (HTTP 501/400)
 * Indicates the provider does not support the requested capability.
 */
export class UnsupportedOperationError extends LLMError {
  constructor(message: string, provider?: AIProviderId) {
    super(message, 501, provider, false);
    this.name = "UnsupportedOperationError";
  }
}

/**
 * Server error (HTTP 5xx)
 * Indicates an issue on the provider's side.
 */
export class ServerError extends LLMError {
  constructor(message: string, code: number = 500, provider?: AIProviderId) {
    super(message, code, provider, true);
    this.name = "ServerError";
  }
}

// ============================================
// ERROR CODE EXTRACTION
// ============================================

/** Common HTTP error codes matched by extractErrorCode */
const COMMON_HTTP_CODES = [
  400, 401, 402, 403, 404, 405, 408, 410, 422, 429, 500, 502, 503, 504,
];

/**
 * Extract HTTP error code from an error message string.
 * Looks for patterns like "404", "status: 500", "error 429", etc.
 *
 * @param message The error message string to parse
 * @returns The integer error code if found, null otherwise
 */
export function extractErrorCode(message: string): number | null {
  if (!message) return null;

  // Build regex pattern for common HTTP codes
  const codePattern = COMMON_HTTP_CODES.join("|");

  // Try to find HTTP status codes in the message
  const patterns = [
    new RegExp(`\\b(${codePattern})\\b`), // Common HTTP Error Codes as standalone words
    /status[:\s]*(\d{3})/i, // "status: 404"
    /code[:\s]*(\d{3})/i, // "code: 500"
    /error[:\s]*(\d{3})/i, // "error: 502"
    /failed with (\d{3})/i, // "failed with 400"
    /HTTP (\d{3})/i, // "HTTP 500"
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

// ============================================
// ERROR CLASSIFICATION UTILITIES
// ============================================

/**
 * Check if an error represents a temporary failure (rate limit, server error)
 * These errors are candidates for retry.
 */
export function isTemporaryError(errorCode: number | null): boolean {
  if (!errorCode) return false;
  return errorCode === 429 || errorCode >= 500;
}

/**
 * Check if an error represents a permanent failure (auth, not found)
 * These errors should not be retried without user intervention.
 */
export function isPermanentError(errorCode: number | null): boolean {
  if (!errorCode) return false;
  return errorCode === 401 || errorCode === 403 || errorCode === 404;
}

/**
 * Check if an error is a rate limit error
 */
export function isRateLimitError(errorCode: number | null): boolean {
  // 429 is standard, but 503 is often used for "Service Unavailable" / Capacity Overload
  return errorCode === 429 || errorCode === 503;
}

/**
 * Check if an error is an authentication error
 */
export function isAuthError(errorCode: number | null): boolean {
  return errorCode === 401 || errorCode === 403;
}

// ============================================
// ERROR FACTORY
// ============================================

/**
 * Create the appropriate typed error from an error code and message.
 * Use this in provider adapters to throw standardized errors.
 */
export function createTypedError(
  message: string,
  code: number | null,
  provider?: AIProviderId,
  options?: {
    modelId?: string;
    retryAfterMs?: number;
  },
): LLMError {
  if (!code) {
    return new LLMError(message, undefined, provider, false);
  }

  switch (code) {
    case 429:
      return new RateLimitError(message, provider, options?.retryAfterMs);
    case 401:
    case 403:
      // Check if it's a quota error vs auth error
      const lowerMessage = message.toLowerCase();
      if (
        lowerMessage.includes("quota") ||
        lowerMessage.includes("limit") ||
        lowerMessage.includes("exceeded")
      ) {
        return new QuotaExhaustedError(message, provider);
      }
      return new AuthenticationError(message, provider, code);
    case 404:
      return new ModelNotFoundError(
        message,
        options?.modelId ?? "unknown",
        provider,
      );
    case 501:
      return new UnsupportedOperationError(message, provider);
    default:
      if (code >= 500) {
        return new ServerError(message, code, provider);
      }
      return new LLMError(message, code, provider, false);
  }
}
