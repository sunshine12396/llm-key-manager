import { describe, it, expect, beforeEach, vi } from "vitest";
import { availabilityCache } from "../../src/services/availability/availability.cache";
import { db } from "../../src/db";

// Mock Dexie
vi.mock("../../src/db", () => ({
    db: {
        modelCache: {
            toArray: vi.fn().mockResolvedValue([]),
        },
        keys: {
            toArray: vi.fn().mockResolvedValue([]),
        },
    },
}));

describe("AvailabilityCache", () => {
    beforeEach(() => {
        availabilityCache.clear();
        vi.clearAllMocks();
    });

    it("should initialize from database", async () => {
        const mockModels = [
            {
                keyId: "key1",
                modelId: "gpt-4",
                providerId: "openai" as const,
                state: "AVAILABLE",
                modelPriority: 5,
            },
            {
                keyId: "key1",
                modelId: "gpt-3.5-turbo",
                providerId: "openai" as const,
                state: "CHECKING",
                modelPriority: 1,
            },
        ];

        vi.mocked(db.modelCache.toArray).mockResolvedValue(mockModels as any);
        vi.mocked(db.keys.toArray as any).mockResolvedValue([{ id: "key1", priority: "high", averageLatency: 20 }] as any);

        await availabilityCache.initialize();

        expect(availabilityCache.hasUsableModels("openai")).toBe(true);
        expect(availabilityCache.getAvailableCount("openai")).toBe(1); // Only AVAILABLE one

        const usable = availabilityCache.getUsableModels("openai");
        expect(usable).toHaveLength(1);
        expect(usable[0].modelId).toBe("gpt-4");
    });

    it("should handle marking models as usable/unusable", () => {
        availabilityCache.initializeKey("key1", "openai", ["gpt-4", "gpt-3.5-turbo"]);

        expect(availabilityCache.isModelUsable("key1", "gpt-4")).toBe(false);

        availabilityCache.markUsable("key1", "gpt-4", "openai");
        expect(availabilityCache.isModelUsable("key1", "gpt-4")).toBe(true);
        expect(availabilityCache.getAvailableCount("openai")).toBe(1);

        availabilityCache.markUnusable("key1", "gpt-4");
        expect(availabilityCache.isModelUsable("key1", "gpt-4")).toBe(false);
        expect(availabilityCache.getAvailableCount("openai")).toBe(0);
    });

    it("should support global key invalidation (429 handling)", () => {
        availabilityCache.initializeKey("key1", "openai", ["gpt-4", "gpt-3.5-turbo"]);
        availabilityCache.markUsable("key1", "gpt-4", "openai");
        availabilityCache.markUsable("key1", "gpt-3.5-turbo", "openai");

        expect(availabilityCache.getAvailableCount("openai")).toBe(2);

        // Global invalidate for key1
        availabilityCache.markUnusable("key1", "");

        expect(availabilityCache.isModelUsable("key1", "gpt-4")).toBe(false);
        expect(availabilityCache.isModelUsable("key1", "gpt-3.5-turbo")).toBe(false);
        expect(availabilityCache.getAvailableCount("openai")).toBe(0);
    });

    it("should sort usable models by effective score and tie-breaker", () => {
        // We'll manually inject entries with different scores for testing
        // key-a and key-b have same score, key-c has higher
        (availabilityCache as any).cache.set("m1:key-b", { 
            keyId: "key-b", modelId: "m1", isUsable: true, effectiveScore: 50, providerId: "openai" 
        });
        (availabilityCache as any).cache.set("m1:key-a", { 
            keyId: "key-a", modelId: "m1", isUsable: true, effectiveScore: 50, providerId: "openai" 
        });
        (availabilityCache as any).cache.set("m1:key-c", { 
            keyId: "key-c", modelId: "m1", isUsable: true, effectiveScore: 80, providerId: "openai" 
        });
        
        // Update indices manually since we bypassed markUsable
        (availabilityCache as any).updateIndices("m1:key-a", (availabilityCache as any).cache.get("m1:key-a"));
        (availabilityCache as any).updateIndices("m1:key-b", (availabilityCache as any).cache.get("m1:key-b"));
        (availabilityCache as any).updateIndices("m1:key-c", (availabilityCache as any).cache.get("m1:key-c"));

        const usable = availabilityCache.getUsableModels("openai" as any);
        expect(usable[0].keyId).toBe("key-c"); // Highest score
        expect(usable[1].keyId).toBe("key-a"); // Tie-break: a before b
        expect(usable[2].keyId).toBe("key-b");
    });

    it("should calculate effective score from model power, priority, latency, and health", async () => {
        vi.mocked(db.modelCache.toArray).mockResolvedValue([
            { keyId: "o3-key", modelId: "o3", providerId: "openai", state: "AVAILABLE", modelPriority: 5 },
            { keyId: "gpt4o-key", modelId: "gpt-4o", providerId: "openai", state: "AVAILABLE", modelPriority: 5 },
            { keyId: "unknown-key", modelId: "custom-model", providerId: "openai", state: "AVAILABLE", modelPriority: 1 },
            { keyId: "unhealthy-key", modelId: "custom-model", providerId: "openai", state: "COOLDOWN", modelPriority: 1 },
        ] as any);
        vi.mocked(db.keys.toArray as any).mockResolvedValue([
            { id: "o3-key", priority: "medium", averageLatency: 0 },
            { id: "gpt4o-key", priority: "medium", averageLatency: 0 },
            { id: "unknown-key", priority: "medium", averageLatency: 0 },
            { id: "unhealthy-key", priority: "medium", averageLatency: 0 },
        ] as any);

        await availabilityCache.initialize();

        const cache = (availabilityCache as any).cache as Map<string, any>;

        // Base power + medium priority bonus + available health bonus - latency penalty.
        expect(cache.get("o3:o3-key").effectiveScore).toBe(110);
        expect(cache.get("gpt-4o:gpt4o-key").effectiveScore).toBe(90);
        expect(cache.get("custom-model:unknown-key").effectiveScore).toBe(60);
        expect(cache.get("custom-model:unhealthy-key").effectiveScore).toBe(40);
    });

    it("should apply key priority bonus and penalty in effective score", async () => {
        vi.mocked(db.modelCache.toArray).mockResolvedValue([
            { keyId: "high-key", modelId: "gpt-4o", providerId: "openai", state: "AVAILABLE", modelPriority: 5 },
            { keyId: "medium-key", modelId: "gpt-4o", providerId: "openai", state: "AVAILABLE", modelPriority: 5 },
            { keyId: "low-key", modelId: "gpt-4o", providerId: "openai", state: "AVAILABLE", modelPriority: 5 },
        ] as any);
        vi.mocked(db.keys.toArray as any).mockResolvedValue([
            { id: "high-key", priority: "high", averageLatency: 0 },
            { id: "medium-key", priority: "medium", averageLatency: 0 },
            { id: "low-key", priority: "low", averageLatency: 0 },
        ] as any);

        await availabilityCache.initialize();

        const byKey = new Map(
            availabilityCache.getUsableKeysForModel("gpt-4o").map((entry) => [
                entry.keyId,
                entry.effectiveScore,
            ]),
        );

        expect(byKey.get("high-key")).toBe(110);
        expect(byKey.get("medium-key")).toBe(90);
        expect(byKey.get("low-key")).toBe(70);
    });

    it("should apply latency penalty and cap it at 30 points", async () => {
        vi.mocked(db.modelCache.toArray).mockResolvedValue([
            { keyId: "latency-200", modelId: "gpt-4o", providerId: "openai", state: "AVAILABLE", modelPriority: 5 },
            { keyId: "latency-500", modelId: "gpt-4o", providerId: "openai", state: "AVAILABLE", modelPriority: 5 },
        ] as any);
        vi.mocked(db.keys.toArray as any).mockResolvedValue([
            { id: "latency-200", priority: "medium", averageLatency: 200 },
            { id: "latency-500", priority: "medium", averageLatency: 500 },
        ] as any);

        await availabilityCache.initialize();

        const byKey = new Map(
            availabilityCache.getUsableKeysForModel("gpt-4o").map((entry) => [
                entry.keyId,
                entry.effectiveScore,
            ]),
        );

        expect(byKey.get("latency-200")).toBe(70);
        expect(byKey.get("latency-500")).toBe(60);
    });

    it("should return pre-sorted usable keys for a model and update the index at runtime", async () => {
        vi.mocked(db.modelCache.toArray).mockResolvedValue([
            { keyId: "slow-key", modelId: "gpt-4o", providerId: "openai", state: "AVAILABLE", modelPriority: 5 },
            { keyId: "fast-key", modelId: "gpt-4o", providerId: "openai", state: "AVAILABLE", modelPriority: 5 },
            { keyId: "other-key", modelId: "gpt-3.5-turbo", providerId: "openai", state: "AVAILABLE", modelPriority: 1 },
        ] as any);
        vi.mocked(db.keys.toArray as any).mockResolvedValue([
            { id: "slow-key", priority: "low", averageLatency: 300 },
            { id: "fast-key", priority: "high", averageLatency: 0 },
            { id: "other-key", priority: "high", averageLatency: 0 },
        ] as any);

        await availabilityCache.initialize();

        expect(availabilityCache.getUsableKeysForModel("gpt-4o").map((m) => m.keyId))
            .toEqual(["fast-key", "slow-key"]);

        availabilityCache.markUnusable("fast-key", "gpt-4o");
        expect(availabilityCache.getUsableKeysForModel("gpt-4o").map((m) => m.keyId))
            .toEqual(["slow-key"]);

        availabilityCache.markUsable("fast-key", "gpt-4o", "openai");
        expect(availabilityCache.getUsableKeysForModel("gpt-4o").map((m) => m.keyId))
            .toEqual(["fast-key", "slow-key"]);
    });

    it("should handle key removal", () => {
        availabilityCache.initializeKey("key1", "openai", ["gpt-4"]);
        availabilityCache.markUsable("key1", "gpt-4", "openai");

        expect(availabilityCache.getAvailableCount("openai")).toBe(1);

        availabilityCache.removeKey("key1");
        expect(availabilityCache.getAvailableCount("openai")).toBe(0);
        expect(availabilityCache.getModelsForKey("key1")).toHaveLength(0);
    });
});
