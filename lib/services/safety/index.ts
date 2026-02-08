/**
 * Safety Module Index
 *
 * Re-exports all safety-related functionality.
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
} from "./safety-events";
export { SafetyEventEmitter } from "./safety-events";

// Circuit breaker
export { CircuitBreaker, circuitBreaker } from "./circuit-breaker";

// Controls
export { SafetyControls, safetyControls } from "./safety-controls";

// Persistence
export {
  persistSafetyState,
  loadSafetyState,
  clearPersistedState,
} from "./safety-persistence";
