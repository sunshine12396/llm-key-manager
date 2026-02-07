
import { describe, it, expect, beforeEach } from 'vitest';
import { KeyRouter, RoutingStrategy } from '../../services/engines/routing.engine';
import { KeyMetadata } from '../../models/metadata';

describe('Smart Routing Logic', () => {
    let router: KeyRouter;

    beforeEach(() => {
        router = new KeyRouter({ strategy: RoutingStrategy.PRIORITY });
        router.resetStats();
    });

    const createKey = (id: string, overrides: Partial<KeyMetadata> = {}): KeyMetadata => ({
        id,
        providerId: 'openai',
        label: `Key ${id}`,
        priority: 'medium',
        verificationStatus: 'valid',
        averageLatency: 100,
        createdAt: Date.now(),
        usageCount: 0,
        isRevoked: false,
        isEnabled: true,
        ...overrides
    });

    it('should prioritize keys based on Availability (Verification Status)', () => {
        const k1 = createKey('k1', { verificationStatus: 'valid' });
        const k2 = createKey('k2', { verificationStatus: 'testing' });
        const k3 = createKey('k3', { verificationStatus: 'untested' });
        // invalid is usually filtered out, but just in case
        const k4 = createKey('k4', { verificationStatus: 'invalid' });

        const keys = [k4, k3, k2, k1]; // Mixed order

        const selected = router.selectKey(keys, 'openai');
        expect(selected?.id).toBe('k1'); // Valid is best
    });

    it('should prioritize keys based on recent Failure History (Error Rate)', () => {
        const k1 = createKey('k1'); // Will have errors
        const k2 = createKey('k2'); // Clean history

        // Simulate usage
        // K1: 10 requests, 5 errors (50% error rate)
        for (let i = 0; i < 5; i++) router.recordSuccess('k1');
        for (let i = 0; i < 5; i++) router.recordError('k1');

        // K2: 10 requests, 0 errors (0% error rate)
        for (let i = 0; i < 10; i++) router.recordSuccess('k2');

        const selected = router.selectKey([k1, k2], 'openai');

        // Should pick k2 because it has lower error rate
        expect(selected?.id).toBe('k2');
    });

    it('should respect Priority OVER Error Rate', () => {
        // High priority key with errors vs Low priority key with no errors
        // The implementation checks Priority (Step 2) before Error Rate (Step 3/4)

        const k1 = createKey('k1', { priority: 'high' });
        const k2 = createKey('k2', { priority: 'low' });

        // K1 has 100% error rate
        router.recordError('k1');
        router.recordError('k1');

        // K2 has 0% error rate
        router.recordSuccess('k2');

        const selected = router.selectKey([k1, k2], 'openai');

        // Expected behavior: Priority wins. K1 selected despite errors.
        // This confirms the "Hierarchical" nature of the smart routing.
        expect(selected?.id).toBe('k1');
    });

    it('should use Latency as tie-breaker when error rates are similar', () => {
        const k1 = createKey('k1', { averageLatency: 500 });
        const k2 = createKey('k2', { averageLatency: 100 });

        // Both have 0 errors
        const selected = router.selectKey([k1, k2], 'openai');
        expect(selected?.id).toBe('k2'); // Faster key
    });

    it('should prioritize Promoted (Restored) keys after auto-rotation', () => {
        const k1 = createKey('k1'); // Will be rate limited
        const k2 = createKey('k2'); // Backup

        // 1. K1 is healthy, selected first (assuming it was first in list or equal)
        // Let's force K1 to be rate limited
        router.markRateLimited('k1', 'openai', 100); // 100ms cooldown

        // 2. K2 is now selected (because K1 is rate limited)
        const selectedAfterLimit = router.selectKey([k1, k2], 'openai');
        expect(selectedAfterLimit?.id).toBe('k2');

        // 3. Mark K2 as healthy (it effectively becomes "Promoted" as temporary primary)
        router.markHealthy('k2', 'openai');

        // 4. Wait for K1 cooldown to expire
        // We simulate this by mocking Date.now in real app, or waiting here
        const start = Date.now();
        while (Date.now() - start < 150) { /* wait */ }

        // Even though K1 cooldown expired, K2 might still be preferred if it was Promoted?
        // Implementation: "Check if there's a promoted key... if promoted key is not rate limited, return it"
        // So K2 should STICK as primary until rotation cooldown (default 5 mins) passes.

        const selectedSticking = router.selectKey([k1, k2], 'openai');
        expect(selectedSticking?.id).toBe('k2');

        // This verifies "Availability" routing handles steady-state switching.
    });
});
