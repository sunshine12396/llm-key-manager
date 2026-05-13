import { AIProviderId, RateLimitData } from './provider-metadata';
import { VerifiedModelMetadata } from './model-metadata';

export type KeyVerificationStatus = 'untested' | 'testing' | 'valid' | 'invalid' | 'retry_scheduled';

export interface KeyMetadata {
    id: string;
    providerId: AIProviderId;
    label: string;
    createdAt: number;
    lastUsed?: number;
    usageCount: number;
    isRevoked: boolean;
    isEnabled?: boolean; // User-controlled active state
    priority?: 'high' | 'medium' | 'low'; // Routing priority
    averageLatency?: number; // In milliseconds
    verifiedModels?: string[]; // Legacy: List of model IDs confirmed to work
    verifiedModelsMeta?: VerifiedModelMetadata[]; // New: Rich per-model metadata
    verificationStatus?: KeyVerificationStatus; // Testing state
    tier?: string; // Account tier (e.g., 'Free', 'Tier 1', 'Pro')
    rateLimits?: RateLimitData;
    retryAfter?: number; // Timestamp for when a rate limit reset occurred
    nextRetryAt?: number; // Timestamp for next validation attempt
}

export interface StoredKey extends KeyMetadata {
    encryptedData: ArrayBuffer;
    iv: ArrayBuffer;
    fingerprint: string; // Hash of the raw key to detect duplicates
}

export interface KeyQuota {
    keyId: string;
    limit: number;           // Total quota (e.g., tokens, requests)
    used: number;            // Amount used
    resetTime: number | null; // When quota resets (timestamp)
    estimatedCost: number;   // Estimated cost in USD
}
