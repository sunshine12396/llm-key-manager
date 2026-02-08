# Unified API Flow

The `UnifiedLLMClient` provides a single, consistent interface for interacting with multiple LLM providers. It handles provider selection, load balancing, and error resilience automatically.

## 1. Initialization

The client is exported as a singleton instance `llmClient` from `lib/core/unified-llm.client.ts`. It does not require manual instantiation.

```typescript
import { llmClient } from "@/lib/core/unified-llm.client";
```

## 2. Making a Request

The `chat` method is the primary entry point. It accepts a standardized `ChatRequest` object.

```typescript
const response = await llmClient.chat({
  model: "gpt-4", // Can be a specific model or an alias
  messages: [{ role: "user", content: "Hello!" }],
});
```

## 3. Core Logic: Resilience & Routing

When a request is made, the `UnifiedLLMClient` executes a robust strategy to ensure request success.

### 3.1 Key Selection Algorithm

The `KeyResolver` determines the best available key for each request using an O(1) in-memory lookup:

1.  **Cache Lookup**: Queries `availabilityCache` for all keys that support the requested model (e.g., `gpt-4`).
2.  **Filtering**:
    - **Excludes Disabled Keys**: Keys manually disabled by the user.
    - **Excludes Unhealthy Keys**: Keys currently in a `COOLDOWN` (rate-limited) or `PERM_FAILED` state.
    - **Excludes Tripped Circuits**: Keys whose failure rate has triggered the `SafetyGuard` circuit breaker.
3.  **Ranking**:
    - **Priority**: High priority keys are selected first.
    - **Health**: Keys with recent successes are preferred.

### 3.2 Automatic Failover (Over-Quota Handling)

If the selected key fails (e.g., hitting a quota limit), the system automatically switches to the next available key without interrupting the user.

1.  **Error Detection**: The client detects a `429 Too Many Requests` or `403 Quota Exceeded` error.
2.  **State Update**:
    - The failed key-model pair is immediately marked as `COOLDOWN` in the `availabilityCache`.
    - It will not be selected again for a standard cooldown period (e.g., 5 minutes or based on `Retry-After` headers).
3.  **Retry Loop**:
    - The system loops back to the **Key Selection** step.
    - It requests a new key, explicitly excluding the one that just failed.
    - This process repeats until a working key is found or all keys are exhausted.
4.  **Sticky Routing**: Once a successful key is found, it is remembered for the duration of the session ("stickiness") to maintain consistency, unless it fails again.

## 4. Error Handling

The client throws standardized errors. Consumers should wrap calls in a try-catch block.

```typescript
try {
  const response = await llmClient.chat({ ... });
} catch (error) {
  if (error.message.includes('No available keys')) {
    // Prompt user to add a valid key
  } else {
    // Handle other errors (network, timeout)
  }
}
```
