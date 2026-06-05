import { RateLimitData } from "../../../models";

const VALIDATION_MODEL = "gpt-4o-mini";

import { fetchWithTimeout } from "../../../utils/fetch-utils";

export async function checkRateLimits(
  apiKey: string,
  modelId?: string,
  baseUrl = "https://api.openai.com/v1",
): Promise<RateLimitData> {
  const targetModel = modelId || VALIDATION_MODEL;
  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [{ role: "user", content: "1" }],
          max_tokens: 1,
        }),
      },
      10000,
    );

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
