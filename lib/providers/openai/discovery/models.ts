import { createOpenAIClient } from "../client";

// Constants for validation and filtering
const EXCLUDED_ID_PATTERNS = [
  "instruct",
  "vision",
  "dall-e",
  "tts",
  "whisper",
  "embedding",
  "ft:",
];

// Priority for model sorting (higher = more preferred)
const MODEL_PRIORITY = [
  "o1", // Reasoning models
  "o3-mini", // Latest mini reasoning
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4",
  "gpt-3.5-turbo",
];

// Patterns that identify OpenAI chat models
const CHAT_MODEL_PREFIXES = ["gpt-", "o1", "o3"];

export async function listModels(apiKey: string): Promise<string[]> {
  const client = createOpenAIClient(apiKey);
  try {
    const response = await client.models.list();

    // Filter and normalize OpenAI models
    return (response.data || [])
      .map((m: any) => m.id)
      .filter((id: string) => {
        // Must start with a known chat model prefix
        if (!CHAT_MODEL_PREFIXES.some((prefix) => id.startsWith(prefix)))
          return false;

        // Must not contain excluded patterns
        if (EXCLUDED_ID_PATTERNS.some((pattern) => id.includes(pattern)))
          return false;

        // Exclude dated snapshots (e.g., -0613, -2024-04-09) to reduce verification load
        // We typically only want the main aliases (gpt-4o, gpt-4-turbo, etc.)
        if (/-\d{4}/.test(id)) return false;

        return true;
      })
      .sort((a: string, b: string) => {
        // Sort by priority first
        const pA = MODEL_PRIORITY.findIndex((p) => a.startsWith(p));
        const pB = MODEL_PRIORITY.findIndex((p) => b.startsWith(p));

        // If both match a priority pattern
        if (pA !== -1 && pB !== -1) return pA - pB;

        // If only one matches
        if (pA !== -1) return -1;
        if (pB !== -1) return 1;

        // Default string sort
        return b.localeCompare(a); // Default to newer (usually higher version numbers)
      });
  } catch (error) {
    console.error("OpenAI adapter listModels failed:", error);
    return [];
  }
}

export function ownsModel(modelId: string): boolean {
  const m = modelId.toLowerCase();
  // Chat models: gpt-*, o1*, o3-mini*
  // Multimodal: dall-e, whisper, text-embedding
  return (
    m.startsWith("gpt") ||
    m.startsWith("o1") ||
    m.startsWith("o3-mini") ||
    m.startsWith("dall-e") ||
    m.startsWith("whisper") ||
    m.startsWith("text-embedding")
  );
}
