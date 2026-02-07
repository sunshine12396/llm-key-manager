import { RateLimitData } from "../../../models/metadata";

export async function checkRateLimits(
  apiKey: string,
  _baseUrl: string,
): Promise<RateLimitData> {
  try {
    const { createAnthropicClient } = await import("../client");
    const client = createAnthropicClient(apiKey);

    // Use .asResponse() to get headers from a lightweight call (models.list)
    const response = await client.models.list().asResponse();
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
