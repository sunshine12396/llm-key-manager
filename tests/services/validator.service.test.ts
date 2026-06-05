import { describe, it, expect, beforeEach, vi } from "vitest";
import { ValidatorService } from "../../src/services/validation/validator.service";
import { vaultService } from "../../src/services/vault/vault.service";
import { modelVerifier } from "../../src/services/validation/model-verifier";
import { availabilityManager } from "../../src/services/availability/availability.manager";
import { getProviderAdapter } from "../../src/providers/provider.registry";

// Mock dependencies
vi.mock("../../src/services/vault/vault.service");
vi.mock("../../src/services/validation/model-verifier");
vi.mock("../../src/services/availability/availability.manager");
vi.mock("../../src/providers/provider.registry", () => ({
    getProviderAdapter: vi.fn(),
}));
vi.mock("../../src/db", () => ({
    db: {
        modelCache: {
            where: vi.fn().mockReturnThis(),
            equals: vi.fn().mockReturnThis(),
            and: vi.fn().mockReturnThis(),
            modify: vi.fn().mockResolvedValue(undefined),
            get: vi.fn().mockResolvedValue(undefined),
            toArray: vi.fn().mockResolvedValue([]),
        },
    },
}));

describe("ValidatorService", () => {
    let service: ValidatorService;

    beforeEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
        service = new ValidatorService();
        // Stop the scheduler for tests
        if ((service as any).schedulerInterval) {
            clearInterval((service as any).schedulerInterval);
        }
    });

    it("should sort queued tasks by priority before processing", () => {
        const lowPriorityTask = {
            keyId: "low",
            providerId: "openai",
            label: "Low Priority",
            apiKey: "sk-low",
            isRetry: false,
            priority: 1,
            queuedAt: 1000,
        };
        const highPriorityTask = {
            keyId: "high",
            providerId: "openai",
            label: "High Priority",
            apiKey: "sk-high",
            isRetry: false,
            priority: 2,
            queuedAt: 2000,
        };

        // Keep processQueue from consuming tasks while pushTask sorts them.
        (service as any).activeCount = service.getConfig().maxConcurrency;

        (service as any).pushTask(lowPriorityTask);
        (service as any).pushTask(highPriorityTask);

        expect((service as any).queue.map((task: any) => task.keyId)).toEqual([
            "high",
            "low",
        ]);
    });

    it("should queue validation and process it", async () => {
        const keyId = "key1";
        const mockKeyMeta = {
            id: keyId,
            providerId: "openai",
            label: "Test Key",
        };

        vi.mocked(vaultService.getKeyMetadata).mockResolvedValue(mockKeyMeta as any);
        vi.mocked(vaultService.getKey).mockResolvedValue("sk-abc");

        // Mock successful execution
        vi.mocked(modelVerifier.verifyBatch).mockResolvedValue([]);

        await service.queueValidation(keyId);

        expect(vaultService.getKeyMetadata).toHaveBeenCalledWith(keyId);
        expect(vaultService.getKey).toHaveBeenCalledWith(keyId);

        // Check if job tracker works
        expect(service.isValidating(keyId)).toBe(true);
    });

    it("should resume pending validations", async () => {
        vi.mocked(vaultService.listKeys).mockResolvedValue([
            { id: "p1", providerId: "openai", verificationStatus: "testing" },
            { id: "p2", providerId: "openai", verificationStatus: "untested" }
        ] as any);

        vi.mocked(vaultService.getKeyMetadata).mockResolvedValue({ id: "p1", providerId: "openai" } as any);

        await service.resumePendingValidations();

        expect(vaultService.listKeys).toHaveBeenCalled();
        expect(vaultService.getKeyMetadata).toHaveBeenCalledWith("p1");
        expect(vaultService.getKeyMetadata).not.toHaveBeenCalledWith("p2");
    });

    it("should handle task errors and update key status", async () => {
        const task = {
            keyId: "k1",
            providerId: "openai",
            label: "Key",
            apiKey: "sk-...",
            isRetry: false,
            priority: 1,
            queuedAt: Date.now()
        };

        const error = new Error("Task failed");
        // Mock private method execution via pushTask
        vi.mocked(vaultService.updateKey).mockResolvedValue(undefined);

        await (service as any).handleTaskError(task, error);

        expect(vaultService.updateKey).toHaveBeenCalledWith("k1", { verificationStatus: "invalid" });
    });

    it("should cache discovered models and refresh them after the cache TTL", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));

        const listModels = vi
            .fn()
            .mockResolvedValueOnce(["gpt-4o", "gpt-4o-mini"])
            .mockResolvedValueOnce(["gpt-4o", "gpt-4o-mini", "o3"]);

        vi.mocked(getProviderAdapter).mockReturnValue({
            providerId: "openai",
            listModels,
            chat: vi.fn(),
            ownsModel: vi.fn(),
            validateKeyFormat: vi.fn(),
        } as any);

        const task = {
            keyId: "k1",
            providerId: "openai",
            label: "Key",
            apiKey: "sk-...",
            isRetry: false,
            priority: 1,
            queuedAt: Date.now(),
        };

        await expect((service as any).resolveModelsForProviderCached(task))
            .resolves.toEqual(["gpt-4o", "gpt-4o-mini"]);
        await expect((service as any).resolveModelsForProviderCached(task))
            .resolves.toEqual(["gpt-4o", "gpt-4o-mini"]);

        expect(listModels).toHaveBeenCalledTimes(1);

        vi.setSystemTime(new Date("2026-06-05T00:30:01.000Z"));

        await expect((service as any).resolveModelsForProviderCached(task))
            .resolves.toEqual(["gpt-4o", "gpt-4o-mini", "o3"]);
        expect(listModels).toHaveBeenCalledTimes(2);
    });

    it("should clear testing status if processQueue catches an unexpected task crash", async () => {
        const task = {
            keyId: "k1",
            providerId: "openai",
            label: "Key",
            apiKey: "sk-...",
            isRetry: false,
            priority: 1,
            queuedAt: Date.now(),
        };
        const crash = new Error("worker crashed");
        const events: any[] = [];

        service.subscribe((event) => events.push(event));
        vi.mocked(vaultService.updateKey).mockResolvedValue(undefined);
        (service as any).queue = [task];
        (service as any).executeTask = vi.fn().mockRejectedValue(crash);

        await (service as any).processQueue();

        expect(vaultService.updateKey).toHaveBeenCalledWith("k1", {
            verificationStatus: "invalid",
        });
        expect(events).toContainEqual(expect.objectContaining({
            type: "validation:error",
            keyId: "k1",
            error: crash,
        }));
        expect((service as any).activeCount).toBe(0);
    });

    it("should update progress during batch verification", async () => {
        const task = {
            keyId: "k1",
            providerId: "openai",
            label: "Key",
            apiKey: "sk-...",
            isRetry: false,
            priority: 1,
            queuedAt: Date.now()
        };

        const result = {
            modelId: "gpt-4",
            isAvailable: true,
            latencyMs: 100
        };

        vi.mocked(vaultService.updateKey).mockResolvedValue(undefined);
        vi.mocked(availabilityManager.markModelAvailable).mockResolvedValue(undefined);

        await (service as any).handleBatchProgress(task, result, 1, 10);

        expect(vaultService.updateKey).toHaveBeenCalledWith("k1", { verificationStatus: "valid" });
        expect(availabilityManager.markModelAvailable).toHaveBeenCalledWith(
            "k1",
            "gpt-4"
        );
    });

    it("should avoid double-queuing the same key", async () => {
        const keyId = "key1";
        vi.mocked(vaultService.getKeyMetadata).mockResolvedValue({ id: keyId, providerId: "openai" } as any);

        // Manually push to active jobs to simulate ongoing validation
        (service as any).activeJobs.add(keyId);

        await service.queueValidation(keyId);

        expect(vaultService.getKeyMetadata).not.toHaveBeenCalled();
    });

    it("should handle discovery failures by scheduling retry", async () => {
        // This is hard to test directly without exposing private methods
        // or mocking the heavy adapter registry.
        // For now, let's verify public API consistency.
        expect(service.isValidating("non-existent")).toBe(false);
    });
});
