import { RateLimitData } from "../../../models";

import { fetchWithTimeout } from "../../../utils/fetch-utils";

export async function checkRateLimits(
  apiKey: string,
  _baseUrl: string,
): Promise<RateLimitData> {
  try {
    const response = await fetchWithTimeout(
      "https://api.anthropic.com/v1/models",
      {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2024-10-22",
        },
      },
      10000,
    );
    const headers = response.headers;

    return {
      requests: {
        limit: parseInt(
          headers.get("anthropic-ratelimit-requests-limit") || "0",
        ),
        remaining: parseInt(
          headers.get("anthropic-ratelimit-requests-remaining") || "0",
        ),
        reset: headers.get("anthropic-ratelimit-requests-reset") || undefined,
      },
      tokens: {
        limit: parseInt(headers.get("anthropic-ratelimit-tokens-limit") || "0"),
        remaining: parseInt(
          headers.get("anthropic-ratelimit-tokens-remaining") || "0",
        ),
        reset: headers.get("anthropic-ratelimit-tokens-reset") || undefined,
      },
    };
  } catch (error) {
    return {};
  }
}

export function detectTier(rateLimits?: RateLimitData): string {
  if (rateLimits?.requests?.limit) {
    const rpm = rateLimits.requests.limit;
    if (rpm <= 5) return "Free";
    if (rpm <= 60) return "Scale 1";
    if (rpm >= 1000) return "Enterprise";
    return "Scale 2";
  }
  return "Standard";
}
