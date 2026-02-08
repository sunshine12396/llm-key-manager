/**
 * Safety Controls Module
 *
 * Provides global controls for providers, keys, and emergency modes.
 * These are manual overrides that take precedence over automatic systems.
 */

import type { AIProviderId } from "../../models/types";
import type { SafetyEvent } from "./safety-events";

// ============================================
// GLOBAL STATE
// ============================================

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

// ============================================
// SAFETY CONTROLS CLASS
// ============================================

export class SafetyControls {
  private state: GlobalSafetyState = {
    disabledProviders: new Set(),
    scanningFrozen: false,
    forcedFallbackModel: null,
    forcedFallbackProvider: null,
    emergencyMode: false,
    disabledKeys: new Set(),
  };

  // ============================================
  // PROVIDER CONTROLS
  // ============================================

  disableProvider(
    providerId: AIProviderId,
    reason: string,
    emitFn?: (event: SafetyEvent) => void,
  ): void {
    this.state.disabledProviders.add(providerId);
    console.warn(
      `[SafetyControls] ⛔ Provider ${providerId} DISABLED: ${reason}`,
    );
    emitFn?.({ type: "PROVIDER_DISABLED", providerId, reason });
  }

  enableProvider(
    providerId: AIProviderId,
    emitFn?: (event: SafetyEvent) => void,
  ): void {
    this.state.disabledProviders.delete(providerId);
    console.log(`[SafetyControls] ✅ Provider ${providerId} ENABLED`);
    emitFn?.({ type: "PROVIDER_ENABLED", providerId });
  }

  isProviderDisabled(providerId: AIProviderId): boolean {
    return this.state.disabledProviders.has(providerId);
  }

  getDisabledProviders(): AIProviderId[] {
    return Array.from(this.state.disabledProviders);
  }

  // ============================================
  // KEY CONTROLS
  // ============================================

  disableKey(
    keyId: string,
    reason: string,
    emitFn?: (event: SafetyEvent) => void,
  ): void {
    this.state.disabledKeys.add(keyId);
    console.warn(`[SafetyControls] ⛔ Key ${keyId} DISABLED: ${reason}`);
    emitFn?.({ type: "KEY_DISABLED", keyId, reason });
  }

  enableKey(keyId: string, emitFn?: (event: SafetyEvent) => void): void {
    this.state.disabledKeys.delete(keyId);
    console.log(`[SafetyControls] ✅ Key ${keyId} ENABLED`);
    emitFn?.({ type: "KEY_ENABLED", keyId });
  }

  isKeyDisabled(keyId: string): boolean {
    return this.state.disabledKeys.has(keyId);
  }

  getDisabledKeys(): string[] {
    return Array.from(this.state.disabledKeys);
  }

  // ============================================
  // SCANNING CONTROLS
  // ============================================

  freezeScanning(reason: string, emitFn?: (event: SafetyEvent) => void): void {
    this.state.scanningFrozen = true;
    console.warn(`[SafetyControls] ❄️ Scanning FROZEN: ${reason}`);
    emitFn?.({ type: "SCANNING_FROZEN", reason });
  }

  resumeScanning(emitFn?: (event: SafetyEvent) => void): void {
    this.state.scanningFrozen = false;
    console.log(`[SafetyControls] ▶️ Scanning RESUMED`);
    emitFn?.({ type: "SCANNING_RESUMED" });
  }

  isScanningFrozen(): boolean {
    return this.state.scanningFrozen;
  }

  // ============================================
  // FALLBACK CONTROLS
  // ============================================

  setForcedFallback(
    model: string,
    provider?: AIProviderId,
    emitFn?: (event: SafetyEvent) => void,
  ): void {
    this.state.forcedFallbackModel = model;
    this.state.forcedFallbackProvider = provider || null;
    console.warn(
      `[SafetyControls] 🎯 Forced fallback: ${model}${provider ? ` (${provider})` : ""}`,
    );
    emitFn?.({ type: "FALLBACK_FORCED", model, provider });
  }

  clearForcedFallback(emitFn?: (event: SafetyEvent) => void): void {
    this.state.forcedFallbackModel = null;
    this.state.forcedFallbackProvider = null;
    console.log(`[SafetyControls] Forced fallback CLEARED`);
    emitFn?.({ type: "FALLBACK_CLEARED" });
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

  enableEmergencyMode(
    reason: string,
    emitFn?: (event: SafetyEvent) => void,
  ): void {
    this.state.emergencyMode = true;
    console.warn(`[SafetyControls] 🚨 EMERGENCY MODE: ${reason}`);
    emitFn?.({ type: "EMERGENCY_MODE_ENABLED", reason });
  }

  disableEmergencyMode(emitFn?: (event: SafetyEvent) => void): void {
    this.state.emergencyMode = false;
    console.log(`[SafetyControls] Emergency mode DISABLED`);
    emitFn?.({ type: "EMERGENCY_MODE_DISABLED" });
  }

  isEmergencyMode(): boolean {
    return this.state.emergencyMode;
  }

  // ============================================
  // SERIALIZATION
  // ============================================

  getSnapshot(): {
    disabledProviders: AIProviderId[];
    scanningFrozen: boolean;
    emergencyMode: boolean;
    disabledKeys: string[];
  } {
    return {
      disabledProviders: Array.from(this.state.disabledProviders),
      scanningFrozen: this.state.scanningFrozen,
      emergencyMode: this.state.emergencyMode,
      disabledKeys: Array.from(this.state.disabledKeys),
    };
  }

  restore(data: {
    disabledProviders?: AIProviderId[];
    scanningFrozen?: boolean;
    emergencyMode?: boolean;
    disabledKeys?: string[];
  }): void {
    if (data.disabledProviders) {
      this.state.disabledProviders = new Set(data.disabledProviders);
    }
    if (data.scanningFrozen !== undefined) {
      this.state.scanningFrozen = data.scanningFrozen;
    }
    if (data.emergencyMode !== undefined) {
      this.state.emergencyMode = data.emergencyMode;
    }
    if (data.disabledKeys) {
      this.state.disabledKeys = new Set(data.disabledKeys);
    }
  }

  reset(emitFn?: (event: SafetyEvent) => void): void {
    this.state = {
      disabledProviders: new Set(),
      scanningFrozen: false,
      forcedFallbackModel: null,
      forcedFallbackProvider: null,
      emergencyMode: false,
      disabledKeys: new Set(),
    };
    console.log(`[SafetyControls] All controls RESET`);
    emitFn?.({ type: "SAFETY_RESET" });
  }
}

// Singleton instance
export const safetyControls = new SafetyControls();
