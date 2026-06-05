import { describe, expect, it } from "vitest";
import { ModelStateMachine } from "../../src/services/availability/state-machine";

describe("ModelStateMachine", () => {
  it("allows standard validation success transitions", () => {
    const checking = ModelStateMachine.transition("NEW", "START_CHECK");
    expect(checking).toMatchObject({
      success: true,
      previousState: "NEW",
      newState: "CHECKING",
    });

    const available = ModelStateMachine.transition(
      checking.newState,
      "CHECK_SUCCESS",
    );
    expect(available).toMatchObject({
      success: true,
      previousState: "CHECKING",
      newState: "AVAILABLE",
    });
  });

  it("blocks illegal transitions out of permanent failure except RESET", () => {
    const blocked = ModelStateMachine.transition("PERM_FAILED", "START_CHECK");
    expect(blocked.success).toBe(false);
    expect(blocked.newState).toBe("PERM_FAILED");
    expect(blocked.error).toContain("Invalid transition");

    const reset = ModelStateMachine.transition("PERM_FAILED", "RESET");
    expect(reset).toMatchObject({
      success: true,
      previousState: "PERM_FAILED",
      newState: "CHECKING",
    });
  });

  it("classifies HTTP errors as permanent or temporary", () => {
    expect(ModelStateMachine.classifyError(401)).toBe("PERM");
    expect(ModelStateMachine.classifyError(403)).toBe("PERM");
    expect(ModelStateMachine.classifyError(404)).toBe("PERM");

    expect(ModelStateMachine.classifyError(429)).toBe("TEMP");
    expect(ModelStateMachine.classifyError(500)).toBe("TEMP");
    expect(ModelStateMachine.classifyError(503)).toBe("TEMP");

    expect(ModelStateMachine.classifyError(400)).toBe("PERM");
    expect(ModelStateMachine.classifyError(422)).toBe("PERM");
    expect(ModelStateMachine.classifyError(undefined)).toBe("UNKNOWN");
  });
});
