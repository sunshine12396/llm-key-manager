/**
 * Availability Module
 * 
 * Exports for key-model availability management.
 */

export { availabilityManager, KeyModelAvailabilityManager } from './availability.manager';
export { getCandidateModels, getKnownProviders } from './provider-models';
export { 
    ModelStateMachine, 
    migrateOldStatus, 
    toDisplayStatus 
} from './state-machine';
export type { ModelState, TransitionEvent, TransitionResult, StateContext } from './state-machine';
export {
    calculateRetry,
    calculateQuotaRetry,
    classifyError,
    getStrategySummary,
    getAllStrategySummaries,
} from './retry-strategy';
export type { ErrorCategory, RetryDecision } from './retry-strategy';
export { safetyGuard, SafetyGuard } from './safety-guard';
export type { SafetyStatus, SafetyEvent, CircuitState } from './safety-guard';
