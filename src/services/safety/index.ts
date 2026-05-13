/**
 * Safety Module Index
 *
 * Re-exports all safety-related functionality from consolidated modules.
 */

// Main facade
export { safetyGuard, SafetyGuard } from "./safety-guard";

// Types
export type {
  SafetyEvent,
  SafetyEventType,
  SafetyEventListener,
  SafetyStatus,
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerState,
  GlobalSafetyState,
} from "./types";

// Circuit breaker
export { CircuitBreaker, circuitBreaker, DEFAULT_CIRCUIT_CONFIG } from "./circuit-breaker";
