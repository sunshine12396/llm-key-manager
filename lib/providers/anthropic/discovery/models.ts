import { fetchWithTimeout } from "../../../utils/fetch-utils";

// Centralized API version - update this when Anthropic releases new API versions
export const ANTHROPIC_API_VERSION = "2024-10-22";

// Priority for model sorting (index = priority, lower = better)
const MODEL_PRIORITY = [
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
  baseUrl: string,
): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/models`,
      {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_API_VERSION,
          "anthropic-dangerous-direct-browser-access": "true",
          "Content-Type": "application/json",
        },
      },
      8000,
    );

    if (res.ok) {
      const data = await res.json();
      const models = data.data.map((m: any) => m.id);

      // Sort by priority
      return models.sort((a: string, b: string) => {
        const aPriority = MODEL_PRIORITY.findIndex((p) => a.includes(p));
        const bPriority = MODEL_PRIORITY.findIndex((p) => b.includes(p));

        if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
        if (aPriority !== -1) return -1;
        if (bPriority !== -1) return 1;
        return b.localeCompare(a); // Newer versions first
      });
    }

    console.log("Anthropic models API failed, using fallback list");
    return FALLBACK_MODELS;
  } catch (error) {
    console.error("Anthropic adapter listModels failed:", error);
    return [];
  }
}

export function ownsModel(modelId: string): boolean {
  return modelId.toLowerCase().startsWith("claude");
}
