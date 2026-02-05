/**
 * Safety Guard Module
 *
 * Provides kill-switches and circuit breakers to protect the system
 * when providers are misbehaving or experiencing outages.
 *
 * Features:
 * - Global provider disable
 * - Freeze background scanning
 * - Force fallback models
 * - Per-key circuit breaker with auto-recovery
 */

import type { AIProviderId } from "../../models/types";

// ============================================
// CIRCUIT BREAKER CONFIGURATION
// ============================================

interface CircuitBreakerConfig {
  /** Number of consecutive failures to trip the breaker */
  failureThreshold: number;
  /** Cooldown period in ms before attempting recovery */
  cooldownMs: number;
  /** Number of successful calls to close the breaker */
  successThreshold: number;
  /** Window in ms to count failures (rolling window) */
  failureWindowMs: number;
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5, // 5 consecutive failures
  cooldownMs: 5 * 60 * 1000, // 5 minutes cooldown
  successThreshold: 2, // 2 successes to recover
  failureWindowMs: 60 * 1000, // 1 minute window
};

// Per-provider circuit config (some providers are more sensitive)
const PROVIDER_CIRCUIT_CONFIGS: Partial<
  Record<AIProviderId, Partial<CircuitBreakerConfig>>
> = {
  openai: {
    failureThreshold: 3, // OpenAI has strict rate limits
    cooldownMs: 10 * 60 * 1000, // 10 minutes
  },
  anthropic: {
    failureThreshold: 5,
    cooldownMs: 5 * 60 * 1000,
  },
  gemini: {
    failureThreshold: 4,
    cooldownMs: 3 * 60 * 1000, // Google tends to recover faster
  },
};

// ============================================
// CIRCUIT BREAKER STATES
// ============================================

export type CircuitState =
  | "CLOSED" // Normal operation
  | "OPEN" // Tripped, rejecting calls
  | "HALF_OPEN"; // Testing recovery

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  openedAt: number | null;
  failureHistory: number[]; // Timestamps of recent failures
}

// ============================================
// GLOBAL SAFETY FLAGS
// ============================================

interface GlobalSafetyState {
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

  /** Per-key circuit breakers */
  keyCircuitBreakers: Map<string, CircuitBreakerState>;

  /** Per-provider circuit breakers */
  providerCircuitBreakers: Map<AIProviderId, CircuitBreakerState>;
}

// ============================================
// SAFETY GUARD CLASS
// ============================================

// Storage key and version
const STORAGE_KEY = "llm_safety_guard_state_v1";

class SafetyGuard {
  private state: GlobalSafetyState = {
    disabledProviders: new Set(),
    scanningFrozen: false,
    forcedFallbackModel: null,
    forcedFallbackProvider: null,
    emergencyMode: false,
    disabledKeys: new Set(),
    keyCircuitBreakers: new Map(),
    providerCircuitBreakers: new Map(),
  };

  private listeners: Array<(event: SafetyEvent) => void> = [];

  constructor() {
    this.loadState();
  }

  /**
   * Persist current state to localStorage
   */
  private saveState(): void {
    if (typeof window === "undefined") return;

    try {
      const serialized = JSON.stringify({
        disabledProviders: Array.from(this.state.disabledProviders),
        scanningFrozen: this.state.scanningFrozen,
        // forcedFallback is usually session-specific, not persisting
        emergencyMode: this.state.emergencyMode,
        disabledKeys: Array.from(this.state.disabledKeys),
        keyCircuitBreakers: Array.from(this.state.keyCircuitBreakers.entries()),
        providerCircuitBreakers: Array.from(
          this.state.providerCircuitBreakers.entries(),
        ),
      });
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch (e) {
      console.warn("[SafetyGuard] Failed to save state:", e);
    }
  }

  /**
   * Load state from localStorage
   */
  private loadState(): void {
    if (typeof window === "undefined") return;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const data = JSON.parse(raw);

      this.state.disabledProviders = new Set(data.disabledProviders || []);
      this.state.scanningFrozen = !!data.scanningFrozen;
      this.state.emergencyMode = !!data.emergencyMode;
      this.state.disabledKeys = new Set(data.disabledKeys || []);

      if (Array.isArray(data.keyCircuitBreakers)) {
        this.state.keyCircuitBreakers = new Map(data.keyCircuitBreakers);
      }

      if (Array.isArray(data.providerCircuitBreakers)) {
        this.state.providerCircuitBreakers = new Map(
          data.providerCircuitBreakers,
        );
      }

      console.log("[SafetyGuard] State restored from storage");
    } catch (e) {
      console.warn("[SafetyGuard] Failed to load state:", e);
      // Fallback to default state if corrupted
    }
  }

