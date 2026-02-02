# 🔍 Model Discovery & Health

The system doesn't just store keys; it actively manages their "Health Score" and discovers what they are capable of.

## 🎭 State Machine Lifecycle

Every (Key, Model) pair exists in a specific state. This state determines if it's "eligible" for selection.

| State | Eligible? | Description |
| :--- | :--- | :--- |
| `NEW` | No | Just added, waiting for initial validation. |
| `CHECKING` | No | Currently being validated against the provider API. |
| `AVAILABLE` | **Yes** | Verified and ready to use. |
| `TEMP_FAILED` | No | Recently failed with a retryable error (e.g., DNS, Timeout). |
| `COOLDOWN` | No | Over rate limits or quota; waiting for reset. |
| `PERM_FAILED` | No | Key is revoked, expired, or model access is denied. |

## 🚀 Background Validation

To provide a seamless UI experience, validation happens in the background.

1.  **Initial Discovery**: When you add an OpenAI key, the system automatically checks for access to `gpt-4o`, `gpt-4o-mini`, etc.
2.  **Periodic Checks**: A background job periodically "retries" keys in the `TEMP_FAILED` or `COOLDOWN` states.
3.  **Active Monitoring**: Every time you make a prompt, the system updates the health state based on the actual API response.

## 📊 Capability Detection

The system automatically categorizes models based on their features:
-   **Chat**: Models capable of conversational dialogue.
-   **Reasoning**: High-compute models like `o1` or `o3`.
-   **Vision**: Models that can process images.
-   **Embedding**: Models for vectorization.

This allows you to request a "Reasoning model" via the Unified Client, and the system will find the best available one across all your keys.

## 🧬 Tier Inference

By analyzing error messages (especially from OpenAI and Anthropic), the system can often infer your usage tier (e.g., Tier 1 vs Tier 5). This information is used to optimize the `COOLDOWN` duration, as higher tiers have more generous rate limits.
