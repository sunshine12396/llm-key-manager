/**
 * Safety Persistence Module
 *
 * Handles saving and loading safety state to/from localStorage.
 * Ensures safety configurations survive page refreshes.
 */

import type { AIProviderId } from "../../models/types";
import type { CircuitBreakerState } from "./safety-events";
import type { CircuitBreaker } from "./circuit-breaker";
import type { SafetyControls } from "./safety-controls";

const STORAGE_KEY = "llm_safety_guard_state_v2";

interface PersistedState {
  version: number;
  disabledProviders: AIProviderId[];
  scanningFrozen: boolean;
  emergencyMode: boolean;
  disabledKeys: string[];
  keyCircuitBreakers: Array<[string, CircuitBreakerState]>;
  providerCircuitBreakers: Array<[AIProviderId, CircuitBreakerState]>;
}

/**
 * Save safety state to localStorage
 */
export function persistSafetyState(
  controls: SafetyControls,
  breaker: CircuitBreaker,
): void {
  if (typeof window === "undefined") return;

  try {
    const snapshot = controls.getSnapshot();
    const state: PersistedState = {
      version: 2,
      disabledProviders: snapshot.disabledProviders,
      scanningFrozen: snapshot.scanningFrozen,
      emergencyMode: snapshot.emergencyMode,
      disabledKeys: snapshot.disabledKeys,
      keyCircuitBreakers: breaker.getKeyCircuitsSnapshot(),
      providerCircuitBreakers: breaker.getProviderCircuitsSnapshot(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("[SafetyPersistence] Failed to save state:", e);
  }
}

/**
 * Load safety state from localStorage
 */
export function loadSafetyState(
  controls: SafetyControls,
  breaker: CircuitBreaker,
): void {
  if (typeof window === "undefined") return;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const data: PersistedState = JSON.parse(raw);

    // Restore controls
    controls.restore({
      disabledProviders: data.disabledProviders,
      scanningFrozen: data.scanningFrozen,
      emergencyMode: data.emergencyMode,
      disabledKeys: data.disabledKeys,
    });

    // Restore circuit breakers
    if (Array.isArray(data.keyCircuitBreakers)) {
      breaker.restoreKeyCircuits(data.keyCircuitBreakers);
    }
    if (Array.isArray(data.providerCircuitBreakers)) {
      breaker.restoreProviderCircuits(data.providerCircuitBreakers);
    }

    console.log("[SafetyPersistence] State restored from storage");
  } catch (e) {
    console.warn("[SafetyPersistence] Failed to load state:", e);
  }
}

/**
 * Clear persisted state
 */
export function clearPersistedState(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
