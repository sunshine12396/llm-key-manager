import {
  ChatRequest,
  ChatResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  AudioTranscriptionRequest,
  AudioTranscriptionResponse,
  TextToSpeechRequest,
  TextToSpeechResponse,
} from "../models/workloads";
import { resilientHandler } from "../services/engines/resilience.engine";
import { getProviderAdapter, resolveProviderId } from "../providers";
import { AIProviderId, LLMManagerConfig } from "../models/metadata";
import { availabilityManager, keyResolver } from "../services/availability";
import { configService } from "../services/config.service";
import { modelDataService } from "../services/model-data.service";
import { extractErrorCode } from "./errors";

export class UnifiedLLMClient {
  // Optimization: Remember the model/provider that actually worked to avoid re-running fallbacks
  private stickyModels: Map<
    string,
    { modelId: string; providerId: AIProviderId }
  > = new Map();

  /**
   * Initialize/Update configuration for the library
   */
  configure(config: LLMManagerConfig) {
    configService.configure(config);
  }

  /**
   * unifiedChat
   * The main entry point for the Unified API.
   * Takes a standard ChatRequest and handles provider selection, routing, and resilience.
   */
  async chat(
    request: ChatRequest,
    options?: { providerId?: AIProviderId; timeout?: number },
  ): Promise<ChatResponse> {
    const capabilityKey = request.model;
    let fullModelChain: string[] = [];

    // 1. Resolve Chain
    const customChain = configService.getFallbackChain(request.model);
    if (customChain) {
      fullModelChain = [...customChain];
    } else if (modelDataService.getFallbackChain(request.model)) {
      fullModelChain = [...modelDataService.getFallbackChain(request.model)!];
    } else {
      const customAlias = configService.getCustomAlias(request.model);
      const mapped = customAlias || modelDataService.getAlias(request.model);
      fullModelChain = [mapped];
    }

    // 2. Apply Stickiness
    const sticky = this.stickyModels.get(capabilityKey);
    if (sticky && !options?.providerId) {
      fullModelChain = [
        sticky.modelId,
        ...fullModelChain.filter((m) => m !== sticky.modelId),
      ];
    }

    // 3. Execution Loop
    const excludedKeys: string[] = [];
    let lastError: Error | null = null;
    let totalAttempts = 0;

    for (const modelId of fullModelChain) {
      // Reset excluded keys for the new model in the chain
      // optimization: if keyId X failed on model A, it might still work on model B? 
      // usually if it's 429 quota, it fails for all models on that key.
      // But let's be safe and clear distinct exclusions per model loop or keep global?
      // Current logic: we want to exhaust keys for THIS model.
      // If we keep excludedKeys global, we might skip a key that works for model B but failed for A.
      // However, usually a key failure is key-wide (quota/auth).
      // Let's use a local exclusion list for the current model loop.
      const modelAttempts: string[] = [];

      // Loop until we exhaust keys for this model
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // Find best key for this model
        // We pass ALL globally failed keys + current attempts
        const resolved = await keyResolver.resolve(modelId, {
          providerId: options?.providerId,
          excludeKeyIds: [...excludedKeys, ...modelAttempts],
        });

        if (!resolved) {
          // No more keys for this specific model, move to next model in chain
          break;
        }

        totalAttempts++;
        try {
          const adapter = getProviderAdapter(resolved.providerId);

          const start = Date.now();
          const response = await adapter.chat(resolved.apiKey, {
            ...request,
            model: resolved.modelId,
          });
          const duration = Date.now() - start;

          // Success Handling
          availabilityManager
            .markModelAvailable(resolved.keyId, resolved.modelId)
            .catch(() => { });
          keyResolver.markSuccess(
            resolved.keyId,
            resolved.modelId,
            resolved.providerId,
          );

          // Update Sticky
          this.stickyModels.set(capabilityKey, {
            modelId: resolved.modelId,
            providerId: resolved.providerId,
          });

          // Analytics
          // dynamically import to avoid circular dependency if any, or just use import
          // using existing structure
          this.recordAnalytics(resolved, response, duration).catch(() => { });

          return {
            ...response,
            providerId: resolved.providerId,
            attempts: totalAttempts,
          };
        } catch (error: any) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const msg = lastError.message;
          const code = extractErrorCode(msg);

          // Error Handling
          await availabilityManager.handleRuntimeError(
            resolved.keyId,
            resolved.modelId,
            code || 0,
            msg,
          );

          // Mark failure in resolver cache immediately to avoid picking it again
          // For 429/403 (Quota), the resolver marks it as COOLDOWN for this model.
          keyResolver.markFailure(resolved.keyId, resolved.modelId);

          // Add to local exclusion list so internal loop asks for next key
          modelAttempts.push(resolved.keyId);

          // If it's a HARD failure (Auth/Quota) or persistent error, add to global exclusion too
          if (code === 401 || code === 403 || code === 429 || code === 500) {
            excludedKeys.push(resolved.keyId);
          }

          console.warn(
            `[UnifiedClient] Attempt ${totalAttempts} failed on key ${resolved.keyId} (${resolved.modelId}): ${msg}`,
          );


          // Fatal errors?
          if (
            code === 401 ||
            msg.includes("unauthorized") ||
            msg.includes("invalid_api_key")
          ) {
            // For fatal auth errors, we disable key via safety guard (handled by handleRuntimeError)
            // But we continue loop to try simplified flow
          }
        }
      }
    }

    throw (
      lastError ||
      new Error(`All models failed. Tried: ${fullModelChain.join(", ")}`)
    );
  }

  private async recordAnalytics(
    resolved: any,
    response: ChatResponse,
    duration: number,
  ) {
    try {
      const { analyticsService } =
        await import("../services/analytics.service");
      await analyticsService.recordUsage({
        keyId: resolved.keyId,
        providerId: resolved.providerId,
        modelId: response.model,
        inputTokens: response.usage?.promptTokens || 0,
        outputTokens: response.usage?.completionTokens || 0,
        success: true,
        latencyMs: duration,
      });
    } catch (e) {
      // ignore
    }
  }

  async embeddings(
    request: EmbeddingRequest,
    options?: { providerId?: AIProviderId; timeout?: number },
  ): Promise<EmbeddingResponse> {
    const providerId = options?.providerId || this.inferProvider(request.model);
    if (!providerId)
      throw new Error(`Could not infer provider for model: ${request.model}`);

    const result = await resilientHandler.executeRequest(
      providerId,
      async (apiKey) => {
        const adapter = getProviderAdapter(providerId);
        if (!adapter.embeddings)
          throw new Error(
            `Provider ${providerId} does not support embeddings.`,
          );
        return await adapter.embeddings(apiKey, request);
      },
      { timeout: options?.timeout },
    );

    if (!result.success || !result.data) {
      throw result.error || new Error("Embeddings generation failed");
    }

    return result.data;
  }

  async generateImage(
    request: ImageGenerationRequest,
    options?: { providerId?: AIProviderId; timeout?: number },
  ): Promise<ImageGenerationResponse> {
    const providerId = options?.providerId || this.inferProvider(request.model);
    if (!providerId)
      throw new Error(`Could not infer provider for model: ${request.model}`);

    const result = await resilientHandler.executeRequest(
      providerId,
      async (apiKey) => {
        const adapter = getProviderAdapter(providerId);
        if (!adapter.generateImage)
          throw new Error(
            `Provider ${providerId} does not support image generation.`,
          );
        return await adapter.generateImage(apiKey, request);
      },
      { timeout: options?.timeout },
    );

    if (!result.success || !result.data) {
      throw result.error || new Error("Image generation failed");
    }

    return result.data;
  }

  async transcribeAudio(
    request: AudioTranscriptionRequest,
    options?: { providerId?: AIProviderId; timeout?: number },
  ): Promise<AudioTranscriptionResponse> {
    const providerId = options?.providerId || this.inferProvider(request.model);
    if (!providerId)
      throw new Error(`Could not infer provider for model: ${request.model}`);

    const result = await resilientHandler.executeRequest(
      providerId,
      async (apiKey) => {
        const adapter = getProviderAdapter(providerId);
        if (!adapter.transcribeAudio)
          throw new Error(
            `Provider ${providerId} does not support audio transcription.`,
          );
        return await adapter.transcribeAudio(apiKey, request);
      },
      { timeout: options?.timeout },
    );

    if (!result.success || !result.data) {
      throw result.error || new Error("Audio transcription failed");
    }

    return result.data;
  }

  async textToSpeech(
    request: TextToSpeechRequest,
    options?: { providerId?: AIProviderId; timeout?: number },
  ): Promise<TextToSpeechResponse> {
    const providerId = options?.providerId || this.inferProvider(request.model);
    if (!providerId)
      throw new Error(`Could not infer provider for model: ${request.model}`);

    const result = await resilientHandler.executeRequest(
      providerId,
      async (apiKey) => {
        const adapter = getProviderAdapter(providerId);
        if (!adapter.textToSpeech)
          throw new Error(
            `Provider ${providerId} does not support text-to-speech.`,
          );
        return await adapter.textToSpeech(apiKey, request);
      },
      { timeout: options?.timeout },
    );

    if (!result.success || !result.data) {
      throw result.error || new Error("Text to speech failed");
    }

    return result.data;
  }

  /**
   * inferProvider
   * Tries to guess the provider from the model ID string.
   */
  private inferProvider(model: string): AIProviderId | null {
    return resolveProviderId(model);
  }
}

export const llmClient = new UnifiedLLMClient();
