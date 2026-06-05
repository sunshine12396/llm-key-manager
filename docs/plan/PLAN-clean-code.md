# PLAN: Code Cleanup & Dead Code Removal

> **Created:** 2026-06-05
> **Status:** Implemented
> **Scope:** All 6 features — remove dead code, reduce duplication, clean up architecture

---

## Progress Tracker

| Phase | Feature | Tasks | Status |
|:------|:--------|:------|:-------|
| 1 | Vault & Key Security | 2 tasks | ✅ Complete |
| 2 | Model Discovery | 2 tasks | ✅ Complete |
| 3 | Routing Engine | 5 tasks | ✅ Complete with note |
| 4 | Resilience & Failover | 3 tasks | ✅ Complete |
| 5 | Analytics | 1 task | ✅ Complete |
| 6 | Safety Guard | 1 task | ✅ Complete |
| X | Cross-Cutting | 4 tasks | ✅ Complete with note |

---

## Phase 1: Vault & Key Security

### 1.1 ✅ Remove unused `exportVault()` / `importVault()`
**File:** `src/services/vault/vault.service.ts` (L150–207)

**Problem:** Both methods are defined but never called anywhere in the codebase. They add ~60 lines and a dynamic import of `utils/binary.ts`.

**Action:** Delete both methods. If they are planned for a future UI feature, extract to a separate `vault-export.service.ts` and track in roadmap.

**Impact:** Also evaluate if `src/utils/binary.ts` becomes orphaned after removal.

### 1.2 ✅ Fix misleading doc claim about PBKDF2
**File:** `docs/features/01-vault-security/README.md` (L48)

**Problem:** Doc says *"AES-256-GCM with PBKDF2-derived keys"* but actual code uses `crypto.subtle.generateKey()` → stores raw JWK in `localStorage`. No PBKDF2 or user password is used.

**Action:** Update the doc to accurately describe the current implementation. Add a `⚠️ Known Limitation` section noting that the master key is stored in plaintext in `localStorage` (suitable for MVP, not for production).

---

## Phase 2: Model Discovery

### 2.1 ✅ Remove `migrateOldStatus()` migration helper
**File:** `src/services/availability/state-machine.ts` (L270–290)

**Problem:** `migrateOldStatus()` maps legacy string statuses (e.g., `"available"`, `"failed"`) to the new `ModelState` enum. It is exported from `availability/index.ts` but **never called** anywhere in the codebase. This was a one-time migration helper.

**Action:** Delete the function and remove its export from `availability/index.ts`.

### 2.2 ✅ Remove `toDisplayStatus()` helper
**File:** `src/services/availability/state-machine.ts` (L283–293)

**Problem:** `toDisplayStatus()` converts `ModelState` → human-friendly strings. Exported from `availability/index.ts` but **never called**. The UI does its own status rendering.

**Action:** Delete the function and remove its export from `availability/index.ts`.

---

## Phase 3: Routing Engine (Largest cleanup)

### 3.1 ✅ Delete entire `model-matching.ts` file (DEAD CODE)
**File:** `src/core/model-matching.ts` (232 lines)

**Problem:** This entire module (`matchModelsToVerified`, `fuzzyMatchModel`, `fuzzyMatchGemini`, `fuzzyMatchOpenAI`, `fuzzyMatchAnthropic`) is **never imported** by any file. It was superseded by `KeyResolver` + `AvailabilityCache` in Phase 3/6 refactoring but never cleaned up.

**Action:** Delete `src/core/model-matching.ts` entirely. This removes 232 lines of dead code.

### 3.2 ✅ Remove `handleModelError()` duplicate method
**File:** `src/services/availability/availability.manager.ts` (L715–736)

**Problem:** `handleModelError()` is a legacy method that partially duplicates `handleRuntimeError()`. It is **never called** externally — all callers use `handleRuntimeError()` directly. The logic is also contradictory: it calls `handleRuntimeError()` for permanent failures but ignores temporary ones, which conflicts with the actual runtime behavior.

**Action:** Delete `handleModelError()`.

### 3.3 ✅ Remove dead methods from `AvailabilityManager`
**File:** `src/services/availability/availability.manager.ts`

