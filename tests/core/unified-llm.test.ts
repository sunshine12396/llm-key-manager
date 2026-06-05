/**
 * Unified LLM Client Tests
 *
 * Updated for Phase 5/6 refactoring:
 * - chat method now uses keyResolver directly instead of resilientHandler
 * - Non-chat methods (embeddings, generateImage) still use resilientHandler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { llmClient } from "../../src/core/unified-llm.client";
import { resilientHandler } from "../../src/services/engines/resilience.engine";
import { keyResolver } from "../../src/services/availability";
import { ChatRequest } from "../../src/models";
import * as ProviderRegistry from "../../src/providers/provider.registry";
import { IProviderAdapter } from "../../src/providers/types";
import { configService } from "../../src/services/config.service";

// Mock Dependencies
vi.mock("../../src/services/engines/resilience.engine", () => ({
  resilientHandler: {
    executeRequest: vi.fn(),
  },
}));

vi.mock("../../src/services/availability", () => ({
  keyResolver: {
    resolve: vi.fn(),
    markSuccess: vi.fn(),
    markFailure: vi.fn(),
  },
  availabilityManager: {
    handleRuntimeError: vi.fn().mockResolvedValue(undefined),
    markModelAvailable: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../src/services/analytics.service", () => ({
  analyticsService: {
    record: vi.fn(),
  },
}));

describe("Unified API Interface", () => {
  let mockAdapter: IProviderAdapter;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock adapter
    mockAdapter = {
      providerId: "openai",
      chat: vi.fn().mockResolvedValue({
        content: "Hello from OpenAI",
        model: "gpt-4",
        usage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
      }),
    } as unknown as IProviderAdapter;

    vi.spyOn(ProviderRegistry, "getProviderAdapter").mockReturnValue(
      mockAdapter,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should use keyResolver for chat requests", async () => {
    // Mock keyResolver to return a key
    vi.mocked(keyResolver.resolve).mockResolvedValue({
      keyId: "key-1",
      apiKey: "sk-test",
      providerId: "openai",
      modelId: "gpt-4",
      keyMetadata: {
        id: "key-1",
        providerId: "openai",
        label: "Test Key",
      } as any,
    });

    const response = await llmClient.chat({
      model: "gpt-4",
      messages: [{ role: "user", content: "Hi" }],
    });

    // Verify response
    expect(response.content).toBe("Hello from OpenAI");

    // Verify keyResolver was called
    expect(keyResolver.resolve).toHaveBeenCalled();

    // Verify success was marked
    expect(keyResolver.markSuccess).toHaveBeenCalledWith(
      "key-1",
      "gpt-4",
      "openai",
    );
  });

  it("should use resilientHandler for embeddings", async () => {
    const mockResponse = {
      embeddings: [[0.1, 0.2, 0.3]],
      model: "text-embedding-ada-002",
    };

    vi.mocked(resilientHandler.executeRequest).mockResolvedValue({
      success: true,
      data: mockResponse,
      keyUsed: "key-1",
      attempts: 1,
      duration: 100,
    });

    // Mock adapter to support embeddings
    mockAdapter.embeddings = vi.fn().mockResolvedValue(mockResponse);

    await llmClient.embeddings({
      input: "Test text",
      model: "text-embedding-ada-002",
    });

    // Verify resilientHandler was used for non-chat methods
    expect(resilientHandler.executeRequest).toHaveBeenCalledWith(
      "openai",
      expect.any(Function),
      expect.anything(),
    );
  });

  it("should throw error when no keys available", async () => {
    // Mock keyResolver to return null (no keys)
    vi.mocked(keyResolver.resolve).mockResolvedValue(null);

    await expect(
      llmClient.chat({
        model: "gpt-4",
        messages: [{ role: "user", content: "Hi" }],
      }),
    ).rejects.toThrow();
  });

  it("should failover to next key on error", async () => {
    // First call fails, second succeeds
    vi.mocked(keyResolver.resolve)
      .mockResolvedValueOnce({
        keyId: "key-1",
        apiKey: "sk-test-1",
        providerId: "openai",
        modelId: "gpt-4",
        keyMetadata: {
          id: "key-1",
          providerId: "openai",
          label: "Key 1",
        } as any,
      })
      .mockResolvedValueOnce({
        keyId: "key-2",
        apiKey: "sk-test-2",
        providerId: "openai",
        modelId: "gpt-4",
        keyMetadata: {
          id: "key-2",
          providerId: "openai",
          label: "Key 2",
        } as any,
      })
      .mockResolvedValue(null); // No more keys

    // Adapter fails first, then succeeds
    mockAdapter.chat = vi
      .fn()
      .mockRejectedValueOnce(new Error("429 Rate Limited"))
      .mockResolvedValue({
        content: "Success on second key",
        model: "gpt-4",
        usage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
      });

    const response = await llmClient.chat({
      model: "gpt-4",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(response.content).toBe("Success on second key");

    // Verify second key marked success
    expect(keyResolver.markSuccess).toHaveBeenCalledWith(
      "key-2",
      "gpt-4",
      "openai",
    );
  });

  it("should standardize response format across providers", async () => {
    vi.mocked(keyResolver.resolve).mockResolvedValue({
      keyId: "key-1",
      apiKey: "sk-test",
      providerId: "openai",
      modelId: "gpt-4",
      keyMetadata: {
        id: "key-1",
        providerId: "openai",
        label: "Test Key",
      } as any,
    });

    const request: ChatRequest = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Test" }],
    };

    const result = await llmClient.chat(request);

    // Consumer doesn't need to know about provider-specific response format
    expect(result).toHaveProperty("content");
    expect(result).toHaveProperty("model");
  });

  describe("Smart Routing & Failover", () => {
    it("should respect sticky routing for subsequent requests", async () => {
      // 1. Setup a chain: model-a -> model-b
      vi.spyOn(configService, "getFallbackChain").mockReturnValue([
        "model-a",
        "model-b",
      ]);

      // 2. Mock keyResolver to fail model-a, succeed model-b
      // We use a counter to track calls across the test
      let callCount = 0;
      vi.mocked(keyResolver.resolve).mockImplementation(
        async (modelId, _options) => {
          callCount++;

          // First Request Logic (Calls 1 & 2)
          if (callCount === 1) {
            // Step 1: Try model-a -> Fail (return null)
            if (modelId === "model-a") return null;
          }
          if (callCount === 2) {
            // Step 2: Try model-b -> Success
            if (modelId === "model-b") {
              return {
                keyId: "key-b",
                apiKey: "sk-b",
                providerId: "openai",
                modelId: "model-b",
                keyMetadata: { id: "key-b" } as any,
              };
            }
          }
          return null;
        },
      );

      // 3. First Request
      await llmClient.chat({
        model: "my-complex-task",
        messages: [{ role: "user", content: "Hi" }],
      });

      // 4. Reset mocks for second request to verify prioritization
      vi.mocked(keyResolver.resolve).mockClear();
      vi.mocked(keyResolver.resolve).mockImplementation(async (modelId) => {
        // Should be called with model-b first
        if (modelId === "model-b") {
          return {
            keyId: "key-b",
            apiKey: "sk-b",
            providerId: "openai",
            modelId: "model-b",
            keyMetadata: { id: "key-b" } as any,
          };
        }
        return null;
      });

      // 5. Second Request (should prioritize model-b due to stickiness)
      await llmClient.chat({
        model: "my-complex-task",
        messages: [{ role: "user", content: "Hi again" }],
      });

      // 6. Verify second request tried model-b FIRST
      // The sticky model is prepended to the chain, so it should be the first call
      expect(keyResolver.resolve).toHaveBeenNthCalledWith(
        1,
        "model-b", // This verifies stickiness
        expect.anything(),
      );
    });

    it("should exclude failed keys in retry loop", async () => {
      // Setup: One model, multiple keys
      // key-1 fails, key-2 succeeds
      vi.spyOn(configService, "getFallbackChain").mockReturnValue(undefined); // Use default

      // Mock Adapter to fail first time
      const mockAdapter = {
        providerId: "openai",
        chat: vi
          .fn()
          .mockRejectedValueOnce(new Error("429 Rate Limit"))
          .mockResolvedValue({
            content: "Success",
            model: "gpt-4",
            usage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
          }),
      } as unknown as IProviderAdapter;
      vi.spyOn(ProviderRegistry, "getProviderAdapter").mockReturnValue(
        mockAdapter,
      );

      let attempt = 0;
      vi.mocked(keyResolver.resolve).mockImplementation(
        async (_modelId, options) => {
          attempt++;
          if (attempt === 1) {
            // First attempt: return key-1
            return {
              keyId: "key-1",
              apiKey: "sk-1",
              providerId: "openai",
              modelId: "gpt-4",
              keyMetadata: { id: "key-1" } as any,
            };
          }
          if (attempt === 2) {
            // Second attempt: verify exclusions
            // We verify that key-1 is in the excluded list
            const isExcluded = options?.excludeKeyIds instanceof Set
                ? options.excludeKeyIds.has("key-1")
                : (options?.excludeKeyIds as string[] | undefined)?.includes("key-1");
            if (!isExcluded) {
              throw new Error("Failed key was not excluded");
            }

            return {
              keyId: "key-2",
              apiKey: "sk-2",
              providerId: "openai",
              modelId: "gpt-4",
              keyMetadata: { id: "key-2" } as any,
            };
          }
          return null;
        },
      );

      await llmClient.chat({
        model: "gpt-4",
        messages: [{ role: "user", content: "Retry test" }],
      });

      expect(attempt).toBe(2);
    });
  });
});
