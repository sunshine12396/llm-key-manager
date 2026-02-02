
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/schema';
import { modelMetadataService } from '../../services/engines/model-discovery.service';
import { VerifiedModelMetadata } from '../../models/metadata';

// Mock routing engine if needed for some tests, but we'll focus on ModelDiscovery logic
// and integration with DB.

describe('Smart Health & Capability Discovery', () => {
    beforeEach(async () => {
        await db.delete();
        await db.open();
        await modelMetadataService.clearCache();
    });

    it('should query available models with filters', async () => {
        // Seed data
        const models: VerifiedModelMetadata[] = [
            {
                modelId: 'gpt-4',
                keyId: 'key-1',
                providerId: 'openai',
                isAvailable: true,
                capabilities: ['text-chat'],
                modelPriority: 5,
                lastCheckedAt: Date.now(),
                state: 'AVAILABLE',
                retryCount: 0,
                nextRetryAt: null
            },
            {
                modelId: 'text-embedding-3',
                keyId: 'key-1',
                providerId: 'openai',
                isAvailable: true,
                capabilities: ['embedding'],
                modelPriority: 3,
                lastCheckedAt: Date.now(),
                state: 'AVAILABLE',
                retryCount: 0,
                nextRetryAt: null
            },
            {
                modelId: 'claude-3',
                keyId: 'key-2',
                providerId: 'anthropic',
                isAvailable: true,
                capabilities: ['text-chat'],
                modelPriority: 5,
                lastCheckedAt: Date.now(),
                state: 'AVAILABLE',
                retryCount: 0,
                nextRetryAt: null
            },
            {
                modelId: 'broken-model',
                keyId: 'key-1',
                providerId: 'openai',
                isAvailable: false,
                capabilities: ['text-chat'],
                lastCheckedAt: Date.now(),
                modelPriority: 1,
                state: 'PERM_FAILED',
                retryCount: 0,
                nextRetryAt: null
            }
        ];

        await modelMetadataService.saveModelMetadataBatch(models);

        // Test Provider Filter
        const openaiModels = await modelMetadataService.queryAvailableModels({ provider: 'openai' });
        expect(openaiModels.length).toBe(2);
        expect(openaiModels.find(m => m.modelId === 'gpt-4')).toBeDefined();
        // broken-model is unavailable, so it shouldn't be returned by default for "available" query

        // Test Capability Filter
        const chatModels = await modelMetadataService.queryAvailableModels({ capabilities: ['text-chat'] });
        expect(chatModels.length).toBe(2); // gpt-4, claude-3
        expect(chatModels.find(m => m.modelId === 'text-embedding-3')).toBeUndefined();

        // Test Priority Filter
        const highPriModels = await modelMetadataService.queryAvailableModels({ priority: 4 });
        expect(highPriModels.length).toBe(2); // gpt-4 (5), claude-3 (5)
        expect(highPriModels.find(m => m.modelId === 'text-embedding-3')).toBeUndefined(); // priority 3
    });

    it('should detect models available for specific provider', async () => {
        await modelMetadataService.saveModelMetadata({
            modelId: 'gemini-pro',
            keyId: 'k1',
            providerId: 'gemini',
            isAvailable: true,
            capabilities: ['text-chat'],
            lastCheckedAt: Date.now(),
            state: 'AVAILABLE',
            modelPriority: 1,
            retryCount: 0,
            nextRetryAt: null
        });

        const geminiModels = await modelMetadataService.getAvailableModels('gemini');
        expect(geminiModels.length).toBe(1);
        expect(geminiModels[0].modelId).toBe('gemini-pro');
    });

    it('should handle model error states correctly (Smart Health)', async () => {
        const keyId = 'key-test';
        const modelId = 'gpt-test';

        // Initial state: Available
        await modelMetadataService.saveModelMetadata({
            modelId,
            keyId,
            providerId: 'openai',
            isAvailable: true,
            lastCheckedAt: Date.now(),
            state: 'AVAILABLE',
            modelPriority: 1,
            retryCount: 0,
            nextRetryAt: null
        });

        // Simulating 401 (Auth Error) -> Should mark unavailable
        await modelMetadataService.handleModelError(keyId, modelId, 401, 'Unauthorized');
        let meta = await modelMetadataService.getModelMetadata(keyId, modelId);
        expect(meta?.isAvailable).toBe(false);
        expect(meta?.state).toBe('PERM_FAILED');

        // Reset
        await modelMetadataService.markModelAvailable(keyId, modelId);

        // Simulating 429 (Rate Limit) -> Should REMAIN available (handled by router, not permanent disable)
        await modelMetadataService.handleModelError(keyId, modelId, 429, 'Rate Limit');
        meta = await modelMetadataService.getModelMetadata(keyId, modelId);
        expect(meta?.isAvailable).toBe(true);
    });

    it('should retrieve stale models for background validation', async () => {
        const now = Date.now();
        const oldTime = now - (25 * 60 * 60 * 1000); // 25 hours ago

        await modelMetadataService.saveModelMetadataBatch([
            { modelId: 'fresh', keyId: 'k1', providerId: 'openai', isAvailable: true, lastCheckedAt: now, state: 'AVAILABLE', modelPriority: 1, retryCount: 0, nextRetryAt: null },
            { modelId: 'stale', keyId: 'k1', providerId: 'openai', isAvailable: true, lastCheckedAt: oldTime, state: 'AVAILABLE', modelPriority: 1, retryCount: 0, nextRetryAt: null }
        ]);

        const stale = await modelMetadataService.getStaleModels(24 * 60 * 60 * 1000);
        expect(stale.length).toBe(1);
        expect(stale[0].modelId).toBe('stale');
    });
});
