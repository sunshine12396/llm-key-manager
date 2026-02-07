# Availability Management with State Machine

## State Machine Design

The availability system uses a formal **State Machine** to track model status. This ensures:

- ✅ **No invalid state transitions** (e.g., can't go directly from `NEW` → `AVAILABLE`)
- ✅ **Single source of truth** for state changes
- ✅ **Easy debugging** - clear transition history in logs

### State Diagram

```
   NEW ──────────────────────────────────────┐
    │                                        │
    ▼ START_CHECK                            │
   CHECKING ─────────────────────────────────┤
    │         │         │                    │
    │ success │ temp    │ perm               │
    ▼         ▼         ▼                    │
   AVAILABLE  TEMP_FAILED  PERM_FAILED       │
    │            │                           │
    │ error      │ ENTER_COOLDOWN            │
    ▼            ▼                           │
   TEMP_FAILED  COOLDOWN ────────────────────┘
                   │
                   │ COOLDOWN_ELAPSED
                   ▼
                 CHECKING
```

---

## Intelligent Retry Strategy (Error-Aware)

Different error types get different retry strategies to **minimize wasted API calls**:

| Error Type             | Strategy        | Base Delay | Max Delay  | Max Retries |
| ---------------------- | --------------- | ---------- | ---------- | ----------- |
| **401/403** (Auth)     | ❌ Stop         | N/A        | N/A        | 0           |
| **404** (Not Found)    | ❌ Stop         | N/A        | N/A        | 0           |
| **429** (Rate Limit)   | ⏳ Long backoff | 1 hour     | 24 hours   | 3           |
| **5xx** (Server Error) | 🔁 Fast retry   | 30 seconds | 5 minutes  | 5           |
| **Network/Timeout**    | 🔁 Limited      | 1 minute   | 10 minutes | 3           |

---

## Kill-Switch & Safety Guard

Protect the system when providers are misbehaving:

### Global Controls

| Control              | Description                      | API                                               |
| -------------------- | -------------------------------- | ------------------------------------------------- |
| **Disable Provider** | Stop all requests to a provider  | `safetyGuard.disableProvider('openai', 'reason')` |
| **Freeze Scanning**  | Pause background validation      | `safetyGuard.freezeScanning('reason')`            |
| **Force Fallback**   | Always use a specific model      | `safetyGuard.setForcedFallback('gpt-3.5-turbo')`  |
| **Emergency Mode**   | Only use verified working models | `safetyGuard.enableEmergencyMode('reason')`       |

### Per-Key Controls

| Control           | Description                   | API                                       |
| ----------------- | ----------------------------- | ----------------------------------------- |
| **Disable Key**   | Stop using a specific key     | `safetyGuard.disableKey(keyId, 'reason')` |
| **Reset Circuit** | Force-close a tripped circuit | `safetyGuard.resetKeyCircuit(keyId)`      |

### Circuit Breaker

Automatic protection that trips after consecutive failures:

```
           ┌──────────────────────────────────────────┐
           │                                          │
           ▼                                          │
        CLOSED ──── N failures in window ──── ► OPEN ─┘
           ▲                                     │
           │                                     │
           │                              cooldown
           │                                     │
           │                                     ▼
           └────── M successes ◄──────── HALF_OPEN
```

**Configuration per provider:**

| Provider  | Failure Threshold | Cooldown | Notes                 |
| --------- | ----------------- | -------- | --------------------- |
| OpenAI    | 3 failures        | 10 min   | Strict rate limits    |
| Anthropic | 5 failures        | 5 min    | Standard              |
| Gemini    | 4 failures        | 3 min    | Tends to recover fast |

### React Hook

```typescript
import { useSafetyGuard } from "llm-key-manager";

const {
  status, // Full safety status
  lastEvent, // Last safety event
  disableProvider, // Disable a provider
  enableProvider, // Re-enable a provider
  freezeScanning, // Pause background validation
  resumeScanning, // Resume validation
  setForcedFallback, // Force a specific model
  clearForcedFallback, // Clear forced fallback
  enableEmergencyMode, // Enable emergency mode
  disableEmergencyMode, // Disable emergency mode
  disableKey, // Disable a key
  enableKey, // Re-enable a key
  resetKeyCircuit, // Reset key's circuit breaker
  resetProviderCircuit, // Reset provider's circuit breaker
  resetAll, // Reset all safety state
} = useSafetyGuard();

// Check if request is allowed
const { allowed, reason, fallback } = shouldAllowRequest(keyId, providerId);
```

### Safety Control Panel

The demo includes a **SafetyControlPanel** component that provides:

1. **Global Controls**
   - Freeze/Resume scanning toggle
   - Emergency mode toggle
   - Forced fallback input

2. **Provider Controls**
   - Enable/Disable each provider
   - View circuit breaker state (OPEN/HALF_OPEN/CLOSED)
   - Reset circuit breaker

3. **Key Controls**
   - Enable/Disable each key
   - View per-key circuit status
   - Reset key circuit

4. **Event Log**
   - Shows last safety event for debugging

---

## Console Logs

The system logs detailed information for debugging:

```
[SafetyGuard] ⛔ Provider openai DISABLED: API outage
[SafetyGuard] ❄️ Scanning FROZEN: Manual freeze
[SafetyGuard] 🎯 Forced fallback: gpt-3.5-turbo
[SafetyGuard] ⛔ Circuit key:abc123 -> OPEN (5 failures)
[SafetyGuard] 🔄 Circuit provider:openai -> HALF_OPEN (testing recovery)
[SafetyGuard] ✅ Circuit provider:openai -> CLOSED (recovered)
```
