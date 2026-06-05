import { ChatRequest, ChatResponse } from "../../../models";
import { fetchWithTimeout } from "../../../utils/fetch-utils";
import {
  extractErrorCode,
  createTypedError,
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
    ? parseInt(retryAfterHeader, 10) * 1000
    : undefined;

  const errorCode = extractErrorCode(message) ?? status;
  return createTypedError(formattedMessage, errorCode, "anthropic", {
    modelId,
    retryAfterMs,
  });
}

export async function completeChat(
  apiKey: string,
  request: ChatRequest,
  baseUrl = "https://api.anthropic.com/v1",
): Promise<ChatResponse> {
  const systemMessage = request.messages.find((m) => m.role === "system");
  const messages = request.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  try {
    const headers: Record<string, string> = {
      "x-api-key": apiKey,
      "anthropic-version": "2024-10-22",
      "Content-Type": "application/json",
    };

    const res = await fetchWithTimeout(
      `${baseUrl}/messages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: request.model,
          messages: messages,
          max_tokens: request.maxTokens || 1024,
          temperature: request.temperature,
          system: systemMessage?.content,
        }),
      },
      request.timeout || 30000,
    );

    if (!res.ok) {
      let message = `HTTP error ${res.status}`;
      let errorJson: any = null;
      try {
        errorJson = await res.json();
        if (errorJson?.error?.message) {
          message = errorJson.error.message;
        } else if (typeof errorJson === "object") {
          message = JSON.stringify(errorJson);
        }
      } catch {
        // ignore
      }
      const headersObj: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headersObj[key] = value;
      });
      throw {
        status: res.status,
        message,
        headers: headersObj,
      };
    }

    const response = await res.json();

    const textContent = (response.content || [])
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
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
