import { RateLimitData } from "../../../models/metadata";

export async function checkRateLimits(
  _apiKey: string,
  _baseUrl: string,
  _modelId?: string,
): Promise<RateLimitData> {
  // Gemini API does not currently return rate limit headers in standard responses.
  // We return a "safe default" based on known tier limits to populate the UI.
  // In the future, if the SDK exposes this, we will use:
  // const client = createGeminiClient(apiKey);

  // Simulating a successful check to confirm the key works is redundant
  // because listModels() already does that during validation.

  return {
    requests: {
      limit: 15, // Default RPM for Gemini free tier
      remaining: 15,
      reset: "1m",
    },
    tokens: {
      limit: 1000000,
      remaining: 1000000,
    },
  };
}

export function detectTier(rateLimits?: RateLimitData): string {
  if (rateLimits?.requests?.limit) {
    const rpm = rateLimits.requests.limit;
    if (rpm <= 15) return "Free";
    if (rpm > 60) return "Pay-as-you-go";
  }
  return "Standard";
}
