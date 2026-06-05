import {
  EmbeddingRequest,
  EmbeddingResponse,
} from "../../../models";
import { fetchWithTimeout } from "../../../utils/fetch-utils";
import { parseGeminiError } from "./chat";

export async function generateEmbeddings(
  apiKey: string,
  request: EmbeddingRequest,
  baseUrl = "https://generativelanguage.googleapis.com",
): Promise<EmbeddingResponse> {
  const cleanModel = request.model.replace(/^models\//, "").trim();

  try {
    if (Array.isArray(request.input)) {
      // Batch embedding
      const body = {
        requests: request.input.map((t) => ({
          model: `models/${cleanModel}`,
          content: { parts: [{ text: t }] },
        })),
      };

      const res = await fetchWithTimeout(
        `${baseUrl}/v1beta/models/${cleanModel}:batchEmbedContents?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
        30000,
      );

      if (!res.ok) {
        let message = `HTTP error ${res.status}`;
        let errorJson: any = null;
        try {
          errorJson = await res.json();
          if (errorJson?.error?.message) {
            message = errorJson.error.message;
          }
        } catch {
          // ignore
        }
        throw {
          message,
          status: res.status,
          response: {
            json: () => errorJson,
          },
        };
      }

      const data = await res.json();
      return {
        data: (data.embeddings || []).map((emb: any, index: number) => ({
          embedding: emb.values,
          index: index,
          object: "embedding",
        })),
        model: request.model,
      };
    } else {
      // Single embedding
      const body = {
        content: { parts: [{ text: request.input }] },
      };

      const res = await fetchWithTimeout(
        `${baseUrl}/v1beta/models/${cleanModel}:embedContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
        30000,
      );

      if (!res.ok) {
        let message = `HTTP error ${res.status}`;
        let errorJson: any = null;
        try {
          errorJson = await res.json();
          if (errorJson?.error?.message) {
            message = errorJson.error.message;
          }
        } catch {
          // ignore
        }
        throw {
          message,
          status: res.status,
          response: {
            json: () => errorJson,
          },
        };
      }

      const data = await res.json();
      return {
        data: [
          {
            embedding: data.embedding?.values || [],
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
