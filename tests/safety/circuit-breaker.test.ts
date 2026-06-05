import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CircuitBreaker } from "../../src/services/safety/circuit-breaker";
import type { SafetyEvent } from "../../src/services/safety/types";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;
  let events: SafetyEvent[];
  const emit = (event: SafetyEvent) => events.push(event);

  beforeEach(() => {
    vi.restoreAllMocks();
    breaker = new CircuitBreaker();
    events = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ignores failures outside the configured failure window", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);

    for (let i = 0; i < 4; i++) {
      expect(breaker.recordKeyFailure("key-1", "openai", emit)).toBe(
        "CLOSED",
      );
    }

    vi.mocked(Date.now).mockReturnValue(1_000 + 60_000);
    expect(breaker.recordKeyFailure("key-1", "openai", emit)).toBe("CLOSED");

    const circuit = breaker.getKeyCircuit("key-1");
    expect(circuit.failureHistory).toHaveLength(1);
    expect(circuit.state).toBe("CLOSED");
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: "CIRCUIT_OPENED" }),
    );
  });

  it("opens a circuit and emits CIRCUIT_OPENED when failures reach threshold", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);

    for (let i = 0; i < 4; i++) {
      expect(breaker.recordKeyFailure("key-1", "openai", emit)).toBe(
        "CLOSED",
      );
    }

    expect(breaker.recordKeyFailure("key-1", "openai", emit)).toBe("OPEN");
    expect(breaker.getKeyCircuitState("key-1")).toBe("OPEN");
    expect(events).toContainEqual({
      type: "CIRCUIT_OPENED",
      label: "key:key-1",
      reason: "5 failures",
    });
  });

  it("moves OPEN circuits to HALF_OPEN after cooldown on the next check", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    for (let i = 0; i < 5; i++) {
      breaker.recordKeyFailure("key-1", "openai", emit);
    }

    vi.mocked(Date.now).mockReturnValue(1_000 + 5 * 60 * 1000 + 1);
    expect(breaker.isKeyCircuitOpen("key-1", "openai")).toBe(false);
    expect(breaker.getKeyCircuitState("key-1")).toBe("HALF_OPEN");
  });

  it("moves provider circuits to HALF_OPEN when checked after cooldown", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    for (let i = 0; i < 5; i++) {
      breaker.recordProviderFailure("openai", emit);
    }

    vi.mocked(Date.now).mockReturnValue(1_000 + 5 * 60 * 1000 + 1);
    expect(breaker.isProviderCircuitOpen("openai")).toBe(false);
    expect(breaker.getProviderCircuit("openai").state).toBe("HALF_OPEN");
  });

  it("re-trips HALF_OPEN circuits on one failure", () => {
    breaker.restoreKeyCircuits([
      [
        "key-1",
        {
          state: "HALF_OPEN",
          failures: 5,
          successes: 0,
          lastFailureAt: 1_000,
          lastSuccessAt: null,
          openedAt: 1_000,
          failureHistory: [1_000],
        },
      ],
    ]);
    vi.spyOn(Date, "now").mockReturnValue(2_000);

    expect(breaker.recordKeyFailure("key-1", "openai", emit)).toBe("OPEN");
    expect(events).toContainEqual({
      type: "CIRCUIT_OPENED",
      label: "key:key-1",
      reason: "Recovery failed",
    });
  });

  it("closes HALF_OPEN circuits after enough successful probes", () => {
    breaker.restoreKeyCircuits([
      [
        "key-1",
        {
          state: "HALF_OPEN",
          failures: 5,
          successes: 0,
          lastFailureAt: 1_000,
          lastSuccessAt: null,
          openedAt: 1_000,
          failureHistory: [1_000],
        },
      ],
    ]);
    vi.spyOn(Date, "now").mockReturnValue(2_000);

    expect(breaker.recordKeySuccess("key-1", emit)).toBe("HALF_OPEN");
    expect(breaker.recordKeySuccess("key-1", emit)).toBe("CLOSED");

    const circuit = breaker.getKeyCircuit("key-1");
    expect(circuit.state).toBe("CLOSED");
    expect(circuit.failures).toBe(0);
    expect(circuit.failureHistory).toEqual([]);
    expect(events).toContainEqual({
      type: "CIRCUIT_CLOSED",
      label: "key:key-1",
    });
  });
});
