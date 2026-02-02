
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validatorJob } from '../../lifecycle/validator.job';
import { vaultService } from '../../services/vault/vault.service';
import * as ProviderRegistry from '../../providers/provider.registry';
import { IProviderAdapter } from '../../providers/types';
import { RateLimitData } from '../../models/metadata';
import 'fake-indexeddb/auto';
import { db } from '../../db/schema';

// Mock VaultService
vi.mock('../../services/vault/vault.service', () => ({
    vaultService: {
        updateKey: vi.fn(),
        getKey: vi.fn().mockResolvedValue('sk-test-key'),
    }
}));

// Mock Dependency imports if any (though we are mocking the method directly)

describe('Background Validator Job', () => {
    let mockAdapter: IProviderAdapter;

    beforeEach(async () => {
        // Reset DB and mocks
        await db.delete();
        await db.open();
        vi.clearAllMocks();

        // Setup Mock Adapter
        mockAdapter = {
            providerId: 'openai',
            listModels: vi.fn().mockResolvedValue(['gpt-4', 'gpt-3.5-turbo']),
            checkRateLimits: vi.fn().mockResolvedValue({
                requests: { limit: 5000, remaining: 4900 },
                tokens: { limit: 100000, remaining: 90000 }
            } as RateLimitData),
            chat: vi.fn().mockResolvedValue({ content: 'pong' }),
            detectTier: vi.fn().mockReturnValue('pro'),
            ownsModel: vi.fn().mockReturnValue(true),
        } as unknown as IProviderAdapter; // Cast strictly needed props

        // Spy on getProviderAdapter to return our mock
        vi.spyOn(ProviderRegistry, 'getProviderAdapter').mockReturnValue(mockAdapter);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should validate key, discover models, and detect tier (Background Validation)', async () => {
        const keyId = 'test-key-id';
        const label = 'My Key';
        const providerId = 'openai';

        // 1. Run Validation
        const result = await validatorJob.validateKey(keyId, providerId, 'sk-test-key', label);

        // 2. Verify Result
        expect(result.status).toBe('valid');
        expect(result.models).toContain('gpt-4');
        expect(result.models).toContain('gpt-3.5-turbo');
        expect(result.keyId).toBe(keyId);

        // 3. Verify Adapter Calls
        expect(mockAdapter.listModels).toHaveBeenCalledWith('sk-test-key');
        expect(mockAdapter.checkRateLimits).toHaveBeenCalledWith('sk-test-key');
        // It validates models by chatting
        expect(mockAdapter.chat).toHaveBeenCalledTimes(2); // Once for each model

        // 4. Verify Vault Update (persistence)
        // It updates status to 'testing' first, then 'valid'
        expect(vaultService.updateKey).toHaveBeenCalledWith(keyId, expect.objectContaining({
            verificationStatus: 'testing'
        }));

        expect(vaultService.updateKey).toHaveBeenCalledWith(keyId, expect.objectContaining({
            verificationStatus: 'valid',
            tier: 'pro',
            verifiedModels: expect.arrayContaining(['gpt-4', 'gpt-3.5-turbo'])
        }));
    });

    it('should handle invalid keys gracefully', async () => {
        // Mock adapter to fail
        mockAdapter.listModels = vi.fn().mockRejectedValue(new Error('401 Unauthorized'));

        const keyId = 'bad-key';
        const result = await validatorJob.validateKey(keyId, 'openai', 'sk-bad', 'Bad Key');

        expect(result.status).toBe('invalid'); // Or 'retry_scheduled' depending on logic, but 401 is usually perm fail
        expect(result.errorType).toBe('no_models');

        expect(vaultService.updateKey).toHaveBeenCalledWith(keyId, expect.objectContaining({
            verificationStatus: 'invalid'
        }));
    });

    it('should emit progress events during validation', async () => {
        const listener = vi.fn();
        const unsubscribe = validatorJob.subscribe(listener);

        await validatorJob.validateKey('k1', 'openai', 'sk-valid', 'Progress Key');

        expect(listener).toHaveBeenCalled();
        const calls = listener.mock.calls.map(c => c[0].type);
        expect(calls).toContain('validation_started');
        expect(calls).toContain('validation_progress');
        expect(calls).toContain('validation_complete');

        unsubscribe();
    });

    it('should detect tiers based on rate limits', async () => {
        mockAdapter.detectTier = vi.fn().mockReturnValue('free');

        await validatorJob.validateKey('k-free', 'openai', 'sk-free', 'Free Key');

        expect(vaultService.updateKey).toHaveBeenCalledWith('k-free', expect.objectContaining({
            tier: 'free'
        }));
    });
});
