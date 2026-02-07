
import { describe, it, expect, vi } from 'vitest';
import { OpenAIPlugin } from '../../providers/openai/openai.plugin';
import { modelDataService } from '../../services/model-data.service';

vi.mock('../../services/model-data.service');

describe('OpenAI Provider Plugin', () => {
    const plugin = new OpenAIPlugin();

    it('should identify OpenAI models correctly', () => {
        expect(plugin.ownsModel('gpt-4')).toBe(true);
        expect(plugin.ownsModel('gpt-3.5-turbo')).toBe(true);
        expect(plugin.ownsModel('claude-3')).toBe(false);
    });

    it('should return correct baseUrl', () => {
        expect(plugin.baseUrl).toBe('https://api.openai.com/v1');
    });

    it('should check capabilities via modelDataService', () => {
        vi.mocked(modelDataService.getModelCapabilities).mockReturnValue(['text-chat', 'code']);

        expect(plugin.supports('gpt-4', 'text-chat')).toBe(true);
        expect(plugin.supports('gpt-4', 'image-gen')).toBe(false);
        expect(modelDataService.getModelCapabilities).toHaveBeenCalledWith('gpt-4');
    });

    it('should generate correct authentication headers', () => {
        const headers = plugin.getHeaders('test-key');
        expect(headers['Authorization']).toBe('Bearer test-key');
        expect(headers['Content-Type']).toBe('application/json');
    });

    it('should validate key format correctly', () => {
        // OpenAI keys typically start with sk-
        const valid = plugin.validateKeyFormat('sk-1234567890abcdef1234567890abcdef12345678');
        expect(valid.isValid).toBe(true);

        const invalid = plugin.validateKeyFormat('not-a-key');
        expect(invalid.isValid).toBe(false);
    });
});
