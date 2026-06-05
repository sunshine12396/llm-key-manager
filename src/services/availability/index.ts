/**
 * Availability Module
 *
 * Exports for key-model availability management.
 */

// Core availability manager
export {
  availabilityManager,
  KeyModelAvailabilityManager,
} from "./availability.manager";

// Provider models
export { getCandidateModels } from "./provider-models";

// State machine
export {
  ModelStateMachine,
} from "./state-machine";
export type {
  ModelState,
  TransitionEvent,
  TransitionResult,
  StateContext,
} from "./state-machine";

// Retry strategy
export {
  calculateRetry,
  calculateQuotaRetry,
  classifyError,
  getStrategySummary,
} from "./retry-strategy";
export type { ErrorCategory, RetryDecision } from "./retry-strategy";

// In-memory cache (NEW)
export { availabilityCache, AvailabilityCache } from "./availability.cache";
export type { CachedModelState, KeyModelPair } from "./availability.cache";

// Fast key resolver (NEW)
export { keyResolver, KeyResolver } from "./key-resolver";
export type { ResolvedKey, ResolveOptions } from "./key-resolver";
