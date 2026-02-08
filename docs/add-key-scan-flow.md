# Add Key & Scan Flow

This document describes the complete flow when a user adds a new API key via the GUI. The system stores the key securely, validates it through background jobs, and discovers which models are available.

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Add Key Form  │────▶│  Vault Service   │────▶│   IndexedDB (keys)  │
│   (React UI)    │     │  (Encryption)    │     │   AES-256-GCM       │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ ValidatorService│────▶│  Model Verifier  │────▶│ Provider API        │
│ (Background Job)│     │  (Batch Check)   │     │ (OpenAI/Gemini/etc) │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ Availability    │────▶│ IndexedDB        │
│ Cache (Memory)  │     │ (modelCache)     │
└─────────────────┘     └──────────────────┘
```

---

## 1. User Interaction (GUI)

1. **Input**: User enters API key and selects a provider (OpenAI, Anthropic, or Google Gemini) in the "Add Key" form.
2. **Format Validation**: Real-time validation checks key format using `adapter.validateKeyFormat()`:
   - OpenAI: `sk-...` (48+ chars)
   - Anthropic: `sk-ant-...` (95+ chars)
   - Gemini: `AIzaSy...` (39 chars)
3. **Submit**: Upon clicking "Add Key", `LLMKeyManagerProvider.addKey()` is triggered.

---

## 2. System Process (Phase 1: Immediate Storage)

**File**: `lib/components/core/LLMKeyManagerProvider.tsx`

```typescript
const addKey = async (providerId, key, label, priority) => {
  // 1. Save to vault (encrypted with AES-256-GCM)
  const id = await vaultService.addKey(providerId, key, label, priority);

  // 2. Set initial status
  await vaultService.updateKey(id, {
    verificationStatus: "untested",
    verifiedModels: [],
  });

  // 3. Refresh UI immediately
  await refreshKeys();

  // 4. Queue background validation (fire and forget)
  validatorService.queueValidation(id, 2); // Priority 2 = high (user action)

  return id;
};
```

**Result**: Key appears in dashboard with "Untested" status badge.

---

## 3. System Process (Phase 2: Background Validation)

**File**: `lib/services/validation/validator.service.ts`

### Step 2a: Task Queuing

```typescript
async queueValidation(keyId: string, priority: number = 1) {
  const keyMeta = await vaultService.listKeys().find(k => k.id === keyId);
  const apiKey = await vaultService.getKey(keyId);

  this.pushTask({
    keyId,
    providerId: keyMeta.providerId,
    label: keyMeta.label,
    apiKey,
    isRetry: false,
    priority,
    queuedAt: Date.now(),
  });
}
```

### Step 2b: Model Selection by Provider

> ✅ **Updated**: Models are configured **per provider** in `modelsByProvider`.
>
> - If provider has models configured → use those directly
> - If empty or not configured → **automatically discover models** using the provider's API (dynamic scan)

**Critical**: Only models for the specific provider are tested (prevents cross-provider bugs).

```typescript
// 1) Check provider-specific config
const configuredModels = this.config.modelsByProvider?.[task.providerId];

if (configuredModels && configuredModels.length > 0) {
  // Use provider-specific config (preferred)
  modelsForProvider = configuredModels;
} else {
  // 2) Dynamic discovery via API (e.g., GET /v1/models)
  modelsForProvider = await adapter.listModels(apiKey);
}

// Example: For Gemini key, either uses configured ["gemini-pro"] list
// OR calls Google API to list all available models dynamically.
```

### Step 2c: Batch Verification

**File**: `lib/services/validation/model-verifier.ts`

```typescript
async verifyBatch(keyId, apiKey, models, providerId, label, concurrency) {
  // Process models in parallel (up to concurrency limit)
  for (const modelId of models) {
    await adapter.chat(apiKey, {
      messages: [{ role: "user", content: "Hello" }],
      model: modelId,
      maxTokens: 5,
      temperature: 0,
    });
    // Mark as AVAILABLE or FAILED based on response
  }
}
```

### Step 2d: Result Storage

```typescript
// Save to IndexedDB modelCache table
await modelMetadataService.saveModelMetadataBatch(results);

