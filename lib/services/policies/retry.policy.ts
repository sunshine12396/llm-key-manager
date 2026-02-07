interface RetryConfig {
    maxRetries: number;
    baseDelay: number;        // Base delay in ms
    maxDelay: number;         // Maximum delay in ms
    backoffMultiplier: number;
    retryableStatusCodes: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    retryableStatusCodes: [429, 500, 502, 503, 504]
};

export interface RetryResult<T> {
    success: boolean;
    data?: T;
    error?: Error;
    attempts: number;
    totalDelay: number;
}

/**
 * Retry Service with Exponential Backoff
 * Handles transient failures with intelligent retry logic.
 */
export class RetryService {
    private config: RetryConfig;

    constructor(config: Partial<RetryConfig> = {}) {
        this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
    }

    /**
     * Calculate delay for a given attempt with exponential backoff + jitter
     */
    private calculateDelay(attempt: number): number {
        const exponentialDelay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt);
        const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
        const delay = Math.min(exponentialDelay + jitter, this.config.maxDelay);
        return Math.floor(delay);
    }

    /**
     * Check if an error is retryable
     */
    private isRetryable(error: unknown): boolean {
        if (error instanceof Error) {
            // Check for network errors
            if (error.message.includes('fetch') || error.message.includes('network')) {
                return true;
            }
        }

        // Check for HTTP status codes
        if (typeof error === 'object' && error !== null && 'status' in error) {
            const status = (error as { status: number }).status;
            return this.config.retryableStatusCodes.includes(status);
        }

        return false;
    }

    /**
     * Sleep for a given duration
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Execute a function with retry logic
     */
    async execute<T>(
        fn: () => Promise<T>,
        options?: {
            onRetry?: (attempt: number, delay: number, error: Error) => void;
            shouldRetry?: (error: unknown) => boolean;
        }
    ): Promise<RetryResult<T>> {
        let attempts = 0;
        let totalDelay = 0;
        let lastError: Error | undefined;

        while (attempts <= this.config.maxRetries) {
            try {
                const data = await fn();
                return {
                    success: true,
                    data,
                    attempts: attempts + 1,
                    totalDelay
                };
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                const shouldRetry = options?.shouldRetry
                    ? options.shouldRetry(error)
                    : this.isRetryable(error);

                if (!shouldRetry || attempts >= this.config.maxRetries) {
                    return {
                        success: false,
                        error: lastError,
                        attempts: attempts + 1,
                        totalDelay
                    };
                }

                const delay = this.calculateDelay(attempts);
                totalDelay += delay;

                if (options?.onRetry) {
                    options.onRetry(attempts + 1, delay, lastError);
                }

                await this.sleep(delay);
                attempts++;
            }
        }

        return {
            success: false,
            error: lastError || new Error('Max retries exceeded'),
            attempts,
            totalDelay
        };
    }
}

export const retryService = new RetryService();
