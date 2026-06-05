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
- **Warning threshold** at 80% usage
- **Critical threshold** at 95% usage
- **Auto-reset** when quota period expires
- Persisted to IndexedDB `quotas` table

## Background Recovery

The `RetryScheduler` (lifecycle module) runs periodic recovery:

- **Interval**: 60 seconds
- **Respects visibility**: Pauses when browser tab is hidden
- **Recovery logic**: Re-checks `COOLDOWN` models by sending minimal test requests
- **Stale data cleanup**: Removes models that no longer belong to a key's provider

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
