import { ChatRequest, ChatResponse } from "../../../models";
import { fetchWithTimeout } from "../../../utils/fetch-utils";
import {
  extractErrorCode,
  createTypedError,
} from "../../../core/errors";

/**
 * Parse Gemini error for retry info and structured message
 */
export function parseGeminiError(error: any, modelId: string): Error {
  const status = error.status || error.response?.status;
  let message = error.message || String(error);
  let retryAfterMs: number | undefined;

  try {
    const data = error.response ? error.response.json?.() : null;

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

  const errorCode = extractErrorCode(message) ?? status;
  const formattedMessage = `Gemini API Error ${errorCode || "Unknown"}: ${message}`;

  return createTypedError(formattedMessage, errorCode, "gemini", {
    modelId,
    retryAfterMs,
  });
}

export async function completeChat(
  apiKey: string,
  request: ChatRequest,
  baseUrl = "https://generativelanguage.googleapis.com",
): Promise<ChatResponse> {
  const cleanModel = request.model.replace(/^models\//, "").trim();

  try {
    const systemMessage = request.messages.find((m) => m.role === "system");

    const contents = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const body: any = {
      contents,
      generationConfig: {
        maxOutputTokens: request.maxTokens,
        temperature: request.temperature,
      },
    };

    if (systemMessage?.content) {
      body.systemInstruction = {
        parts: [{ text: systemMessage.content }],
      };
    }

    const res = await fetchWithTimeout(
      `${baseUrl}/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
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
      throw {
        message,
        status: res.status,
        response: {
          json: () => errorJson,
        },
      };
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text || "";

    return {
      content: text,
      usage: data.usageMetadata
        ? {
            promptTokens: data.usageMetadata.promptTokenCount,
            completionTokens: data.usageMetadata.candidatesTokenCount,
            totalTokens: data.usageMetadata.totalTokenCount,
          }
        : undefined,
      model: request.model,
    };
  } catch (error: any) {
    throw parseGeminiError(error, cleanModel);
  }
}
