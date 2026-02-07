/**
 * Provider Model Candidates
 * 
 * Provides candidate model lists for each provider.
 * Used when initializing key-model entries.
 */

import { AIProviderId } from '../../models/types';
import modelsData from '../../constants/models.json';

/**
 * Get candidate models for a provider.
 * Returns all known models for the provider from the configuration.
 */
export function getCandidateModels(providerId: AIProviderId): string[] {
    const providerModels = modelsData[providerId as keyof typeof modelsData];
    
    if (!providerModels || typeof providerModels !== 'object') {
        return [];
    }

    // Extract model IDs from the provider's model config
    return Object.keys(providerModels);
}

/**
 * Get all known providers.
 */
export function getKnownProviders(): AIProviderId[] {
    return ['openai', 'anthropic', 'gemini'];
}
