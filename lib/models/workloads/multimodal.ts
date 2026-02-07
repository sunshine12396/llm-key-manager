
export interface EmbeddingRequest {
    model: string;
    input: string | string[];
    dimensions?: number;
    user?: string;
}

export interface EmbeddingResponse {
    data: {
        embedding: number[];
        index: number;
        object: 'embedding';
    }[];
    model: string;
    usage?: {
        promptTokens: number;
        totalTokens: number;
    };
}

export type ImageSize = '256x256' | '512x512' | '1024x1024';

export interface ImageGenerationRequest {
    model: string;
    prompt: string;
    n?: number;
    size?: ImageSize;
    quality?: 'standard' | 'hd';
    style?: 'vivid' | 'natural';
    responseFormat?: 'url' | 'b64_json';
}

export interface ImageGenerationResponse {
    created: number;
    data: {
        url?: string;
        b64_json?: string;
        revised_prompt?: string;
    }[];
}

export interface AudioTranscriptionRequest {
    model: string;
    file: Blob | Buffer; // Check environment compatibility
    language?: string;
    prompt?: string;
    responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
    temperature?: number;
}

export interface AudioTranscriptionResponse {
    text: string;
    duration?: number;
    language?: string;
}

export interface TextToSpeechRequest {
    model: string;
    input: string;
    voice: string;
    responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac';
    speed?: number;
}

export interface TextToSpeechResponse {
    audioContent: ArrayBuffer; // Binary audio data
    contentType: string;
}
