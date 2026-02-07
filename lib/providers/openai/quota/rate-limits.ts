import { RateLimitData } from "../../../models/metadata";

const VALIDATION_MODEL = "gpt-4o-mini";

export async function checkRateLimits(
  apiKey: string,
  modelId?: string,
): Promise<RateLimitData> {
  const targetModel = modelId || VALIDATION_MODEL;
  try {
    const { createOpenAIClient } = await import("../client");
    const client = createOpenAIClient(apiKey);

    // We use a minimal completion request to get the actual rate limit headers using the SDK
    // Using asResponse() to access headers
    const response = await client.chat.completions
      .create({
        model: targetModel,
        messages: [{ role: "user", content: "1" }],
        max_tokens: 1,
      })
      .asResponse();

    const headers = response.headers;

    return {
      requests: {
        limit: parseInt(headers.get("x-ratelimit-limit-requests") || "0"),
        remaining: parseInt(
          headers.get("x-ratelimit-remaining-requests") || "0",
        ),
        reset: headers.get("x-ratelimit-reset-requests") || undefined,
      },
      tokens: {
        limit: parseInt(headers.get("x-ratelimit-limit-tokens") || "0"),
        remaining: parseInt(headers.get("x-ratelimit-remaining-tokens") || "0"),
        reset: headers.get("x-ratelimit-reset-tokens") || undefined,
      },
    };
  } catch (error) {
    return {};
  }
}

export function detectTier(rateLimits?: RateLimitData): string {
  if (rateLimits?.requests?.limit) {
    const rpm = rateLimits.requests.limit;
    if (rpm >= 10000) return "Tier 5";
    if (rpm >= 5000) return "Tier 4";
    if (rpm >= 3500) return "Tier 3";
    if (rpm >= 500) return "Tier 2";
    if (rpm >= 60) return "Tier 1";
    return "Free";
  }
  return "Standard";
}
