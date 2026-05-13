import { AIProviderId } from "../../models/metadata/provider-metadata";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
  successThreshold: number;
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

export type SafetyEventType =
  | "PROVIDER_DISABLED"
  | "PROVIDER_ENABLED"
  | "KEY_DISABLED"
  | "KEY_ENABLED"
  | "SCANNING_FROZEN"
  | "SCANNING_RESUMED"
  | "FALLBACK_FORCED"
  | "FALLBACK_CLEARED"
  | "EMERGENCY_MODE_ENABLED"
  | "EMERGENCY_MODE_DISABLED"
  | "CIRCUIT_OPENED"
  | "CIRCUIT_HALF_OPEN"
  | "CIRCUIT_CLOSED"
  | "CIRCUIT_RESET"
  | "SAFETY_RESET";

export interface SafetyEvent {
  type: SafetyEventType;
  providerId?: AIProviderId;
  keyId?: string;
  reason?: string;
  label?: string;
  model?: string | null;
  provider?: AIProviderId | null;
}

export type SafetyEventListener = (event: SafetyEvent) => void;

export interface GlobalSafetyState {
  disabledProviders: Set<AIProviderId>;
  scanningFrozen: boolean;
  forcedFallbackModel: string | null;
  forcedFallbackProvider: AIProviderId | null;
  emergencyMode: boolean;
  disabledKeys: Set<string>;
}

export interface SafetyStatus {
  disabledProviders: AIProviderId[];
  scanningFrozen: boolean;
  forcedFallback: { model: string; provider?: AIProviderId } | null;
  emergencyMode: boolean;
  disabledKeys: string[];
  keyCircuits: Record<string, CircuitState>;
  providerCircuits: Record<string, CircuitState>;
}
