import { AIProviderId, ModelCapability, RateLimitData } from '../models/metadata';
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
    TextToSpeechResponse
} from '../models/workloads';

export interface AIModel {
    id: string;
    name?: string; // Human readable name
    description?: string;
    providerId: AIProviderId;
    capabilities: ModelCapability[];
    contextWindow: number;
    maxOutput: number;
    pricing?: {
        prompt: number; // Cost per 1M tokens
        completion: number;
    };
    releaseDate?: string;
}

export interface KeyFormatValidationResult {
    isValid: boolean;
    errorMessage?: string;
    hint?: string;
}


export interface IProviderAdapter {
    readonly providerId: AIProviderId;
    readonly baseUrl: string;

    /**
     * Check whether a model supports a specific capability
     * (chat, embeddings, image, audio, vision, tools, etc.)
     */
    supports(modelId: string, capability: ModelCapability): boolean;

    /**
     * ownsModel
     * Checks if a model ID belongs to this provider.
     * Used for provider inference.
     */
    ownsModel(modelId: string): boolean;

    /**
     * validateKeyFormat
     * Validates the format of an API key locally (no network request).
     * Returns validation result with error message if invalid.
     */
    validateKeyFormat(apiKey: string): KeyFormatValidationResult;


    /**
     * listModels
     * Fetches the list of available models for this specific API key.
     * Returns model IDs.
     */
    listModels(apiKey: string): Promise<string[]>;

    /**
     * getHeaders
     * Returns the specific headers required for this provider.
     */
    getHeaders(apiKey: string): Record<string, string>;

    /**
     * checkRateLimits
     * Makes a minimal request to fetch the latest rate limit headers.
     * @param apiKey - The API key to check
     * @param modelId - Optional model ID for model-specific rate limits
     */
    checkRateLimits(apiKey: string, modelId?: string): Promise<RateLimitData>;

    /**
     * detectTier
     * Determines the account tier based on rate limits.
     * Each provider has its own tier classification logic.
     */
    detectTier(rateLimits?: RateLimitData): string;

    /**
     * chat
     * Standardized chat completion interface.
     */
    chat(apiKey: string, request: ChatRequest): Promise<ChatResponse>;

    /**
     * Text embeddings generation
     */
    embeddings?(
        apiKey: string,
        request: EmbeddingRequest
    ): Promise<EmbeddingResponse>;

    /**
     * Image generation
     */
    generateImage?(
        apiKey: string,
        request: ImageGenerationRequest
    ): Promise<ImageGenerationResponse>;

    /**
     * Audio transcription (speech → text)
     */
    transcribeAudio?(
        apiKey: string,
        request: AudioTranscriptionRequest
    ): Promise<AudioTranscriptionResponse>;

    /**
     * Text to speech (text → audio)
     */
    textToSpeech?(
        apiKey: string,
        request: TextToSpeechRequest
    ): Promise<TextToSpeechResponse>;
}
