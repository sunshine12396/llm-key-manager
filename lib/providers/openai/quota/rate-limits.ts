import { RateLimitData } from '../../../models/metadata';
import { fetchWithTimeout } from '../../../utils/fetch-utils';

const VALIDATION_MODEL = 'gpt-4o-mini';
const BASE_URL = 'https://api.openai.com/v1';

export function getHeaders(apiKey: string): Record<string, string> {
    return {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    };
}

export async function checkRateLimits(apiKey: string, modelId?: string): Promise<RateLimitData> {
    const targetModel = modelId || VALIDATION_MODEL;
    try {
        // We use a minimal completion request to get the actual rate limit headers for generation
        const res = await fetchWithTimeout(`${BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: getHeaders(apiKey),
            body: JSON.stringify({
                model: targetModel,
                messages: [{ role: 'user', content: '1' }],
                max_tokens: 16
            })
        }, 8000);

        const headers = res.headers;

        return {
            requests: {
                limit: parseInt(headers.get('x-ratelimit-limit-requests') || '0'),
                remaining: parseInt(headers.get('x-ratelimit-remaining-requests') || '0'),
                reset: headers.get('x-ratelimit-reset-requests') || undefined
            },
            tokens: {
                limit: parseInt(headers.get('x-ratelimit-limit-tokens') || '0'),
                remaining: parseInt(headers.get('x-ratelimit-remaining-tokens') || '0'),
                reset: headers.get('x-ratelimit-reset-tokens') || undefined
            }
        };
    } catch (error) {
        return {};
    }
}

export function detectTier(rateLimits?: RateLimitData): string {
    if (rateLimits?.requests?.limit) {
        const rpm = rateLimits.requests.limit;
        if (rpm >= 10000) return 'Tier 5';
        if (rpm >= 5000) return 'Tier 4';
        if (rpm >= 3500) return 'Tier 3';
        if (rpm >= 500) return 'Tier 2';
        if (rpm >= 60) return 'Tier 1';
        return 'Free';
    }
    return 'Standard';
}
