
import { describe, it, expect, vi } from 'vitest';
import { AnthropicPlugin } from '../../providers/anthropic/anthropic.plugin';
import { modelDataService } from '../../services/model-data.service';

vi.mock('../../services/model-data.service');

describe('Anthropic Provider Plugin', () => {
    const plugin = new AnthropicPlugin();

    it('should identify Anthropic models correctly', () => {
        expect(plugin.ownsModel('claude-3-opus')).toBe(true);
        expect(plugin.ownsModel('claude-2.1')).toBe(true);
        expect(plugin.ownsModel('gpt-4')).toBe(false);
    });

    it('should return correct baseUrl', () => {
        expect(plugin.baseUrl).toBe('https://api.anthropic.com/v1');
    });

    it('should check capabilities via modelDataService', () => {
        vi.mocked(modelDataService.getModelCapabilities).mockReturnValue(['text-chat', 'image-input']);

        expect(plugin.supports('claude-3', 'text-chat')).toBe(true);
        expect(plugin.supports('claude-3', 'code')).toBe(false);
    });

    it('should generate correct authentication headers', () => {
        const headers = plugin.getHeaders('test-key');
        expect(headers['x-api-key']).toBe('test-key');
        expect(headers['anthropic-version']).toBeDefined();
    });

    it('should validate key format correctly', () => {
        // Anthropic keys typically start with sk-ant- and are long
        const valid = plugin.validateKeyFormat('sk-ant-api03-abcdef-1234567890abcdef-1234567890abcdef-1234567890abcdef-1234567890abcdef-1234');
        expect(valid.isValid).toBe(true);


        const invalid = plugin.validateKeyFormat('not-a-key');
        expect(invalid.isValid).toBe(false);
    });
});
