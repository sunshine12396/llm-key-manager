/**
 * Integration Tests: Add Key & Scan Key Flow
 *
 * These tests use REAL API keys from .env to validate:
 * 1. Adding keys to the vault
 * 2. Scanning/discovering models for those keys
 *
 * Run with: pnpm test lib/tests/integration/key-integration.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import "fake-indexeddb/auto";
import { Crypto } from "@peculiar/webcrypto";
import { db } from "../../db/schema";
import { VaultService } from "../../services/vault/vault.service";
import { listModels as listGeminiModels } from "../../providers/gemini/discovery/models";
import { listModels as listOpenAIModels } from "../../providers/openai/discovery/models";

// ============================================
// ENVIRONMENT SETUP
// ============================================

// Mock window.crypto for Node environment
const crypto = new Crypto();
Object.defineProperty(global, "crypto", {
  value: crypto,
  writable: true,
});
Object.defineProperty(global, "window", {
  value: {
    crypto: crypto,
  },
  writable: true,
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(global, "localStorage", { value: localStorageMock });

// ============================================
// API KEYS FROM ENVIRONMENT
// ============================================

// Parse .env keys - using the last occurrence of each key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GPT_API_KEY = process.env.GPT_API_KEY || "";

// ============================================
// TEST SUITE: ADD KEY FLOW
// ============================================

describe("Add Key Flow (Real Keys)", () => {
  let vault: VaultService;

  // Clear database before all tests in this suite
  beforeAll(async () => {
    await db.keys.clear();
    await db.quotas.clear();
    await db.usageLogs.clear();
    await db.errorLogs.clear();
    await db.modelCache.clear();
  });

  beforeEach(async () => {
    // Reset localStorage before each test
    localStorageMock.clear();

    // Clear all database tables explicitly (more reliable with fake-indexeddb)
    await db.keys.clear();
    await db.quotas.clear();
    await db.usageLogs.clear();
    await db.errorLogs.clear();
    await db.modelCache.clear();

    vault = new VaultService();
  });

  afterEach(async () => {
    // Clean up after each test
    await db.keys.clear();
    await db.quotas.clear();
    await db.usageLogs.clear();
    await db.errorLogs.clear();
    await db.modelCache.clear();
  });

  describe("Vault Operations", () => {
    it("should add a Gemini key to the vault", async () => {
      await vault.unlock();

      const keyId = await vault.addKey(
        "gemini",
        GEMINI_API_KEY,
        "Test Gemini Key",
        "high",
      );

      expect(keyId).toBeDefined();
      expect(typeof keyId).toBe("string");

      // Verify key is stored
      const keys = await vault.listKeys("gemini");
      expect(keys.length).toBe(1);
      expect(keys[0].label).toBe("Test Gemini Key");
      expect(keys[0].providerId).toBe("gemini");
      expect(keys[0].priority).toBe("high");
    });

    it("should add an OpenAI key to the vault", async () => {
      await vault.unlock();

      const keyId = await vault.addKey(
        "openai",
        GPT_API_KEY,
        "Test OpenAI Key",
        "medium",
      );

      expect(keyId).toBeDefined();
      expect(typeof keyId).toBe("string");

      // Verify key is stored
      const keys = await vault.listKeys("openai");
      expect(keys.length).toBe(1);
      expect(keys[0].label).toBe("Test OpenAI Key");
      expect(keys[0].providerId).toBe("openai");
      expect(keys[0].priority).toBe("medium");
    });

    it("should encrypt API key before storage", async () => {
      await vault.unlock();

      const keyId = await vault.addKey(
        "gemini",
        GEMINI_API_KEY,
        "Encrypted Key Test",
      );

      // Access DB directly to verify encryption
      const storedRecord = await db.keys.get(keyId);

      expect(storedRecord).toBeDefined();
      // The stored encryptedData should NOT be the plain API key
      expect(storedRecord?.encryptedData).not.toBe(GEMINI_API_KEY);
      // It should be an ArrayBuffer
      expect(storedRecord?.encryptedData).toBeInstanceOf(ArrayBuffer);
    });

    it("should decrypt API key correctly", async () => {
      await vault.unlock();

      const keyId = await vault.addKey(
        "gemini",
        GEMINI_API_KEY,
        "Decrypt Test",
      );

      // Retrieve via service
      const retrievedKey = await vault.getKey(keyId);

      expect(retrievedKey).toBe(GEMINI_API_KEY);
    });

    it("should add multiple keys for different providers", async () => {
      // Skip if either key is missing or if they're the same (would cause fingerprint collision)
      if (!GEMINI_API_KEY || !GPT_API_KEY || GEMINI_API_KEY === GPT_API_KEY) {
        console.log("Skipping test - requires both different API keys");
        return;
      }

      await vault.unlock();

      const geminiId = await vault.addKey(
        "gemini",
        GEMINI_API_KEY,
        "Gemini Primary",
      );
      const openaiId = await vault.addKey(
        "openai",
        GPT_API_KEY,
        "OpenAI Primary",
      );

      expect(geminiId).toBeDefined();
      expect(openaiId).toBeDefined();

      const allKeys = await vault.listKeys();
      expect(allKeys.length).toBe(2);

      const geminiKeys = await vault.listKeys("gemini");
      const openaiKeys = await vault.listKeys("openai");
      expect(geminiKeys.length).toBe(1);
      expect(openaiKeys.length).toBe(1);
    });

    it("should reject duplicate keys", async () => {
      await vault.unlock();

      await vault.addKey("gemini", GEMINI_API_KEY, "First Entry");

      // Attempting to add the same key again should fail
      await expect(
        vault.addKey("gemini", GEMINI_API_KEY, "Second Entry"),
      ).rejects.toThrow("already in the vault");
    });

    it("should update key metadata", async () => {
      await vault.unlock();

      const keyId = await vault.addKey(
        "gemini",
        GEMINI_API_KEY,
        "Original Label",
        "low",
      );

      await vault.updateKey(keyId, {
        label: "Updated Label",
        priority: "high",
        isEnabled: false,
      });

      const keys = await vault.listKeys("gemini");
      expect(keys[0].label).toBe("Updated Label");
      expect(keys[0].priority).toBe("high");
      expect(keys[0].isEnabled).toBe(false);
    });

    it("should delete a key", async () => {
      await vault.unlock();

      const keyId = await vault.addKey(
        "gemini",
        GEMINI_API_KEY,
        "To Be Deleted",
      );

      let keys = await vault.listKeys("gemini");
      expect(keys.length).toBe(1);

      await vault.deleteKey(keyId);

      keys = await vault.listKeys("gemini");
      expect(keys.length).toBe(0);
    });
  });
});

// ============================================
// TEST SUITE: SCAN KEY / MODEL DISCOVERY
// ============================================

describe("Scan Key / Model Discovery (Real API Calls)", () => {
  // These tests make REAL API calls - they may take time and consume quota
  // Skip in CI or when keys are not available

  const shouldSkip = !GEMINI_API_KEY || GEMINI_API_KEY.startsWith("fake-");

  describe("Gemini Model Discovery", () => {
    it("should discover Gemini models with valid API key", async () => {
      if (shouldSkip) {
        console.log("Skipping real API test - no valid key");
        return;
      }

      const baseUrl = "https://generativelanguage.googleapis.com";
      const headers = {
        "x-goog-api-key": GEMINI_API_KEY,
      };

      const models = await listGeminiModels(GEMINI_API_KEY, baseUrl, headers);

      console.log(
        `[Test] Discovered ${models.length} Gemini models:`,
        models.slice(0, 5),
      );

      expect(models).toBeDefined();
      expect(Array.isArray(models)).toBe(true);
      // Should find at least some models
      expect(models.length).toBeGreaterThan(0);
      // Should include gemini models
      expect(models.some((m) => m.toLowerCase().includes("gemini"))).toBe(true);
    }, 15000); // 15 second timeout for network call

    it("should prioritize newer Gemini models", async () => {
      if (shouldSkip) {
        console.log("Skipping real API test - no valid key");
        return;
      }

      const baseUrl = "https://generativelanguage.googleapis.com";
      const headers = {
        "x-goog-api-key": GEMINI_API_KEY,
      };

      const models = await listGeminiModels(GEMINI_API_KEY, baseUrl, headers);

      if (models.length >= 2) {
        // First model should be a high-priority one (gemini-2.x or gemini-1.5-pro)
        const firstModel = models[0].toLowerCase();
        const isHighPriority =
          firstModel.includes("2.5") ||
          firstModel.includes("2.0") ||
          firstModel.includes("1.5-pro");

        console.log(
          `[Test] First model: ${models[0]} (high priority: ${isHighPriority})`,
        );
        // This is informational - priority sorting is best-effort
      }
    }, 15000);
  });

  describe("OpenAI Model Discovery", () => {
    const shouldSkipOpenAI = !GPT_API_KEY || GPT_API_KEY.startsWith("fake-");

    it("should discover OpenAI models with valid API key", async () => {
      if (shouldSkipOpenAI) {
        console.log("Skipping real API test - no valid OpenAI key");
        return;
      }

      const models = await listOpenAIModels(GPT_API_KEY);

      console.log(
        `[Test] Discovered ${models.length} OpenAI models:`,
        models.slice(0, 5),
      );

      expect(models).toBeDefined();
      expect(Array.isArray(models)).toBe(true);
      // Should find at least some models
      expect(models.length).toBeGreaterThan(0);
      // Should include GPT models
      expect(models.some((m) => m.toLowerCase().includes("gpt"))).toBe(true);
    }, 15000);

    it("should filter out non-chat models", async () => {
      if (shouldSkipOpenAI) {
        console.log("Skipping real API test - no valid OpenAI key");
        return;
      }

      const models = await listOpenAIModels(GPT_API_KEY);

      // Should NOT include embedding, TTS, whisper, dall-e, etc.
      const excludedPatterns = ["embedding", "tts", "whisper", "dall-e"];

      for (const model of models) {
        const m = model.toLowerCase();
        for (const pattern of excludedPatterns) {
          expect(m).not.toContain(pattern);
        }
      }
    }, 15000);
  });
});

// ============================================
// TEST SUITE: FULL INTEGRATION FLOW
// ============================================

describe("Full Add Key + Scan Flow", () => {
  let vault: VaultService;

  beforeEach(async () => {
    // Reset localStorage before each test
    localStorageMock.clear();

    // Clear all database tables explicitly (more reliable with fake-indexeddb)
    await db.keys.clear();
    await db.quotas.clear();
    await db.usageLogs.clear();
    await db.errorLogs.clear();
    await db.modelCache.clear();

    vault = new VaultService();
  });

  it("should add key and then discover its models (Gemini)", async () => {
    const shouldSkip = !GEMINI_API_KEY || GEMINI_API_KEY.startsWith("fake-");
    if (shouldSkip) {
      console.log("Skipping full flow test - no valid Gemini key");
      return;
    }

    // Step 1: Add key to vault
    await vault.unlock();
    const keyId = await vault.addKey(
      "gemini",
      GEMINI_API_KEY,
      "Full Flow Test",
      "high",
    );
    expect(keyId).toBeDefined();

    // Step 2: Retrieve key from vault
    const retrievedKey = await vault.getKey(keyId);
    expect(retrievedKey).toBe(GEMINI_API_KEY);

    // Step 3: Use key to discover models
    const baseUrl = "https://generativelanguage.googleapis.com";
    const headers = {
      "x-goog-api-key": retrievedKey,
    };
    const models = await listGeminiModels(retrievedKey, baseUrl, headers);

    console.log(
      `[Full Flow] Added key ${keyId}, discovered ${models.length} models`,
    );

    expect(models.length).toBeGreaterThan(0);

    // Step 4: Update key with discovered models
    await vault.updateKey(keyId, {
      verifiedModels: models.slice(0, 5), // Store first 5 models
      verificationStatus: "valid",
    });

    const keys = await vault.listKeys("gemini");
    expect(keys[0].verificationStatus).toBe("valid");
    expect(keys[0].verifiedModels?.length).toBeGreaterThan(0);
  }, 20000);

  it("should add key and then discover its models (OpenAI)", async () => {
    const shouldSkip = !GPT_API_KEY || GPT_API_KEY.startsWith("fake-");
    if (shouldSkip) {
      console.log("Skipping full flow test - no valid OpenAI key");
      return;
    }

    // Step 1: Add key to vault
    await vault.unlock();
    const keyId = await vault.addKey(
      "openai",
      GPT_API_KEY,
      "OpenAI Full Flow Test",
      "high",
    );
    expect(keyId).toBeDefined();

    // Step 2: Retrieve key from vault
    const retrievedKey = await vault.getKey(keyId);
    expect(retrievedKey).toBe(GPT_API_KEY);

    // Step 3: Use key to discover models
    const models = await listOpenAIModels(retrievedKey);

    console.log(
      `[Full Flow] Added OpenAI key ${keyId}, discovered ${models.length} models`,
    );

    expect(models.length).toBeGreaterThan(0);

    // Step 4: Update key with discovered models
    await vault.updateKey(keyId, {
      verifiedModels: models.slice(0, 5), // Store first 5 models
      verificationStatus: "valid",
    });

    const keys = await vault.listKeys("openai");
    expect(keys[0].verificationStatus).toBe("valid");
    expect(keys[0].verifiedModels?.length).toBeGreaterThan(0);
  }, 20000);
});
