/**
 * Error Handling Module
 *
 * Provides typed error classes and utility functions for parsing and handling
 * LLM API errors across all providers.
 */

import { AIProviderId } from "../models";

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
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, LLMError);
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
    const isRetryable = isRetryableCode(code);

    return new LLMError(message, code ?? undefined, provider, isRetryable);
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

function isRetryableCode(errorCode: number | null): boolean {
  if (!errorCode) return false;
  return errorCode === 429 || errorCode >= 500;
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
  _options?: {
    modelId?: string;
    retryAfterMs?: number;
  },
): LLMError {
  return new LLMError(message, code ?? undefined, provider, isRetryableCode(code));
}
