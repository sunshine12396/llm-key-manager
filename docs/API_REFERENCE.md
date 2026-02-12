# API Reference - Unified LLM Client

The `UnifiedLLMClient` is the primary interface for interacting with various LLM providers through a single, standardized API.

## Classes

### `UnifiedLLMClient`

The core client class. An instance is exported as `llmClient` for convenience.

#### Methods

##### `chat(request: ChatRequest, options?: RequestOptions): Promise<ChatResponse>`
Performs a chat completion. Supports automatic fallback chains and provider selection.
- **`request`**: Standard chat request object.
- **`options`**:
    - `providerId`: Force a specific provider (e.g., 'openai').
    - `timeout`: Request timeout in milliseconds.

##### `embeddings(request: EmbeddingRequest, options?: RequestOptions): Promise<EmbeddingResponse>`
Generates text embeddings.
- **`request`**: Standard embedding request object.

##### `generateImage(request: ImageGenerationRequest, options?: RequestOptions): Promise<ImageGenerationResponse>`
Generates an image from a prompt.

##### `transcribeAudio(request: AudioTranscriptionRequest, options?: RequestOptions): Promise<AudioTranscriptionResponse>`
Transcribes audio to text.

##### `textToSpeech(request: TextToSpeechRequest, options?: RequestOptions): Promise<TextToSpeechResponse>`
Generates audio from text.

---

## Core Data Types

### `ChatRequest`
```typescript
interface ChatRequest {
  model: string;            // Concrete model (e.g. 'gpt-4') or alias (e.g. 'fast')
  messages: ChatMessage[];  // Array of messages
  temperature?: number;     // 0.0 to 2.0
  maxTokens?: number;       // Max tokens in response
  stream?: boolean;         // Stream responses (where supported)
  tools?: ToolDefinition[]; // Function calling definitions
}
```

### `ChatResponse`
```typescript
interface ChatResponse {
  content: string;          // Extracted response text
  model: string;            // The actual model used (post-fallback)
  providerId: AIProviderId; // The provider that served the request
  usage?: TokenUsage;       // Token counts and estimated cost
  attempts: number;         // Total attempts (including fallbacks)
}
```

---

## Fallback Mechanism

When a `chat` request is made with a model alias (e.g., `fast`), the client resolves this to a chain defined in configuration or defaults:

1. **Check Stickiness**: If a previous request for this capability succeeded on a specific model, that model is tried first.
2. **Execute Chain**: The client iterates through the fallback chain.
3. **Handle Errors**:
    - **Retriable (5xx, Network)**: Tries the same key again up to the retry limit.
    - **Rate Limit (429)**: Switches to the next available key for that model.
    - **Permanent (401, 403)**: Marks the key as invalid and moves to the next key.
    - **Model Failure**: If all keys for a model fail, it moves to the next model in the fallback chain.
