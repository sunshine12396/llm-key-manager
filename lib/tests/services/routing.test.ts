
import { describe, it, expect, beforeEach } from 'vitest';
import { KeyRouter, RoutingStrategy, keyRouter } from '../../services/engines/routing.engine';
import { KeyMetadata, VerifiedModelMetadata, ModelPriority } from '../../models/metadata';

describe('KeyRouter Check', () => {
    // Reset singleton state before each test
    beforeEach(() => {
        keyRouter.resetStats();
        // Reset private rotation state if possible, or just use a new instance for unit testing
        // Since keyRouter is exported as singleton, we might need access to it or create a new class instance if exported
        // The file exports 'KeyRouter' class, so we can instantiate it.
    });

    const createKey = (id: string, priority: 'high' | 'medium' | 'low' = 'medium', latency = 100): KeyMetadata => ({
        id,
        providerId: 'openai',
        label: `Key ${id}`,
        priority,
        isEnabled: true,
        isRevoked: false,
        verificationStatus: 'valid',
        averageLatency: latency,
        usageCount: 0,
        createdAt: Date.now(),
        lastUsed: 0
    });

    describe('Priority Routing', () => {
        const router = new KeyRouter({ strategy: RoutingStrategy.PRIORITY });

        it('should select high priority key over low priority', () => {
            const keys = [
                createKey('k1', 'low'),
                createKey('k2', 'high'),
                createKey('k3', 'medium')
            ];

            const selected = router.selectKey(keys, 'openai');
            expect(selected?.id).toBe('k2');
        });

        it('should use latency as tie-breaker for same priority', () => {
            const keys = [
                createKey('k1', 'high', 200),
                createKey('k2', 'high', 100)
            ];

            const selected = router.selectKey(keys, 'openai');
            expect(selected?.id).toBe('k2');
        });

        it('should respect model-specific priority', () => {
            const k1 = createKey('k1', 'high'); // General High
            const k2 = createKey('k2', 'high'); // General High

            const createVerifiedMeta = (keyId: string, modelId: string, priority: ModelPriority): VerifiedModelMetadata => ({
                modelId,
                providerId: 'openai',
                keyId,
                isAvailable: true,
                state: 'AVAILABLE',
                lastCheckedAt: Date.now(),
                modelPriority: priority,
                retryCount: 0,
                nextRetryAt: null
            });

            // k2 has specific high priority for gpt-4
            k2.verifiedModelsMeta = [createVerifiedMeta('k2', 'gpt-4', 5)]; // 5 is high
            k1.verifiedModelsMeta = [createVerifiedMeta('k1', 'gpt-4', 1)];

            const selected = router.selectKey([k1, k2], 'openai', [], 'gpt-4');
            expect(selected?.id).toBe('k2');
        });
    });

    describe('Auto-Switching & Rotation', () => {
        const router = new KeyRouter({
            strategy: RoutingStrategy.PRIORITY,
            rotationCooldown: 5000 // Short cooldown for testing
        });

        it('should exclude rate-limited keys', () => {
            const keys = [createKey('k1'), createKey('k2')];

            // Mark k1 as rate-limited
            router.markRateLimited('k1', 'openai', 60000);

            const selected = router.selectKey(keys, 'openai');
            expect(selected?.id).toBe('k2');
        });

        it('should fallback to rate-limited key if NO healthy keys exist', () => {
            const keys = [createKey('k1')];
            router.markRateLimited('k1', 'openai', 60000);

            // Should still return k1 because it's the only one (Failover Logic)
            const selected = router.selectKey(keys, 'openai');
            expect(selected?.id).toBe('k1');
        });

        it('should promote healthy key and stick to it', () => {
            const keys = [createKey('k1'), createKey('k2')];

            // k1 fails
            router.markRateLimited('k1', 'openai', 60000);

            // k2 selected
            const selected = router.selectKey(keys, 'openai');
            expect(selected?.id).toBe('k2');

            // Mark k2 success -> Promoted
            router.markHealthy('k2', 'openai');

            // Even if k1 cooldown expired manually (simulated), k2 might still be preferred due to promotion?
            // Actually config.rotationCooldown applies. 
            // In Priority strategy, it usually strictly follows priority, but Router has "Promoted Key" logic.

            const promoted = router.getPromotedKey('openai');
            expect(promoted).toBe('k2');
        });
    });

    describe('Routing Strategies', () => {
        it('should support Round Robin', () => {
            const router = new KeyRouter({ strategy: RoutingStrategy.ROUND_ROBIN });
            const keys = [createKey('k1'), createKey('k2')];

            const first = router.selectKey(keys, 'openai');
            const second = router.selectKey(keys, 'openai');
            const third = router.selectKey(keys, 'openai');

            expect(first?.id).toBe('k1');
            expect(second?.id).toBe('k2');
            expect(third?.id).toBe('k1');
        });
    });
});
