/**
 * Resilience Engine Failover Tests
 *
 * Updated for Phase 6 refactoring:
 * - resilientHandler now uses keyResolver instead of keyRouter
 * - Tests mock keyResolver.resolve() for key selection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resilientHandler } from "../../services/engines/resilience.engine";
import { vaultService } from "../../services/vault/vault.service";
import { keyResolver } from "../../services/availability";
import { safetyGuard } from "../../services/safety";
import { quotaManager } from "../../services/policies/quota.policy";
import { KeyMetadata } from "../../models/metadata";
import { retryService } from "../../services/policies/retry.policy";

// Mock dependencies
vi.mock("../../services/vault/vault.service");
vi.mock("../../services/availability", () => ({
  keyResolver: {
    resolve: vi.fn(),
    markSuccess: vi.fn(),
    markFailure: vi.fn(),
  },
  availabilityManager: {
    handleRuntimeError: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("../../services/safety", () => ({
  safetyGuard: {
    isProviderDisabled: vi.fn(),
    isProviderCircuitOpen: vi.fn(),
    isKeyDisabled: vi.fn(),
    isKeyCircuitOpen: vi.fn(),
    getKeyCircuitState: vi.fn(),
    recordKeySuccess: vi.fn(),
    recordKeyFailure: vi.fn(),
    recordProviderFailure: vi.fn(),
  },
}));
vi.mock("../../services/policies/quota.policy");
vi.mock("../../services/policies/retry.policy");

describe("Resilience Engine - Failover & Routing", () => {
  const mockKeys: KeyMetadata[] = [
    {
      id: "k1",
      providerId: "openai",
      label: "Key 1 (High Priority)",
      priority: "high",
      createdAt: Date.now(),
      usageCount: 0,
      isRevoked: false,
      isEnabled: true,
    },
    {
      id: "k2",
      providerId: "openai",
      label: "Key 2 (Backup)",
      priority: "low",
      createdAt: Date.now(),
      usageCount: 0,
      isRevoked: false,
      isEnabled: true,
    },
  ];

  // Helper to create resolved key response
  const createResolvedKey = (key: KeyMetadata) => ({
    keyId: key.id,
    apiKey: `sk-${key.id}`,
    providerId: key.providerId,
    modelId: "gpt-4",
    keyMetadata: key,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Retry Service to simple pass-through with correct return shape
    vi.mocked(retryService.execute).mockImplementation(async (fn) => {
      try {
        const data = await fn();
        return { success: true, data, attempts: 1, totalDelay: 0 };
      } catch (error) {
        return {
          success: false,
          error: error as Error,
          attempts: 1,
          totalDelay: 0,
        };
      }
    });

    // Default: keyResolver returns k1 first, then k2, then null
    let resolveCallCount = 0;
    vi.mocked(keyResolver.resolve).mockImplementation(
      async (_modelId, options) => {
        const excludeList = options?.excludeKeyIds || [];
        const availableKeys = mockKeys.filter(
          (k) => !excludeList.includes(k.id),
        );
        if (availableKeys.length === 0) return null;
        resolveCallCount++;
        return createResolvedKey(availableKeys[0]);
      },
    );

    // Vault mocks
    vi.mocked(vaultService.updateUsageStats).mockResolvedValue(undefined);
    vi.mocked(vaultService.revokeKey).mockResolvedValue(undefined);
    vi.mocked(vaultService.updateKey).mockResolvedValue(undefined);

    // Safety Guard Defaults: All healthy
    vi.mocked(safetyGuard.isProviderDisabled).mockReturnValue(false);
    vi.mocked(safetyGuard.isProviderCircuitOpen).mockReturnValue(false);
    vi.mocked(safetyGuard.isKeyDisabled).mockReturnValue(false);
    vi.mocked(safetyGuard.isKeyCircuitOpen).mockReturnValue(false);
    vi.mocked(safetyGuard.getKeyCircuitState).mockReturnValue("CLOSED");

    // Quota Defaults: Has quota
    vi.mocked(quotaManager.hasAvailableQuota).mockReturnValue(true);
    vi.mocked(quotaManager.getUsagePercentage).mockReturnValue(0);
    vi.mocked(quotaManager.setLimit).mockReturnValue();
    vi.mocked(quotaManager.recordUsage).mockReturnValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should successfully execute request with first available key", async () => {
    const mockFn = vi.fn().mockResolvedValue({ success: true, data: "result" });

    const result = await resilientHandler.executeRequest("openai", mockFn);

    expect(result.success).toBe(true);
    expect(result.keyUsed).toBe("k1");
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it("should failover to second key on 429 Rate Limit", async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("429 Too Many Requests")) // k1 fails
      .mockResolvedValue({ success: true, data: "recovered" }); // k2 succeeds

    const result = await resilientHandler.executeRequest("openai", mockFn);

    expect(result.success).toBe(true);
    expect(result.keyUsed).toBe("k2"); // Should have switched to k2
    expect(result.attempts).toBeGreaterThan(1);

    // Verification: Check if k1 was recorded as error
    expect(keyResolver.markFailure).toHaveBeenCalledWith("k1", "gpt-4");
    expect(safetyGuard.recordKeyFailure).toHaveBeenCalledWith("k1", "openai");
  });

  it("should failover to second key on 401 Auth Error", async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("401 Unauthorized")) // k1 fails
      .mockResolvedValue({ success: true, data: "recovered" });

    const result = await resilientHandler.executeRequest("openai", mockFn);

    expect(result.success).toBe(true);
    expect(result.keyUsed).toBe("k2");

    // Auth errors should revoke the key
    expect(vaultService.revokeKey).toHaveBeenCalledWith("k1");
  });

  it("should return error for disabled provider", async () => {
    vi.mocked(safetyGuard.isProviderDisabled).mockReturnValue(true);

    const mockFn = vi.fn().mockResolvedValue({ success: true });

    const result = await resilientHandler.executeRequest("openai", mockFn);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("disabled");
    expect(mockFn).not.toHaveBeenCalled();
  });

  it("should return error for open provider circuit breaker", async () => {
    vi.mocked(safetyGuard.isProviderCircuitOpen).mockReturnValue(true);

    const mockFn = vi.fn().mockResolvedValue({ success: true });

    const result = await resilientHandler.executeRequest("openai", mockFn);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("circuit breaker");
    expect(mockFn).not.toHaveBeenCalled();
  });

  it("should return error if no keys available", async () => {
    vi.mocked(keyResolver.resolve).mockResolvedValue(null);

    const mockFn = vi.fn().mockResolvedValue({ success: true });

    const result = await resilientHandler.executeRequest("openai", mockFn);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("No available keys");
  });

  it("should return error if all keys fail", async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error("500 Server Error"));

    const result = await resilientHandler.executeRequest("openai", mockFn);

    expect(result.success).toBe(false);
    // Last error is returned
    expect(result.error?.message).toBe("500 Server Error");
  });

  it("should mark success in keyResolver on successful request", async () => {
    const mockFn = vi.fn().mockResolvedValue({ success: true, data: "result" });

    await resilientHandler.executeRequest("openai", mockFn);

    expect(keyResolver.markSuccess).toHaveBeenCalledWith(
      "k1",
      "gpt-4",
      "openai",
    );
  });
});
