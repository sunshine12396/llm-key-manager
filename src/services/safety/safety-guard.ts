/**
 * Safety Guard Module
 *
 * Provides a unified interface for all safety-related functionality.
 * Controls provider/key status, circuit breakers, and emergency overrides.
 *
 * Features:
 * - Global provider disable
 * - Freeze background scanning
 * - Force fallback models
 * - Per-key and per-provider circuit breakers with auto-recovery
 * - LocalStorage persistence
 */

import type { AIProviderId } from "../../models/types";
import {
  SafetyEvent,
  SafetyEventListener,
  SafetyStatus,
  CircuitState,
  GlobalSafetyState,
  CircuitBreakerState,
} from "./types";
import { CircuitBreaker, circuitBreaker } from "./circuit-breaker";

// ============================================
// INTERNAL EMITTER
// ============================================

class SafetyEventEmitter {
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
}

// ============================================
// PERSISTENCE CONSTANTS
// ============================================

const STORAGE_KEY = "llm_safety_guard_state_v2";

interface PersistedState {
  version: number;
  disabledProviders: AIProviderId[];
  scanningFrozen: boolean;
  emergencyMode: boolean;
  disabledKeys: string[];
  forcedFallbackModel?: string | null;
  forcedFallbackProvider?: AIProviderId | null;
  keyCircuitBreakers: Array<[string, CircuitBreakerState]>;
  providerCircuitBreakers: Array<[AIProviderId, CircuitBreakerState]>;
}

// ============================================
// MAIN SAFETY GUARD
// ============================================

class SafetyGuard {
  private eventEmitter = new SafetyEventEmitter();
  private breaker: CircuitBreaker;
  private state: GlobalSafetyState = {
    disabledProviders: new Set(),
    scanningFrozen: false,
    forcedFallbackModel: null,
    forcedFallbackProvider: null,
    emergencyMode: false,
    disabledKeys: new Set(),
  };

  constructor(breaker: CircuitBreaker = circuitBreaker) {
    this.breaker = breaker;
    this.loadState();
  }

  // ============================================
  // PERSISTENCE
  // ============================================

