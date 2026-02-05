# AI Key Manager Module (Client-Only)

**Description:**
An open-source library for secure, browser-only API key management for AI providers. Fully supports **Google Gemini**, **OpenAI**, and **Anthropic Claude**.

All data is stored locally in the browser (no server, no cloud sync), ensuring maximum privacy and user control.

## ✨ Core Capabilities

### 1. Advanced API Key Management

- **Multi-Key Support:** Add, edit, and delete multiple API keys per provider.
- **Search & Filtering:** Instantly find keys by label or provider with real-time filtering.
- **Priority Levels:** Assign priority levels (High/Medium/Low) to control usage order.
- **Bulk Actions:** Delete multiple keys simultaneously for easier management.

### 2. Secure Client-Side Storage

- **Encryption:** API keys are encrypted using **AES-256-GCM** (via Web Crypto API) before storage.
- **Local Storage:** Uses browser-native secure storage (IndexedDB).
- **Zero Leakage:** No plaintext keys are ever persisted; no data ever leaves the client.

### 3. Smart Health & Capability Discovery

- **Background Validation:** Asynchronously validates key authenticity without blocking the UI.
- **Model Discovery:** Automatically queries providers to list exactly which models a key can access (e.g. `gpt-4` vs `gpt-3.5`).
- **Real-time Monitoring:** Detects expired, disabled, or revoked keys instantly.
- **Tier Detection:** Infers usage tiers (Free vs Pro) based on rate limits.

### 4. Unified API Interface

- **Provider Agnostic:** Exposes a single, unified API interface for all providers.
- **Smart Selection:** Automatically selects the correct provider, compatible model, and best available API key.
- **Abstraction:** Hides provider-specific complexities directly from the consumer.

### 5. Auto-Switching & Priority Routing

- **Failover Protection:** Automatically switches keys on Rate Limited (429), Quota Exceeded, or temporary service failures.
- **Smart Routing:** Routes requests based on key priority, availability, and recent failure history.

### 6. Robust Error Handling

- **Exponential Backoff:** Built-in retry strategy to handle transient errors gracefully.
- **Smart Classification:** Distinguishes between retryable and non-retryable errors to prevent retry storms.

### 7. Usage Analytics & Cost Estimation

- **Request Tracking:** Visualizes request volume over time.
- **Cost Estimator:** Client-side calculation of estimated costs based on token usage.
- **Error Logs:** Detailed history of failed requests for debugging.

### 8. Pro-Level UI & UX

- **Glassmorphism Design:** Modern, translucent UI with smooth animations.
- **Responsive:** Fully adaptive layout for mobile and desktop.
- **Micro-interactions:** Interactive hover states and loading indicators.
- **Zero-Config:** Drop-in React components ready for production use.

## 🧠 Supported Providers

- **Google Gemini** (AI Studio)
- **OpenAI** (Platform)
- **Anthropic Claude** (Workbench)
- _Architecture is extensible for future providers_

## 🛡️ Design Principles

- **Client-Only:** No backend required; works entirely in the browser.
- **Privacy-First:** Zero telemetry; your keys stay on your device.
- **Deterministic Routing:** Predictable and transparent key selection.
- **Safe Failure:** Designed to never leak keys, even during error states.

## 🧪 Testing Scope

- **Integration Test:** Build a chat application to apply the auto-switching of API keys and models under real-world scenarios.
