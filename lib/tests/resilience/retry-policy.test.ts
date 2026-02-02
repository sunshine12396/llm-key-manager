
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetryService } from '../../services/policies/retry.policy';

describe('Retry Service (Exponential Backoff)', () => {
    let retryService: RetryService;

    beforeEach(() => {
        retryService = new RetryService({
            baseDelay: 100, // Short delays for testing
            maxDelay: 1000,
            backoffMultiplier: 2,
            maxRetries: 3
        });
    });

    it('should calculate exponential delay with jitter', () => {
        // Access private method via casting
        const calculateDelay = (retryService as any).calculateDelay.bind(retryService); // delay = base * 2^attempt

        // Attempt 0: 100 * 2^0 = 100ms (+ jitter)
        const d1 = calculateDelay(0);
        expect(d1).toBeGreaterThanOrEqual(100);
        expect(d1).toBeLessThan(130); // 30% jitter

        // Attempt 1: 100 * 2^1 = 200ms
        const d2 = calculateDelay(1);
        expect(d2).toBeGreaterThanOrEqual(200);
        expect(d2).toBeLessThan(260);

        // Attempt 2: 100 * 2^2 = 400ms
        const d3 = calculateDelay(2);
        expect(d3).toBeGreaterThanOrEqual(400);
        expect(d3).toBeLessThan(520);
    });

    it('should retry up to maxRetries', async () => {
        const mockFn = vi.fn()
            .mockRejectedValueOnce(new Error('Fail 1'))
            .mockRejectedValueOnce(new Error('Fail 2'))
            .mockRejectedValueOnce(new Error('Fail 3'))
            .mockRejectedValue(new Error('Fail Final'));

        // Mock sleep to be instant speed
        (retryService as any).sleep = vi.fn().mockResolvedValue(undefined);

        const result = await retryService.execute(mockFn, {
            shouldRetry: () => true // Always retry
        });

        expect(result.success).toBe(false);
        expect(result.attempts).toBe(4); // Initial + 3 Retries = 4 Calls
        expect(mockFn).toHaveBeenCalledTimes(4);
    });

    it('should distinguish retryable vs non-retryable errors', async () => {
        const mockFn = vi.fn()
            .mockRejectedValueOnce({ status: 500, message: 'Server Error' }) // Retryable (default)
            .mockRejectedValueOnce({ status: 400, message: 'Bad Request' }); // Non-Retryable

        // Reuse sleep mock
        (retryService as any).sleep = vi.fn().mockResolvedValue(undefined);

        const result = await retryService.execute(mockFn);

        expect(result.success).toBe(false);
        expect(result.attempts).toBe(2); // Try 1 (500) -> Retry -> Try 2 (400) -> Stop
        expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should succeed if retry succeeds', async () => {
        const mockFn = vi.fn()
            .mockRejectedValueOnce(new Error('Transient Error'))
            .mockResolvedValue('Success');

        (retryService as any).sleep = vi.fn().mockResolvedValue(undefined);

        const result = await retryService.execute(mockFn, { shouldRetry: () => true });

        expect(result.success).toBe(true);
        expect(result.data).toBe('Success');
        expect(result.attempts).toBe(2);
    });

    it('should allow custom shouldRetry logic', async () => {
        const mockFn = vi.fn().mockRejectedValue({ status: 418 }); // I'm a teapot

        const result = await retryService.execute(mockFn, {
            shouldRetry: (err: any) => err.status === 418 // Retry teapots
        });

        // Current maxRetries is 3. So 1 initial + 3 retries = 4 calls.
        expect(result.attempts).toBe(4);
    });
});
