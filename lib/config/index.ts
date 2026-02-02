import { ModelCapability } from '../models/types';

export interface LLMKeyManagerConfig {
    // Filter models by capability - only show/use models with these capabilities
    requiredCapabilities?: ModelCapability[];
    
    // Default capability filter for UI (user can change)
    defaultCapabilityFilter?: ModelCapability | 'all';
    
    // Whether to auto-test keys on add
    autoTestOnAdd?: boolean;
    
    // Providers to enable (default: all)
    enabledProviders?: ('openai' | 'anthropic' | 'gemini')[];
    
    // Custom model capability overrides
    customModelCapabilities?: Record<string, ModelCapability[]>;
}

// Default configuration
const defaultConfig: LLMKeyManagerConfig = {
    requiredCapabilities: undefined, // Show all
    defaultCapabilityFilter: 'all',
    autoTestOnAdd: true,
    enabledProviders: ['openai', 'anthropic', 'gemini'],
    customModelCapabilities: {},
};

// Global configuration instance
let globalConfig: LLMKeyManagerConfig = { ...defaultConfig };

/**
 * Initialize the LLM Key Manager library with custom configuration.
 * Call this before using the library.
 * 
 * @example
 * // For a chat-only app:
 * initLLMKeyManager({
 *     requiredCapabilities: ['text-chat'],
 *     defaultCapabilityFilter: 'text-chat',
 * });
 * 
 * @example
 * // For an image generation app:
 * initLLMKeyManager({
 *     requiredCapabilities: ['image-gen'],
 *     enabledProviders: ['openai', 'gemini'],
 * });
 */
export function initLLMKeyManager(config: Partial<LLMKeyManagerConfig>): void {
    globalConfig = { ...defaultConfig, ...config };
    console.log('🔐 LLM Key Manager initialized with config:', globalConfig);
}

/**
 * Get the current configuration.
 */
export function getLLMKeyManagerConfig(): LLMKeyManagerConfig {
    return globalConfig;
}

/**
 * Update configuration at runtime.
 */
export function updateLLMKeyManagerConfig(config: Partial<LLMKeyManagerConfig>): void {
    globalConfig = { ...globalConfig, ...config };
}

/**
 * Reset to default configuration.
 */
export function resetLLMKeyManagerConfig(): void {
    globalConfig = { ...defaultConfig };
}
