import {
  EmbeddingRequest,
  EmbeddingResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  AudioTranscriptionRequest,
  AudioTranscriptionResponse,
  TextToSpeechRequest,
  TextToSpeechResponse,
} from "../../../models";
import { fetchWithTimeout } from "../../../utils/fetch-utils";
import { parseOpenAIError } from "./errors";

async function checkResponse(res: Response): Promise<any> {
  if (!res.ok) {
    let message = `HTTP error ${res.status}`;
    let errorJson: any = null;
    try {
      errorJson = await res.json();
      if (errorJson?.error?.message) {
        message = errorJson.error.message;
      } else if (typeof errorJson === "object") {
        message = JSON.stringify(errorJson);
      }
    } catch {
      // ignore
    }
    const headersObj: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headersObj[key] = value;
    });
    throw {
      status: res.status,
      message,
      headers: headersObj,
    };
  }
  return res;
}

export async function generateEmbeddings(
  apiKey: string,
  request: EmbeddingRequest,
  baseUrl = "https://api.openai.com/v1",
): Promise<EmbeddingResponse> {
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/embeddings`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: request.model,
          input: request.input,
          dimensions: request.dimensions,
          user: request.user,
        }),
      },
      30000,
    );
    await checkResponse(res);
    const response = await res.json();

    return {
      data: response.data.map((item: any) => ({
        embedding: item.embedding,
        index: item.index,
        object: "embedding",
      })),
      model: response.model,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  } catch (error: any) {
    throw parseOpenAIError(error, request.model);
  }
}

export async function generateImage(
  apiKey: string,
  request: ImageGenerationRequest,
  baseUrl = "https://api.openai.com/v1",
): Promise<ImageGenerationResponse> {
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/images/generations`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: request.model,
          prompt: request.prompt,
          n: request.n,
          size: request.size,
          quality: request.quality,
          style: request.style,
          response_format: request.responseFormat,
        }),
      },
      30000,
    );
    await checkResponse(res);
    const response = await res.json();

    return {
      created: response.created,
      data: (response.data || []).map((item: any) => ({
        url: item.url,
        b64_json: item.b64_json,
        revised_prompt: item.revised_prompt,
      })),
    };
  } catch (error: any) {
    throw parseOpenAIError(error, request.model);
  }
}

export async function transcribeAudio(
  apiKey: string,
  request: AudioTranscriptionRequest,
  baseUrl = "https://api.openai.com/v1",
): Promise<AudioTranscriptionResponse> {
  try {
    const formData = new FormData();
    formData.append("file", request.file as Blob);
    formData.append("model", request.model);
    if (request.language) formData.append("language", request.language);
    if (request.prompt) formData.append("prompt", request.prompt);
    if (request.responseFormat) formData.append("response_format", request.responseFormat);
    if (request.temperature !== undefined) {
      formData.append("temperature", request.temperature.toString());
    }

    const res = await fetchWithTimeout(
      `${baseUrl}/audio/transcriptions`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
        },
        body: formData,
      },
      60000,
    );
    await checkResponse(res);
    const response = await res.json();

    if (typeof response === "string") {
      return { text: response };
    }

    return {
      text: (response as any).text,
      duration: (response as any).duration,
      language: (response as any).language,
    };
  } catch (error: any) {
    throw parseOpenAIError(error, request.model);
  }
}

export async function textToSpeech(
  apiKey: string,
  request: TextToSpeechRequest,
  baseUrl = "https://api.openai.com/v1",
): Promise<TextToSpeechResponse> {
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/audio/speech`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: request.model,
          voice: request.voice,
          input: request.input,
          response_format: request.responseFormat,
          speed: request.speed,
        }),
      },
      30000,
    );
    await checkResponse(res);
    const arrayBuffer = await res.arrayBuffer();

    return {
      audioContent: arrayBuffer,
      contentType: res.headers.get("content-type") || "audio/mpeg",
    };
  } catch (error: any) {
    throw parseOpenAIError(error, request.model);
  }
}
