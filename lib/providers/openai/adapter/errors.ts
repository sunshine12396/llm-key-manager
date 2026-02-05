import {
  extractErrorCode,
  createTypedError,
  RateLimitError,
} from "../../../core/errors";

export function parseOpenAIError(error: any, modelId: string): Error {
  const status = error.status || error.response?.status;
  const message = error.message || String(error);
  const formattedMessage = `OpenAI API Error ${status || "Unknown"}: ${message}`;

  const retryAfterHeader =
    error.headers?.["retry-after"] ?? error.response?.headers?.["retry-after"];
  const retryAfterMs = retryAfterHeader
    ? parseInt(retryAfterHeader, 10) * 1000
    : undefined;

  if (status === 429 && retryAfterMs) {
    return new RateLimitError(formattedMessage, "openai", retryAfterMs);
  }

  const errorCode = extractErrorCode(message) ?? status;
  return createTypedError(formattedMessage, errorCode, "openai", {
    modelId,
    retryAfterMs,
  });
}