// Update key verification status
await vaultService.updateKey(task.keyId, {
  verificationStatus: successCount > 0 ? "valid" : "invalid",
  verifiedModels: results.filter((m) => m.isAvailable).map((m) => m.modelId),
});
```

---

## 4. Configuration

**File**: `lib/services/validation/validation.types.ts`

```typescript
export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  maxConcurrency: 3, // Max parallel API calls
  batchSize: 5, // Models per batch

  // Provider-specific model lists (preferred)
  modelsByProvider: {
    openai: ["gpt-4-turbo-preview", "gpt-3.5-turbo"],
    anthropic: ["claude-3-opus-20240229", "claude-3-sonnet-20240229"],
    gemini: ["gemini-pro", "gemini-1.5-pro"],
  },

  // Legacy flat list (fallback for backwards compatibility)
  initialModelsToCheck: [
    "gpt-4-turbo-preview",
    "gpt-3.5-turbo",
    // Anthropic
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    // Gemini
    "gemini-pro",
    "gemini-1.5-pro",
  ],
};
```

---

## 5. Validation Events

**Event Types** (emitted during validation):

| Event                 | Description                         |
| --------------------- | ----------------------------------- |
| `validation:start`    | Validation begins for a key         |
| `validation:model`    | Individual model check completed    |
| `validation:complete` | All models checked, validation done |
| `validation:error`    | Validation failed with error        |

**Subscribing to Events**:

```typescript
validatorService.subscribe((event) => {
  if (event.type === "validation:complete") {
    console.log(`Key validated! ${event.modelsFound} models available.`);
  }
});
```

---

## 6. UI Updates & Notifications

**File**: `lib/components/notifications/ValidationNotificationToast.tsx`

| Status       | UI Display                           |
| ------------ | ------------------------------------ |
| **Start**    | Spinner + "Validating API Key..."    |
| **Progress** | Updates with discovered model count  |
| **Complete** | Success badge + "7 models available" |
| **Error**    | Error badge + "Invalid API Key"      |

**Key Status Badge Updates**:

| Status     | Badge Color     | Meaning                |
| ---------- | --------------- | ---------------------- |
| `untested` | Grey            | Not yet validated      |
| `testing`  | Blue (animated) | Currently validating   |
| `valid`    | Green           | At least 1 model works |
| `invalid`  | Red             | No models available    |

---

## 7. Retry Scheduler

**File**: `lib/services/validation/retry-scheduler.ts`

Failed models are automatically retried:

```typescript
async failoverRetry() {
  // Get models due for retry (COOLDOWN state with passed retry time)
  const dueModels = await modelMetadataService.getModelsDueForRetry(50);

  for (const model of dueModels) {
    // Skip if model doesn't belong to this provider (cleanup stale data)
    if (!adapter.ownsModel(model.modelId)) {
      await modelMetadataService.deleteModelsForKey(keyId);
      continue;
    }

    // Re-verify the model
    const result = await modelVerifier.verifyModel(...);
  }
}
```

**Retry Schedule**: Runs every 60 seconds automatically.

---

## 8. Data Flow Summary

```
User Clicks "Add Key"
        │
        ▼
┌───────────────────────────────────────┐
│ Phase 1: Immediate (Blocking)         │
│ • Encrypt key with AES-256-GCM        │
│ • Store in IndexedDB (keys table)     │
│ • Set status = "untested"             │
│ • Refresh UI list                     │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│ Phase 2: Background (Async)           │
│ • Queue validation task               │
│ • Filter models by provider           │
│ • Test each model against API         │
│ • Store results in modelCache         │
│ • Update key status → "valid"/"invalid"│
│ • Emit events for UI notifications    │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│ Phase 3: Continuous (Periodic)        │
│ • RetryScheduler runs every 60s       │
│ • Re-checks failed models             │
│ • Cleans up stale data                │
└───────────────────────────────────────┘
```

---

## 9. Related Files

| File                                              | Purpose                                  |
| ------------------------------------------------- | ---------------------------------------- |
| `lib/components/core/LLMKeyManagerProvider.tsx`   | Main context provider, addKey() function |
| `lib/services/vault/vault.service.ts`             | Encryption & storage                     |
| `lib/services/validation/validator.service.ts`    | Background validation orchestration      |
| `lib/services/validation/model-verifier.ts`       | Actual API calls to verify models        |
| `lib/services/validation/retry-scheduler.ts`      | Periodic retry of failed models          |
| `lib/services/validation/validation.types.ts`     | Types and configuration                  |
| `lib/services/availability/availability.cache.ts` | In-memory cache for fast lookups         |
| `lib/providers/*/discovery/models.ts`             | Provider-specific ownsModel() logic      |
