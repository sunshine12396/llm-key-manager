
import { describe, it, expect, vi } from 'vitest';
import { GeminiPlugin } from '../../providers/gemini/gemini.plugin';
import { modelDataService } from '../../services/model-data.service';

vi.mock('../../services/model-data.service');

describe('Gemini Provider Plugin', () => {
    const plugin = new GeminiPlugin();

    it('should identify Gemini models correctly', () => {
        expect(plugin.ownsModel('gemini-pro')).toBe(true);
        expect(plugin.ownsModel('gemini-1.5-flash')).toBe(true);
        expect(plugin.ownsModel('gpt-4')).toBe(false);
    });

    it('should return correct baseUrl', () => {
        expect(plugin.baseUrl).toBe('https://generativelanguage.googleapis.com');
    });

    it('should check capabilities via modelDataService', () => {
        vi.mocked(modelDataService.getModelCapabilities).mockReturnValue(['text-chat', 'image-input']);

        expect(plugin.supports('gemini-pro', 'text-chat')).toBe(true);
        expect(plugin.supports('gemini-pro', 'video-gen')).toBe(false);
    });

    it('should generate correct authentication headers', () => {
        const headers = plugin.getHeaders('test-key');
        expect(headers['x-goog-api-key']).toBe('test-key');
    });

    it('should validate key format correctly', () => {
        // Gemini keys are exactly 39 characters starting with AIza
        const valid = plugin.validateKeyFormat('AIzaSyD_abcdef1234567890abcdef123456789'); // 39 chars
        expect(valid.isValid).toBe(true);


        const invalid = plugin.validateKeyFormat('AIzaSyD_too-short');
        expect(invalid.isValid).toBe(false);
    });
});
