# 🧠 Centralized Model Management

One of the most powerful features of the AI Key Manager is its ability to decouple your application logic from specific, version-pinned model names.

## 🏷 Logical Aliases

Instead of hardcoding `gpt-4o-2024-08-06` everywhere in your code, you can use **Aliases**. This makes your application resilient to model deprecations.

### Pre-defined Aliases:
-   **`fast`**: Maps to high-speed, cost-effective models (e.g., `gpt-4o-mini`).
-   **`smart`**: Maps to state-of-the-art models with strong reasoning (e.g., `o1-mini`).
-   **`balanced`**: The best trade-off between speed and intelligence.
-   **`coding`**: Models optimized for software development.
-   **`reasoning`**: Specialized models for deep thought and complex logic.

```typescript
// Example: Requesting by alias
const response = await llmClient.chat({
    model: 'fast', // Logic will resolve this to the best 'fast' key/model available
    messages: [...]
});
```

## ⛓ Fallback Chains

What happens if OpenAI's API is down? In a traditional app, you'd be offline. In the AI Key Manager, you have **Fallback Chains**.

A fallback chain is an ordered list of models the system will try if the primary choice fails:

**Example `smart` chain:**
1.  `o1` (OpenAI)
2.  `gpt-4o` (OpenAI)
3.  `claude-3-5-sonnet-latest` (Anthropic)
4.  `gemini-1.5-pro` (Google)

If the first model fails (or you have no keys for it), the system automatically moves to the next one in the list.

## 📂 Configuration-Driven (models.json)

The mapping for capabilities, aliases, and fallback chains is stored in a centralized `models.json` file. 

-   **Zero Code Changes**: You can update a model's capabilities or add a new alias by simply updating the JSON.
-   **Provider Metadata**: Each model entry defines its supported features (e.g., `text-chat`, `vision`, `code`).

## 💰 Cost Estimation

Because model metadata is centralized, the system can perform real-time cost estimation on the client side. By looking up the pricing (input/output tokens) in `pricing.json`, we can show users exactly how much they are spending on each key without ever sending usage data to a third party.