  // ============================================
  // GLOBAL CONTROLS
  // ============================================

  /**
   * Disable a provider entirely. All requests will skip this provider.
   */
  disableProvider(providerId: AIProviderId, reason: string): void {
    this.state.disabledProviders.add(providerId);
    this.saveState(); // Persist
    this.emit({ type: "PROVIDER_DISABLED", providerId, reason });
    console.warn(`[SafetyGuard] ⛔ Provider ${providerId} DISABLED: ${reason}`);
  }

  /**
   * Re-enable a previously disabled provider.
   */
  enableProvider(providerId: AIProviderId): void {
    this.state.disabledProviders.delete(providerId);
    this.saveState(); // Persist
    this.emit({ type: "PROVIDER_ENABLED", providerId });
    console.log(`[SafetyGuard] ✅ Provider ${providerId} ENABLED`);
  }

  /**
   * Check if a provider is disabled.
   */
  isProviderDisabled(providerId: AIProviderId): boolean {
    return this.state.disabledProviders.has(providerId);
  }

  /**
   * Freeze background scanning (stop all validation jobs).
   */
  freezeScanning(reason: string): void {
    this.state.scanningFrozen = true;
    this.saveState();
    this.emit({ type: "SCANNING_FROZEN", reason });
    console.warn(`[SafetyGuard] ❄️ Scanning FROZEN: ${reason}`);
  }

  /**
   * Resume background scanning.
   */
  resumeScanning(): void {
    this.state.scanningFrozen = false;
    this.saveState();
    this.emit({ type: "SCANNING_RESUMED" });
    console.log(`[SafetyGuard] ▶️ Scanning RESUMED`);
  }

  /**
   * Check if scanning is frozen.
   */
  isScanningFrozen(): boolean {
    return this.state.scanningFrozen;
  }

  /**
   * Force a specific fallback model for all requests.
   */
  setForcedFallback(model: string, provider?: AIProviderId): void {
    this.state.forcedFallbackModel = model;
    this.state.forcedFallbackProvider = provider || null;
    this.emit({ type: "FALLBACK_FORCED", model, provider });
    console.warn(
      `[SafetyGuard] 🎯 Forced fallback: ${model}${provider ? ` (${provider})` : ""}`,
    );
  }

  /**
   * Clear forced fallback.
   */
  clearForcedFallback(): void {
    this.state.forcedFallbackModel = null;
    this.state.forcedFallbackProvider = null;
    this.emit({ type: "FALLBACK_CLEARED" });
    console.log(`[SafetyGuard] Forced fallback CLEARED`);
  }

  /**
   * Get forced fallback if set.
   */
  getForcedFallback(): { model: string; provider?: AIProviderId } | null {
    if (this.state.forcedFallbackModel) {
      return {
        model: this.state.forcedFallbackModel,
        provider: this.state.forcedFallbackProvider || undefined,
      };
    }
    return null;
  }

  /**
   * Enable emergency mode - only use verified working models.
   */
  enableEmergencyMode(reason: string): void {
    this.state.emergencyMode = true;
    this.saveState();
    this.emit({ type: "EMERGENCY_MODE_ENABLED", reason });
    console.warn(`[SafetyGuard] 🚨 EMERGENCY MODE: ${reason}`);
  }

  /**
   * Disable emergency mode.
   */
  disableEmergencyMode(): void {
    this.state.emergencyMode = false;
    this.saveState();
    this.emit({ type: "EMERGENCY_MODE_DISABLED" });
    console.log(`[SafetyGuard] Emergency mode DISABLED`);
  }

