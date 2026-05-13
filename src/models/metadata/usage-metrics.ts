import { AIProviderId } from './provider-metadata';

export interface UsageDataPoint {
    id?: number;
    timestamp: number;
    keyId: string;
    providerId: AIProviderId;
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    success: boolean;
    latencyMs: number;
}

export interface ErrorLogEntry {
    id?: number;
    timestamp: number;
    keyId: string;
    providerId: AIProviderId;
    errorType: 'rate_limit' | 'auth' | 'server' | 'network' | 'quota' | 'unknown';
    message: string;
    retryCount: number;
}
