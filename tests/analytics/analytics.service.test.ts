import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db";
import { analyticsService } from "../../src/services/analytics.service";

describe("AnalyticsService", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await analyticsService.ensureInitialized();
    await analyticsService.clearAll();
    await db.usageLogs.clear();
    await db.errorLogs.clear();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await analyticsService.clearAll();
  });

  describe("secret redaction", () => {
    it("redacts OpenAI and Anthropic style sk-* keys", async () => {
      await analyticsService.recordError({
        keyId: "key-1",
        providerId: "openai",
        errorType: "auth",
        message: "Auth failed for sk-abcdefghijklmnopqrstuvwxyz123456",
        retryCount: 0,
      });

      const [error] = analyticsService.getErrorLogs();
      expect(error.message).toBe("Auth failed for [REDACTED]");
      expect(error.message).not.toContain("sk-");
    });

    it("redacts Gemini API keys", async () => {
      await analyticsService.recordError({
        keyId: "key-1",
        providerId: "gemini",
        errorType: "auth",
        message: "Google rejected AIzaSyabcdefghijklmnopqrstuvwxyz1234567",
        retryCount: 0,
      });

      const [error] = analyticsService.getErrorLogs();
      expect(error.message).toBe("Google rejected [REDACTED]");
      expect(error.message).not.toContain("AIzaSy");
    });

    it("redacts Bearer authorization headers", async () => {
      await analyticsService.recordError({
        keyId: "key-1",
        providerId: "openai",
        errorType: "auth",
        message: "Authorization: Bearer token.secret-value_123 failed",
        retryCount: 0,
      });

      const [error] = analyticsService.getErrorLogs();
      expect(error.message).toBe("Authorization: [REDACTED] failed");
      expect(error.message).not.toContain("token.secret-value_123");
    });

    it("redacts generic api_key assignments in JSON-like and query-string text", async () => {
      await analyticsService.recordError({
        keyId: "key-1",
        providerId: "openai",
        errorType: "auth",
        message:
          'Payload contained "api_key": "abcdefghijklmnop" and api_key=zyxwvutsrqpon',
        retryCount: 0,
      });

      const [error] = analyticsService.getErrorLogs();
      expect(error.message).toContain("[REDACTED]");
      expect(error.message).not.toContain("abcdefghijklmnop");
      expect(error.message).not.toContain("zyxwvutsrqpon");
    });

    it("keeps ordinary error messages unchanged", async () => {
      await analyticsService.recordError({
        keyId: "key-1",
        providerId: "openai",
        errorType: "server",
        message: "Upstream server returned 503 after retry",
        retryCount: 2,
      });

      const [error] = analyticsService.getErrorLogs();
      expect(error.message).toBe("Upstream server returned 503 after retry");
    });
  });

  describe("provider stats", () => {
    it("calculates average latency from successful usage only", async () => {
      vi.spyOn(Date, "now").mockReturnValue(
        new Date("2026-06-05T10:00:00Z").getTime(),
      );

      await analyticsService.recordUsage({
        keyId: "key-1",
        providerId: "openai",
        modelId: "gpt-4o",
        inputTokens: 100,
        outputTokens: 50,
        success: true,
        latencyMs: 100,
      });
      await analyticsService.recordUsage({
        keyId: "key-1",
        providerId: "openai",
        modelId: "gpt-4o",
        inputTokens: 20,
        outputTokens: 10,
        success: false,
        latencyMs: 10_000,
      });
      await analyticsService.recordUsage({
        keyId: "key-2",
        providerId: "openai",
        modelId: "gpt-4o",
        inputTokens: 100,
        outputTokens: 50,
        success: true,
        latencyMs: 300,
      });
      await analyticsService.recordError({
        keyId: "key-1",
        providerId: "openai",
        errorType: "server",
        message: "500 Server Error",
        retryCount: 1,
      });

      const stats = analyticsService.getProviderStats("openai");

      expect(stats.totalRequests).toBe(4);
      expect(stats.successfulRequests).toBe(2);
      expect(stats.failedRequests).toBe(2);
      expect(stats.totalTokens).toBe(330);
      expect(stats.totalCost).toBeGreaterThan(0);
      expect(stats.avgLatency).toBe(200);
    });

    it("returns avgLatency=0 when there are no successful requests", async () => {
      await analyticsService.recordUsage({
        keyId: "key-1",
        providerId: "openai",
        modelId: "gpt-4o",
        inputTokens: 10,
        outputTokens: 5,
        success: false,
        latencyMs: 500,
      });

      const stats = analyticsService.getProviderStats("openai");

      expect(stats.successfulRequests).toBe(0);
      expect(stats.avgLatency).toBe(0);
    });

    it("filters provider stats by sinceTime", async () => {
      const dateSpy = vi.spyOn(Date, "now").mockReturnValue(
        new Date("2026-06-05T09:00:00Z").getTime(),
      );
      await analyticsService.recordUsage({
        keyId: "old-key",
        providerId: "openai",
        modelId: "gpt-4o",
        inputTokens: 100,
        outputTokens: 0,
        success: true,
        latencyMs: 100,
      });

      const since = Date.now() + 1;
      dateSpy.mockReturnValue(since);
      await analyticsService.recordUsage({
        keyId: "new-key",
        providerId: "openai",
        modelId: "gpt-4o",
        inputTokens: 40,
        outputTokens: 60,
        success: true,
        latencyMs: 250,
      });

      const stats = analyticsService.getProviderStats("openai", since);

      expect(stats.totalRequests).toBe(1);
      expect(stats.totalTokens).toBe(100);
      expect(stats.avgLatency).toBe(250);
    });
  });

  describe("hourly breakdown", () => {
    it("initializes the requested number of hourly buckets and fills empty hours with zeroes", () => {
      const baseDate = new Date("2026-06-05T12:00:00Z");
      vi.spyOn(Date, "now").mockReturnValue(baseDate.getTime());

      const breakdown = analyticsService.getHourlyBreakdown(4);

      const startTime = baseDate.getTime() - 4 * 60 * 60 * 1000;
      const expectedHours = [];
      for (let i = 0; i < 4; i++) {
        const time = new Date(startTime + i * 60 * 60 * 1000);
        expectedHours.push(`${time.getHours().toString().padStart(2, "0")}:00`);
      }

      expect(breakdown).toHaveLength(4);
      expect(breakdown.map((b) => b.hour)).toEqual(expectedHours);
      expect(breakdown).toEqual(
        breakdown.map((bucket) => ({
          hour: bucket.hour,
          requests: 0,
          tokens: 0,
          cost: 0,
          errors: 0,
        })),
      );
    });

    it("places usage and error data into the matching hour buckets", async () => {
      const date1 = new Date("2026-06-05T10:15:00Z");
      const dateSpy = vi.spyOn(Date, "now").mockReturnValue(date1.getTime());
      await analyticsService.recordUsage({
        keyId: "key-1",
        providerId: "openai",
        modelId: "gpt-4o",
        inputTokens: 100,
        outputTokens: 50,
        success: true,
        latencyMs: 120,
      });

      const date2 = new Date("2026-06-05T11:45:00Z");
      dateSpy.mockReturnValue(date2.getTime());
      await analyticsService.recordError({
        keyId: "key-1",
        providerId: "openai",
        errorType: "server",
        message: "500 Server Error",
        retryCount: 0,
      });

      const baseDate = new Date("2026-06-05T12:00:00Z");
      dateSpy.mockReturnValue(baseDate.getTime());
      const breakdown = analyticsService.getHourlyBreakdown(4);

      const hour10Str = `${date1.getHours().toString().padStart(2, "0")}:00`;
      const hour11Str = `${date2.getHours().toString().padStart(2, "0")}:00`;
      const hour9Str = `${new Date(baseDate.getTime() - 3 * 60 * 60 * 1000).getHours().toString().padStart(2, "0")}:00`;

      const ten = breakdown.find((bucket) => bucket.hour === hour10Str);
      const eleven = breakdown.find((bucket) => bucket.hour === hour11Str);
      const nine = breakdown.find((bucket) => bucket.hour === hour9Str);

      expect(ten).toMatchObject({
        requests: 1,
        tokens: 150,
        errors: 0,
      });
      expect(ten?.cost).toBeGreaterThan(0);
      expect(eleven).toMatchObject({
        requests: 0,
        tokens: 0,
        cost: 0,
        errors: 1,
      });
      expect(nine).toMatchObject({
        requests: 0,
        tokens: 0,
        cost: 0,
        errors: 0,
      });
    });
  });

  describe("storage trimming", () => {
    it("keeps only the newest 1000 usage records in memory", async () => {
      vi.spyOn(db.usageLogs, "add").mockResolvedValue({} as any);
      const baseTime = new Date("2026-06-05T00:00:00Z").getTime();
      const dateSpy = vi.spyOn(Date, "now").mockReturnValue(baseTime);

      for (let i = 0; i < 1001; i++) {
        dateSpy.mockReturnValue(baseTime + i);
        await analyticsService.recordUsage({
          keyId: `key-${i}`,
          providerId: "openai",
          modelId: "gpt-4o",
          inputTokens: i,
          outputTokens: 0,
          success: true,
          latencyMs: 10,
        });
      }

      const data = analyticsService.getUsageData();
      expect(data).toHaveLength(1000);
      expect(data[0].keyId).toBe("key-1");
      expect(data.at(-1)?.keyId).toBe("key-1000");
    });

    it("keeps only the newest 500 error records in memory", async () => {
      vi.spyOn(db.errorLogs, "add").mockResolvedValue({} as any);
      const baseTime = new Date("2026-06-05T00:00:00Z").getTime();
      const dateSpy = vi.spyOn(Date, "now").mockReturnValue(baseTime);

      for (let i = 0; i < 501; i++) {
        dateSpy.mockReturnValue(baseTime + i);
        await analyticsService.recordError({
          keyId: `key-${i}`,
          providerId: "openai",
          errorType: "server",
          message: `Server error ${i}`,
          retryCount: 0,
        });
      }

      const logs = analyticsService.getErrorLogs();
      expect(logs).toHaveLength(500);
      expect(logs[0].keyId).toBe("key-1");
      expect(logs.at(-1)?.keyId).toBe("key-500");
    });
  });

  describe("publisher-subscriber notifications", () => {
    it("notifies subscribers on usage, error, and clear operations", async () => {
      const listener = vi.fn();
      const unsubscribe = analyticsService.subscribe(listener);

      await analyticsService.recordUsage({
        keyId: "key-1",
        providerId: "openai",
        modelId: "gpt-4o",
        inputTokens: 10,
        outputTokens: 5,
        success: true,
        latencyMs: 50,
      });
      await analyticsService.recordError({
        keyId: "key-1",
        providerId: "openai",
        errorType: "server",
        message: "500 Server Error",
        retryCount: 1,
      });
      await analyticsService.clearAll();

      expect(listener).toHaveBeenCalledTimes(3);

      unsubscribe();
      await analyticsService.recordUsage({
        keyId: "key-2",
        providerId: "openai",
        modelId: "gpt-4o",
        inputTokens: 1,
        outputTokens: 1,
        success: true,
        latencyMs: 10,
      });

      expect(listener).toHaveBeenCalledTimes(3);
    });
  });
});
