/**
 * Models & Fallback Constants
 * 
 * Re-exports data-driven constants from JSON for legacy compatibility.
 */

import modelsJson from './models.json';
import pricingJson from './pricing.json';

// Model aliases (e.g. 'smart' -> 'gpt-4o')
export const DEFAULT_MODEL_ALIASES: Record<string, string> = modelsJson.aliases;

// Fallback chains (multi-model failover paths)
export const DEFAULT_FALLBACK_CHAINS: Record<string, string[]> = modelsJson.fallbackChains;

// Model pricing data
export const MODEL_PRICING: Record<string, { input: number; output: number }> = pricingJson;
