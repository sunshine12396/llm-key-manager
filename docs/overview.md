# 🗝️ AI Key Manager — Documentation Hub

> **Browser-native Hybrid AI Gateway** for resilient, multi-provider LLM integration.

---

## 📖 Documentation Map

### 🏗️ Architecture
High-level system design, module map, and data layer.

- [System Architecture](./architecture/system-architecture.md) — Module dependency graph, data flow, and design principles.
- [Data Layer (IndexedDB)](./architecture/data-layer.md) — Schema, tables, encryption strategy.

### ✨ Features (by development phase)
Each feature is documented with its own **purpose, API, internals, and status**.

| # | Feature | Status | Docs |
|:--|:--------|:-------|:-----|
| 1 | **Vault & Key Security** | ✅ Complete | [→ Feature Doc](./features/01-vault-security/README.md) |
| 2 | **Model Discovery & Validation** | ✅ Complete | [→ Feature Doc](./features/02-model-discovery/README.md) |
| 3 | **Routing Engine (Effective Score)** | ✅ Complete | [→ Feature Doc](./features/03-routing-engine/README.md) |
| 4 | **Resilience & Failover** | ✅ Complete | [→ Feature Doc](./features/04-resilience/README.md) |
| 5 | **Analytics & Usage Tracking** | ✅ Complete | [→ Feature Doc](./features/05-analytics/README.md) |
| 6 | **Safety Guard & Circuit Breakers** | ✅ Complete | [→ Feature Doc](./features/06-safety-guard/README.md) |

### 🛠️ Developer Guides
Step-by-step tutorials for extending the system.

- [Adding a New Provider](./guides/add-new-provider.md) — Implement `IProviderAdapter` and register.
- [API Reference](./guides/api-reference.md) — Public types, methods, and hook signatures.

---

## 🗺️ Development Roadmap

### Phase 1: Foundation (Vault + Providers) ✅
> *"Store keys securely, connect to providers."*

Built the encrypted key vault (AES-256-GCM via Web Crypto API), IndexedDB persistence, and the provider adapter pattern (`IProviderAdapter`) for OpenAI, Anthropic, and Gemini.

**Key files:** `services/vault/`, `providers/`, `db/schema.ts`

### Phase 2: Model Discovery ✅
> *"Know what models each key can access."*

Background validation pipeline: queue-based `ValidatorService` → batch `ModelVerifier` → per-model availability stored in `modelCache`. Includes dynamic model discovery via provider `/v1/models` APIs.

**Key files:** `services/validation/`, `models/metadata/`

### Phase 3: Intelligent Routing ✅
> *"Always pick the best key for every request."*

Hybrid routing architecture: policy layer (alias → model chain) + key-level scoring (`Power + Priority + Health - Latency`). In-memory `AvailabilityCache` with O(1) lookup and pre-sorted indices. Sticky routing for session consistency.

**Key files:** `core/unified-llm.client.ts`, `services/availability/`, `services/model-data.service.ts`

### Phase 4: Resilience ✅
> *"Never let a single failure break the system."*

`ResilientRequestHandler` with retry policies, timeout wrapping, and automatic key rotation on failure. Quota tracking via `QuotaManager`. `RetryScheduler` for periodic recovery of `COOLDOWN` models.

**Key files:** `services/engines/resilience.engine.ts`, `services/policies/`, `lifecycle/`

### Phase 5: Observability ✅
> *"See what's happening in real-time."*

`AnalyticsService` for usage/error tracking with IndexedDB persistence. Cost estimation via `MODEL_PRICING` data. Hourly breakdown charts. Secret redaction in error logs.

**Key files:** `services/analytics.service.ts`, `constants/pricing.json`

### Phase 6: Safety & Emergency Controls ✅
> *"Protect against cascading failures."*

`SafetyGuard` with per-key and per-provider circuit breakers (`CLOSED → OPEN → HALF_OPEN`). Emergency mode, provider disable, scan freezing, forced fallback. State persisted to `localStorage`.

**Key files:** `services/safety/`, `hooks/useSafetyGuard.ts`

### Phase 7: UI & Developer Experience 🔄 In Progress
> *"Make it easy to use and integrate."*

React components (`LLMKeyManagerProvider`, `AddKeyForm`, `ValidationNotificationToast`), hooks (`useLLM`, `useVault`, `useAvailability`, `useSafetyGuard`), and the `ui-demo` monitoring dashboard.

**Key files:** `components/`, `hooks/`, `examples/ui-demo/`

---

## 📁 Source Code Map

```
src/
├── core/                    # UnifiedLLMClient (Phase 3)
│   ├── unified-llm.client.ts
│   ├── model-matching.ts
│   └── errors.ts
├── services/
│   ├── vault/               # Encrypted key storage (Phase 1)
│   ├── validation/          # Background model discovery (Phase 2)
│   ├── availability/        # AvailabilityCache + KeyResolver + StateMachine (Phase 3)
│   ├── engines/             # ResilientRequestHandler (Phase 4)
│   ├── policies/            # QuotaManager + RetryPolicy (Phase 4)
│   ├── safety/              # CircuitBreaker + SafetyGuard (Phase 6)
│   ├── analytics.service.ts # Usage tracking (Phase 5)
│   ├── model-data.service.ts# Static model registry (Phase 3)
│   ├── config.service.ts    # Runtime configuration
│   └── model-capabilities.ts# Cost calculation helpers
├── providers/               # OpenAI, Anthropic, Gemini adapters (Phase 1)
├── components/              # React UI (Phase 7)
├── hooks/                   # React hooks (Phase 7)
├── lifecycle/               # Background job scheduler (Phase 4)
├── models/                  # Type definitions
├── constants/               # Static JSON data (models, pricing, limits)
├── db/                      # IndexedDB schema (Phase 1)
└── public/                  # Exported types & hooks
```
