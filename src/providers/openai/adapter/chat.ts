import { ChatRequest, ChatResponse } from "../../../models";
import { fetchWithTimeout } from "../../../utils/fetch-utils";
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
  baseUrl = "https://api.openai.com/v1",
): Promise<ChatResponse> {
  const useResponses = requiresResponsesAPI(request.model);
  const url = useResponses
    ? `${baseUrl}/responses`
    : `${baseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  let body: any;

  if (useResponses) {
    const safeMaxTokens =
      request.maxTokens !== undefined
        ? Math.max(request.maxTokens, 16)
        : undefined;

    body = {
      model: request.model,
      input: mapMessagesForResponses(request.messages),
      max_output_tokens: safeMaxTokens,
      temperature: request.temperature ?? 1,
      store: false,
    };
  } else {
    const reasoning = isReasoningModel(request.model);
    body = {
      model: request.model,
      messages: request.messages,
      stream: false,
    };

    if (reasoning) {
      if (request.maxTokens !== undefined) {
        body.max_completion_tokens = request.maxTokens;
      }
      body.temperature = 1;
    } else {
      if (request.maxTokens !== undefined) {
        body.max_tokens = request.maxTokens;
      }
      if (request.temperature !== undefined) {
        body.temperature = request.temperature;
      }
    }
  }

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers,
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

    const data = await res.json();

    if (useResponses) {
      return {
        content: extractResponsesText(data),
        usage: data.usage
          ? {
              promptTokens: data.usage.input_tokens,
              completionTokens: data.usage.output_tokens,
              totalTokens:
                (data.usage.input_tokens || 0) +
                (data.usage.output_tokens || 0),
            }
          : undefined,
        model: data.model || request.model,
      };
    } else {
      const choice = data.choices?.[0];
      return {
        content: choice?.message?.content || "",
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
        model: data.model || request.model,
      };
    }
  } catch (error: any) {
    throw parseOpenAIError(error, request.model);
  }
}
