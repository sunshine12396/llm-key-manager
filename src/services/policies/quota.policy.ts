import { AIProviderId, KeyQuota } from '../../models/types';
import { db } from '../../db';
import { MODEL_PRICING } from '../../constants/models';

interface QuotaConfig {
    warningThreshold: number;  // Percentage (0-1) to warn at
    criticalThreshold: number; // Percentage (0-1) to consider critical
}

/**
 * Default token costs per 1K tokens (approximate fallback).
 * Note: MODEL_PRICING uses per-1M tokens. This is per-1K for quick estimation.
 */
const DEFAULT_PROVIDER_COSTS: Record<AIProviderId, { input: number; output: number }> = {
    openai: { input: 0.0015, output: 0.002 },    // GPT-4o-mini pricing
    anthropic: { input: 0.003, output: 0.015 },  // Claude 3 Haiku
    gemini: { input: 0.00025, output: 0.0005 }   // Gemini 1.5 Flash
};

/**
 * Quota Manager for Client-Side Usage Estimation
 * Tracks and estimates API usage per key.
 */
export class QuotaManager {
    private quotas: Map<string, KeyQuota> = new Map();
    private config: QuotaConfig;
    private initPromise: Promise<void> | null = null;

    constructor(config: Partial<QuotaConfig> = {}) {
        this.config = {
            warningThreshold: 0.8,
            criticalThreshold: 0.95,
            ...config
        };
        // Start initialization but don't block constructor
        this.initPromise = this.init();
    }

    /**
     * Ensure the manager is initialized before accessing data.
     * Safe to call multiple times - uses promise caching.
     */
    async ensureInitialized(): Promise<void> {
        if (this.initPromise) {
            await this.initPromise;
        }
    }

    /**
     * Initialize by loading quotas from DB
     */
    private async init(): Promise<void> {
        try {
            const records = await db.quotas.toArray();
            for (const r of records) {
                this.quotas.set(r.keyId, r);
            }
            console.log(`[QuotaManager] Loaded ${records.length} quotas from DB`);
        } catch (e) {
            console.error('[QuotaManager] Failed to load quotas', e);
        } finally {
            // Clear promise after completion
            this.initPromise = null;
        }
    }

    private getQuota(keyId: string): KeyQuota {
        if (!this.quotas.has(keyId)) {
            const newQuota: KeyQuota = {
                keyId,
                limit: Infinity,  // Unknown limit by default
                used: 0,
                resetTime: null,
                estimatedCost: 0
            };
            this.quotas.set(keyId, newQuota);
            // Persist initial state
            db.quotas.put(newQuota).catch(console.error);
        }
        return this.quotas.get(keyId)!;
    }

    private async saveQuota(quota: KeyQuota) {
        try {
            await db.quotas.put({ ...quota });
        } catch (e) {
            console.error('[QuotaManager] Failed to save quota', e);
        }
    }

    /**
     * Set the quota limit for a key (user-defined or from API response headers)
     */
    setLimit(keyId: string, limit: number, resetTime?: number): void {
        const quota = this.getQuota(keyId);
        quota.limit = limit;
        if (resetTime) {
            quota.resetTime = resetTime;
        }
        this.saveQuota(quota);
    }

    /**
     * Record token usage for a request
     */
    recordUsage(
        keyId: string,
        providerId: AIProviderId,
        inputTokens: number,
        outputTokens: number,
        modelId?: string
    ): void {
        const quota = this.getQuota(keyId);
        const totalTokens = inputTokens + outputTokens;

        quota.used += totalTokens;

        // Try to find specific model pricing
        if (modelId) {
            const pricing = MODEL_PRICING[modelId] ||
                Object.entries(MODEL_PRICING).find(([k]) => modelId.startsWith(k))?.[1];
            if (pricing) {
                // Pricing is per 1M tokens in constants
                quota.estimatedCost += (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
                this.saveQuota(quota);
                return;
            }
        }

        // Fallback to per-1k defaults
        const costs = DEFAULT_PROVIDER_COSTS[providerId];
        quota.estimatedCost += (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;

        this.saveQuota(quota);
    }

    /**
     * Get the current usage percentage for a key
     */
    getUsagePercentage(keyId: string): number {
        const quota = this.getQuota(keyId);
        if (quota.limit === Infinity || quota.limit === 0) {
            return 0;
        }
        return quota.used / quota.limit;
    }

    /**
     * Check if a key is at warning level
     */
    isAtWarning(keyId: string): boolean {
        return this.getUsagePercentage(keyId) >= this.config.warningThreshold;
    }

    /**
     * Check if a key is at critical level
     */
    isCritical(keyId: string): boolean {
        return this.getUsagePercentage(keyId) >= this.config.criticalThreshold;
    }

    /**
     * Check if a key has available quota
     */
    hasAvailableQuota(keyId: string): boolean {
        return this.getUsagePercentage(keyId) < 1;
    }

    /**
     * Get quota information for a key
     */
    getQuotaInfo(keyId: string): KeyQuota {
        return { ...this.getQuota(keyId) };
    }

    /**
     * Get estimated cost for a key
     */
    getEstimatedCost(keyId: string): number {
        return this.getQuota(keyId).estimatedCost;
    }

    /**
     * Reset usage for a key (e.g., when quota period resets)
     */
    resetUsage(keyId: string): void {
        const quota = this.getQuota(keyId);
        quota.used = 0;
        quota.estimatedCost = 0;
        quota.resetTime = null;
        this.saveQuota(quota);
    }

    /**
     * Check all quotas and reset those past their reset time
     */
    checkAndResetExpired(): void {
        const now = Date.now();
        for (const [keyId, quota] of this.quotas) {
            if (quota.resetTime && now >= quota.resetTime) {
                this.resetUsage(keyId);
            }
        }
    }

    /**
     * Get all keys sorted by usage (least used first)
     */
    getKeysByUsage(): Array<{ keyId: string; usage: number; cost: number }> {
        return Array.from(this.quotas.entries())
            .map(([keyId, quota]) => ({
                keyId,
                usage: this.getUsagePercentage(keyId),
                cost: quota.estimatedCost
            }))
            .sort((a, b) => a.usage - b.usage);
    }
}

export const quotaManager = new QuotaManager();