  /**
   * Check if in emergency mode.
   */
  isEmergencyMode(): boolean {
    return this.state.emergencyMode;
  }

  // ============================================
  // PER-KEY CONTROLS
  // ============================================

  /**
   * Disable a specific key.
   */
  disableKey(keyId: string, reason: string): void {
    this.state.disabledKeys.add(keyId);
    this.saveState();
    this.emit({ type: "KEY_DISABLED", keyId, reason });
    console.warn(`[SafetyGuard] ⛔ Key ${keyId} DISABLED: ${reason}`);
  }

  /**
   * Enable a specific key.
   */
  enableKey(keyId: string): void {
    this.state.disabledKeys.delete(keyId);
    this.saveState();
    this.emit({ type: "KEY_ENABLED", keyId });
    console.log(`[SafetyGuard] ✅ Key ${keyId} ENABLED`);
  }

  /**
   * Check if a key is disabled.
   */
  isKeyDisabled(keyId: string): boolean {
    return this.state.disabledKeys.has(keyId);
  }

  // ============================================
  // CIRCUIT BREAKER
  // ============================================

  /**
   * Get the circuit breaker state for a key.
   */
  private getKeyCircuit(keyId: string): CircuitBreakerState {
    if (!this.state.keyCircuitBreakers.has(keyId)) {
      this.state.keyCircuitBreakers.set(keyId, this.createCircuitState());
    }
    return this.state.keyCircuitBreakers.get(keyId)!;
  }

  /**
   * Get the circuit breaker state for a provider.
   */
  private getProviderCircuit(providerId: AIProviderId): CircuitBreakerState {
    if (!this.state.providerCircuitBreakers.has(providerId)) {
      this.state.providerCircuitBreakers.set(
        providerId,
        this.createCircuitState(),
      );
    }
    return this.state.providerCircuitBreakers.get(providerId)!;
  }

  /**
   * Create a new circuit breaker state.
   */
  private createCircuitState(): CircuitBreakerState {
    return {
      state: "CLOSED",
      failures: 0,
      successes: 0,
      lastFailureAt: null,
      lastSuccessAt: null,
      openedAt: null,
      failureHistory: [],
    };
  }

  /**
   * Get config for a provider's circuit breaker.
   */
  private getCircuitConfig(providerId?: AIProviderId): CircuitBreakerConfig {
    if (providerId && PROVIDER_CIRCUIT_CONFIGS[providerId]) {
      return {
        ...DEFAULT_CIRCUIT_CONFIG,
        ...PROVIDER_CIRCUIT_CONFIGS[providerId],
      };
    }
    return DEFAULT_CIRCUIT_CONFIG;
  }

  /**
   * Record a failure for a key's circuit breaker.
   */
  recordKeyFailure(keyId: string, providerId?: AIProviderId): CircuitState {
    const circuit = this.getKeyCircuit(keyId);
    const config = this.getCircuitConfig(providerId);
    return this.recordFailure(circuit, config, `key:${keyId}`);
  }

  /**
   * Record a success for a key's circuit breaker.
   */
  recordKeySuccess(keyId: string): CircuitState {
    const circuit = this.getKeyCircuit(keyId);
    return this.recordSuccess(circuit, `key:${keyId}`);
  }

  /**
   * Check if a key's circuit is allowing requests.
   */
  isKeyCircuitOpen(keyId: string): boolean {
    const circuit = this.getKeyCircuit(keyId);
    return circuit.state === "OPEN";
  }

  /**
   * Get the current state of a key's circuit.
   */
  getKeyCircuitState(keyId: string): CircuitState {
    return this.getKeyCircuit(keyId).state;
  }

  /**
   * Record a failure for a provider's circuit breaker.
   */
  recordProviderFailure(providerId: AIProviderId): CircuitState {
    const circuit = this.getProviderCircuit(providerId);
    const config = this.getCircuitConfig(providerId);
    return this.recordFailure(circuit, config, `provider:${providerId}`);
  }

