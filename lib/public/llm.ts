import { llmClient as internalClient } from "../core/unified-llm.client";
import {
  ChatRequest,
  ChatResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  AudioTranscriptionRequest,
  AudioTranscriptionResponse,
  TextToSpeechRequest,
  TextToSpeechResponse,
} from "./types";
import { AIProviderId, LLMManagerConfig } from "../models/metadata";

/**
 * Public LLM Client
 *
 * Provides a stable interface for unified chat across all providers.
 */
export const llmClient = {
  /**
   * Send a chat completion request to the best available provider/model.
   */
  async chat(
    request: ChatRequest,
    options?: { providerId?: AIProviderId; timeout?: number },
  ): Promise<ChatResponse> {
    return internalClient.chat(request, options);
  },

  /**
   * Generate text embeddings.
   */
  async embeddings(
    request: EmbeddingRequest,
    options?: { providerId?: AIProviderId; timeout?: number },
  ): Promise<EmbeddingResponse> {
    return internalClient.embeddings(request, options);
  },

  /**
   * Generate images from text.
   */
  async generateImage(
    request: ImageGenerationRequest,
    options?: { providerId?: AIProviderId; timeout?: number },
  ): Promise<ImageGenerationResponse> {
    return internalClient.generateImage(request, options);
  },

  /**
   * Transcribe audio to text.
   */
  async transcribeAudio(
    request: AudioTranscriptionRequest,
    options?: { providerId?: AIProviderId; timeout?: number },
  ): Promise<AudioTranscriptionResponse> {
    return internalClient.transcribeAudio(request, options);
  },

  /**
   * Convert text to speech.
   */
  async textToSpeech(
    request: TextToSpeechRequest,
    options?: { providerId?: AIProviderId; timeout?: number },
  ): Promise<TextToSpeechResponse> {
    return internalClient.textToSpeech(request, options);
  },

  /**
   * Configure global settings for the LLM client.
   */
  configure(config: LLMManagerConfig) {
    return internalClient.configure(config);
  },
};
