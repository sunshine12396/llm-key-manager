
import { describe, it, expect } from 'vitest';
import { modelDataService } from '../../services/model-data.service';

describe('ModelDataService - JSON Configuration', () => {
    it('should correctly load capabilities from models.json', () => {
        const gpt4oCaps = modelDataService.getModelCapabilities('gpt-4o');
        expect(gpt4oCaps).toContain('text-chat');
        expect(gpt4oCaps).toContain('text-reasoning');
        expect(gpt4oCaps).toContain('code');
        expect(gpt4oCaps).toContain('image-input');
    });

    it('should correctly load pricing from pricing.json', () => {
        const gpt4oPricing = modelDataService.getPricing('gpt-4o');
        expect(gpt4oPricing.input).toBeGreaterThan(0);
        expect(gpt4oPricing.output).toBeGreaterThan(0);
    });

    it('should correctly load context window from limits.json', () => {
        const gpt4oContext = modelDataService.getContextWindow('gpt-4o');
        expect(gpt4oContext).toBe('128k');
    });

    it('should correctly resolve aliases from models.json', () => {
        const smartModel = modelDataService.getAlias('smart');
        expect(smartModel).toBe('o1-mini');
    });

    it('should correctly resolve fallback chains from models.json', () => {
        const fastChain = modelDataService.getFallbackChain('fast');
        expect(fastChain).toBeDefined();
        expect(fastChain).toContain('gpt-4o-mini');
        expect(fastChain).toContain('gemini-2.0-flash');
    });

    it('should support fuzzy matching for model capabilities', () => {
        // gpt-4-turbo-preview should match gpt-4-turbo
        const match = modelDataService.getModelCapabilities('gpt-4-turbo-2024-04-09');
        expect(match).toContain('text-chat');
    });

    it('should return default capabilities for unknown models', () => {
        const unknown = modelDataService.getModelCapabilities('completely-unknown-model-xyz');
        expect(unknown).toEqual(['text-chat']);
    });

    it('should correctly load providers from providers.json', () => {
        const providers = modelDataService.getProviders();
        expect(providers.length).toBeGreaterThan(2);
        expect(providers.find(p => p.id === 'openai')).toBeDefined();
    });

    it('should correctly find a provider by ID', () => {
        const openai = modelDataService.getProvider('openai');
        expect(openai).toBeDefined();
        expect(openai?.name).toBe('OpenAI');
        expect(openai?.baseUrl).toContain('api.openai.com');
    });
});
