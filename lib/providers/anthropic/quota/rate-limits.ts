import { RateLimitData } from "../../../models/metadata";
import { fetchWithTimeout } from "../../../utils/fetch-utils";
import { ANTHROPIC_API_VERSION } from "../discovery/models";

export function getHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_API_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
    "Content-Type": "application/json",
  };
}

export async function checkRateLimits(
  apiKey: string,
  baseUrl: string,
): Promise<RateLimitData> {
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/models`,
      {
        headers: getHeaders(apiKey),
      },
      5000,
    );

    const headers = res.headers;

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