  /**
   * Record a success for a provider's circuit breaker.
   */
  recordProviderSuccess(providerId: AIProviderId): CircuitState {
    const circuit = this.getProviderCircuit(providerId);
    return this.recordSuccess(circuit, `provider:${providerId}`);
  }

  /**
   * Check if a provider's circuit is allowing requests.
   */
  isProviderCircuitOpen(providerId: AIProviderId): boolean {
    const circuit = this.getProviderCircuit(providerId);
    return circuit.state === "OPEN";
  }

  /**
   * Core failure recording logic.
   */
  private recordFailure(
    circuit: CircuitBreakerState,
    config: CircuitBreakerConfig,
    label: string,
  ): CircuitState {
    const result = this._recordFailureLogic(circuit, config, label);
    this.saveState();
    return result;
  }

  /**
   * Extracted logic for recordFailure to allow saveState wrapper.
   */
  private _recordFailureLogic(
    circuit: CircuitBreakerState,
    config: CircuitBreakerConfig,
    label: string,
  ): CircuitState {
    const now = Date.now();

    // If circuit is OPEN, check if cooldown has passed
    if (circuit.state === "OPEN") {
      if (circuit.openedAt && now - circuit.openedAt > config.cooldownMs) {
        // Move to HALF_OPEN to test recovery
        circuit.state = "HALF_OPEN";
        circuit.successes = 0;
        console.log(
          `[SafetyGuard] 🔄 Circuit ${label} -> HALF_OPEN (testing recovery)`,
        );
        this.emit({ type: "CIRCUIT_HALF_OPEN", label });
      }
      // Still record the failure
      circuit.failures++;
      circuit.lastFailureAt = now;
      return circuit.state;
    }

    // Clean up old failures outside the window
    circuit.failureHistory = circuit.failureHistory.filter(
      (ts) => now - ts < config.failureWindowMs,
    );

    // Add this failure
    circuit.failureHistory.push(now);
    circuit.failures++;
    circuit.lastFailureAt = now;

    // If HALF_OPEN and got a failure, trip back to OPEN
    if (circuit.state === "HALF_OPEN") {
      circuit.state = "OPEN";
      circuit.openedAt = now;
      console.warn(
        `[SafetyGuard] ⛔ Circuit ${label} -> OPEN (recovery failed)`,
      );
      this.emit({ type: "CIRCUIT_OPENED", label, reason: "Recovery failed" });
      return circuit.state;
    }

    // Check if we should trip the breaker
    if (circuit.failureHistory.length >= config.failureThreshold) {
      circuit.state = "OPEN";
      circuit.openedAt = now;
      console.warn(
        `[SafetyGuard] ⛔ Circuit ${label} -> OPEN (${config.failureThreshold} failures in ${config.failureWindowMs / 1000}s)`,
      );
      this.emit({
        type: "CIRCUIT_OPENED",
        label,
        reason: `${config.failureThreshold} failures`,
      });
    }

    return circuit.state;
  }

  /**
   * Core success recording logic.
   */
  private recordSuccess(
    circuit: CircuitBreakerState,
    label: string,
  ): CircuitState {
    const result = this._recordSuccessLogic(circuit, label);
    this.saveState();
    return result;
  }

  /**
   * Extracted logic for recordSuccess to allow saveState wrapper.
   */
  private _recordSuccessLogic(
    circuit: CircuitBreakerState,
    label: string,
  ): CircuitState {
    const now = Date.now();

    circuit.successes++;
    circuit.lastSuccessAt = now;

    // If HALF_OPEN and got enough successes, close the circuit
    if (circuit.state === "HALF_OPEN") {
      const config = DEFAULT_CIRCUIT_CONFIG;
      if (circuit.successes >= config.successThreshold) {
        circuit.state = "CLOSED";
        circuit.failures = 0;
        circuit.failureHistory = [];
        circuit.openedAt = null;
        console.log(`[SafetyGuard] ✅ Circuit ${label} -> CLOSED (recovered)`);
        this.emit({ type: "CIRCUIT_CLOSED", label });
      }
    } else if (circuit.state === "CLOSED") {
      // Reset failure count on success in normal mode
      circuit.failures = 0;
      circuit.failureHistory = [];
    }

    return circuit.state;
  }

