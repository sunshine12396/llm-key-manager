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

## 3. Core Logic: AI Gateway Architecture

The system uses a **Hybrid Model Routing Architecture** to provide deterministic, customizable, and resilient request execution. This architecture strictly separates the logic for finding the *best abstract model* from finding the *best actual API key*.

### 3.1 Architecture Components

1. **Model Registry (Static)**
   - A static, code-shipped JSON registry mapping every known model to its provider, context window, and capability tags (e.g., `reasoning`, `coding`, `vision`).
2. **Routing Policies (Dynamic/User-Customizable)**
   - Defines the ordered fallback chains (e.g., `smart` -> `1. o3`, `2. claude-3.5-sonnet`, `3. gemini-2.0-flash`).
   - Stored in the database, allowing users/admins to reorder models, create custom aliases, and override system defaults without changing application code.
3. **Key-Level Scoring**
   - Decouples model selection from key selection. Keys are evaluated based on their overall access level (`Power Score`) combined with runtime metrics.
4. **Runtime Health Layer**
   - Dynamically tracks latency, failure rates, rate limits (`429`), and circuit breaker states for both keys and providers.

### 3.2 Runtime Flow & Scoring Algorithm

When a request is made, the `UnifiedLLMClient` executes the following flow:

1. **Policy Resolution**: The request's `model` (e.g., `smart`) is expanded into an ordered list of models via the active Routing Policy.
2. **Key Discovery**: For the highest-priority model in the chain, query the `availabilityCache` for all keys supporting it.
3. **Health Filtering**: Exclude keys that are disabled, in `COOLDOWN` (rate-limited), or have an open `SafetyGuard` circuit.
4. **Key Ranking (Effective Score)**: The remaining keys are sorted by an `Effective Score` formula:
   ```text
   Effective Score = Power Score + Health Bonus - Latency Penalty - Recent Failure Penalty
   ```
5. **Execution & Fallback**:
   - The request is executed using the key with the highest effective score.
   - If a failure occurs (e.g., Quota Exceeded), the key is immediately marked for cooldown, a penalty is applied, and the system transparently loops back to **Step 2** to find the next best key or fallback model in the chain.

### 3.3 Sticky Routing

Once a successful key and model combination is found, it is cached for the duration of the session ("stickiness") for that specific capability alias. This ensures consistent responses and context persistence, unless the chosen key/model subsequently fails.

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
