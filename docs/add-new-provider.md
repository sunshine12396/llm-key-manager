# How to Add a New Provider

The system is designed to be extensible. Adding a new provider involved implementing a standard interface and registering it.

## 1. Implement `IProviderAdapter`

Create a new adapter class in `lib/providers/{provider_name}/adapter.ts`. It must implement the `IProviderAdapter` interface defined in `lib/providers/types.ts`.

**Required Properties:**

- `providerId`: A unique string ID (e.g., `mistral`, `together`).
- `baseUrl`: The API base URL.

**Required Methods:**

- `ownsModel(modelId)`: Checks if a model ID belongs to this provider (for inference).
- `chat(apiKey, request)`: Maps the unified `ChatRequest` to the provider's specific API format and returns a `ChatResponse`.
- `listModels(apiKey)`: Fetches available models from the provider.
- `validateKeyFormat(apiKey)`: A regex check for the key format (e.g., starts with `sk-`).
- `checkRateLimits(apiKey, modelId?)`: Makes a lightweight request (e.g., 1 token) to fetch the latest rate limit headers from the provider.

**Optional Methods:**

- `embeddings`, `generateImage`, `transcribeAudio`, `textToSpeech`: Implement if the provider supports these modalities.

## 2. Register the Adapter

In `lib/providers/provider.registry.ts`:

1. Import your new adapter class.
2. Register it using `registerAdapter`.

```typescript
import { MistralAdapter } from "./mistral/adapter";

// ... existing registrations
registerAdapter(new MistralAdapter());
```

## 3. Update Types (Optional but Recommended)

Add the new provider ID to the `AIProviderId` type definition in `lib/models/metadata/provider-metadata.ts` to ensure type safety across the application.

```typescript
export type AIProviderId = "openai" | "anthropic" | "gemini" | "mistral";
```

## 4. Verification

1. Add a new key for the provider in the GUI.
2. Verify that validation passes and models are discovered.
3. Test a chat request using a model from the new provider.
