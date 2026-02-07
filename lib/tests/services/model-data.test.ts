
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the JSON data BEFORE importing the service
vi.mock('../../constants/models.json', () => ({
    default: {
        openai: {
            "gpt-4": ["text-chat"],
            "gpt-4o-mini": ["text-chat"]
        },
        aliases: {
            "fast": "gpt-4o-mini",
            "smart": "gpt-4"
        },
        fallbackChains: {
            "test-chain": ["gpt-4", "gpt-4o-mini"],
            "complex-chain": ["claude-3", "gemini-pro"]
        }
    }
}));

// Import service after mocking
import { modelDataService } from '../../services/model-data.service';

describe('Model Data Service (Centralized Management)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Alias System', () => {
        it('should resolve known aliases to their target models', () => {
            expect(modelDataService.getAlias('fast')).toBe('gpt-4o-mini');
            expect(modelDataService.getAlias('smart')).toBe('gpt-4');
        });

        it('should return the original string if no alias is found', () => {
            expect(modelDataService.getAlias('unknown-alias')).toBe('unknown-alias');
            expect(modelDataService.getAlias('gpt-4')).toBe('gpt-4');
        });
    });

    describe('Fallback Chains', () => {
        it('should return fallback chain for defined capabilities/keys', () => {
            const chain = modelDataService.getFallbackChain('test-chain');
            expect(chain).toBeDefined();
            expect(chain).toHaveLength(2);
            expect(chain).toEqual(['gpt-4', 'gpt-4o-mini']);
        });

        it('should return undefined for unknown chains', () => {
            const chain = modelDataService.getFallbackChain('non-existent-chain');
            expect(chain).toBeUndefined();
        });

        it('should handle complex multi-provider chains', () => {
            const chain = modelDataService.getFallbackChain('complex-chain');
            expect(chain).toEqual(['claude-3', 'gemini-pro']);
        });
    });

    // Integration check: Ensure UnifiedLLM logic uses this (implicitly tested via unit tests of service here,
    // actual integration would be in unified-llm.test.ts, but we are validating the Service API here)
});
