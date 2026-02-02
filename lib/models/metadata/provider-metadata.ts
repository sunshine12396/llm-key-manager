export type AIProviderId = 'openai' | 'anthropic' | 'gemini';

export interface RateLimitData {
    requests?: {
        limit: number;
        remaining: number;
        reset?: string | number;
    };
    tokens?: {
        limit: number;
        remaining: number;
        reset?: string | number;
    };
    quota?: {
        limit?: number;
        usage?: number;
        remaining?: number;
    };
}