  /**
   * Manually reset a key's circuit breaker.
   */
  resetKeyCircuit(keyId: string): void {
    this.state.keyCircuitBreakers.set(keyId, this.createCircuitState());
    this.saveState();
    console.log(`[SafetyGuard] 🔄 Circuit key:${keyId} RESET`);
    this.emit({ type: "CIRCUIT_RESET", label: `key:${keyId}` });
  }

  /**
   * Manually reset a provider's circuit breaker.
   */
  resetProviderCircuit(providerId: AIProviderId): void {
    this.state.providerCircuitBreakers.set(
      providerId,
      this.createCircuitState(),
    );
    this.saveState();
    console.log(`[SafetyGuard] 🔄 Circuit provider:${providerId} RESET`);
    this.emit({ type: "CIRCUIT_RESET", label: `provider:${providerId}` });
  }

  // ============================================
  // COMBINED CHECK
  // ============================================

  /**
   * Check if a request should be allowed (combines all safety checks).
   */
  shouldAllowRequest(
    keyId: string,
    providerId: AIProviderId,
  ): {
    allowed: boolean;
    reason?: string;
    fallback?: { model: string; provider?: AIProviderId };
  } {
    // Check forced fallback first
    const fallback = this.getForcedFallback();
    if (fallback) {
      return { allowed: true, fallback };
    }

    // Check provider disabled
    if (this.isProviderDisabled(providerId)) {
      return { allowed: false, reason: `Provider ${providerId} is disabled` };
    }

    // Check provider circuit breaker
    if (this.isProviderCircuitOpen(providerId)) {
      return {
        allowed: false,
        reason: `Provider ${providerId} circuit is OPEN`,
      };
    }

    // Check key disabled
    if (this.isKeyDisabled(keyId)) {
      return { allowed: false, reason: `Key ${keyId} is disabled` };
    }

    // Check key circuit breaker
    if (this.isKeyCircuitOpen(keyId)) {
      return { allowed: false, reason: `Key ${keyId} circuit is OPEN` };
    }

    return { allowed: true };
  }

  // ============================================
  // STATUS & EVENTS
  // ============================================

  /**
   * Get full safety status.
   */
  getStatus(): SafetyStatus {
    return {
      disabledProviders: Array.from(this.state.disabledProviders),
      scanningFrozen: this.state.scanningFrozen,
      forcedFallback: this.getForcedFallback(),
      emergencyMode: this.state.emergencyMode,
      disabledKeys: Array.from(this.state.disabledKeys),
      keyCircuits: Object.fromEntries(
        Array.from(this.state.keyCircuitBreakers.entries()).map(([k, v]) => [
          k,
          v.state,
        ]),
      ),
      providerCircuits: Object.fromEntries(
        Array.from(this.state.providerCircuitBreakers.entries()).map(
          ([k, v]) => [k, v.state],
        ),
      ),
    };
  }

  /**
   * Subscribe to safety events.
   */
  subscribe(listener: (event: SafetyEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: SafetyEvent): void {
    this.listeners.forEach((l) => l(event));
  }

  /**
   * Reset all safety state (for testing/debugging).
   */
  resetAll(): void {
    this.state = {
      disabledProviders: new Set(),
      scanningFrozen: false,
      forcedFallbackModel: null,
      forcedFallbackProvider: null,
      emergencyMode: false,
      disabledKeys: new Set(),
      keyCircuitBreakers: new Map(),
      providerCircuitBreakers: new Map(),
    };
    this.saveState();
    console.log(`[SafetyGuard] All safety state RESET`);
    this.emit({ type: "SAFETY_RESET" });
  }
}

// ============================================
// TYPES
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

// ============================================
// SINGLETON EXPORT
// ============================================

export const safetyGuard = new SafetyGuard();
export { SafetyGuard };
