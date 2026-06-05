# Feature 6: Safety Guard & Circuit Breakers

> **Phase:** 6 (Safety) · **Status:** ✅ Complete

## Purpose

Protect the system from cascading failures by implementing circuit breakers at both the key and provider levels. Provides emergency controls for manual override when automated systems aren't enough.

## Circuit Breaker Pattern

Each key and provider has an independent circuit breaker with 3 states:

```
CLOSED ──[failures >= threshold]──> OPEN ──[cooldown elapsed]──> HALF_OPEN
  ↑                                                                │
  └──────────[successes >= threshold]──────────────────────────────┘
  └──────────[failure in half-open]───> OPEN (re-trip)
```

### Per-Provider Thresholds

| Provider | Failure Threshold | Cooldown |
|:---------|:-----------------|:---------|
| OpenAI | 5 failures in 1 min | 5 min |
| Anthropic | 8 failures in 1 min | 5 min |
| Gemini | 10 failures in 1 min | 2 min |

Gemini has a higher threshold because Google's API is typically very stable — failures are likely transient.

## Safety Guard Controls

The `SafetyGuard` provides a unified interface over circuit breakers plus additional emergency controls:

### Provider Controls
```typescript
safetyGuard.disableProvider("openai", "Budget exceeded");
safetyGuard.enableProvider("openai");
safetyGuard.isProviderDisabled("openai"); // true/false
```

### Key Controls
```typescript
safetyGuard.disableKey(keyId, "Suspected compromise");
safetyGuard.enableKey(keyId);
safetyGuard.isKeyDisabled(keyId); // true/false
```

### Emergency Mode
```typescript
safetyGuard.enableEmergencyMode("All providers down");
// In emergency mode, special handling logic can be triggered
safetyGuard.disableEmergencyMode();
```

### Forced Fallback
```typescript
// Force all requests to use a specific model
safetyGuard.setForcedFallback("gpt-4o-mini", "openai");
safetyGuard.clearForcedFallback();
```

### Scan Freeze
```typescript
// Stop background validation (e.g., to conserve API quota)
safetyGuard.freezeScanning("Monthly quota near limit");
safetyGuard.resumeScanning();
```

## Pre-Request Safety Check

Every request passes through a unified check:

```typescript
const result = safetyGuard.shouldAllowRequest(keyId, providerId);
// → { allowed: boolean, reason?: string, fallback?: { model, provider } }
```

Check order:
1. Forced fallback active? → redirect to fallback
2. Provider disabled? → block
3. Provider circuit open? → block
4. Key disabled? → block
5. Key circuit open? → block
6. All clear → allow

## State Persistence

All safety state is persisted to `localStorage` (key: `llm_safety_guard_state_v2`):
- Disabled providers and keys
- Circuit breaker states (per-key and per-provider)
- Emergency mode and scan freeze flags

This ensures safety state survives page refreshes and browser restarts.

## Event System

All state changes emit events for UI reactivity:

| Event | Trigger |
|:------|:--------|
| `CIRCUIT_OPENED` | Circuit tripped to OPEN |
| `CIRCUIT_HALF_OPEN` | Circuit testing recovery |
| `CIRCUIT_CLOSED` | Circuit recovered |
| `CIRCUIT_RESET` | Manual circuit reset |
| `PROVIDER_DISABLED` / `PROVIDER_ENABLED` | Provider toggle |
| `KEY_DISABLED` / `KEY_ENABLED` | Key toggle |
| `EMERGENCY_MODE_ENABLED` / `DISABLED` | Emergency toggle |
| `SCANNING_FROZEN` / `RESUMED` | Scan toggle |
| `FALLBACK_FORCED` / `CLEARED` | Fallback override |
| `SAFETY_RESET` | Full reset |

## Key Files

| File | Purpose |
|:-----|:--------|
| `src/services/safety/safety-guard.ts` | Unified safety controller + persistence |
| `src/services/safety/circuit-breaker.ts` | Per-key/provider circuit breaker logic |
| `src/services/safety/types.ts` | Safety event types and state interfaces |
| `src/hooks/useSafetyGuard.ts` | React hook for safety UI |
