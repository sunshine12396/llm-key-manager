import { ModelCapability } from '../models/metadata';
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
 * Filter a list of models by required capability
 */
export function filterModelsByCapability(models: string[], capability: ModelCapability): string[] {
    return models.filter(model => getModelCapabilities(model).includes(capability));
}

/**
 * Gets only the models that strictly match a capability
 */
export function getAllModelsByType(capability: ModelCapability): string[] {
    // In a real app, this would query the indexed models database
    // For now, we use a simple heuristic based on aliases and common names
    const commonModels = ['gpt-4o', 'claude-3-5-sonnet-latest', 'gemini-1.5-pro'];
    return commonModels.filter(m => getModelCapabilities(m).includes(capability));
}

/**
 * Gets the display string for a model's context window
 */
export function getModelContextWindow(modelId: string): string {
    return modelDataService.getContextWindow(modelId);
}

/**
 * Calculates estimated cost based on token usage
 */
export function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    return modelDataService.calculateCost(modelId, inputTokens, outputTokens);
}
