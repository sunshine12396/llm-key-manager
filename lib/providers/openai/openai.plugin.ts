import { IProviderAdapter, KeyFormatValidationResult } from "../types";
import { ChatRequest, ChatResponse } from "../../models/workloads";
import {
  RateLimitData,
  AIProviderId,
  ModelCapability,
} from "../../models/metadata";
import { modelDataService } from "../../services/model-data.service";

import { completeChat } from "./adapter/chat";
import {
  generateEmbeddings,
  generateImage,
  transcribeAudio,
  textToSpeech,
} from "./adapter/multimodal";
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

export class OpenAIPlugin implements IProviderAdapter {
  readonly providerId: AIProviderId = "openai";
  readonly baseUrl = "https://api.openai.com/v1";

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
    return listModels(apiKey);
  }

  getHeaders(apiKey: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async checkRateLimits(
    apiKey: string,
    modelId?: string,
  ): Promise<RateLimitData> {
    return checkRateLimits(apiKey, modelId);
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
    apiKey: string,
    request: ImageGenerationRequest,
  ): Promise<ImageGenerationResponse> {
    return generateImage(apiKey, request);
  }

  async transcribeAudio(
    apiKey: string,
    request: AudioTranscriptionRequest,
  ): Promise<AudioTranscriptionResponse> {
    return transcribeAudio(apiKey, request);
  }

  async textToSpeech(
    apiKey: string,
    request: TextToSpeechRequest,
  ): Promise<TextToSpeechResponse> {
    return textToSpeech(apiKey, request);
  }
}
