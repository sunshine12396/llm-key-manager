# LLM Key Manager Core Library (`/lib`)

The core business logic and services for the Client-Side LLM Key Manager. This library is designed as a standalone module for managing AI API keys, executing requests with resilience, and handling provider variances.

## 🏗 Architecture

The library follows a **Client-Side First** architecture.

```mermaid
graph TD
    UI[React Components] --> Hooks[lib/hooks]
    Hooks --> Unified[UnifiedLLMClient (Core)]
    Hooks --> Vault[VaultService]
    
    Unified --> Resilience[Resilience Engine]
    Resilience --> Circuit[Circuit Breaker]
    Resilience --> Router[Key Router]
    Resilience --> Quota[Quota Policy]
    
    Resilience --> Adapter[Provider Adapters]
    Adapter --> OpenAI[OpenAI API]
    Adapter --> Anthropic[Anthropic API]
    Adapter --> Gemini[Google Gemini API]
    
    Validation[Background Validator] --> Adapter
    Validation --> Vault
    
    Vault --> DB[(Dexie / IndexedDB)]
    Vault --> Crypto[CryptoService (WebCrypto)]
```

## 📂 Directory Structure

| Directory | Description |
|-----------|-------------|
| `public/` | **Stable Public Surface**. Defines the only objects and types users should import. |
| `core/` | Framework-agnostic orchestration (`UnifiedLLMClient`, `Errors`). |
| `providers/` | **Provider Plugin System**. Contains adapters for OpenAI, Anthropic, Gemini, etc. |
| `services/` | Business logic separated by domain (Vault, Engines, Policies). |
| `lifecycle/` | **Background Lifecycles**. Scheduled/async jobs (e.g., Background Validation). |
| `models/` | Domain types and standardized schemas. |
| `hooks/` | React hooks for UI integration. |
| `db/` | Database schema (Dexie.js) and repositories. |
| `constants/` | Data-driven configuration (JSON-based). |

## 🔑 Key Concepts

### 1. Public API Surface (`lib/index.ts`)
We maintain a strict boundary between internal logic and public surface area. Users should only import from the root `lib/index.ts` (or `@/lib` in most setups).

**Publicly Exposed:**
- `llmClient`: Unified chat and configuration.
- `vault`: Secure key management.
- `hooks`: React hooks for easy integration.
- `types`: Stable, versioned data types.

## 🛠 Usage

### React Hooks (Recommended)
```typescript
import { useLLM } from '@/lib';

function Chat() {
  const { chat, isLoading } = useLLM();

  const handleSend = async () => {
    const response = await chat({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }]
    });
    console.log(response.content);
  };
}
```

### Direct Core Usage
```typescript
import { llmClient, vault } from '@/lib';

// Unlock and use directly
await vault.unlock('optional-pass');
const result = await llmClient.chat({
    model: 'claude-3-opus',
    messages: [...]
});
```

### Managing Keys
```typescript
import { vault } from '@/lib';

await vault.addKey('openai', 'sk-...', 'My Key', 'high');
const keys = await vault.listKeys();
```

## 🧩 Extending

### Adding a New Provider
1. Create `lib/providers/new-provider/new.adapter.ts` implementing `IProviderAdapter`.
2. Register it in `lib/providers/index.ts`.
3. Add provider constants.

### Adding a New Routing Strategy
1. Implement logic in `lib/services/routing/key-router.ts`.
2. Update `RoutingStrategy` enum in `lib/models/metadata`.
