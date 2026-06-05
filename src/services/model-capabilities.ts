import { ModelCapability } from '../models';
import { configService } from './config.service';
import { modelDataService } from './model-data.service';

/**
 * Gets the capabilities of a model, accounting for both hardcoded defaults
 * and user-defined overrides in the config.
 */
export function getModelCapabilities(modelId: string): ModelCapability[] {
    // 1. Check dynamic config overrides first
    const customCaps = configService.getCustomCapabilities(modelId);
    if (customCaps) return customCaps;

    // 2. Fall back to data-driven constants
    return modelDataService.getModelCapabilities(modelId);
}

/**
 * Calculates estimated cost based on token usage
 */
export function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    return modelDataService.calculateCost(modelId, inputTokens, outputTokens);
}
