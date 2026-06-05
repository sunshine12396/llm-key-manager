import { describe, it, expect, beforeEach, vi } from "vitest";
import { RetryScheduler } from "../../src/services/validation/retry-scheduler";
import { availabilityManager } from "../../src/services/availability";
import { vaultService } from "../../src/services/vault/vault.service";
import { modelVerifier } from "../../src/services/validation/model-verifier";
import { getProviderAdapter } from "../../src/providers/provider.registry";
import { db } from "../../src/db";

vi.mock("../../src/services/availability", () => ({
  availabilityManager: {
    getModelsDueForRetry: vi.fn(),
    saveModelMetadata: vi.fn(),
  },
  calculateRetry: vi.fn().mockReturnValue({
    shouldRetry: true,
    nextRetryAt: Date.now() + 60_000,
    nextState: "COOLDOWN",
  }),
}));

vi.mock("../../src/services/vault/vault.service", () => ({
  vaultService: {
    listKeys: vi.fn(),
    getKey: vi.fn(),
  },
}));

vi.mock("../../src/services/validation/model-verifier", () => ({
  modelVerifier: {
    verifyModel: vi.fn(),
  },
}));

vi.mock("../../src/providers/provider.registry", () => ({
  getProviderAdapter: vi.fn(),
}));

vi.mock("../../src/db", () => ({
  db: {
    modelCache: {
      delete: vi.fn(),
    },
  },
}));

describe("RetryScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delete orphaned model cache entries that do not belong to the key provider", async () => {
    vi.mocked(availabilityManager.getModelsDueForRetry).mockResolvedValue([
      {
        keyId: "key-1",
        modelId: "claude-3-5-sonnet",
        providerId: "anthropic",
        isAvailable: false,
        state: "COOLDOWN",
        lastCheckedAt: Date.now(),
        modelPriority: 3,
        retryCount: 0,
        nextRetryAt: Date.now() - 1,
      },
    ] as any);
    vi.mocked(vaultService.listKeys).mockResolvedValue([
      {
        id: "key-1",
        providerId: "openai",
        label: "OpenAI Key",
        isRevoked: false,
      },
    ] as any);
    vi.mocked(vaultService.getKey).mockResolvedValue("sk-test");
    vi.mocked(getProviderAdapter).mockReturnValue({
      providerId: "openai",
      ownsModel: vi.fn().mockReturnValue(false),
    } as any);

    const stats = await new RetryScheduler().failoverRetry();

    expect(db.modelCache.delete).toHaveBeenCalledWith([
      "claude-3-5-sonnet",
      "key-1",
    ]);
    expect(modelVerifier.verifyModel).not.toHaveBeenCalled();
    expect(stats).toEqual({ retried: 0, recovered: 0 });
  });

  it("should skip due models for revoked keys", async () => {
    vi.mocked(availabilityManager.getModelsDueForRetry).mockResolvedValue([
      {
        keyId: "key-1",
        modelId: "gpt-4o",
        providerId: "openai",
        isAvailable: false,
        state: "COOLDOWN",
        lastCheckedAt: Date.now(),
        modelPriority: 3,
        retryCount: 0,
        nextRetryAt: Date.now() - 1,
      },
    ] as any);
    vi.mocked(vaultService.listKeys).mockResolvedValue([
      {
        id: "key-1",
        providerId: "openai",
        label: "Revoked Key",
        isRevoked: true,
      },
    ] as any);

    const stats = await new RetryScheduler().failoverRetry();

    expect(vaultService.getKey).not.toHaveBeenCalled();
    expect(getProviderAdapter).not.toHaveBeenCalled();
    expect(modelVerifier.verifyModel).not.toHaveBeenCalled();
    expect(stats).toEqual({ retried: 0, recovered: 0 });
  });

  it("should verify due models sequentially for a key", async () => {
    vi.mocked(availabilityManager.getModelsDueForRetry).mockResolvedValue([
      {
        keyId: "key-1",
        modelId: "gpt-4o",
        providerId: "openai",
        isAvailable: false,
        state: "COOLDOWN",
        lastCheckedAt: Date.now(),
        modelPriority: 3,
        retryCount: 0,
        nextRetryAt: Date.now() - 1,
      },
      {
        keyId: "key-1",
        modelId: "gpt-4o-mini",
        providerId: "openai",
        isAvailable: false,
        state: "COOLDOWN",
        lastCheckedAt: Date.now(),
        modelPriority: 3,
        retryCount: 0,
        nextRetryAt: Date.now() - 1,
      },
    ] as any);
    vi.mocked(vaultService.listKeys).mockResolvedValue([
      {
        id: "key-1",
        providerId: "openai",
        label: "OpenAI Key",
        isRevoked: false,
      },
    ] as any);
    vi.mocked(vaultService.getKey).mockResolvedValue("sk-test");
    vi.mocked(getProviderAdapter).mockReturnValue({
      providerId: "openai",
      ownsModel: vi.fn().mockReturnValue(true),
    } as any);

    const resolvers: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    let started = 0;

    vi.mocked(modelVerifier.verifyModel).mockImplementation(
      async (_keyId, _apiKey, modelId, providerId) => {
        started++;
        active++;
        maxActive = Math.max(maxActive, active);

        await new Promise<void>((resolve) => {
          resolvers.push(() => {
            active--;
            resolve();
          });
        });

        return {
          keyId: "key-1",
          modelId,
          providerId,
          state: "AVAILABLE",
          isAvailable: true,
          lastCheckedAt: Date.now(),
          modelPriority: 3,
          retryCount: 0,
          nextRetryAt: null,
        } as any;
      },
    );

    const retryPromise = new RetryScheduler().failoverRetry();

    await vi.waitFor(() => expect(started).toBe(1));
    expect(maxActive).toBe(1);

    resolvers.shift()?.();

    await vi.waitFor(() => expect(started).toBe(2));
    expect(maxActive).toBe(1);

    resolvers.shift()?.();
    const stats = await retryPromise;

    expect(stats).toEqual({ retried: 2, recovered: 2 });
    expect(maxActive).toBe(1);
    expect(availabilityManager.saveModelMetadata).toHaveBeenCalledTimes(2);
  });
});
