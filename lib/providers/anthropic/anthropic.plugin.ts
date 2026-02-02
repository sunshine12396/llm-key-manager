import { IProviderAdapter, KeyFormatValidationResult } from '../types';
import { ChatRequest, ChatResponse } from '../../models/workloads';
import { RateLimitData, AIProviderId, ModelCapability } from '../../models/metadata';
import { modelDataService } from '../../services/model-data.service';

import { completeChat } from './adapter/chat';
import { listModels, ownsModel } from './discovery/models';
import { validateKeyFormat } from './discovery/health';
import { checkRateLimits, detectTier, getHeaders } from './quota/rate-limits';
import {
    EmbeddingRequest,
    EmbeddingResponse,
    ImageGenerationRequest,
    ImageGenerationResponse,
    AudioTranscriptionRequest,
    AudioTranscriptionResponse,
    TextToSpeechRequest,
    TextToSpeechResponse
} from '../../models/workloads/multimodal';

export class AnthropicPlugin implements IProviderAdapter {
    readonly providerId: AIProviderId = 'anthropic';

    get baseUrl(): string {
        return modelDataService.getProvider(this.providerId)?.baseUrl || 'https://api.anthropic.com/v1';
    }

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
        return listModels(apiKey, this.baseUrl);
    }

    getHeaders(apiKey: string): Record<string, string> {
        return getHeaders(apiKey);
    }

    async checkRateLimits(apiKey: string, _modelId?: string): Promise<RateLimitData> {
        return checkRateLimits(apiKey, this.baseUrl);
    }

    detectTier(rateLimits?: RateLimitData): string {
        return detectTier(rateLimits);
    }

    async chat(apiKey: string, request: ChatRequest): Promise<ChatResponse> {
        return completeChat(apiKey, request);
    }

    async embeddings(_apiKey: string, _request: EmbeddingRequest): Promise<EmbeddingResponse> {
        throw new Error('Embeddings are not supported by Anthropic API yet.');
    }

    async generateImage(_apiKey: string, _request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
        throw new Error('Image generation is not supported by Anthropic API yet.');
    }

    async transcribeAudio(_apiKey: string, _request: AudioTranscriptionRequest): Promise<AudioTranscriptionResponse> {
        throw new Error('Audio transcription is not supported by Anthropic API yet.');
    }

    async textToSpeech(_apiKey: string, _request: TextToSpeechRequest): Promise<TextToSpeechResponse> {
        throw new Error('Text to speech is not supported by Anthropic API yet.');
    }
}
