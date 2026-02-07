import { AIProviderId, UsageDataPoint, ErrorLogEntry } from "../models/types";
import { db } from "../db";

export type { ErrorLogEntry, UsageDataPoint };
import { calculateCost } from "./model-capabilities";

const MAX_DATA_POINTS = 1000;
const MAX_ERROR_LOGS = 500;

/**
 * Analytics Service for tracking usage and errors
 */
class AnalyticsService {
  private usageData: UsageDataPoint[] = [];
  private errorLogs: ErrorLogEntry[] = [];
  private listeners: Set<() => void> = new Set();
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Start initialization but don't block constructor
    this.initPromise = this.init();
  }

  /**
   * Ensure the service is initialized before accessing data.
   * Safe to call multiple times - uses promise caching.
   */
  async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  private async init(): Promise<void> {
    try {
      // Load initial data from DB
      const usage = await db.usageLogs
        .orderBy("timestamp")
        .reverse()
        .limit(MAX_DATA_POINTS)
        .toArray();
      const errors = await db.errorLogs
        .orderBy("timestamp")
        .reverse()
        .limit(MAX_ERROR_LOGS)
        .toArray();

      this.usageData = usage.reverse();
      this.errorLogs = errors.reverse();
      this.notifyListeners();
    } catch (e) {
      console.error("[Analytics] Failed to initialize service", e);
    } finally {
      // Clear promise after completion
      this.initPromise = null;
    }
  }

  /**
   * Record a successful API request
   */
  async recordUsage(
    data: Omit<UsageDataPoint, "timestamp" | "cost">,
  ): Promise<void> {
    const cost = calculateCost(
      data.modelId,
      data.inputTokens,
      data.outputTokens,
    );
    const entry: UsageDataPoint = {
      ...data,
      cost,
      timestamp: Date.now(),
    };

    // Persist to DB
    try {
      await db.usageLogs.add(entry);
    } catch (e) {
      console.error("Failed to persist usage log", e);
    }

    this.usageData.push(entry);

    // Trim old data in memory
    if (this.usageData.length > MAX_DATA_POINTS) {
      this.usageData = this.usageData.slice(-MAX_DATA_POINTS);
    }

    this.notifyListeners();
  }

  /**
   * Record an error
   */
  async recordError(data: Omit<ErrorLogEntry, "timestamp">): Promise<void> {
    // Security Fix: Redact potential secrets from error message
    const redactedMessage = this.redactSecrets(data.message);

    const entry: ErrorLogEntry = {
      ...data,
      message: redactedMessage,
      timestamp: Date.now(),
    };

    // Persist to DB
    try {
      await db.errorLogs.add(entry);
    } catch (e) {
      console.error("Failed to persist error log", e);
    }

    this.errorLogs.push(entry);

    // Trim old logs in memory
    if (this.errorLogs.length > MAX_ERROR_LOGS) {
      this.errorLogs = this.errorLogs.slice(-MAX_ERROR_LOGS);
    }

    this.notifyListeners();
  }

  /**
   * Get usage data for a time range
   */
  getUsageData(startTime?: number, endTime?: number): UsageDataPoint[] {
    let data = this.usageData;

    if (startTime) {
      data = data.filter((d) => d.timestamp >= startTime);
    }
    if (endTime) {
      data = data.filter((d) => d.timestamp <= endTime);
    }

    return [...data];
  }

  /**
   * Get error logs for a time range
   */
  getErrorLogs(startTime?: number, endTime?: number): ErrorLogEntry[] {
    let logs = this.errorLogs;

    if (startTime) {
      logs = logs.filter((l) => l.timestamp >= startTime);
    }
    if (endTime) {
      logs = logs.filter((l) => l.timestamp <= endTime);
    }

    return [...logs];
  }

  /**
   * Get aggregated stats for a provider
   */
  getProviderStats(
    providerId: AIProviderId,
    sinceTime?: number,
  ): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
    totalCost: number;
    avgLatency: number;
  } {
    const since = sinceTime || 0;
    const usage = this.usageData.filter(
      (d) => d.providerId === providerId && d.timestamp >= since,
    );
    const errors = this.errorLogs.filter(
      (e) => e.providerId === providerId && e.timestamp >= since,
    );

    const successful = usage.filter((d) => d.success);

    return {
      totalRequests: usage.length + errors.length,
      successfulRequests: successful.length,
      failedRequests: errors.length + usage.filter((d) => !d.success).length,
      totalTokens: usage.reduce(
        (sum, d) => sum + d.inputTokens + d.outputTokens,
        0,
      ),
      totalCost: usage.reduce((sum, d) => sum + d.cost, 0),
      avgLatency:
        successful.length > 0
          ? successful.reduce((sum, d) => sum + d.latencyMs, 0) /
            successful.length
          : 0,
    };
  }

  /**
   * Get hourly usage breakdown for charts
   */
  getHourlyBreakdown(hours: number = 24): Array<{
    hour: string;
    requests: number;
    tokens: number;
    cost: number;
    errors: number;
  }> {
    const now = Date.now();
    const startTime = now - hours * 60 * 60 * 1000;
    const buckets = new Map<
      string,
      { requests: number; tokens: number; cost: number; errors: number }
    >();

    // Initialize buckets
    for (let i = 0; i < hours; i++) {
      const time = new Date(startTime + i * 60 * 60 * 1000);
      const key = `${time.getHours().toString().padStart(2, "0")}:00`;
      buckets.set(key, { requests: 0, tokens: 0, cost: 0, errors: 0 });
    }

    // Fill usage data
    for (const data of this.usageData) {
      if (data.timestamp >= startTime) {
        const time = new Date(data.timestamp);
        const key = `${time.getHours().toString().padStart(2, "0")}:00`;
        const bucket = buckets.get(key);
        if (bucket) {
          bucket.requests++;
          bucket.tokens += data.inputTokens + data.outputTokens;
          bucket.cost += data.cost;
        }
      }
    }

    // Fill error data
    for (const error of this.errorLogs) {
      if (error.timestamp >= startTime) {
        const time = new Date(error.timestamp);
        const key = `${time.getHours().toString().padStart(2, "0")}:00`;
        const bucket = buckets.get(key);
        if (bucket) {
          bucket.errors++;
        }
      }
    }

    return Array.from(buckets.entries()).map(([hour, data]) => ({
      hour,
      ...data,
    }));
  }

  /**
   * Subscribe to data changes
   */
  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach((cb) => cb());
  }

  /**
   * Clear all data
   */
  async clearAll(): Promise<void> {
    try {
      await db.usageLogs.clear();
      await db.errorLogs.clear();
    } catch (e) {
      console.error("Failed to clear logs from DB", e);
    }
    this.usageData = [];
    this.errorLogs = [];
    this.notifyListeners();
  }

  /**
   * Redact common API key and secret patterns from a string.
   */
  private redactSecrets(text: string): string {
    if (!text) return text;

    const patterns = [
      /sk-[a-zA-Z0-9]{20,}/g, // OpenAI / Anthropic
      /xai-[a-zA-Z0-9]{20,}/g, // X.AI
      /AIzaSy[a-zA-Z0-9_-]{33}/g, // Gemini / Google
      /Bearer\s+[a-zA-Z0-9._-]+/gi, // Bearer tokens
      /\"?api[_-]key\"?\s*[:=]\s*\"?[a-zA-Z0-9]{10,}\"?/gi, // Generic API key assignments
    ];

    let redacted = text;
    patterns.forEach((pattern) => {
      redacted = redacted.replace(pattern, "[REDACTED]");
    });

    return redacted;
  }
}

export const analyticsService = new AnalyticsService();
