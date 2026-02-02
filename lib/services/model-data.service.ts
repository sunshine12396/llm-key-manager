/**
 * Model Data Service
 * 
 * Provides data-driven model information including capabilities, pricing, and limits.
 * All data is loaded from JSON constants to allow updates without redeployment.
 */

import { ModelCapability } from '../models/metadata';
import modelsJson from '../constants/models.json';
import pricingJson from '../constants/pricing.json';
import limitsJson from '../constants/limits.json';
import featureFlagsJson from '../constants/feature-flags.json';
import providersJson from '../constants/providers.json';

interface ProviderInfo {
    id: string;
    name: string;
    baseUrl: string;
    website: string;
}

class ModelDataService {
    /**
     * Get all configured providers
     */
    getProviders(): ProviderInfo[] {
        return providersJson as ProviderInfo[];
    }

    /**
     * Get provider info by ID
     */
    getProvider(providerId: string): ProviderInfo | undefined {
        return this.getProviders().find(p => p.id === providerId);
    }

    /**
     * Get capabilities for a model
     */
    getModelCapabilities(modelId: string): ModelCapability[] {
        // Search across all providers in models.json
        for (const provider of Object.values(modelsJson)) {
            const caps = (provider as Record<string, string[]>)[modelId];
            if (caps) return caps as ModelCapability[];
        }

        // Fuzzy match
        for (const provider of Object.values(modelsJson)) {
            for (const [pattern, caps] of Object.entries(provider as Record<string, string[]>)) {
                if (modelId.startsWith(pattern) || modelId.includes(pattern)) {
                    return caps as ModelCapability[];
                }
            }
        }

        return ['text-chat']; // Default
    }

    /**
     * Get pricing data for a model (per 1M tokens)
     */
    getPricing(modelId: string): { input: number; output: number } {
        const pricing = (pricingJson as Record<string, { input: number; output: number }>)[modelId];
        if (pricing) return pricing;

        // Fuzzy match
        for (const [pattern, price] of Object.entries(pricingJson)) {
            if (modelId.includes(pattern)) return price;
        }

        return { input: 0, output: 0 };
    }

    /**
     * Get context window limit for a model
     */
    getContextWindow(modelId: string): string {
        const windows = (limitsJson as any)['context-windows'] as Record<string, string>;

        for (const [pattern, limit] of Object.entries(windows)) {
            if (modelId.includes(pattern)) return limit;
        }

        return '32k'; // Default
    }

    /**
     * Get the mapped model for an alias
     */
    getAlias(alias: string): string {
        return (modelsJson.aliases as any)[alias] || alias;
    }

    /**
     * Get a fallback chain for a capability or model
     */
    getFallbackChain(chain: string): string[] | undefined {
        return (modelsJson.fallbackChains as any)[chain];
    }

    /**
     * Check if a feature flag is enabled
     */
    isFeatureEnabled(flag: keyof typeof featureFlagsJson): boolean {
        return featureFlagsJson[flag] || false;
    }

    /**
     * Calculate cost for a request
     */
    calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
        const pricing = this.getPricing(modelId);
        if (pricing.input === 0 && pricing.output === 0) return 0;

        const inputCost = (inputTokens / 1_000_000) * pricing.input;
        const outputCost = (outputTokens / 1_000_000) * pricing.output;

        return Number((inputCost + outputCost).toFixed(6));
    }
}

export const modelDataService = new ModelDataService();
