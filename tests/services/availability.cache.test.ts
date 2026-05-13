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

    it("should handle key removal", () => {
        availabilityCache.initializeKey("key1", "openai", ["gpt-4"]);
        availabilityCache.markUsable("key1", "gpt-4", "openai");

        expect(availabilityCache.getAvailableCount("openai")).toBe(1);

        availabilityCache.removeKey("key1");
        expect(availabilityCache.getAvailableCount("openai")).toBe(0);
        expect(availabilityCache.getModelsForKey("key1")).toHaveLength(0);
    });
});
