import { ChatRequest, ChatResponse } from "../../../models/workloads";
import { createAnthropicClient } from "../client";
import {
  extractErrorCode,
  createTypedError,
  RateLimitError,
} from "../../../core/errors";

/**
 * Parse Anthropic error for retry info and structured message
 */
export function parseAnthropicError(error: any, modelId: string): Error {
  const status = error.status || error.response?.status;
  const message = error.message || String(error);
  const formattedMessage = `Anthropic API Error ${status || "Unknown"}: ${message}`;

  // Extract retry-after header if present
  const retryAfterHeader = error.headers?.["retry-after"];
  const retryAfterMs = retryAfterHeader
    ? parseInt(retryAfterHeader) * 1000
    : undefined;

  if (status === 429 && retryAfterMs) {
    return new RateLimitError(formattedMessage, "anthropic", retryAfterMs);
  }

  const errorCode = extractErrorCode(message) ?? status;
  return createTypedError(formattedMessage, errorCode, "anthropic", {
    modelId,
    retryAfterMs,
  });
}

export async function completeChat(
  apiKey: string,
  request: ChatRequest,
): Promise<ChatResponse> {
  const client = createAnthropicClient(apiKey);
  const systemMessage = request.messages.find((m) => m.role === "system");
  const messages = request.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  try {
    // Build request options with timeout support
    const requestOptions: any = {};
    if (request.timeout) {
      requestOptions.timeout = request.timeout;
    }

    const response = await client.messages.create(
      {
        model: request.model,
        messages: messages,
        max_tokens: request.maxTokens || 1024,
        temperature: request.temperature,
        system: systemMessage?.content,
      },
      requestOptions,
    );

    const textContent = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as any).text)
      .join("\n");

    return {
      content: textContent,
      usage: response.usage
        ? {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
            totalTokens:
              response.usage.input_tokens + response.usage.output_tokens,
          }
        : undefined,
      model: response.model,
    };
  } catch (error: any) {
    throw parseAnthropicError(error, request.model);
  }
}
