import { ChatRequest, ChatResponse } from "../../../models/workloads";
import { createGeminiClient } from "../client";
import {
  extractErrorCode,
  createTypedError,
  RateLimitError,
} from "../../../core/errors";

/**
 * Parse Gemini error for retry info and structured message
 */
export function parseGeminiError(error: any, modelId: string): Error {
  let message = error.message || String(error);
  let retryAfterMs: number | undefined;

  try {
    const jsonMatch = message.match(/\[\{(.*?)\}\]$/);
    const data = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : error.response
        ? error.response.json?.()
        : null;

    if (data) {
      const errorArray = Array.isArray(data) ? data : [data];
      const retryInfo = errorArray.find(
        (i: any) => i.retryDelay || i["@type"]?.includes("RetryInfo"),
      );

      if (retryInfo?.retryDelay) {
        const seconds = parseFloat(retryInfo.retryDelay.replace("s", ""));
        retryAfterMs = Math.ceil(seconds * 1000);
      } else if (retryInfo?.retryAfter) {
        retryAfterMs = retryInfo.retryAfter * 1000;
      }

      if (data.error) {
        message = `${data.error.status || ""}: ${data.error.message}`;
      }
    }
  } catch {
    // Ignore parse errors - use original message
  }

  const errorCode = extractErrorCode(message);
  const formattedMessage = `Gemini API Error ${errorCode || "Unknown"}: ${message}`;

  if (errorCode === 429 && retryAfterMs) {
    return new RateLimitError(formattedMessage, "gemini", retryAfterMs);
  }

  return createTypedError(formattedMessage, errorCode, "gemini", {
    modelId,
    retryAfterMs,
  });
}

export async function completeChat(
  apiKey: string,
  request: ChatRequest,
): Promise<ChatResponse> {
  const genAI = createGeminiClient(apiKey);
  const cleanModel = request.model.replace(/^models\//, "").trim();

  try {
    const systemMessage = request.messages.find((m) => m.role === "system");

    const model = genAI.getGenerativeModel({
      model: cleanModel,
      systemInstruction: systemMessage?.content,
    });

    const contents = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    // Build request options with timeout support
    const requestOptions: any = {};
    if (request.timeout) {
      requestOptions.timeout = request.timeout;
    }

    const result = await model.generateContent(
      {
        contents,
        generationConfig: {
          maxOutputTokens: request.maxTokens,
          temperature: request.temperature,
        },
      },
      requestOptions,
    );

    const response = result.response;
    const text = response.text();

    return {
      content: text,
      usage: response.usageMetadata
        ? {
            promptTokens: response.usageMetadata.promptTokenCount,
            completionTokens: response.usageMetadata.candidatesTokenCount,
            totalTokens: response.usageMetadata.totalTokenCount,
          }
        : undefined,
      model: request.model,
    };
  } catch (error: any) {
    throw parseGeminiError(error, cleanModel);
  }
}
