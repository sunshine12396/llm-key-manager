import { ChatRequest, ChatResponse } from "../../../models/workloads";
import { createOpenAIClient } from "../client";
import {
  extractErrorCode,
  createTypedError,
  RateLimitError,
} from "../../../core/errors";

/**
 * Model capability helpers
 * Keep these SMALL and obvious — move to model registry later.
 */
function isReasoningModel(model: string): boolean {
  // o1 and o3-mini are reasoning models
  return model.startsWith("o1") || model.startsWith("o3-mini");
}

function requiresResponsesAPI(model: string): boolean {
  // Preview & mini models still work with chat.completions
  if (model.includes("preview")) return false;
  if (model.includes("-mini")) return false;

  // Only the full o1 models currently benefit/require specialized handling 
  // that might be mapped to Responses API in some enterprise setups.
  // Standard public API usually works with chat.completions for o1 now.
  return model === "o1";
}

/**
 * Normalize Responses API output into plain text
 */
function extractResponsesText(response: any): string {
  if (response.output_text) return response.output_text;

  if (!Array.isArray(response.output)) return "";

  return response.output
    .flatMap((item: any) => item.content || [])
    .filter((c: any) => c.type === "output_text")
    .map((c: any) => c.text)
    .join("");
}

/**
 * Map ChatRequest messages → Responses API format
 */
function mapMessagesForResponses(messages: ChatRequest["messages"]) {
  return messages.map((m) => ({
    role: m.role === "system" ? "developer" : m.role,
    content: m.content,
  }));
}

export async function completeChat(
  apiKey: string,
  request: ChatRequest,
): Promise<ChatResponse> {
  const client = createOpenAIClient(apiKey);

  const useResponsesAPI = async (
    modelId: string,
    chatRequest: ChatRequest,
  ): Promise<ChatResponse> => {
    // Responses API requires >= 16 output tokens
    const safeMaxTokens =
      chatRequest.maxTokens !== undefined
        ? Math.max(chatRequest.maxTokens, 16)
        : undefined;

    const options = request.timeout ? { timeout: request.timeout } : undefined;

    const response = await (client as any).responses.create(
      {
        model: modelId,
        input: mapMessagesForResponses(chatRequest.messages),
        max_output_tokens: safeMaxTokens,
        temperature: chatRequest.temperature ?? 1,
        // IMPORTANT: do NOT store user prompts by default
        store: false,
      },
      options,
    );

    return {
      content: extractResponsesText(response),
      usage: response.usage
        ? {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens:
            (response.usage.input_tokens || 0) +
            (response.usage.output_tokens || 0),
        }
        : undefined,
      model: response.model || modelId,
    };
  };

  try {
    // Primary routing
    if (requiresResponsesAPI(request.model)) {
      return await useResponsesAPI(request.model, request);
    }

    const reasoning = isReasoningModel(request.model);

    const params: any = {
      model: request.model,
      messages: request.messages,
      stream: false,
    };

    if (reasoning) {
      // o1-preview / o1-mini rules
      if (request.maxTokens !== undefined) {
        params.max_completion_tokens = request.maxTokens;
      }
      params.temperature = 1;
    } else {
      // Standard chat models
      if (request.maxTokens !== undefined) {
        params.max_tokens = request.maxTokens;
      }
      if (request.temperature !== undefined) {
        params.temperature = request.temperature;
      }
    }

    const options = request.timeout ? { timeout: request.timeout } : undefined;
    const response = await client.chat.completions.create(params, options);
    const casted = response as any;
    const choice = casted.choices?.[0];

    return {
      content: choice?.message?.content || "",
      usage: casted.usage
        ? {
          promptTokens: casted.usage.prompt_tokens,
          completionTokens: casted.usage.completion_tokens,
          totalTokens: casted.usage.total_tokens,
        }
        : undefined,
      model: casted.model || request.model,
    };
  } catch (error: any) {
    const status = error?.status ?? error?.response?.status;

    const message = error?.message ?? String(error);

    /**
     * Transparent fallback:
     * Some models silently force /v1/responses
     */
    if (
      message.includes("v1/responses") &&
      !requiresResponsesAPI(request.model)
    ) {
      try {
        console.warn(
          `[OpenAI] Forced Responses API fallback for model ${request.model}`,
        );
        return await useResponsesAPI(request.model, request);
      } catch (fallbackError) {
        error = fallbackError;
      }
    }

    const retryAfterHeader =
      error?.headers?.["retry-after"] ??
      error?.response?.headers?.["retry-after"];

    const retryAfterMs =
      retryAfterHeader !== undefined
        ? parseInt(retryAfterHeader, 10) * 1000
        : undefined;

    const formattedMessage = `OpenAI API Error ${status || "Unknown"
      }: ${message}`;

    if (status === 429 && retryAfterMs) {
      throw new RateLimitError(formattedMessage, "openai", retryAfterMs);
    }

    const errorCode = extractErrorCode(message) ?? status;

    throw createTypedError(formattedMessage, errorCode, "openai", {
      modelId: request.model,
      retryAfterMs,
    });
  }
}