The following methods have **zero external callers** (only defined, never consumed):

| Method | Lines | Reason for removal |
|:-------|:------|:-------------------|
| `getPromotedKey()` | L135–137 | Never called externally; `activeKeyMap` is internal-only |
| `onRotation()` | L105–112 | Never subscribed to by any UI or service |
| `handleQuotaExhausted()` | L556–574 | Never called; quota handling is done inline in `handleRuntimeError()` L462–490 |
| `getStaleModels()` | L662–667 | Never called; the retry scheduler uses `getModelsDueForRetry()` instead |
| `getAvailableModelsForKey()` | L422–430 | Never called; `getModelsForKey()` is used instead |

**Action:** Delete all 5 methods. This removes ~80 lines.

### 3.4 ✅ Consolidate `model-capabilities.ts` dead functions
**File:** `src/services/model-capabilities.ts`

Three of four exported functions were expected to be unused:

| Function | Called? |
|:---------|:-------|
| `getModelCapabilities()` | ✅ Used by `model-verifier.ts` |
| `filterModelsByCapability()` | ❌ Never called |
| `getAllModelsByType()` | ❌ Never called (also has hardcoded `commonModels` array) |
| `getModelContextWindow()` | ❌ Never called |
| `calculateCost()` | ✅ Used by `analytics.service.ts` |

**Action:** Deleted the unused filter/context helpers. Kept `getModelCapabilities()` because `src/services/validation/model-verifier.ts` uses config-aware capability lookup, and kept `calculateCost()` because analytics uses it.

### 3.5 ✅ Remove `getKnownProviders()` hardcoded list
**File:** `src/services/availability/provider-models.ts` (L29–31)

**Problem:** Returns hardcoded `['openai', 'anthropic', 'gemini']`. **Never called** outside its own export in `index.ts`. The registry and provider adapters are the actual source of truth for supported providers.

**Action:** Delete the function and its export from `availability/index.ts`.

---

## Phase 4: Resilience & Failover

### 4.1 ✅ Remove unused error subclasses
**File:** `src/core/errors.ts`

The following typed error classes are defined and constructed by `createTypedError()` but **never caught or instanceof-checked** anywhere:

| Class | Used? |
|:------|:------|
| `RateLimitError` | ❌ Created but never caught |
| `AuthenticationError` | ❌ Created but never caught |
| `ModelNotFoundError` | ❌ Created but never caught |
| `QuotaExhaustedError` | ❌ Created but never caught |
| `UnsupportedOperationError` | ❌ Created but never caught |
| `ServerError` | ❌ Created but never caught |
| `LLMError` | ✅ Used (base class, `.from()`, catch blocks) |

**Problem:** `createTypedError()` creates these subclasses, but all catch blocks only check `error.code` (number) or `error.message` (string) — never `instanceof`. The subclasses add ~80 lines of code that is never leveraged.

**Action:** Two options:
- **Option A (minimal):** Keep classes for future use, add `// @public` JSDoc to signal intent.
- **Option B (clean):** Delete all subclasses. Simplify `createTypedError()` to always return `new LLMError(message, code, provider, isRetryable)`.

**Recommendation:** Option B. The error classification is already handled well by `classifyError()` in `retry-strategy.ts` and `extractErrorCode()` in `errors.ts`.

### 4.2 ✅ Remove unused error helper functions
**File:** `src/core/errors.ts`

These four helpers are exported but **never imported or called** anywhere:

- `isTemporaryError()` (L184)
- `isPermanentError()` (L193)
- `isRateLimitError()` (L201)
- `isAuthError()` (L209)

**Problem:** The same logic is duplicated in `retry-strategy.ts` `classifyError()` which is the actual classification used at runtime.

**Action:** Delete all 4 functions (~25 lines).

### 4.3 ✅ Remove `getAllStrategySummaries()` debug utility
**File:** `src/services/availability/retry-strategy.ts` (L368–376)

**Problem:** Exported and re-exported from `availability/index.ts` but **never called**. It's a debug/documentation helper with no consumer.

**Action:** Delete the function and its export.

---

## Phase 5: Analytics

