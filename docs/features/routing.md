# 🚦 Smart Routing & Failover

The routing engine is the "brain" of the AI Key Manager. It ensures that your requests are always sent to the most capable, available, and cost-effective API key.

## 🏆 Dual-Level Priority System

The system uses two types of priority to determine the best key for a request:

### 1. Key Priority (User Defined)
When you add a key, you can assign it a priority: **High**, **Medium**, or **Low**.
-   **High**: Primary keys (e.g., your paid Pro account).
-   **Medium**: Secondary/Overflow keys.
-   **Low**: Free-tier or shared keys.

### 2. Model Priority (System Defined)
Not all models are equal. The routing engine assigns a priority (1 to 5) based on model capability patterns.
-   **Rank 5 (Flagship)**: `o1`, `gpt-4o`, `claude-3-5-sonnet`.
-   **Rank 4 (Strong)**: `o3-mini`, `gpt-4-turbo`, `gemini-2.0-flash`, `gemini-1.5-pro`.
-   **Rank 3 (Everyday)**: `gpt-4o-mini`, `gemini-1.5-flash`, `claude-3-5-haiku`.
-   **Rank 1-2 (Legacy/Lite)**: Older or experimental models.

## 🔄 The Routing Algorithm

When a request is initiated, the `KeyModelAvailabilityManager` performs the following steps:

1.  **Filter**: Removes keys that are currently in `TEMP_FAILED`, `PERM_FAILED`, or `COOLDOWN` states.
2.  **Safety Check**: Filters out keys where the **Circuit Breaker** is currently open.
3.  **Capability Match**: If specific capabilities are requested (e.g., "Vision", "Tools"), only compatible models are considered.
4.  **Sort**: candidates are sorted by **Model Priority** (descending), then by **Retry Count** (preferring "clean" keys).
5.  **Selection**: The top candidate is selected for the request.

## 🛠 Failover Logic

If a request fails, the system doesn't just crash. It intelligently handles the error:

| Error Type | Action | Logic |
| :--- | :--- | :--- |
| **429 (Rate Limit)** | **Switch Key** | Key is moved to `COOLDOWN` for a duration (inferred from headers or default). |
| **Quota Exceeded** | **Switch Key** | Key is moved to `COOLDOWN` until the typical reset period. |
| **5xx (Server Error)** | **Retry / Switch** | Incurs an exponential backoff. If it fails again, the key is moved to `TEMP_FAILED`. |
| **401 (Auth Error)** | **Disable** | Key is moved to `PERM_FAILED` immediately. |

## ⚡ Circuit Breaker Pattern

To prevent unnecessary delay in user experience, we implement a **Safety Guard**:
-   **Provider Level**: If Google Gemini is down globally, we stop asking and immediately fallback to OpenAI.
-   **Key Level**: If your specific OpenAI key is failing 100% of the time, we stop trying it for 5 minutes.
