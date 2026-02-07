import { IProviderAdapter, KeyFormatValidationResult } from "../types";
import { ChatRequest, ChatResponse } from "../../models/workloads";
import {
  RateLimitData,
  AIProviderId,
  ModelCapability,
} from "../../models/metadata";
import { modelDataService } from "../../services/model-data.service";
import { createTypedError } from "../../core/errors";

import { completeChat } from "./adapter/chat";
import { generateEmbeddings } from "./adapter/multimodal";
import { listModels, ownsModel } from "./discovery/models";
import { validateKeyFormat } from "./discovery/health";
import { checkRateLimits, detectTier } from "./quota/rate-limits";
import {
  EmbeddingRequest,
  EmbeddingResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  AudioTranscriptionRequest,
  AudioTranscriptionResponse,
  TextToSpeechRequest,
  TextToSpeechResponse,
} from "../../models/workloads/multimodal";

export class GeminiPlugin implements IProviderAdapter {
  readonly providerId: AIProviderId = "gemini";
  readonly baseUrl = "https://generativelanguage.googleapis.com";

  ownsModel(modelId: string): boolean {
    return ownsModel(modelId);
  }

  supports(modelId: string, capability: ModelCapability): boolean {
    return modelDataService.getModelCapabilities(modelId).includes(capability);
  }

  validateKeyFormat(apiKey: string): KeyFormatValidationResult {
    return validateKeyFormat(apiKey);
  }

  async listModels(apiKey: string): Promise<string[]> {
    return listModels(apiKey, this.baseUrl, this.getHeaders(apiKey));
  }

  getHeaders(apiKey: string): Record<string, string> {
    return {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    };
  }

  async checkRateLimits(
    apiKey: string,
    modelId?: string,
  ): Promise<RateLimitData> {
    return checkRateLimits(apiKey, this.baseUrl, modelId);
  }

  detectTier(rateLimits?: RateLimitData): string {
    return detectTier(rateLimits);
  }

  async chat(apiKey: string, request: ChatRequest): Promise<ChatResponse> {
    return completeChat(apiKey, request);
  }

  async embeddings(
    apiKey: string,
    request: EmbeddingRequest,
  ): Promise<EmbeddingResponse> {
    return generateEmbeddings(apiKey, request);
  }

  async generateImage(
    _apiKey: string,
    _request: ImageGenerationRequest,
  ): Promise<ImageGenerationResponse> {
    throw createTypedError(
      "Image generation is not supported by Gemini API yet.",
      501,
      "gemini",
    );
  }

  async transcribeAudio(
    _apiKey: string,
    _request: AudioTranscriptionRequest,
  ): Promise<AudioTranscriptionResponse> {
    throw createTypedError(
      "Audio transcription is not supported by Gemini API yet.",
      501,
      "gemini",
    );
  }

  async textToSpeech(
    _apiKey: string,
    _request: TextToSpeechRequest,
  ): Promise<TextToSpeechResponse> {
    throw createTypedError(
      "Text to speech is not supported by Gemini API yet.",
      501,
      "gemini",
    );
  }
}
