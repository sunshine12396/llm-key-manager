import { fetchWithTimeout } from "../../../utils/fetch-utils";

// Priority for model sorting (index = priority, lower = better)
const MODEL_PRIORITY = [
  "claude-4", // Future-proof
  "claude-3-5-sonnet",
  "claude-3-5-haiku",
  "claude-3-opus",
  "claude-3-sonnet",
  "claude-3-haiku",
];

// Fallback models when API fails (updated Jan 2025)
const FALLBACK_MODELS = [
  "claude-3-5-sonnet-latest",
  "claude-3-5-haiku-latest",
  "claude-3-opus-latest",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
];

export async function listModels(
  apiKey: string,
  _baseUrl: string,
): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(
      "https://api.anthropic.com/v1/models",
      {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2024-10-22",
        },
      },
      10000,
    );

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }

    const response = await res.json();
    const models = (response.data || []).map((m: any) => m.id);

    // Sort by priority
    return models.sort((a: string, b: string) => {
      const aPriority = MODEL_PRIORITY.findIndex((p) => a.includes(p));
      const bPriority = MODEL_PRIORITY.findIndex((p) => b.includes(p));

      if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
      if (aPriority !== -1) return -1;
      if (bPriority !== -1) return 1;
      return b.localeCompare(a); // Newer versions first
    });
  } catch (error) {
    console.warn(
      "Anthropic SDK listModels failed, checking fallback...",
      error,
    );
    // On failure/older versions, fallback
    return FALLBACK_MODELS;
  }
}

export function ownsModel(modelId: string): boolean {
  return modelId.toLowerCase().startsWith("claude");
}
