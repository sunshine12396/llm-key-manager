# Feature 2: Model Discovery & Background Validation

> **Phase:** 2 (Discovery) · **Status:** ✅ Complete

## Purpose

Automatically discover which models each API key can access and maintain an up-to-date availability database. This runs entirely in the background so the user never waits for validation.

## How It Works

```
Key Added
    │
    ▼
┌────────────────────┐
│ ValidatorService    │  Queue-based, priority-sorted
│ queueValidation()  │  Priority 2 = user action (high)
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ Model Selection    │  1. Check modelsByProvider config
│                    │  2. Fallback: adapter.listModels() (dynamic)
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ ModelVerifier       │  Batch verification (default concurrency=5)
│ verifyBatch()      │  Sends: chat("Hello", maxTokens=5)
└────────┬───────────┘  Per-model: AVAILABLE or FAILED
         │
         ▼
┌────────────────────┐
│ IndexedDB          │  modelCache table (per key+model)
│ + AvailabilityCache│  In-memory sync for fast routing
└────────────────────┘
```

## Validation Pipeline

### Phase 2a: Task Queuing
Keys are validated via a priority queue. User-initiated additions get `priority: 2` (processed first).

Background retry recovery is handled separately by `RetryScheduler.failoverRetry()`. It does not enqueue `ValidatorService` tasks; it scans models whose retry timers have elapsed and re-verifies them directly.

### Phase 2b: Model Selection
```typescript
// 1. Provider-specific config (preferred)
const configured = config.modelsByProvider?.[task.providerId];

// 2. Dynamic discovery via API (fallback)
const discovered = await adapter.listModels(apiKey);
```

### Phase 2c: Batch Verification
Each model is tested with a minimal `chat()` call (`maxTokens: 5, temperature: 0`). `ModelVerifier.verifyBatch()` has a standalone default concurrency of `3`, but `ValidatorService` passes `DEFAULT_VALIDATION_CONFIG.batchSize`, which is `5`, so normal key validation verifies up to 5 models in parallel by default.

### Phase 2d: Result Storage
Results are persisted to IndexedDB and the key's `verificationStatus` is updated:
- `valid` — at least 1 model works
- `invalid` — no models available
- `retry_scheduled` — validation failed with a retryable error and a future retry time was scheduled

## Retry Scheduler

`RetryScheduler` is called periodically by the background job loop, but it only retries models whose backoff timers have elapsed. The 60-second interval is a polling cadence, not a fixed retry delay.

- Gets unavailable models with elapsed `nextRetryAt` timers via `getModelsDueForRetry()`
- Skips models that don't belong to the key's provider (stale data cleanup)
- Re-verifies due models sequentially with `modelVerifier.verifyModel()` to avoid rate-limit spikes
- Recalculates the next retry with `calculateRetry()` when a model still fails

Default retry delays depend on error category:

| Error Category | Initial Backoff |
|:---------------|:----------------|
| `RATE_LIMITED` / 429 | 1 hour |
| `SERVER_ERROR` / 5xx | 2 minutes |
| `NETWORK_ERROR` | 5 minutes |
| `CLIENT_ERROR` / other 4xx | 30 minutes |
| `UNKNOWN` | 30 minutes |

The current implementation does not pause retries based on `document.visibilityState`.

## Validation Events

| Event | Fired When |
|:------|:-----------|
| `validation:start` | Validation begins for a key |
| `validation:model` | Individual model check completed |
| `validation:complete` | All models checked |
| `validation:error` | Validation failed |

```typescript
validatorService.subscribe((event) => {
  if (event.type === "validation:complete") {
    console.log(`${event.modelsFound} models discovered`);
  }
});
```

## UI Status Badges

| Status | Badge | Meaning |
|:-------|:------|:--------|
| `untested` | 🔘 Grey | Not yet validated |
| `testing` | 🔵 Blue (animated) | Currently validating |
| `valid` | 🟢 Green | At least 1 model works |
| `invalid` | 🔴 Red | No models available |
| `retry_scheduled` | 🟡 Yellow | Retryable validation failure; background retry is scheduled |

## Key Files

| File | Purpose |
|:-----|:--------|
| `src/services/validation/validator.service.ts` | Queue + orchestration |
| `src/services/validation/model-verifier.ts` | Actual API test calls |
| `src/services/validation/retry-scheduler.ts` | Periodic COOLDOWN recovery |
| `src/services/validation/validation.types.ts` | Config + types |
| `src/components/notifications/ValidationNotificationToast.tsx` | Real-time UI feedback |
