# 🚦 Effective Score Routing

The AI Key Manager uses a **deterministic scoring engine** to select the optimal API key for every request. This ensures maximum performance, reliability, and cost-efficiency without requiring manual intervention.

## 1. The Scoring Formula

Every model/key pair in the `AvailabilityCache` is assigned an **Effective Score** calculated using the following formula:

```text
Score = Power + Priority_Bonus + Health_Bonus - Latency_Penalty
```

### 1.1 Base Power Score
The fundamental ranking of a model's intelligence and capability.
- **Reasoning (o3, gpt-4.5)**: 90 - 100
- **Smart (gpt-4o, claude-3.5-sonnet)**: 80 - 85
- **Fast (gpt-4o-mini, gemini-flash)**: 60 - 75

### 1.2 Priority Bonus
A user-defined multiplier that allows manual overrides of the automated routing.
- **High Priority**: `+20`
- **Medium Priority**: `0`
- **Low Priority**: `-20`

### 1.3 Health Bonus/Penalty
A real-time indicator of a key's reliability.
- **Stable (Available)**: `+10`
- **Checking/New**: `0`
- **Degraded/Cooldown**: `-10` per recent failure

### 1.4 Latency Penalty
A dynamic penalty that favors faster responses.
- **Penalty**: `-1` for every `10ms` of average response time.
- **Cap**: Maximum penalty of `-30`.

## 2. Selection Logic

When a request is made for an abstract alias (e.g., `smart`):

1.  **Chain Expansion**: The alias is expanded into an ordered list of candidate models.
2.  **Pool Filtering**: The system filters all keys that support the current candidate model and are not in `COOLDOWN` or `DISABLED` states.
3.  **Score Calculation**: The `Effective Score` is calculated for every key in the filtered pool.
4.  **Deterministic Sort**: 
    - Keys are sorted by `Effective Score` descending.
    - If two keys have the exact same score, a **deterministic tie-breaker** (`keyId.localeCompare`) is used to ensure stable routing and "stickiness" within a session.

## 3. Real-time Adaptation

The routing engine is not static. It adapts instantly to runtime events:

-   **Success**: Reduces the latency penalty based on the new response time.
-   **Failure (429)**: Triggers an immediate `-10` score penalty and enters the key into `COOLDOWN`.
-   **Timeout**: Increases the latency penalty and triggers a circuit-breaker check.

---

> [!TIP]
> You can monitor these scores in real-time using the **Monitoring Dashboard** provided in the `ui-demo` package.
