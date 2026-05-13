import { fetchWithTimeout } from "../../../utils/fetch-utils";

const EXCLUDED_PATTERNS = [
  "aqa", // QA models, often require special payload
  "text-davinci", // Wrong provider, safety check
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
  const tryFetch = async (version: string): Promise<string[]> => {
    try {
      console.log(`[GeminiAdapter] Attempting discovery via ${version}...`);
      const res = await fetchWithTimeout(
        `${baseUrl}/${version}/models?pageSize=1000`,
        {
          headers,
        },
        8000,
      );

      if (!res.ok) {
        const err = new Error(
          `Gemini API fetch failed with status: ${res.status}`,
        );
        (err as any).status = res.status;
        throw err;
      }

      const data = await res.json();
      const rawModels = data.models || [];

      return rawModels
        .filter((m: any) => {
          const name = m.name.replace("models/", "").toLowerCase();

          // Check supported generation methods
          const methods = m.supportedGenerationMethods || [];
          const isSupported =
            methods.includes("generateContent") || // Gemini Chat
            methods.includes("embedContent") || // Embeddings
            methods.includes("generateImages") || // Imagen
            methods.includes("predict"); // Legacy PaLM

          if (!isSupported) return false;

          // Exclude internal or truly deprecated models
          if (EXCLUDED_PATTERNS.some((pattern) => name.includes(pattern))) {
            return false;
          }

          return true;
        })
        .map((m: any) => m.name.replace("models/", ""));
    } catch (e) {
      console.error(`[GeminiAdapter] Error fetching ${version}:`, e);
      return [];
    }
  };

  try {
    // 1. Fetch from both versions in parallel
    const [v1Models, v1betaModels] = await Promise.all([
      tryFetch("v1"),
      tryFetch("v1beta"),
    ]);

    // 2. Merge and deduplicate
    const allModelsSet = new Set([...v1Models, ...v1betaModels]);
    const models = Array.from(allModelsSet);

    // 3. Sort by priority and name
    const sortedModels = models.sort((a: string, b: string) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();

      const aPriority = MODEL_PRIORITY.findIndex((p) => aLower.includes(p));
      const bPriority = MODEL_PRIORITY.findIndex((p) => bLower.includes(p));

      // If both have priority, use priority order
      if (aPriority !== -1 && bPriority !== -1) {
        return aPriority - bPriority;
      }

      // If only one has priority, it goes first
      if (aPriority !== -1) return -1;
      if (bPriority !== -1) return 1;

      // Default to alphabetical
      return aLower.localeCompare(bLower);
    });

    console.log(
      `[GeminiAdapter] Discovered ${sortedModels.length} compatible models (v1: ${v1Models.length}, v1beta: ${v1betaModels.length})`,
    );

    return sortedModels;
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
