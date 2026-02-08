/**
 * Safety Guard Module (Facade)
 *
 * Provides a unified interface for all safety-related functionality.
 * Delegates to specialized modules for specific operations.
 *
 * Features:
 * - Global provider disable
 * - Freeze background scanning
 * - Force fallback models
 * - Per-key circuit breaker with auto-recovery
 */

import type { AIProviderId } from "../../models/types";
import {
  SafetyEventEmitter,
  type SafetyEvent,
  type SafetyStatus,
  type CircuitState,
} from "./safety-events";
import { CircuitBreaker, circuitBreaker } from "./circuit-breaker";
import { SafetyControls, safetyControls } from "./safety-controls";
import { persistSafetyState, loadSafetyState } from "./safety-persistence";

// ============================================
// SAFETY GUARD FACADE
// ============================================

class SafetyGuard {
  private eventEmitter = new SafetyEventEmitter();
  private controls: SafetyControls;
  private breaker: CircuitBreaker;

  constructor(
    controls: SafetyControls = safetyControls,
    breaker: CircuitBreaker = circuitBreaker,
  ) {
    this.controls = controls;
    this.breaker = breaker;
    this.loadState();
  }

  private loadState(): void {
    loadSafetyState(this.controls, this.breaker);
  }

  private saveState(): void {
    persistSafetyState(this.controls, this.breaker);
  }

  private emit(event: SafetyEvent): void {
    this.eventEmitter.emit(event);
    this.saveState();
  }

  // ============================================
  // PROVIDER CONTROLS
  // ============================================

  disableProvider(providerId: AIProviderId, reason: string): void {
    this.controls.disableProvider(providerId, reason, (e) => this.emit(e));
  }

  enableProvider(providerId: AIProviderId): void {
    this.controls.enableProvider(providerId, (e) => this.emit(e));
  }

  isProviderDisabled(providerId: AIProviderId): boolean {
    return this.controls.isProviderDisabled(providerId);
  }

  // ============================================
  // KEY CONTROLS
  // ============================================

  disableKey(keyId: string, reason: string): void {
    this.controls.disableKey(keyId, reason, (e) => this.emit(e));
  }

  enableKey(keyId: string): void {
    this.controls.enableKey(keyId, (e) => this.emit(e));
  }

  isKeyDisabled(keyId: string): boolean {
    return this.controls.isKeyDisabled(keyId);
  }

  // ============================================
  // SCANNING CONTROLS
  // ============================================

  freezeScanning(reason: string): void {
    this.controls.freezeScanning(reason, (e) => this.emit(e));
  }

  resumeScanning(): void {
    this.controls.resumeScanning((e) => this.emit(e));
  }

  isScanningFrozen(): boolean {
    return this.controls.isScanningFrozen();
  }

  // ============================================
  // FALLBACK CONTROLS
  // ============================================

  setForcedFallback(model: string, provider?: AIProviderId): void {
    this.controls.setForcedFallback(model, provider, (e) => this.emit(e));
  }

  clearForcedFallback(): void {
    this.controls.clearForcedFallback((e) => this.emit(e));
  }

  getForcedFallback(): { model: string; provider?: AIProviderId } | null {
    return this.controls.getForcedFallback();
  }

  // ============================================
  // EMERGENCY MODE
  // ============================================

  enableEmergencyMode(reason: string): void {
    this.controls.enableEmergencyMode(reason, (e) => this.emit(e));
  }

  disableEmergencyMode(): void {
    this.controls.disableEmergencyMode((e) => this.emit(e));
  }

  isEmergencyMode(): boolean {
    return this.controls.isEmergencyMode();
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

  isKeyCircuitOpen(keyId: string): boolean {
    return this.breaker.isKeyCircuitOpen(keyId);
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

    if (this.isKeyCircuitOpen(keyId)) {
      return { allowed: false, reason: `Key ${keyId} circuit is OPEN` };
    }

    return { allowed: true };
  }

  // ============================================
  // STATUS & EVENTS
  // ============================================

  getStatus(): SafetyStatus {
    const snapshot = this.controls.getSnapshot();
    return {
      disabledProviders: snapshot.disabledProviders,
      scanningFrozen: snapshot.scanningFrozen,
      forcedFallback: this.getForcedFallback(),
      emergencyMode: snapshot.emergencyMode,
      disabledKeys: snapshot.disabledKeys,
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
    this.controls.reset((e) => this.emit(e));
    this.breaker.clear();
    this.saveState();
    console.log(`[SafetyGuard] All safety state RESET`);
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const safetyGuard = new SafetyGuard();
export { SafetyGuard };
