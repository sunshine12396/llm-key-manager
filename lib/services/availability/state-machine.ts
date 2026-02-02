/**
 * Model Availability State Machine
 * 
 * Defines valid states and transitions for (key, model) availability.
 * Both background jobs and runtime error handlers MUST use this
 * to ensure consistent state management.
 * 
 * State Diagram:
 * 
 *   NEW ──────────────────────────────────────┐
 *    │                                        │
 *    ▼                                        │
 *   CHECKING ─────────────────────────────────┤
 *    │         │         │                    │
 *    │ success │ temp    │ perm               │
 *    ▼         ▼         ▼                    │
 *   AVAILABLE  TEMP_FAILED  PERM_FAILED       │
 *    │            │                           │
 *    │ error      │ cooldown elapsed          │
 *    ▼            ▼                           │
 *   TEMP_FAILED  COOLDOWN ────────────────────┘
 *                   │
 *                   │ retry triggered
 *                   ▼
 *                 CHECKING
 */

// ============================================
// STATE DEFINITIONS
// ============================================

/**
 * All possible states for a (key, model) pair.
 */
export type ModelState =
    | 'NEW'           // Just added, never checked
    | 'CHECKING'      // Currently being validated
    | 'AVAILABLE'     // Working, can be used for requests
    | 'TEMP_FAILED'   // Temporarily failed (rate limit, server error)
    | 'COOLDOWN'      // Waiting for retry timer
    | 'PERM_FAILED';  // Permanently failed (auth error, not found)

/**
 * Events that trigger state transitions.
 */
export type TransitionEvent =
    | 'START_CHECK'       // Begin validation
    | 'CHECK_SUCCESS'     // Validation passed
    | 'CHECK_TEMP_FAIL'   // Temporary failure (429, 5xx, network)
    | 'CHECK_PERM_FAIL'   // Permanent failure (401, 403, 404)
    | 'RUNTIME_SUCCESS'   // Request succeeded at runtime
    | 'RUNTIME_TEMP_FAIL' // Request failed temporarily at runtime
    | 'RUNTIME_PERM_FAIL' // Request failed permanently at runtime
    | 'ENTER_COOLDOWN'    // Enter cooldown period
    | 'COOLDOWN_ELAPSED'  // Cooldown period ended, ready to retry
    | 'RESET';            // Force reset to CHECKING

// ============================================
// TRANSITION TABLE
// ============================================

/**
 * Valid state transitions.
 * Key: current state
 * Value: Map of event -> next state
 */
const TRANSITIONS: Record<ModelState, Partial<Record<TransitionEvent, ModelState>>> = {
    NEW: {
        START_CHECK: 'CHECKING',
    },
    CHECKING: {
        CHECK_SUCCESS: 'AVAILABLE',
        CHECK_TEMP_FAIL: 'TEMP_FAILED',
        CHECK_PERM_FAIL: 'PERM_FAILED',
    },
    AVAILABLE: {
        RUNTIME_SUCCESS: 'AVAILABLE',      // Stay available
        RUNTIME_TEMP_FAIL: 'TEMP_FAILED',
        RUNTIME_PERM_FAIL: 'PERM_FAILED',
        START_CHECK: 'CHECKING',           // Re-validation
    },
    TEMP_FAILED: {
        ENTER_COOLDOWN: 'COOLDOWN',
        START_CHECK: 'CHECKING',           // Immediate retry
        RESET: 'CHECKING',
    },
    COOLDOWN: {
        COOLDOWN_ELAPSED: 'CHECKING',
        RESET: 'CHECKING',
    },
    PERM_FAILED: {
        RESET: 'CHECKING',                 // Only manual reset allowed
    },
};

// ============================================
// STATE MACHINE CLASS
// ============================================

export interface TransitionResult {
    success: boolean;
    previousState: ModelState;
    newState: ModelState;
    event: TransitionEvent;
    error?: string;
}

export interface StateContext {
    modelId: string;
    keyId: string;
    retryCount: number;
    lastErrorCode?: number;
    errorMessage?: string;
}

/**
 * Model Availability State Machine
 * 
 * Provides a single source of truth for state transitions.
 * All components (background job, runtime handler, UI) should use this.
 */
export class ModelStateMachine {

