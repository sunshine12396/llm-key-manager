
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resilientHandler } from '../../services/engines/resilience.engine';
import { vaultService } from '../../services/vault/vault.service';
import { keyRouter } from '../../services/engines/routing.engine';
import { safetyGuard } from '../../services/availability/safety-guard';
import { quotaManager } from '../../services/policies/quota.policy';
import { KeyMetadata } from '../../models/metadata';

import { retryService } from '../../services/policies/retry.policy';

// Mock dependencies
vi.mock('../../services/vault/vault.service');
vi.mock('../../services/engines/routing.engine');
vi.mock('../../services/availability/safety-guard');
vi.mock('../../services/policies/quota.policy');
vi.mock('../../services/policies/retry.policy');

describe('Resilience Engine - Failover & Routing', () => {

    const mockKeys: KeyMetadata[] = [
        {
            id: 'k1',
            providerId: 'openai',
            label: 'Key 1 (High Priority)',
            priority: 'high',
            createdAt: Date.now(),
            usageCount: 0,
            isRevoked: false,
            isEnabled: true
        },
        {
            id: 'k2',
            providerId: 'openai',
            label: 'Key 2 (Backup)',
            priority: 'low',
            createdAt: Date.now(),
            usageCount: 0,
            isRevoked: false,
            isEnabled: true
        }
    ];

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock Retry Service to simple pass-through with correct return shape
        vi.mocked(retryService.execute).mockImplementation(async (fn) => {
            try {
                const data = await fn();
                return { success: true, data, attempts: 1, totalDelay: 0 };
            } catch (error) {
                return { success: false, error: error as Error, attempts: 1, totalDelay: 0 };
            }
        });

        // Default mocks
        vi.mocked(vaultService.listKeys).mockResolvedValue(mockKeys);
        vi.mocked(vaultService.getKey).mockImplementation(async (id) => `sk-${id}`);
        vi.mocked(vaultService.updateKey).mockResolvedValue();
        vi.mocked(vaultService.updateUsageStats).mockResolvedValue();
        vi.mocked(vaultService.revokeKey).mockResolvedValue();

        // Safety Guard Defaults: All healthy
        vi.mocked(safetyGuard.isProviderDisabled).mockReturnValue(false);
        vi.mocked(safetyGuard.isKeyDisabled).mockReturnValue(false);
        vi.mocked(safetyGuard.isKeyCircuitOpen).mockReturnValue(false);
        vi.mocked(safetyGuard.getKeyCircuitState).mockReturnValue('CLOSED');

        // Quota Defaults: Has quota
        vi.mocked(quotaManager.hasAvailableQuota).mockReturnValue(true);
        vi.mocked(quotaManager.getUsagePercentage).mockReturnValue(0);

        // Router Defaults: Return k1 then k2
        vi.mocked(keyRouter.selectKey).mockImplementation((keys, _pid, tried) => {
            const triedList = tried || [];
            return keys.find(k => !triedList.includes(k.id)) || null;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should successfully execute request with first available key', async () => {
        const mockFn = vi.fn().mockResolvedValue({ success: true, data: 'result' });

        const result = await resilientHandler.executeRequest('openai', mockFn);

        expect(result.success).toBe(true);
        expect(result.keyUsed).toBe('k1');
        expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should failover to second key on 429 Rate Limit', async () => {
        const mockFn = vi.fn()
            .mockRejectedValueOnce(new Error('429 Too Many Requests')) // k1 fails
            .mockResolvedValue({ success: true, data: 'recovered' });   // k2 succeeds

        const result = await resilientHandler.executeRequest('openai', mockFn);

        expect(result.success).toBe(true);
        expect(result.keyUsed).toBe('k2'); // Should have switched to k2
        expect(result.attempts).toBeGreaterThan(1);

        // Verification: Check if k1 was recorded as error
        expect(keyRouter.recordError).toHaveBeenCalledWith('k1');
        expect(safetyGuard.recordKeyFailure).toHaveBeenCalledWith('k1', 'openai');
    });

    it('should failover to second key on 402 Quota Exceeded', async () => {
        const mockFn = vi.fn()
            .mockRejectedValueOnce(new Error('402 Payment Required: insufficient_quota')) // k1 fails
            .mockResolvedValue({ success: true, data: 'recovered' });

        const result = await resilientHandler.executeRequest('openai', mockFn);

        expect(result.success).toBe(true);
        expect(result.keyUsed).toBe('k2');

        // Verification: Check if k1 was recorded as error
        expect(keyRouter.recordError).toHaveBeenCalledWith('k1');
    });

    it('should bypass keys with open circuit breaker', async () => {
        // Setup: k1 has open circuit
        vi.mocked(safetyGuard.isKeyCircuitOpen).mockImplementation((id) => id === 'k1');

        const mockFn = vi.fn().mockResolvedValue({ success: true });

        const result = await resilientHandler.executeRequest('openai', mockFn);

        expect(result.success).toBe(true);
        expect(result.keyUsed).toBe('k2'); // usage of k1 should be skipped
        expect(mockFn).toHaveBeenCalledTimes(1); // Only called for k2
    });

    it('should bypass keys with exhausted quota', async () => {
        // Setup: k1 has no quota
        vi.mocked(quotaManager.hasAvailableQuota).mockImplementation((id) => id !== 'k1');

        const mockFn = vi.fn().mockResolvedValue({ success: true });

        const result = await resilientHandler.executeRequest('openai', mockFn);

        expect(result.success).toBe(true);
        expect(result.keyUsed).toBe('k2');
    });

    it('should return error if all keys fail', async () => {
        const mockFn = vi.fn().mockRejectedValue(new Error('500 Server Error'));

        const result = await resilientHandler.executeRequest('openai', mockFn);

        expect(result.success).toBe(false);
        // If no specific skip reasons (like rate limit), it returns the last error
        expect(result.error?.message).toBe('500 Server Error');
        expect(mockFn).toHaveBeenCalledTimes(2); // Tried both
    });
});
