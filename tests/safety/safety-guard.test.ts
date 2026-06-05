import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CircuitBreaker } from "../../src/services/safety/circuit-breaker";
import { SafetyGuard } from "../../src/services/safety/safety-guard";
import type { SafetyEvent } from "../../src/services/safety/types";

const STORAGE_KEY = "llm_safety_guard_state_v2";

describe("SafetyGuard", () => {
  let guard: SafetyGuard;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    guard = new SafetyGuard(new CircuitBreaker());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const persisted = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

  it("persists provider, key, circuit, and forced fallback state immediately", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);

    guard.disableProvider("openai", "maintenance");
    expect(persisted().disabledProviders).toEqual(["openai"]);

    guard.disableKey("key-1", "manual block");
    expect(persisted().disabledKeys).toEqual(["key-1"]);

    guard.recordKeyFailure("key-1", "openai");
    expect(persisted().keyCircuitBreakers[0]).toEqual([
      "key-1",
      expect.objectContaining({
        failures: 1,
        state: "CLOSED",
        failureHistory: [1_000],
      }),
    ]);

    guard.setForcedFallback("gpt-4o-mini", "openai");
    expect(persisted()).toMatchObject({
      forcedFallbackModel: "gpt-4o-mini",
      forcedFallbackProvider: "openai",
    });
  });

  it("restores disabled resources, fallback, and circuit breaker state from localStorage", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);

    guard.disableProvider("openai", "maintenance");
    guard.disableKey("key-1", "manual block");
    guard.setForcedFallback("gpt-4o-mini", "openai");
    for (let i = 0; i < 5; i++) {
      guard.recordKeyFailure("key-1", "openai");
      guard.recordProviderFailure("openai");
    }

    const restored = new SafetyGuard(new CircuitBreaker());

    expect(restored.isProviderDisabled("openai")).toBe(true);
    expect(restored.isKeyDisabled("key-1")).toBe(true);
    expect(restored.getForcedFallback()).toEqual({
      model: "gpt-4o-mini",
      provider: "openai",
    });
    expect(restored.getKeyCircuitState("key-1")).toBe("OPEN");
    expect(restored.isProviderCircuitOpen("openai")).toBe(true);
  });

  it("lets forced fallback override disabled and open-circuit checks", () => {
    guard.disableProvider("openai", "maintenance");
    guard.disableKey("key-1", "manual block");
    for (let i = 0; i < 5; i++) {
      guard.recordKeyFailure("key-1", "openai");
    }
    guard.setForcedFallback("claude-3-5-sonnet-latest", "anthropic");

    expect(guard.shouldAllowRequest("key-1", "openai")).toEqual({
      allowed: true,
      fallback: {
        model: "claude-3-5-sonnet-latest",
        provider: "anthropic",
      },
    });
  });

  it("rejects provider-wide blocks before key-specific checks", () => {
    guard.disableProvider("openai", "maintenance");
    guard.disableKey("key-1", "manual block");

    expect(guard.shouldAllowRequest("key-1", "openai")).toEqual({
      allowed: false,
      reason: "Provider openai is disabled",
    });
  });

  it("returns explicit reasons for provider and key circuit blocks", () => {
    for (let i = 0; i < 5; i++) {
      guard.recordProviderFailure("openai");
    }
    expect(guard.shouldAllowRequest("key-1", "openai")).toEqual({
      allowed: false,
      reason: "Provider openai circuit is OPEN",
    });

    guard.resetProviderCircuit("openai");
    for (let i = 0; i < 5; i++) {
      guard.recordKeyFailure("key-1", "openai");
    }
    expect(guard.shouldAllowRequest("key-1", "openai")).toEqual({
      allowed: false,
      reason: "Key key-1 circuit is OPEN",
    });
  });

  it("persists and emits emergency mode and scan freeze changes", () => {
    const events: SafetyEvent[] = [];
    guard.subscribe((event) => events.push(event));

    guard.enableEmergencyMode("all providers down");
    guard.freezeScanning("quota near limit");

    expect(guard.isEmergencyMode()).toBe(true);
    expect(guard.isScanningFrozen()).toBe(true);
    expect(persisted()).toMatchObject({
      emergencyMode: true,
      scanningFrozen: true,
    });
    expect(events).toContainEqual({
      type: "EMERGENCY_MODE_ENABLED",
      reason: "all providers down",
    });
    expect(events).toContainEqual({
      type: "SCANNING_FROZEN",
      reason: "quota near limit",
    });
  });

  it("returns forced fallback until it is cleared", () => {
    guard.setForcedFallback("gpt-4o-mini", "openai");
    expect(guard.getForcedFallback()).toEqual({
      model: "gpt-4o-mini",
      provider: "openai",
    });

    guard.clearForcedFallback();

    expect(guard.getForcedFallback()).toBeNull();
    expect(persisted()).toMatchObject({
      forcedFallbackModel: null,
      forcedFallbackProvider: null,
    });
  });
});
