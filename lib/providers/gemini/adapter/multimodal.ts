import {
  EmbeddingRequest,
  EmbeddingResponse,
} from "../../../models/workloads/multimodal";
import { createGeminiClient } from "../client";
import { parseGeminiError } from "./chat";

export async function generateEmbeddings(
  apiKey: string,
  request: EmbeddingRequest,
): Promise<EmbeddingResponse> {
  const genAI = createGeminiClient(apiKey);
  const cleanModel = request.model.replace(/^models\//, "").trim();

  try {
    const model = genAI.getGenerativeModel({ model: cleanModel });

    if (Array.isArray(request.input)) {
      // Batch embedding
      const result = await model.batchEmbedContents({
        requests: request.input.map((t) => ({
          content: { role: "user", parts: [{ text: t }] },
        })),
      });

      return {
        data: result.embeddings.map((emb, index) => ({
          embedding: emb.values,
          index: index,
          object: "embedding",
        })),
        model: request.model,
      };
    } else {
      // Single embedding
      const result = await model.embedContent(request.input);

      return {
        data: [
          {
            embedding: result.embedding.values,
            index: 0,
            object: "embedding",
          },
        ],
        model: request.model,
      };
    }
  } catch (error: any) {
    throw parseGeminiError(error, cleanModel);
  }
}
