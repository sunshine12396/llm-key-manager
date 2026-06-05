# How to Add a New Provider

## 1. Implement `IProviderAdapter`

Create `src/providers/{name}/adapter.ts` implementing `IProviderAdapter` from `src/providers/types.ts`.

**Required:**
- `providerId` — unique string (e.g., `mistral`)
- `baseUrl` — API base URL
- `ownsModel(modelId)` — model ownership check
- `chat(apiKey, request)` — map to provider's API
- `listModels(apiKey)` — fetch available models
- `validateKeyFormat(apiKey)` — regex format check
- `checkRateLimits(apiKey, modelId?)` — fetch rate limit headers

**Optional:** `embeddings`, `generateImage`, `transcribeAudio`, `textToSpeech`

## 2. Register the Adapter

In `src/providers/provider.registry.ts`:

```typescript
import { MistralAdapter } from "./mistral/adapter";
registerAdapter(new MistralAdapter());
```

## 3. Update Types

Add provider ID to `AIProviderId` in `src/models/metadata/provider-metadata.ts`:

```typescript
export type AIProviderId = "openai" | "anthropic" | "gemini" | "mistral";
```

## 4. Add Static Data (Optional)

- `src/constants/providers.json` — provider metadata
- `src/constants/models.json` — model capabilities
- `src/constants/pricing.json` — per-model pricing
- `src/constants/limits.json` — context window sizes

## 5. Verify

1. Add a key via the GUI → format validation works
2. Background validation discovers models
3. Chat request succeeds
4. Invalid key → properly marked `invalid`
