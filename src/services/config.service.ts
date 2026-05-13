import { LLMManagerConfig } from '../models/types';

class ConfigService {
    private config: LLMManagerConfig = {
        supportedModelTypes: {},
        specialModels: {},
        fallbackChains: {}
    };

    /**
     * Update configuration
     */
    configure(config: LLMManagerConfig) {
        this.config = {
            supportedModelTypes: {
                ...this.config.supportedModelTypes,
                ...config.supportedModelTypes
            },
            specialModels: {
                ...this.config.specialModels,
                ...config.specialModels
            },
            fallbackChains: {
                ...this.config.fallbackChains,
                ...config.fallbackChains
            }
        };
        console.log('[ConfigService] Configuration updated', this.config);
    }

    /**
     * Get current configuration
     */
    getConfig(): LLMManagerConfig {
        return this.config;
    }

    /**
     * Get custom model capabilities if defined
     */
    getCustomCapabilities(modelId: string) {
        return this.config.supportedModelTypes?.[modelId];
    }

    /**
     * Get custom alias if defined
     */
    getCustomAlias(alias: string) {
        return this.config.specialModels?.[alias];
    }

    /**
     * Get custom fallback chain if defined
     */
    getFallbackChain(modelId: string): string[] | undefined {
        return this.config.fallbackChains?.[modelId];
    }
}

export const configService = new ConfigService();
