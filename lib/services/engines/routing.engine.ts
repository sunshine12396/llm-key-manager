/**
 * Key Router for UI Display
 *
 * Provides routing state information for the UI:
 * - Provider rotation status
 * - Promoted key tracking
 *
 * Note: Key selection and failover logic has moved to keyResolver.
 * This module is now primarily for UI display purposes.
 */

import { AIProviderId } from "../../models/metadata";

// ============================================
// TYPES
// ============================================

interface RotationState {
  promotedKeyId: string | null;
  promotedAt: number;
  rotatedOutKeyId: string | null;
}

export interface RotationEvent {
  type: "key_rotated_out" | "key_promoted" | "key_restored";
  keyId: string;
  providerId: AIProviderId;
  reason?: "rate_limited" | "error" | "manual";
  retryAfterMs?: number;
}

// ============================================
// KEY ROUTER (Simplified)
// ============================================

/**
 * Key Router
 *
 * Simplified to provide rotation status for UI display.
 * Key selection has moved to keyResolver (lib/services/availability/key-resolver.ts)
 */
export class KeyRouter {
  private rotationState: Map<AIProviderId, RotationState> = new Map();
  private rotationListeners: Array<(event: RotationEvent) => void> = [];

  constructor() {}

  /**
   * Subscribe to rotation events
   */
  onRotation(listener: (event: RotationEvent) => void): () => void {
    this.rotationListeners.push(listener);
    return () => {
      this.rotationListeners = this.rotationListeners.filter(
        (l) => l !== listener,
      );
    };
  }

  private emitRotation(event: RotationEvent): void {
    this.rotationListeners.forEach((l) => l(event));
  }

  /**
   * Mark a key as promoted (for UI display)
   */
  markPromoted(keyId: string, providerId: AIProviderId): void {
    this.rotationState.set(providerId, {
      promotedKeyId: keyId,
      promotedAt: Date.now(),
      rotatedOutKeyId: null,
    });

    this.emitRotation({
      type: "key_promoted",
      keyId,
      providerId,
    });
  }

  /**
   * Mark a key as rotated out (for UI display)
   */
  markRotatedOut(
    keyId: string,
    providerId: AIProviderId,
    retryAfterMs?: number,
  ): void {
    const currentState = this.rotationState.get(providerId);

    this.rotationState.set(providerId, {
      promotedKeyId: currentState?.promotedKeyId || null,
      promotedAt: currentState?.promotedAt || 0,
      rotatedOutKeyId: keyId,
    });

    this.emitRotation({
      type: "key_rotated_out",
      keyId,
      providerId,
      reason: "rate_limited",
      retryAfterMs,
    });
  }

  /**
   * Get the currently promoted key for a provider
   * Used by UI to show "Primary" badge
   */
  getPromotedKey(providerId: AIProviderId): string | null {
    return this.rotationState.get(providerId)?.promotedKeyId || null;
  }

  /**
   * Get rotation status for a provider
   */
  getRotationStatus(providerId: AIProviderId): RotationState | null {
    return this.rotationState.get(providerId) || null;
  }

  /**
   * Clear rotation state (used when key is restored)
   */
  clearRotation(providerId: AIProviderId): void {
    const state = this.rotationState.get(providerId);
    if (state?.rotatedOutKeyId) {
      this.emitRotation({
        type: "key_restored",
        keyId: state.rotatedOutKeyId,
        providerId,
      });
    }
    this.rotationState.delete(providerId);
  }

  /**
   * Reset all state (for tests)
   */
  resetStats(): void {
    this.rotationState.clear();
  }
}

export const keyRouter = new KeyRouter();