### 5.1 ✅ Evaluate `getHourlyBreakdown()` and `clearAll()`
**File:** `src/services/analytics.service.ts`

Both methods are defined but have **no current callers**. However, they are clearly designed for the Phase 7 monitoring dashboard UI (`examples/ui-demo`).

**Action:** Keep both — but add `// @public - used by ui-demo dashboard` comments to signal intent and prevent future false-positive dead-code detection.

---

## Phase 6: Safety Guard

### 6.1 ✅ Clean re-export from `availability/index.ts`
**File:** `src/services/availability/index.ts` (L47–49)

```typescript
// Safety - re-export from new safety module for backward compatibility
export { safetyGuard, SafetyGuard } from "../safety";
export type { SafetyStatus, SafetyEvent, CircuitState } from "../safety";
```

**Problem:** This re-export exists "for backward compatibility" from when safety was part of the availability module. All current consumers import directly from `services/safety`. This creates a confusing import path.

**Action:** Delete the re-exports (L47–49). Verify no consumer imports safety from `services/availability`.

---

## Cross-Cutting Cleanup

### X.1 ✅ Consolidate duplicate `calculateSmartRetry` / `calculateQuotaRetry` wrappers
**File:** `src/services/availability/availability.manager.ts` (L188–205)

**Problem:** `calculateSmartRetry()` and `calculateQuotaRetry()` are trivial pass-through methods that just call the standalone functions from `retry-strategy.ts`. They add no logic, just indirection.

**Action:** Call `calculateRetry()` and `calculateQuotaRetry()` directly from `retry-strategy.ts` in `handleRuntimeError()`. Delete the wrapper methods.

### X.2 ✅ Remove `refreshActiveKeys()` + `activeKeyMap` system
**File:** `src/services/availability/availability.manager.ts` (L93–170)

**Problem:** The `activeKeyMap` system (`refreshActiveKeys`, `getPromotedKey`, `onRotation`, `emitRotation`) was designed for a pre-cache era where a "promoted key" per provider was tracked. After the `AvailabilityCache` + `KeyResolver` refactoring (Phase 3/6), this system is redundant — `KeyResolver.resolve()` handles key selection directly. `refreshActiveKeys()` is still called in several places but only updates the `activeKeyMap` which is never read.

**Action:** Delete the entire `activeKeyMap` infrastructure (~70 lines):
- `activeKeyMap` field
- `rotationListeners` field + `emitRotation()` method
- `onRotation()` method
- `getPromotedKey()` method
- `refreshActiveKeys()` method
- Remove all `await this.refreshActiveKeys()` calls scattered in other methods

### X.3 ✅ Evaluate `cn.ts` tailwind utility
**File:** `src/utils/cn.ts` (7 lines)

**Problem:** Imports `clsx` + `tailwind-merge`. If the project doesn't use Tailwind CSS, this is a dead dependency.

**Action:** Verified Tailwind and `cn()` are used in package components and `examples/ui-demo`, so `src/utils/cn.ts`, `clsx`, and `tailwind-merge` were kept.

### X.4 ✅ Clean up barrel exports
**File:** `src/services/availability/index.ts`

After completing the above tasks, clean the barrel export to only export symbols that are actually consumed:

**Remove:**
- `migrateOldStatus` (Task 2.1)
- `toDisplayStatus` (Task 2.2)
- `getAllStrategySummaries` (Task 4.3)
- Safety re-exports (Task 6.1)
- `getKnownProviders` (Task 3.5)

---

## Estimated Impact

| Metric | Before | After |
|:-------|:-------|:------|
| Dead functions | ~25 | 0 |
| Dead file (`model-matching.ts`) | 232 lines | 0 lines |
| Lines removed (est.) | — | ~550–600 lines |
| Files deleted | 0 | 1–2 |

## Execution Order

1. **Start with Phase 3** (largest impact, most dead code)
2. **Then Phase 4** (error cleanup, independent)
3. **Then Phase X** (cross-cutting, depends on Phase 3)
4. **Then Phase 1, 2, 6** (small, isolated changes)
5. **Phase 5 last** (just comments, no code change)
6. **Run `pnpm run build` after each phase** to verify no regressions
