import { describe, it, expect, vi } from 'vitest';
import { KeyRouter, RoutingStrategy } from '../../services/engines/routing.engine';
import { KeyMetadata } from '../../models/metadata';

describe('KeyRouter Logic Verification', () => {
    it('should break ties using Model Priority when Key Priority is equal', () => {
        const router = new KeyRouter({
            strategy: RoutingStrategy.PRIORITY
        } as any);

        // Spy on verifyKeyHealth or getStats if needed. 
        // Based on the code, selectByPriority calls this.getStats(key.id).
        vi.spyOn(router as any, 'getStats').mockReturnValue({
            requestCount: 10,
            errorCount: 0
        });

        const modelId = 'gpt-4';

        // Key A: Medium Priority, Model Priority 1 (Low)
        const keyA: KeyMetadata = {
            id: 'key-a',
            label: 'Key A',
            providerId: 'openai',
            priority: 'medium',
            verificationStatus: 'valid',
            verifiedModelsMeta: [
                { modelId: 'gpt-4', modelPriority: 1, isAvailable: true, providerId: 'openai' }
            ],
            // Add other required fields to satisfy type or just as any
            created: Date.now(),
            usageCount: 0
        } as any;

        // Key B: Medium Priority, Model Priority 5 (High)
        const keyB: KeyMetadata = {
            id: 'key-b',
            label: 'Key B',
            providerId: 'openai',
            priority: 'medium',
            verificationStatus: 'valid',
            verifiedModelsMeta: [
                { modelId: 'gpt-4', modelPriority: 5, isAvailable: true, providerId: 'openai' }
            ],
            created: Date.now(),
            usageCount: 0
        } as any;

        // Action: Select key for gpt-4
        // We pass [keyA, keyB]. Since status and key priority are same, 
        // it should check model priority. Key B (5) > Key A (1).
        const selected = (router as any).selectByPriority([keyA, keyB], modelId);

        // Assert
        expect(selected.id).toBe('key-b');
    });

    it('should fallback to Key Priority if Model Priority is not involved', () => {
        const router = new KeyRouter({ strategy: RoutingStrategy.PRIORITY } as any);
        vi.spyOn(router as any, 'getStats').mockReturnValue({ requestCount: 0, errorCount: 0 });

        const keyHigh: KeyMetadata = {
            id: 'key-high',
            priority: 'high',
            verificationStatus: 'valid',
            verifiedModelsMeta: []
        } as any;

        const keyLow: KeyMetadata = {
            id: 'key-low',
            priority: 'low',
            verificationStatus: 'valid',
            verifiedModelsMeta: []
        } as any;

        const selected = (router as any).selectByPriority([keyLow, keyHigh], 'some-model');
        expect(selected.id).toBe('key-high');
    });
});
