# API Reference

## UnifiedLLMClient

The primary interface. Exported as singleton `llmClient`.

### Methods

| Method | Signature | Description |
|:-------|:----------|:------------|
| `chat` | `chat(request: ChatRequest, options?): Promise<ChatResponse>` | Full multi-model fallback flow |
| `embeddings` | `embeddings(request, options?): Promise<EmbeddingResponse>` | Text embeddings |
| `generateImage` | `generateImage(request, options?): Promise<ImageGenerationResponse>` | Image generation |
| `transcribeAudio` | `transcribeAudio(request, options?): Promise<AudioTranscriptionResponse>` | Audio transcription |
| `textToSpeech` | `textToSpeech(request, options?): Promise<TextToSpeechResponse>` | Text-to-speech |

### Core Types

```typescript
interface ChatRequest {
  model: string;            // Concrete model or alias (e.g. "smart")
  messages: ChatMessage[];
  temperature?: number;     // 0.0 to 2.0
  maxTokens?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
}

interface ChatResponse {
  content: string;
  model: string;            // Actual model used (post-fallback)
  providerId: AIProviderId;
  usage?: TokenUsage;
  attempts: number;         // Total attempts including fallbacks
}
```

### Fallback Behavior

| Error Type | Action |
|:-----------|:-------|
| `5xx` / Network | Retry same key (up to 3x) |
| `429` Rate Limit | Switch to next key for same model |
| `401` / `403` Auth | Mark key invalid, try next key |
| All keys fail | Move to next model in fallback chain |

## React Hooks

| Hook | Purpose |
|:-----|:--------|
| `useLLM()` | `{ chat, isLoading, error }` — main chat interface |
| `useVault()` | Key management (add, list, delete, revoke) |
| `useAvailability()` | Model availability status per provider |
| `useSafetyGuard()` | Safety controls (disable provider/key, circuit status) |
| `useKeyHealth()` | Per-key health metrics |
| `useModelExplorer()` | Browse discovered models per key |
