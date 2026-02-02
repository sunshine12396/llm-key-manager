import { RateLimitData } from '../../../models/metadata';
import { fetchWithTimeout } from '../../../utils/fetch-utils';

export function getHeaders(apiKey: string): Record<string, string> {
    return {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json'
    };
}

export async function checkRateLimits(apiKey: string, baseUrl: string, modelId?: string): Promise<RateLimitData> {
    const targetModel = modelId || 'gemini-2.0-flash';
    try {
        let res = await fetchWithTimeout(`${baseUrl}/v1/models/${targetModel}`, {
            headers: getHeaders(apiKey)
        }, 5000);

        if (!res.ok) {
            res = await fetchWithTimeout(`${baseUrl}/v1beta/models/${targetModel}`, {
                headers: getHeaders(apiKey)
            }, 5000);
        }

        if (res.ok) {
            return {
                requests: {
                    limit: 15, // Default RPM for Gemini free tier
                    remaining: 15,
                    reset: '1m'
                },
                tokens: {
                    limit: 1000000,
                    remaining: 1000000
                }
            };
        }
        return {};
    } catch {
        return {};
    }
}

export function detectTier(rateLimits?: RateLimitData): string {
    if (rateLimits?.requests?.limit) {
        const rpm = rateLimits.requests.limit;
        if (rpm <= 15) return 'Free';
        if (rpm > 60) return 'Pay-as-you-go';
    }
    return 'Standard';
}
