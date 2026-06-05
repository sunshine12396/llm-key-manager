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
└────────┬───────────┘  Priority 1 = background retry
         │
         ▼
┌────────────────────┐
│ Model Selection    │  1. Check modelsByProvider config
│                    │  2. Fallback: adapter.listModels() (dynamic)
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ ModelVerifier       │  Batch verification (concurrency=3)
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
Keys are validated via a priority queue. User-initiated additions get `priority: 2` (processed first). Background retries get `priority: 1`.

### Phase 2b: Model Selection
```typescript
// 1. Provider-specific config (preferred)
const configured = config.modelsByProvider?.[task.providerId];

// 2. Dynamic discovery via API (fallback)
const discovered = await adapter.listModels(apiKey);
```

### Phase 2c: Batch Verification
Each model is tested with a minimal `chat()` call (`maxTokens: 5, temperature: 0`). Up to 3 models are verified in parallel.

### Phase 2d: Result Storage
Results are persisted to IndexedDB and the key's `verificationStatus` is updated:
- `valid` — at least 1 model works
- `invalid` — no models available

## Retry Scheduler

Failed models are automatically retried every **60 seconds** via `RetryScheduler`:
- Gets models in `COOLDOWN` state with elapsed retry timers
- Skips models that don't belong to the key's provider (stale data cleanup)
- Pauses when browser tab is hidden (respects `document.visibilityState`)

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

## Key Files

| File | Purpose |
|:-----|:--------|
| `src/services/validation/validator.service.ts` | Queue + orchestration |
| `src/services/validation/model-verifier.ts` | Actual API test calls |
| `src/services/validation/retry-scheduler.ts` | Periodic COOLDOWN recovery |
| `src/services/validation/validation.types.ts` | Config + types |
| `src/components/notifications/ValidationNotificationToast.tsx` | Real-time UI feedback |
