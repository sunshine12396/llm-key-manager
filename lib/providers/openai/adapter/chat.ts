import { ChatRequest, ChatResponse } from "../../../models/workloads";
import { createOpenAIClient } from "../client";
import { parseOpenAIError } from "./errors";

/**
 * Model capability helpers
 * Keep these SMALL and obvious — move to model registry later.
 */
function isReasoningModel(model: string): boolean {
  // o1, o3, o4 are reasoning models (o4 future-proof)
  return (
    model.startsWith("o1") || model.startsWith("o3") || model.startsWith("o4")
  );
}

function requiresResponsesAPI(model: string): boolean {
  // Preview & mini models still work with chat.completions
  if (model.includes("preview")) return false;
  if (model.includes("-mini")) return false;

  // Full reasoning models (o1, o3, o4) + image models require /v1/responses
  return (
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("o4") ||
    model.startsWith("gpt-image")
  );
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
    throw parseOpenAIError(error, request.model);
  }
}
