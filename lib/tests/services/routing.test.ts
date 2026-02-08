/**
 * KeyRouter Tests
 *
 * Updated for Phase 6 refactoring:
 * - Key selection logic has moved to keyResolver
 * - KeyRouter now primarily handles rotation state for UI display
 */

import { describe, it, expect, beforeEach } from "vitest";
import { KeyRouter, keyRouter } from "../../services/engines/routing.engine";

describe("KeyRouter - Rotation State for UI", () => {
  beforeEach(() => {
    keyRouter.resetStats();
  });

  describe("Promoted Key Tracking", () => {
    it("should track promoted key for UI display", () => {
      const router = new KeyRouter();

      router.markPromoted("k2", "openai");

      expect(router.getPromotedKey("openai")).toBe("k2");
    });

    it("should return null when no key is promoted", () => {
      const router = new KeyRouter();

      expect(router.getPromotedKey("openai")).toBeNull();
    });

    it("should update promoted key when new one is set", () => {
      const router = new KeyRouter();

      router.markPromoted("k1", "openai");
      router.markPromoted("k2", "openai");

      expect(router.getPromotedKey("openai")).toBe("k2");
    });
  });

  describe("Rotation Events", () => {
    it("should emit key_promoted event", () => {
      const router = new KeyRouter();
      const events: any[] = [];

      router.onRotation((event) => events.push(event));
      router.markPromoted("k1", "openai");

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("key_promoted");
      expect(events[0].keyId).toBe("k1");
    });

    it("should emit key_rotated_out event", () => {
      const router = new KeyRouter();
      const events: any[] = [];

      router.onRotation((event) => events.push(event));
      router.markRotatedOut("k1", "openai", 60000);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("key_rotated_out");
      expect(events[0].keyId).toBe("k1");
      expect(events[0].retryAfterMs).toBe(60000);
    });

    it("should emit key_restored event on clearRotation", () => {
      const router = new KeyRouter();
      const events: any[] = [];

      router.markRotatedOut("k1", "openai");
      router.onRotation((event) => events.push(event));
      router.clearRotation("openai");

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("key_restored");
      expect(events[0].keyId).toBe("k1");
    });

    it("should support unsubscribe", () => {
      const router = new KeyRouter();
      const events: any[] = [];

      const unsubscribe = router.onRotation((event) => events.push(event));
      unsubscribe();
      router.markPromoted("k1", "openai");

      expect(events).toHaveLength(0);
    });
  });

  describe("Rotation Status", () => {
    it("should return rotation state for provider", () => {
      const router = new KeyRouter();

      router.markPromoted("k2", "openai");
      router.markRotatedOut("k1", "openai");

      const status = router.getRotationStatus("openai");
      expect(status?.promotedKeyId).toBe("k2");
      expect(status?.rotatedOutKeyId).toBe("k1");
    });

    it("should return null for providers without rotation", () => {
      const router = new KeyRouter();

      expect(router.getRotationStatus("anthropic")).toBeNull();
    });
  });

  describe("Reset", () => {
    it("should clear all rotation state on reset", () => {
      const router = new KeyRouter();

      router.markPromoted("k1", "openai");
      router.markPromoted("k2", "anthropic");

      router.resetStats();

      expect(router.getPromotedKey("openai")).toBeNull();
      expect(router.getPromotedKey("anthropic")).toBeNull();
    });
  });
});
