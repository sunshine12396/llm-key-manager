# Feature 3: Routing Engine (Effective Score)

> **Phase:** 3 (Intelligent Routing) · **Status:** ✅ Complete

## Purpose

Deterministically select the **best API key** for every request using a multi-factor scoring formula. The system separates *which model to use* (routing policy) from *which key to use* (key-level scoring), enabling intelligent failover without user intervention.

## The Effective Score Formula

```
Effective Score = Power + Priority_Bonus + Health_Bonus - Latency_Penalty
```

### Components

| Factor | Range | Description |
|:-------|:------|:------------|
| **Power Score** | 50–100 | Base model intelligence ranking |
| **Priority Bonus** | -20 to +20 | User-defined key priority override |
| **Health Bonus** | -10 to +10 | Real-time availability indicator |
| **Latency Penalty** | 0 to -30 | `-1` per `10ms` average response time |

### Power Score Examples

| Model | Score |
|:------|:------|
| `o3` | 100 |
| `gpt-4.5` | 90 |
| `claude-3-5-sonnet-latest` | 85 |
| `gemini-2.5-pro` | 85 |
| `gpt-4o` | 80 |
| `gemini-1.5-pro` | 80 |
| `gemini-2.5-flash` | 75 |
| `gemini-2.0-flash` | 70 |
| Other registered models | 50 |

## Architecture: Two-Layer Routing

### Layer 1: Policy Resolution (Model Chain)
Resolves an abstract alias into an ordered list of concrete models:

```typescript
"smart" → ["gpt-4o", "claude-3-5-sonnet-latest", "gemini-2.5-pro"]
"fast"  → ["gpt-4o-mini", "gemini-2.0-flash", "claude-3-haiku"]
```

Sources (in priority order):
1. User-configured custom chains (`configService.getFallbackChain()`)
2. Static data-driven chains (`modelDataService.getFallbackChain()`)
3. Custom aliases → single model
4. Direct model ID (no expansion)

### Layer 2: Key Resolution (Effective Score)
For each model in the chain, finds the best key:

1. **Safety check**: Provider disabled? Circuit open?
2. **Cache lookup**: `AvailabilityCache.getUsableModels(provider)` — O(1)
3. **Model filter**: Match requested model (exact + substring)
4. **Exclude filter**: Remove failed/attempted keys
5. **Sticky preference**: If `ResolveOptions.preferredKeyId` matches a safe key for the requested model, use it first
6. **Score sort**: Descending `effectiveScore` with deterministic `keyId.localeCompare` tie-breaker
7. **Return**: Highest-scoring key + decrypted API key

Key resolution runs in strict mode. If a concrete model ID is requested and no usable key matches that model, `keyResolver.resolve()` returns `null`; it does not silently choose a different model from the same provider. Trying the next fallback model belongs to Layer 1 (`UnifiedLLMClient`'s model-chain loop), which keeps model fallback behavior explicit and ordered.

```typescript
await keyResolver.resolve("gpt-4o", {
  providerId: "openai",
  preferredKeyId: sticky?.keyId,
  excludeKeyIds: attemptedKeys,
});
```

## Sticky Routing

`UnifiedLLMClient` owns session stickiness. Once a successful `(model, provider, key)` tuple is found for a capability alias or requested model, the client stores it in memory:

```typescript
stickyModels: Map<string, { modelId, providerId, keyId }>
```

- The sticky model is promoted to the front of the model chain when `providerId` is not explicitly forced
- The sticky key is passed to `keyResolver.resolve()` as `ResolveOptions.preferredKeyId`
- `KeyResolver` only uses the sticky key if that key is present in the matching model set and passes safety checks
- If the sticky key fails during a request, the client excludes that key for the current model attempt; permanent key failures are excluded for the rest of the request

## AvailabilityCache Design

The cache maintains **4 indices** for O(1) lookups:

| Index | Key | Value | Purpose |
|:------|:----|:------|:--------|
| `cache` | `modelId:keyId` | `CachedModelState` | Primary data store |
| `usableByProvider` | `providerId` | `Set<cacheKey>` | Fast provider lookup |
| `sortedByModel` | `modelId` | `CachedModelState[]` (pre-sorted) | O(1) key resolution |
| `modelsByKey` | `keyId` | `Set<cacheKey>` | Key deletion |

- Syncs from IndexedDB on initialization
- TTL: 5 minutes via `isStale()`, but the current routing hot path does not call `isStale()` to trigger automatic re-sync. Synchronization is event-driven through `requestSync()` / `syncFromDB()`, with one fallback sync when the provider cache is empty.
- Re-sorts on every state change for consistent results

## Key Files

| File | Purpose |
|:-----|:--------|
| `src/core/unified-llm.client.ts` | `chat()` orchestration + chain resolution + sticky logic |
| `src/services/availability/key-resolver.ts` | Fast key selection with safety + score sorting |
| `src/services/availability/availability.cache.ts` | In-memory multi-index cache |
| `src/services/model-data.service.ts` | Static model registry (aliases, chains, pricing) |
| `src/constants/models.json` | Model definitions, capabilities, fallback chains |
