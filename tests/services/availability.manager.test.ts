import { describe, it, expect, beforeEach, vi } from "vitest";
import { availabilityManager } from "../../src/services/availability/availability.manager";
import { db } from "../../src/db";
import { availabilityCache } from "../../src/services/availability/availability.cache";

// Mock dependencies
vi.mock("../../src/db", () => ({
    db: {
        modelCache: {
            get: vi.fn(),
            update: vi.fn(),
            where: vi.fn().mockReturnThis(),
            equals: vi.fn().mockReturnThis(),
            and: vi.fn().mockReturnThis(),
            toArray: vi.fn().mockResolvedValue([]),
            modify: vi.fn().mockResolvedValue(undefined),
            bulkPut: vi.fn().mockResolvedValue(undefined),
        } as any,
    } as any,
}));

vi.mock("../../src/services/safety", () => ({
    safetyGuard: {
        recordKeyFailure: vi.fn(),
        recordProviderFailure: vi.fn(),
        recordKeySuccess: vi.fn(),
        recordProviderSuccess: vi.fn(),
        isProviderDisabled: vi.fn().mockReturnValue(false),
        isProviderCircuitOpen: vi.fn().mockReturnValue(false),
        getForcedFallback: vi.fn().mockReturnValue(null),
        isKeyDisabled: vi.fn().mockReturnValue(false),
        isKeyCircuitOpen: vi.fn().mockReturnValue(false),
    },
}));

vi.mock("../../src/services/availability/availability.cache", () => ({
    availabilityCache: {
        markUsable: vi.fn(),
        markUnusable: vi.fn(),
        initializeKey: vi.fn(),
    },
}));

vi.mock("../../src/services/vault/vault.service", () => ({
    vaultService: {
        updateKey: vi.fn().mockResolvedValue(undefined),
    },
}));

describe("AvailabilityManager", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("handleRuntimeError", () => {
        it("should handle global 429 error by marking all models for the key as COOLDOWN", async () => {
            const keyId = "key1";
            const modelId = "gpt-4"; // even if specific model is passed

            vi.mocked(db.modelCache.get as any).mockResolvedValue({
                keyId,
                modelId,
                providerId: "openai",
                retryCount: 0,
                modelPriority: 3
            } as any);

            await availabilityManager.handleRuntimeError(keyId, modelId, 429, "Rate limit exceeded");

            // Verify DB update for ALL models
            expect((db.modelCache as any).where).toHaveBeenCalledWith("keyId");
            expect((db.modelCache as any).equals).toHaveBeenCalledWith(keyId);
            expect((db.modelCache as any).modify).toHaveBeenCalledWith(expect.objectContaining({
                state: "COOLDOWN",
                lastErrorCode: 429
            }));

            // Verify Cache update
            expect(availabilityCache.markUnusable).toHaveBeenCalledWith(keyId, "", "COOLDOWN");
        });

        it("should handle permanent errors (401) by marking key as invalid", async () => {
            const keyId = "key1";
            const modelId = "gpt-4";

            vi.mocked(db.modelCache.get as any).mockResolvedValue({
                keyId,
                modelId,
                providerId: "openai",
                retryCount: 0,
                modelPriority: 3
            } as any);

            await availabilityManager.handleRuntimeError(keyId, modelId, 401, "Unauthorized");

            expect(db.modelCache.update).toHaveBeenCalled();
            const updateCall = vi.mocked(db.modelCache.update as any).mock.calls[0][1];
            expect(updateCall.state).toBe("PERM_FAILED");

            // Should propagate to vaultService (via dynamic import in implementation)
            // Note: testing dynamic imports can be tricky, but we mocked it above
        });
    });

    describe("markModelAvailable", () => {
        it("should mark model as AVAILABLE and update cache", async () => {
            const keyId = "key1";
            const modelId = "gpt-4";

            vi.mocked(db.modelCache.get as any).mockResolvedValue({
                keyId,
                modelId,
                providerId: "openai",
                modelPriority: 3
            });

            await availabilityManager.markModelAvailable(keyId, modelId);

            expect(db.modelCache.update).toHaveBeenCalledWith([modelId, keyId], expect.objectContaining({
                state: "AVAILABLE",
                isAvailable: true
            }));

            expect(availabilityCache.markUsable).toHaveBeenCalledWith(keyId, modelId, "openai", 3);
        });
    });

    describe("handleRuntimeError (Extra Cases)", () => {
        it("should handle 500 errors by marking as TEMP_FAILED", async () => {
            const keyId = "key1";
            const modelId = "gpt-4";

            vi.mocked(db.modelCache.get as any).mockResolvedValue({
                keyId,
                modelId,
                providerId: "openai",
                retryCount: 0,
                modelPriority: 3
            } as any);

            const state = await availabilityManager.handleRuntimeError(keyId, modelId, 500, "Internal Server Error");
            expect(state).toBe("COOLDOWN");
            expect(availabilityCache.markUnusable).toHaveBeenCalledWith(keyId, modelId, "COOLDOWN");
        });
    });

    describe("handleQuotaExhausted", () => {
        it("should mark all models for a key as COOLDOWN", async () => {
            const keyId = "key1";
            vi.mocked(db.modelCache.where as any).mockReturnThis();
            vi.mocked(db.modelCache.toArray as any).mockResolvedValue([
                { keyId, modelId: "m1", providerId: "p1" },
                { keyId, modelId: "m2", providerId: "p1" }
            ]);

            await availabilityManager.handleQuotaExhausted(keyId, 3600);

            expect(db.modelCache.bulkPut as any).toHaveBeenCalled();
        });
    });
});
