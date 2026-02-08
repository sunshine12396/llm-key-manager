/**
 * Safety Events Module
 *
 * Event types and emitter for safety-related events.
 * Provides a pub/sub mechanism for circuit breaker and safety state changes.
 */

import type { AIProviderId } from "../../models/types";

// ============================================
// EVENT TYPES
// ============================================

export type SafetyEventType =
  | "PROVIDER_DISABLED"
  | "PROVIDER_ENABLED"
  | "SCANNING_FROZEN"
  | "SCANNING_RESUMED"
  | "FALLBACK_FORCED"
  | "FALLBACK_CLEARED"
  | "EMERGENCY_MODE_ENABLED"
  | "EMERGENCY_MODE_DISABLED"
  | "KEY_DISABLED"
  | "KEY_ENABLED"
  | "CIRCUIT_OPENED"
  | "CIRCUIT_CLOSED"
  | "CIRCUIT_HALF_OPEN"
  | "CIRCUIT_RESET"
  | "SAFETY_RESET";

export type SafetyEvent =
  | { type: "PROVIDER_DISABLED"; providerId: AIProviderId; reason: string }
  | { type: "PROVIDER_ENABLED"; providerId: AIProviderId }
  | { type: "SCANNING_FROZEN"; reason: string }
  | { type: "SCANNING_RESUMED" }
  | { type: "FALLBACK_FORCED"; model: string; provider?: AIProviderId }
  | { type: "FALLBACK_CLEARED" }
  | { type: "EMERGENCY_MODE_ENABLED"; reason: string }
  | { type: "EMERGENCY_MODE_DISABLED" }
  | { type: "KEY_DISABLED"; keyId: string; reason: string }
  | { type: "KEY_ENABLED"; keyId: string }
  | { type: "CIRCUIT_OPENED"; label: string; reason: string }
  | { type: "CIRCUIT_CLOSED"; label: string }
  | { type: "CIRCUIT_HALF_OPEN"; label: string }
  | { type: "CIRCUIT_RESET"; label: string }
  | { type: "SAFETY_RESET" };

export type SafetyEventListener = (event: SafetyEvent) => void;

// ============================================
// SAFETY STATUS TYPE
// ============================================

export interface SafetyStatus {
  disabledProviders: AIProviderId[];
  scanningFrozen: boolean;
  forcedFallback: { model: string; provider?: AIProviderId } | null;
  emergencyMode: boolean;
  disabledKeys: string[];
  keyCircuits: Record<string, CircuitState>;
  providerCircuits: Record<string, CircuitState>;
}

// ============================================
// CIRCUIT BREAKER TYPES
// ============================================

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  /** Number of consecutive failures to trip the breaker */
  failureThreshold: number;
  /** Cooldown period in ms before attempting recovery */
  cooldownMs: number;
  /** Number of successful calls to close the breaker */
  successThreshold: number;
  /** Window in ms to count failures (rolling window) */
  failureWindowMs: number;
}

export interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  openedAt: number | null;
  failureHistory: number[];
}

// ============================================
// EVENT EMITTER CLASS
// ============================================

export class SafetyEventEmitter {
  private listeners: SafetyEventListener[] = [];

  subscribe(listener: SafetyEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  emit(event: SafetyEvent): void {
    this.listeners.forEach((l) => l(event));
  }

  clear(): void {
    this.listeners = [];
  }
}
