/**
 * Safety Module Types
 *
 * Unified type definitions for the safety system.
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
// STATUS TYPES
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

export interface GlobalSafetyState {
    /** Disabled providers (won't be used for any requests) */
    disabledProviders: Set<AIProviderId>;
    /** Whether background scanning is frozen */
    scanningFrozen: boolean;
    /** Force fallback model (bypass normal selection) */
    forcedFallbackModel: string | null;
    /** Force fallback provider */
    forcedFallbackProvider: AIProviderId | null;
    /** Emergency mode - only use verified working models */
    emergencyMode: boolean;
    /** Per-key disabled status */
    disabledKeys: Set<string>;
}
