# Feature 4: Resilience & Failover

> **Phase:** 4 (Resilience) · **Status:** ✅ Complete

## Purpose

Ensure that no single key failure, rate limit, or provider outage interrupts the user. The system automatically retries, rotates keys, and falls back to alternative models — all transparently.

## Resilient Request Handler

The `ResilientRequestHandler` is the execution engine for non-chat capabilities (embeddings, image gen, TTS, transcription). It wraps every API call with:

1. **Provider-level safety check** (disabled? circuit open?)
2. **Key selection loop** (up to 5 keys via `KeyResolver`)
3. **Retry with backoff** (via `RetryPolicy`)
4. **Timeout wrapping** (default: 60s)
5. **Error classification and state updates**

```
Request → Safety Check → Key #1 → Retry(3x) → Success ✓
                              ↓ fail
                         Key #2 → Retry(3x) → Success ✓
                              ↓ fail
                         Key #3 → ...
                              ↓ all fail
                         Return error with details
```

Retries happen at the **key level**: transient failures are retried on the currently selected key using `RetryPolicy`. Rotation happens at the **request level**: once a key hits a non-retriable error (401/403/429) or exhausts its retries, the handler excludes that key and asks `KeyResolver` for the next available key, up to 5 keys.

## Error Classification

| HTTP Code | Classification | Action |
|:----------|:--------------|:-------|
| `429` | Rate Limit (TEMP) | Mark key unavailable, enter COOLDOWN, rotate to next key |
| `401`, `403` | Auth (PERM) | Revoke key, set quota to 0, mark `invalid` |
| `5xx` | Server (TEMP) | Record failure in circuit breaker + state machine, retry |
| Network error | Unknown (TEMP) | Retry with backoff, update availability |

## Model State Machine

Every `(key, model)` pair follows a formal state machine:

```
NEW → CHECKING → AVAILABLE ←──────────────┐
                     │                     │
                     │ runtime error       │ cooldown elapsed
                     ▼                     │
               TEMP_FAILED → COOLDOWN ─────┘
                     │
                     │ permanent error
                     ▼
               PERM_FAILED (terminal — manual reset only)
```

All state transitions go through `ModelStateMachine.transition()` to guarantee consistency.

## Retry Policy

```typescript
RetryPolicy {
  maxRetries: 3,
  baseDelay: 1000,     // 1 second
  maxDelay: 30000,     // 30 seconds
  backoffMultiplier: 2 // Exponential
}
```

Non-retriable errors (401, 403, 429) skip retries and immediately rotate to the next key.

## Quota Tracking

The `QuotaManager` tracks per-key token usage client-side:

- **Cost estimation** using `MODEL_PRICING` data (per 1M tokens)
- **Warning threshold** at 80% usage (`isAtWarning()`)
- **Critical threshold** at 95% usage (`isCritical()`)
- **Auto-reset** when quota period expires
- Persisted to IndexedDB `quotas` table

The 80% and 95% thresholds are currently helper signals for UI/UX warning states. The resilience engine's health check applies a hard stop at 100% quota usage (`quotaUsage < 1`) when deciding whether a key is healthy.

## Background Recovery

Recovery can be triggered by two schedulers:

| Scheduler | Location | Interval | Visibility Behavior | Purpose |
|:----------|:---------|:---------|:--------------------|:--------|
| Lifecycle `model-recovery` job | `src/lifecycle/background-jobs.ts` | 5 minutes, with 10% jitter | Uses `pauseOnHidden: true`; also runs an immediate recovery pass when the tab becomes visible again | Central background recovery with lower API pressure |
| Validator local interval | `src/services/validation/validator.service.ts` | 60 seconds | Runs only in browser clients (`window !== undefined`) but does not check `document.visibilityState` | Local periodic call to `retryScheduler.failoverRetry()` |

Both paths call the same recovery logic:

- Re-checks models whose cooldown/retry timers have elapsed
- Sends minimal validation requests via `modelVerifier.verifyModel()`
- Processes retry candidates sequentially to avoid rate-limit spikes
- Removes models that no longer belong to a key's provider

Visibility-aware pausing applies to the lifecycle scheduler, not to the validator's local 60-second interval.

## Key Files

| File | Purpose |
|:-----|:--------|
| `src/services/engines/resilience.engine.ts` | `ResilientRequestHandler` — retry + rotation |
| `src/services/policies/retry.policy.ts` | Exponential backoff retry logic |
| `src/services/policies/quota.policy.ts` | Per-key quota + cost tracking |
| `src/services/availability/state-machine.ts` | Formal state transitions |
| `src/services/availability/retry-strategy.ts` | Retry timing calculations |
| `src/lifecycle/scheduler.ts` | Background job scheduler |
| `src/lifecycle/background-jobs.ts` | Job definitions (validation, retry, quota reset) |