    /**
     * Attempt to transition from currentState via event.
     * Returns the result with success/failure and new state.
     */
    static transition(
        currentState: ModelState,
        event: TransitionEvent,
        context?: StateContext
    ): TransitionResult {
        const validTransitions = TRANSITIONS[currentState];
        const nextState = validTransitions?.[event];

        if (!nextState) {
            return {
                success: false,
                previousState: currentState,
                newState: currentState, // No change
                event,
                error: `Invalid transition: ${currentState} --[${event}]--> ? (not allowed)`
            };
        }

        // Log transition for debugging
        if (context) {
            console.log(
                `[StateMachine] ${context.keyId}/${context.modelId}: ` +
                `${currentState} --[${event}]--> ${nextState}`
            );
        }

        return {
            success: true,
            previousState: currentState,
            newState: nextState,
            event
        };
    }

    /**
     * Check if a transition is valid without executing it.
     */
    static canTransition(currentState: ModelState, event: TransitionEvent): boolean {
        return TRANSITIONS[currentState]?.[event] !== undefined;
    }

    /**
     * Get all valid events for a given state.
     */
    static getValidEvents(state: ModelState): TransitionEvent[] {
        const transitions = TRANSITIONS[state];
        return Object.keys(transitions || {}) as TransitionEvent[];
    }

    /**
     * Determine the appropriate event based on error code.
     * Centralizes the error classification logic.
     */
    static classifyError(errorCode: number | undefined): 'TEMP' | 'PERM' | 'UNKNOWN' {
        if (!errorCode) return 'UNKNOWN';

        // Permanent failures
        if (errorCode === 401 || errorCode === 403 || errorCode === 404) {
            return 'PERM';
        }

        // Temporary failures
        if (errorCode === 429 || errorCode >= 500) {
            return 'TEMP';
        }

        // Other 4xx errors might be permanent
        if (errorCode >= 400 && errorCode < 500) {
            return 'PERM';
        }

        return 'UNKNOWN';
    }

    /**
     * Convert error classification to appropriate transition event.
     */
    static getEventForError(
        errorCode: number | undefined,
        isRuntime: boolean
    ): TransitionEvent {
        const classification = this.classifyError(errorCode);

        if (isRuntime) {
            switch (classification) {
                case 'PERM': return 'RUNTIME_PERM_FAIL';
                case 'TEMP': return 'RUNTIME_TEMP_FAIL';
                default: return 'RUNTIME_TEMP_FAIL'; // Default to temp for unknown
            }
        } else {
            switch (classification) {
                case 'PERM': return 'CHECK_PERM_FAIL';
                case 'TEMP': return 'CHECK_TEMP_FAIL';
                default: return 'CHECK_TEMP_FAIL';
            }
        }
    }

    /**
     * Check if a state is considered "usable" for requests.
     * Including 'NEW' allows for optimistic on-demand discovery.
     */
    static isUsable(state: ModelState): boolean {
        return state === 'AVAILABLE' || state === 'NEW';
    }

    /**
     * Check if a state allows retry.
     */
    static canRetry(state: ModelState): boolean {
        return state === 'TEMP_FAILED' || state === 'COOLDOWN' || state === 'PERM_FAILED';
    }

    /**
     * Check if a state is terminal (no automatic recovery).
     */
    static isTerminal(state: ModelState): boolean {
        return state === 'PERM_FAILED';
    }

    /**
     * Get human-readable description of a state.
     */
    static getStateDescription(state: ModelState): string {
        switch (state) {
            case 'NEW': return 'Newly added, pending validation';
            case 'CHECKING': return 'Currently being validated';
            case 'AVAILABLE': return 'Working and ready for use';
            case 'TEMP_FAILED': return 'Temporarily unavailable';
            case 'COOLDOWN': return 'Waiting for retry';
            case 'PERM_FAILED': return 'Permanently failed';
        }
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Map old status strings to new ModelState.
 * Used for migration/compatibility.
 */
export function migrateOldStatus(oldStatus: string): ModelState {
    switch (oldStatus) {
        case 'available': return 'AVAILABLE';
        case 'temporary_failed': return 'TEMP_FAILED';
        case 'permanently_failed': return 'PERM_FAILED';
        case 'unknown': return 'NEW';
        default: return 'NEW';
    }
}

/**
 * Map new ModelState to display-friendly status.
 */
export function toDisplayStatus(state: ModelState): string {
    switch (state) {
        case 'NEW': return 'new';
        case 'CHECKING': return 'checking';
        case 'AVAILABLE': return 'available';
        case 'TEMP_FAILED': return 'temp_failed';
        case 'COOLDOWN': return 'cooldown';
        case 'PERM_FAILED': return 'perm_failed';
    }
}
