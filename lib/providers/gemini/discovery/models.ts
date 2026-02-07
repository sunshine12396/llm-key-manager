import { fetchWithTimeout } from "../../../utils/fetch-utils";

const EXCLUDED_PATTERNS = [
  "aqa", // QA models, not general chat
  "embedding", // Embedding models
  "text-bison", // Legacy PaLM models
  "chat-bison", // Legacy PaLM chat
  "codechat-bison", // Legacy code chat
  "text-davinci", // Wrong provider
  "legacy", // Explicitly marked legacy
];

// Priority for model sorting (higher = more preferred)
const MODEL_PRIORITY = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-pro", // Added
  "gemini-2.0-flash-thinking", // Thinking model
  "gemini-2.0-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-pro",
];

export async function listModels(
  _apiKey: string,
  baseUrl: string,
  headers: Record<string, string>,
): Promise<string[]> {
  const tryFetch = async (version: string) => {
    console.log(`[GeminiAdapter] Attempting discovery via ${version}...`);
    const res = await fetchWithTimeout(
      `${baseUrl}/${version}/models`,
      {
        headers,
      },
      8000,
    );

    if (!res.ok) return null;

    const data = await res.json();
    const models = data.models || [];

    return models
      .filter((m: any) => {
        const name = m.name.replace("models/", "").toLowerCase();

        // Must support generateContent for chat
        if (
          m.supportedGenerationMethods &&
          !m.supportedGenerationMethods.includes("generateContent")
        ) {
          return false;
        }

        // Exclude deprecated/non-chat models
        if (EXCLUDED_PATTERNS.some((pattern) => name.includes(pattern))) {
          return false;
        }

        return true;
      })
      .map((m: any) => m.name.replace("models/", ""))
      .sort((a: string, b: string) => {
        const aPriority = MODEL_PRIORITY.findIndex((p) => a.includes(p));
        const bPriority = MODEL_PRIORITY.findIndex((p) => b.includes(p));

        if (aPriority !== -1 && bPriority !== -1) {
          return aPriority - bPriority;
        }
        if (aPriority !== -1) return -1;
        if (bPriority !== -1) return 1;
        return a.localeCompare(b);
      });
  };

  try {
    let models = await tryFetch("v1");
    const v1betaModels = await tryFetch("v1beta");

    if (v1betaModels) {
      const existingSet = new Set(models || []);
      const currentModels = models || [];
      for (const model of v1betaModels) {
        if (!existingSet.has(model)) {
          currentModels.push(model);
        }
      }
      models = currentModels;
    }

    console.log(
      `[GeminiAdapter] Discovered ${models?.length || 0} chat-capable models`,
    );
    return models || [];
  } catch (error) {
    console.error("Gemini adapter listModels failed:", error);
    return [];
  }
}

export function ownsModel(modelId: string): boolean {
  const m = modelId.toLowerCase();
  // Gemini chat/multimodal models
  // Imagen: image generation
  // Veo: video generation
  // Gemma: open weights models
  // LearnLM: educational AI models
  return (
    m.startsWith("gemini") ||
    m.startsWith("imagen") ||
    m.startsWith("veo") ||
    m.startsWith("gemma") ||
    m.startsWith("learnlm")
  );
}
