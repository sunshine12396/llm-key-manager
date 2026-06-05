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
| `claude-3-5-sonnet` | 85 |
| `gemini-2.5-pro` | 85 |
| `gpt-4o` | 80 |
| `gemini-2.0-flash` | 70 |

## Architecture: Two-Layer Routing

### Layer 1: Policy Resolution (Model Chain)
Resolves an abstract alias into an ordered list of concrete models:

```typescript
"smart" → ["gpt-4o", "claude-3-5-sonnet", "gemini-2.5-pro"]
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
5. **Sticky preference**: If a previous key worked for this capability, try it first
6. **Score sort**: Descending `effectiveScore` with deterministic `keyId.localeCompare` tie-breaker
7. **Return**: Highest-scoring key + decrypted API key

## Sticky Routing

Once a successful `(model, key)` pair is found for a capability alias, it's cached in-memory for the session:

```typescript
stickyModels: Map<string, { modelId, providerId, keyId }>
```

- Sticky model is always tried **first** in the chain (promoted to index 0)
- Cleared automatically when the sticky key fails
- Disabled when `providerId` is explicitly forced

## AvailabilityCache Design

The cache maintains **4 indices** for O(1) lookups:

| Index | Key | Value | Purpose |
|:------|:----|:------|:--------|
| `cache` | `modelId:keyId` | `CachedModelState` | Primary data store |
| `usableByProvider` | `providerId` | `Set<cacheKey>` | Fast provider lookup |
| `sortedByModel` | `modelId` | `CachedModelState[]` (pre-sorted) | O(1) key resolution |
| `modelsByKey` | `keyId` | `Set<cacheKey>` | Key deletion |

- Syncs from IndexedDB on initialization
- TTL: 5 minutes (triggers re-sync if stale)
- Re-sorts on every state change for consistent results

## Key Files

| File | Purpose |
|:-----|:--------|
| `src/core/unified-llm.client.ts` | `chat()` orchestration + chain resolution + sticky logic |
| `src/services/availability/key-resolver.ts` | Fast key selection with safety + score sorting |
| `src/services/availability/availability.cache.ts` | In-memory multi-index cache |
| `src/services/model-data.service.ts` | Static model registry (aliases, chains, pricing) |
| `src/constants/models.json` | Model definitions, capabilities, fallback chains |
