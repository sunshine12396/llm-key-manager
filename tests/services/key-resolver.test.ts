import { describe, it, expect, beforeEach, vi } from "vitest";
import { KeyResolver } from "../../src/services/availability/key-resolver";
import { availabilityCache } from "../../src/services/availability/availability.cache";
import { safetyGuard } from "../../src/services/safety";
import { vaultService } from "../../src/services/vault/vault.service";
import { resolveProviderId } from "../../src/providers";
import type { CachedModelState } from "../../src/services/availability/availability.cache";

vi.mock("../../src/services/availability/availability.cache", () => ({
  availabilityCache: {
    getUsableModels: vi.fn(),
    getUsableKeysForModel: vi.fn(),
    syncFromDB: vi.fn(),
    markUsable: vi.fn(),
    markUnusable: vi.fn(),
    removeKey: vi.fn(),
    initializeKey: vi.fn(),
    getStats: vi.fn(),
  },
}));

vi.mock("../../src/services/safety", () => ({
  safetyGuard: {
    isProviderDisabled: vi.fn(),
    isProviderCircuitOpen: vi.fn(),
    getForcedFallback: vi.fn(),
    isKeyDisabled: vi.fn(),
    isKeyCircuitOpen: vi.fn(),
  },
}));

vi.mock("../../src/services/vault/vault.service", () => ({
  vaultService: {
    getKey: vi.fn(),
    getKeyMetadata: vi.fn(),
  },
}));

vi.mock("../../src/providers", () => ({
  resolveProviderId: vi.fn(),
}));

function cachedModel(
  overrides: Partial<CachedModelState> & { keyId: string; modelId: string },
): CachedModelState {
  return {
    keyId: overrides.keyId,
    modelId: overrides.modelId,
    providerId: overrides.providerId ?? "openai",
    isUsable: overrides.isUsable ?? true,
    priority: overrides.priority ?? 3,
    state: overrides.state ?? "AVAILABLE",
    lastUpdated: overrides.lastUpdated ?? Date.now(),
    effectiveScore: overrides.effectiveScore ?? 50,
    averageLatency: overrides.averageLatency ?? 0,
    keyPriority: overrides.keyPriority ?? "medium",
    recentFailures: overrides.recentFailures ?? 0,
  };
}

describe("KeyResolver", () => {
  let resolver: KeyResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = new KeyResolver();

    vi.mocked(resolveProviderId).mockReturnValue("openai");
    vi.mocked(safetyGuard.isProviderDisabled).mockReturnValue(false);
    vi.mocked(safetyGuard.isProviderCircuitOpen).mockReturnValue(false);
    vi.mocked(safetyGuard.getForcedFallback).mockReturnValue(null);
    vi.mocked(safetyGuard.isKeyDisabled).mockReturnValue(false);
    vi.mocked(safetyGuard.isKeyCircuitOpen).mockReturnValue(false);
    vi.mocked(vaultService.getKey).mockImplementation(async (keyId) => `secret:${keyId}`);
    vi.mocked(vaultService.getKeyMetadata).mockImplementation(async (keyId) => ({
      id: keyId,
      providerId: "openai",
      label: `Key ${keyId}`,
      isRevoked: false,
      isEnabled: true,
      priority: "medium",
      usageCount: 0,
      createdAt: 0,
    } as any));
  });

  it("should return null in strict mode when no key supports the requested model", async () => {
    vi.mocked(availabilityCache.getUsableModels).mockReturnValue([
      cachedModel({ keyId: "k1", modelId: "gpt-3.5-turbo", effectiveScore: 100 }),
    ]);

    await expect(resolver.resolve("gpt-4o")).resolves.toBeNull();

    expect(vaultService.getKey).not.toHaveBeenCalled();
    expect(availabilityCache.syncFromDB).not.toHaveBeenCalled();
  });

  it("should return null when provider safety guards block routing", async () => {
    vi.mocked(safetyGuard.isProviderDisabled).mockReturnValue(true);

    await expect(resolver.resolve("gpt-4o")).resolves.toBeNull();

    expect(availabilityCache.getUsableModels).not.toHaveBeenCalled();

    vi.mocked(safetyGuard.isProviderDisabled).mockReturnValue(false);
    vi.mocked(safetyGuard.isProviderCircuitOpen).mockReturnValue(true);

    await expect(resolver.resolve("gpt-4o")).resolves.toBeNull();

    expect(availabilityCache.getUsableModels).not.toHaveBeenCalled();
  });

  it("should filter out unsafe keys when key safety guards are open", async () => {
    vi.mocked(availabilityCache.getUsableModels).mockReturnValue([
      cachedModel({ keyId: "blocked-key", modelId: "gpt-4o", effectiveScore: 100 }),
    ]);
    vi.mocked(safetyGuard.isKeyCircuitOpen).mockReturnValue(true);

    await expect(resolver.resolve("gpt-4o")).resolves.toBeNull();

    expect(vaultService.getKey).not.toHaveBeenCalled();
  });

  it("should prefer preferredKeyId when it matches the requested model", async () => {
    vi.mocked(availabilityCache.getUsableModels).mockReturnValue([
      cachedModel({ keyId: "high-score", modelId: "gpt-4o", effectiveScore: 120 }),
      cachedModel({ keyId: "sticky-key", modelId: "gpt-4o", effectiveScore: 60 }),
    ]);

    const resolved = await resolver.resolve("gpt-4o", {
      preferredKeyId: "sticky-key",
    });

    expect(resolved).toEqual(expect.objectContaining({
      keyId: "sticky-key",
      modelId: "gpt-4o",
      apiKey: "secret:sticky-key",
    }));
  });

  it("should match requested models by substring", async () => {
    vi.mocked(availabilityCache.getUsableModels).mockReturnValue([
      cachedModel({ keyId: "snapshot-key", modelId: "gpt-4-0613", effectiveScore: 80 }),
    ]);

    const resolved = await resolver.resolve("gpt-4");

    expect(resolved).toEqual(expect.objectContaining({
      keyId: "snapshot-key",
      modelId: "gpt-4-0613",
    }));
  });
});
