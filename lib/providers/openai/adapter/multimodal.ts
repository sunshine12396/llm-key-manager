import { 
    EmbeddingRequest, 
    EmbeddingResponse, 
    ImageGenerationRequest, 
    ImageGenerationResponse,
    AudioTranscriptionRequest,
    AudioTranscriptionResponse,
    TextToSpeechRequest,
    TextToSpeechResponse
} from '../../../models/workloads/multimodal';
import { createOpenAIClient } from '../client';
import { extractErrorCode, createTypedError, RateLimitError } from '../../../core/errors';

export async function generateEmbeddings(apiKey: string, request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const client = createOpenAIClient(apiKey);
    try {
        const response = await client.embeddings.create({
            model: request.model,
            input: request.input,
            dimensions: request.dimensions,
            user: request.user
        });

        return {
            data: response.data.map((item: any) => ({
                embedding: item.embedding,
                index: item.index,
                object: 'embedding'
            })),
            model: response.model,
            usage: response.usage ? {
                promptTokens: response.usage.prompt_tokens,
                totalTokens: response.usage.total_tokens
            } : undefined
        };
    } catch (error: any) {
        throw handleOpenAIError(error, request.model);
    }
}

export async function generateImage(apiKey: string, request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const client = createOpenAIClient(apiKey);
    try {
        const response = await client.images.generate({
            model: request.model,
            prompt: request.prompt,
            n: request.n,
            size: request.size as any,
            quality: request.quality,
            style: request.style,
            response_format: request.responseFormat as any
        });

        return {
            created: response.created,
            data: (response.data || []).map((item: any) => ({
                url: item.url,
                b64_json: item.b64_json,
                revised_prompt: item.revised_prompt
            }))
        };
    } catch (error: any) {
        throw handleOpenAIError(error, request.model);
    }
}

export async function transcribeAudio(apiKey: string, request: AudioTranscriptionRequest): Promise<AudioTranscriptionResponse> {
    const client = createOpenAIClient(apiKey);
    try {
        // file must be an actual File object or similar in Browser, or Buffer in Node
        // OpenAI client handles this if it's passed correctly
        const response = await client.audio.transcriptions.create({
            file: request.file as any,
            model: request.model,
            language: request.language,
            prompt: request.prompt,
            response_format: request.responseFormat as any,
            temperature: request.temperature
        });

        if (typeof response === 'string') {
            return { text: response };
        }

        return {
            text: (response as any).text,
            duration: (response as any).duration,
            language: (response as any).language
        };
    } catch (error: any) {
        throw handleOpenAIError(error, request.model);
    }
}

export async function textToSpeech(apiKey: string, request: TextToSpeechRequest): Promise<TextToSpeechResponse> {
    const client = createOpenAIClient(apiKey);
    try {
        const response = await client.audio.speech.create({
            model: request.model,
            voice: request.voice as any,
            input: request.input,
            response_format: request.responseFormat as any,
            speed: request.speed
        });

        const arrayBuffer = await response.arrayBuffer();

        return {
            audioContent: arrayBuffer,
            contentType: response.type || 'audio/mpeg'
        };
    } catch (error: any) {
        throw handleOpenAIError(error, request.model);
    }
}

function handleOpenAIError(error: any, modelId: string): Error {
    const status = error.status || error.response?.status;
    const message = error.message || String(error);
    const formattedMessage = `OpenAI API Error ${status || 'Unknown'}: ${message}`;

    const retryAfterHeader = error.headers?.['retry-after'];
    const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader) * 1000 : undefined;

    if (status === 429 && retryAfterMs) {
        return new RateLimitError(formattedMessage, 'openai', retryAfterMs);
    }

    const errorCode = extractErrorCode(message) ?? status;
    return createTypedError(formattedMessage, errorCode, 'openai', {
        modelId,
        retryAfterMs
    });
}