  private loadState(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const data: PersistedState = JSON.parse(raw);
      if (data.disabledProviders)
        this.state.disabledProviders = new Set(data.disabledProviders);
      if (data.scanningFrozen !== undefined)
        this.state.scanningFrozen = data.scanningFrozen;
      if (data.emergencyMode !== undefined)
        this.state.emergencyMode = data.emergencyMode;
      if (data.disabledKeys)
        this.state.disabledKeys = new Set(data.disabledKeys);
      if (data.forcedFallbackModel !== undefined)
        this.state.forcedFallbackModel = data.forcedFallbackModel;
      if (data.forcedFallbackProvider !== undefined)
        this.state.forcedFallbackProvider = data.forcedFallbackProvider;

      if (Array.isArray(data.keyCircuitBreakers)) {
        this.breaker.restoreKeyCircuits(data.keyCircuitBreakers);
      }
      if (Array.isArray(data.providerCircuitBreakers)) {
        this.breaker.restoreProviderCircuits(data.providerCircuitBreakers);
      }
      console.log("[SafetyGuard] State restored from storage");
    } catch (e) {
      console.warn("[SafetyGuard] Failed to load state:", e);
    }
  }

  private saveState(): void {
    if (typeof window === "undefined") return;
    try {
      const state: PersistedState = {
        version: 2,
        disabledProviders: Array.from(this.state.disabledProviders),
        scanningFrozen: this.state.scanningFrozen,
        emergencyMode: this.state.emergencyMode,
        disabledKeys: Array.from(this.state.disabledKeys),
        forcedFallbackModel: this.state.forcedFallbackModel,
        forcedFallbackProvider: this.state.forcedFallbackProvider,
        keyCircuitBreakers: this.breaker.getKeyCircuitsSnapshot(),
        providerCircuitBreakers: this.breaker.getProviderCircuitsSnapshot(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("[SafetyGuard] Failed to save state:", e);
    }
  }

  private emit(event: SafetyEvent): void {
    this.eventEmitter.emit(event);
    this.saveState();
  }

  // ============================================
  // PROVIDER CONTROLS
  // ============================================

  disableProvider(providerId: AIProviderId, reason: string): void {
    this.state.disabledProviders.add(providerId);
    console.warn(`[SafetyGuard] ⛔ Provider ${providerId} DISABLED: ${reason}`);
    this.emit({ type: "PROVIDER_DISABLED", providerId, reason });
  }

  enableProvider(providerId: AIProviderId): void {
    this.state.disabledProviders.delete(providerId);
    console.log(`[SafetyGuard] ✅ Provider ${providerId} ENABLED`);
    this.emit({ type: "PROVIDER_ENABLED", providerId });
  }

  isProviderDisabled(providerId: AIProviderId): boolean {
    return this.state.disabledProviders.has(providerId);
  }

  // ============================================
  // KEY CONTROLS
  // ============================================

  disableKey(keyId: string, reason: string): void {
    this.state.disabledKeys.add(keyId);
    console.warn(`[SafetyGuard] ⛔ Key ${keyId} DISABLED: ${reason}`);
    this.emit({ type: "KEY_DISABLED", keyId, reason });
  }

  enableKey(keyId: string): void {
    this.state.disabledKeys.delete(keyId);
    console.log(`[SafetyGuard] ✅ Key ${keyId} ENABLED`);
    this.emit({ type: "KEY_ENABLED", keyId });
  }

  isKeyDisabled(keyId: string): boolean {
    return this.state.disabledKeys.has(keyId);
  }

  // ============================================
  // SCANNING CONTROLS
  // ============================================

  freezeScanning(reason: string): void {
    this.state.scanningFrozen = true;
    console.warn(`[SafetyGuard] ❄️ Scanning FROZEN: ${reason}`);
    this.emit({ type: "SCANNING_FROZEN", reason });
  }

  resumeScanning(): void {
    this.state.scanningFrozen = false;
    console.log(`[SafetyGuard] ▶️ Scanning RESUMED`);
    this.emit({ type: "SCANNING_RESUMED" });
  }

  isScanningFrozen(): boolean {
    return this.state.scanningFrozen;
  }

  // ============================================
  // FALLBACK CONTROLS
  // ============================================

  setForcedFallback(model: string, provider?: AIProviderId): void {
    this.state.forcedFallbackModel = model;
    this.state.forcedFallbackProvider = provider || null;
    console.warn(
      `[SafetyGuard] 🎯 Forced fallback: ${model}${provider ? ` (${provider})` : ""}`,
    );
    this.emit({ type: "FALLBACK_FORCED", model, provider });
  }

  clearForcedFallback(): void {
    this.state.forcedFallbackModel = null;
    this.state.forcedFallbackProvider = null;
    console.log(`[SafetyGuard] Forced fallback CLEARED`);
    this.emit({ type: "FALLBACK_CLEARED" });
  }

  getForcedFallback(): { model: string; provider?: AIProviderId } | null {
    if (this.state.forcedFallbackModel) {
      return {
        model: this.state.forcedFallbackModel,
        provider: this.state.forcedFallbackProvider || undefined,
      };
    }
    return null;
  }

  // ============================================
  // EMERGENCY MODE
  // ============================================

  enableEmergencyMode(reason: string): void {
    this.state.emergencyMode = true;
    console.warn(`[SafetyGuard] 🚨 EMERGENCY MODE: ${reason}`);
    this.emit({ type: "EMERGENCY_MODE_ENABLED", reason });
  }

  disableEmergencyMode(): void {
    this.state.emergencyMode = false;
    console.log(`[SafetyGuard] Emergency mode DISABLED`);
    this.emit({ type: "EMERGENCY_MODE_DISABLED" });
  }

  isEmergencyMode(): boolean {
    return this.state.emergencyMode;
  }

  // ============================================
  // CIRCUIT BREAKER - KEYS
  // ============================================

  recordKeyFailure(keyId: string, providerId?: AIProviderId): CircuitState {
    const result = this.breaker.recordKeyFailure(keyId, providerId, (e) =>
      this.emit(e),
    );
    this.saveState();
    return result;
  }

  recordKeySuccess(keyId: string): CircuitState {
    const result = this.breaker.recordKeySuccess(keyId, (e) => this.emit(e));
    this.saveState();
    return result;
  }

  isKeyCircuitOpen(keyId: string, providerId?: AIProviderId): boolean {
    return this.breaker.isKeyCircuitOpen(keyId, providerId);
  }

  getKeyCircuitState(keyId: string): CircuitState {
    return this.breaker.getKeyCircuitState(keyId);
  }

  resetKeyCircuit(keyId: string): void {
    this.breaker.resetKeyCircuit(keyId, (e) => this.emit(e));
    this.saveState();
  }

  // ============================================
  // CIRCUIT BREAKER - PROVIDERS
  // ============================================

  recordProviderFailure(providerId: AIProviderId): CircuitState {
    const result = this.breaker.recordProviderFailure(providerId, (e) =>
      this.emit(e),
    );
    this.saveState();
    return result;
  }

  recordProviderSuccess(providerId: AIProviderId): CircuitState {
    const result = this.breaker.recordProviderSuccess(providerId, (e) =>
      this.emit(e),
    );
    this.saveState();
    return result;
  }

  isProviderCircuitOpen(providerId: AIProviderId): boolean {
    return this.breaker.isProviderCircuitOpen(providerId);
  }

  resetProviderCircuit(providerId: AIProviderId): void {
    this.breaker.resetProviderCircuit(providerId, (e) => this.emit(e));
    this.saveState();
  }

  // ============================================
  // COMBINED CHECK
  // ============================================

  shouldAllowRequest(
    keyId: string,
    providerId: AIProviderId,
  ): {
    allowed: boolean;
    reason?: string;
    fallback?: { model: string; provider?: AIProviderId };
  } {
    const fallback = this.getForcedFallback();
    if (fallback) {
      return { allowed: true, fallback };
    }

    if (this.isProviderDisabled(providerId)) {
      return { allowed: false, reason: `Provider ${providerId} is disabled` };
    }

    if (this.isProviderCircuitOpen(providerId)) {
      return {
        allowed: false,
        reason: `Provider ${providerId} circuit is OPEN`,
      };
    }

    if (this.isKeyDisabled(keyId)) {
      return { allowed: false, reason: `Key ${keyId} is disabled` };
    }

    if (this.isKeyCircuitOpen(keyId, providerId)) {
      return { allowed: false, reason: `Key ${keyId} circuit is OPEN` };
    }

    return { allowed: true };
  }

  // ============================================
  // STATUS & EVENTS
  // ============================================

  getStatus(): SafetyStatus {
    return {
      disabledProviders: Array.from(this.state.disabledProviders),
      scanningFrozen: this.state.scanningFrozen,
      forcedFallback: this.getForcedFallback(),
      emergencyMode: this.state.emergencyMode,
      disabledKeys: Array.from(this.state.disabledKeys),
      keyCircuits: Object.fromEntries(
        this.breaker.getKeyCircuitsSnapshot().map(([k, v]) => [k, v.state]),
      ),
      providerCircuits: Object.fromEntries(
        this.breaker
          .getProviderCircuitsSnapshot()
          .map(([k, v]) => [k, v.state]),
      ),
    };
  }

  subscribe(listener: (event: SafetyEvent) => void): () => void {
    return this.eventEmitter.subscribe(listener);
  }

  resetAll(): void {
    this.state = {
      disabledProviders: new Set(),
      scanningFrozen: false,
      forcedFallbackModel: null,
      forcedFallbackProvider: null,
      emergencyMode: false,
      disabledKeys: new Set(),
    };
    this.breaker.clear();
    this.saveState();
    this.emit({ type: "SAFETY_RESET" });
    console.log(`[SafetyGuard] All safety state RESET`);
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const safetyGuard = new SafetyGuard();
export { SafetyGuard };
