# Developer Guide - Internal Architecture

This document provides an overview of the internal architecture of the LLM Key Manager library. It is intended for developers who want to contribute to the core logic, add new providers, or optimize the routing engine.

## Core Modules

The library is organized into several strategic modules:

### 1. `lib/core` (The Brain)
- **`UnifiedLLMClient`**: The primary entry point. It orchestrates the entire request lifecycle:
    1. **Chain Resolution**: Resolves model aliases (e.g., `fast`) into concrete fallback chains.
    2. **Key Selection**: Uses the `keyResolver` to find the best available key for the current model.
    3. **Execution**: Hands off the request to the provider adapter via the `resilientHandler`.
    4. **Learning**: Updates "stickiness" for successful model/provider pairs to avoid redundant fallbacks in future requests.

### 2. `lib/services/availability` (The Heart)
- **`KeyModelAvailabilityManager`**: Manages the runtime state of all (Key, Model) pairs.
    - **State Machine**: Transitions models through `NEW` -> `CHECKING` -> `AVAILABLE` -> `COOLDOWN` -> `PERM_FAILED`.
    - **Reactivity**: Emits rotation events when the "Primary Key" for a provider changes, ensuring the UI stays in sync.
- **`KeyResolver`**: A fast, O(1) lookup service that selects the best key from the availability cache based on priority and health.

### 3. `lib/services/engines` (Resilience)
- **`ResilientRequestHandler`**: Implements circuit breakers and retry logic. It ensures that a failing provider doesn't stall the entire application.

### 4. `lib/providers` (The Adapters)
- Standardized adapters for OpenAI, Anthropic, and Gemini.
- Each adapter maps the Unified API types to provider-specific payloads.

---

## Model Lifecycle

Models are tracked per-key in the `modelCache` (IndexedDB). A model's availability follows this lifecycle:

1. **Discovery**: When a new key is added, all potential models are registered as `NEW`.
2. **Verification**: The `ValidatorService` runs background tests on models.
3. **Availability**: Successful verification moves a model to `AVAILABLE`.
4. **Runtime Failure**: If a request fails:
    - **429 (Rate Limit)**: All models for that key enter `COOLDOWN`.
    - **401/403 (Auth)**: The key is marked `invalid` and all models move to `PERM_FAILED`.
    - **500 (Server)**: The specific model enters `COOLDOWN` with exponential backoff.

---

## Performance Considerations

- **O(1) Routing**: We avoid iterating through all keys on every request by maintaining an `AvailabilityCache` in memory.
- **Lazy Loading**: Heavy services like `AnalyticsService` are imported dynamically to keep the initial bundle size small.
- **Background Jobs**: Periodic recovery of `COOLDOWN` models happens in a separate scheduler that respects browser visibility (pauses when the tab is hidden).
