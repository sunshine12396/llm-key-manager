import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db";
import { QuotaManager } from "../../src/services/policies/quota.policy";

describe("QuotaManager", () => {
  let manager: QuotaManager;

  beforeEach(async () => {
    await db.quotas.clear();
    manager = new QuotaManager();
    await manager.ensureInitialized();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await db.quotas.clear();
  });

  it("calculates model-specific costs using per-1M token pricing", () => {
    manager.recordUsage("key-1", "openai", 1_000_000, 1_000_000, "gpt-4o");

    expect(manager.getQuotaInfo("key-1").used).toBe(2_000_000);
    expect(manager.getEstimatedCost("key-1")).toBe(20);
  });

  it("falls back to provider default costs using per-1K token pricing for unknown models", () => {
    manager.recordUsage("key-1", "openai", 1_000, 1_000, "unknown-model");

    expect(manager.getQuotaInfo("key-1").used).toBe(2_000);
    expect(manager.getEstimatedCost("key-1")).toBeCloseTo(0.0035, 6);
  });

  it("evaluates warning, critical, and hard quota thresholds from used / limit", () => {
    manager.setLimit("key-1", 100);

    manager.recordUsage("key-1", "openai", 79, 0);
    expect(manager.isAtWarning("key-1")).toBe(false);
    expect(manager.isCritical("key-1")).toBe(false);
    expect(manager.hasAvailableQuota("key-1")).toBe(true);

    manager.recordUsage("key-1", "openai", 1, 0);
    expect(manager.getUsagePercentage("key-1")).toBe(0.8);
    expect(manager.isAtWarning("key-1")).toBe(true);
    expect(manager.isCritical("key-1")).toBe(false);
    expect(manager.hasAvailableQuota("key-1")).toBe(true);

    manager.recordUsage("key-1", "openai", 15, 0);
    expect(manager.getUsagePercentage("key-1")).toBe(0.95);
    expect(manager.isCritical("key-1")).toBe(true);
    expect(manager.hasAvailableQuota("key-1")).toBe(true);

    manager.recordUsage("key-1", "openai", 5, 0);
    expect(manager.getUsagePercentage("key-1")).toBe(1);
    expect(manager.hasAvailableQuota("key-1")).toBe(false);
  });

  it("resets expired quota windows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T00:00:00Z"));

    manager.setLimit("key-1", 1000, Date.now() + 1000);
    manager.recordUsage("key-1", "openai", 500, 500, "gpt-4o");

    expect(manager.getQuotaInfo("key-1").used).toBe(1000);
    expect(manager.getEstimatedCost("key-1")).toBeGreaterThan(0);

    vi.setSystemTime(Date.now() + 1001);
    manager.checkAndResetExpired();

    const quota = manager.getQuotaInfo("key-1");
    expect(quota.used).toBe(0);
    expect(quota.estimatedCost).toBe(0);
    expect(quota.resetTime).toBeNull();
  });
});
