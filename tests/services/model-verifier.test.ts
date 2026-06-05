import { describe, it, expect, beforeEach, vi } from "vitest";
import { ModelVerifier } from "../../src/services/validation/model-verifier";
import { getProviderAdapter } from "../../src/providers/provider.registry";

vi.mock("../../src/providers/provider.registry", () => ({
  getProviderAdapter: vi.fn(),
}));

vi.mock("../../src/services/availability/availability.cache", () => ({
  availabilityCache: {
    markUsable: vi.fn(),
    markUnusable: vi.fn(),
  },
}));

vi.mock("../../src/services/model-capabilities", () => ({
  getModelCapabilities: vi.fn().mockReturnValue(["text-chat"]),
}));

describe("ModelVerifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should verify models with minimal chat request parameters", async () => {
    const chat = vi.fn().mockResolvedValue({
      id: "resp-1",
      model: "gpt-4o",
      content: "ok",
    });

    vi.mocked(getProviderAdapter).mockReturnValue({
      providerId: "openai",
      chat,
    } as any);

    const verifier = new ModelVerifier();

    const result = await verifier.verifyModel(
      "key-1",
      "sk-test",
      "gpt-4o",
      "openai",
      "OpenAI Key",
    );

    expect(chat).toHaveBeenCalledWith("sk-test", {
      messages: [{ role: "user", content: "Hello" }],
      model: "gpt-4o",
      maxTokens: 5,
      temperature: 0,
    });
    expect(result).toEqual(expect.objectContaining({
      keyId: "key-1",
      modelId: "gpt-4o",
      providerId: "openai",
      state: "AVAILABLE",
      isAvailable: true,
    }));
  });

  it("should limit verifyBatch concurrency to the provided value", async () => {
    const verifier = new ModelVerifier();
    const resolvers: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    let started = 0;

    vi.spyOn(verifier, "verifyModel").mockImplementation(
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
        };
      },
    );

    const batchPromise = verifier.verifyBatch(
      "key-1",
      "sk-test",
      ["m1", "m2", "m3", "m4", "m5"],
      "openai",
      "OpenAI Key",
      2,
    );

    await vi.waitFor(() => expect(started).toBe(2));
    expect(maxActive).toBe(2);

    resolvers.shift()?.();

    await vi.waitFor(() => expect(started).toBe(3));
    expect(maxActive).toBe(2);

    while (started < 5 || resolvers.length > 0) {
      resolvers.shift()?.();
      if (started < 5) {
        await vi.waitFor(() => expect(resolvers.length).toBeGreaterThan(0));
      }
    }

    const results = await batchPromise;
    expect(results).toHaveLength(5);
    expect(maxActive).toBe(2);
  });
});
