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
} from "../public/types";

import { LLMManagerConfig, AIProviderId } from "../models";
import { resilientHandler } from "../services/engines/resilience.engine";
import { getProviderAdapter, resolveProviderId } from "../providers";
import { availabilityManager, keyResolver } from "../services/availability";
import { configService } from "../services/config.service";
import { modelDataService } from "../services/model-data.service";
import { LLMError } from "./errors";
import { ResolvedKey } from "../services/availability";

/**
 * UnifiedLLMClient
 *
 * Orchestrates:
 * - Model fallback chains
 * - Key-level load balancing
 * - Automatic failover
 * - Sticky routing
 * - Multi-provider resilience
 */
export class UnifiedLLMClient {
  /**
   * Sticky routing cache:
   * Remembers last successful model/provider for a capability.
   */
  private stickyModels: Map<
    string,
    { modelId: string; providerId: AIProviderId; keyId: string }
  > = new Map();

  configure(config: LLMManagerConfig) {
    configService.configure(config);
  }

  /**
   * -----------------------------
   * CHAT (Full Multi-Model Flow)
   * -----------------------------
   */
  async chat(
    request: ChatRequest,
    options?: { providerId?: AIProviderId; timeout?: number },
  ): Promise<ChatResponse> {
    const capabilityKey = request.model;

    const modelChain = this.resolveChain(
      request.model,
      options?.providerId,
    );
    console.log(`[UnifiedClient] Using model chain for ${request.model}:`, modelChain);

    const permanentlyExcludedKeys = new Set<string>();
    let lastError: Error | null = null;
    let totalAttempts = 0;

    for (const modelId of modelChain) {
      const attemptedKeysForModel = new Set<string>();

      while (true) {
        const sticky = this.stickyModels.get(capabilityKey);

        const resolved = await keyResolver.resolve(modelId, {
          providerId: options?.providerId,
          preferredKeyId: sticky?.keyId,
          excludeKeyIds: [
            ...permanentlyExcludedKeys,
            ...attemptedKeysForModel,
          ],
        });

        if (!resolved) break;

        totalAttempts++;

        try {
          const adapter = getProviderAdapter(resolved.providerId);
          const start = Date.now();

          const response = await adapter.chat(resolved.apiKey, {
            ...request,
            model: resolved.modelId,
          });

          const latency = Date.now() - start;

          await availabilityManager.markModelAvailable(
            resolved.keyId,
            resolved.modelId,
          );

          keyResolver.markSuccess(
            resolved.keyId,
            resolved.modelId,
            resolved.providerId,
          );

          // Sticky update (only if provider not forced)
          if (!options?.providerId) {
            this.stickyModels.set(capabilityKey, {
              modelId: resolved.modelId,
              providerId: resolved.providerId,
              keyId: resolved.keyId,
            });
          }

          this.recordAnalytics(resolved, response, latency).catch(() => { });

          return {
            ...response,
            providerId: resolved.providerId,
            attempts: totalAttempts,
          };
        } catch (error: any) {
          lastError = LLMError.from(error, resolved.providerId);
          const code = (lastError as any)?.code;

          await availabilityManager.handleRuntimeError(
            resolved.keyId,
            resolved.modelId,
            code || 0,
            lastError.message,
          );

          attemptedKeysForModel.add(resolved.keyId);

          if (this.isPermanentFailure(code)) {
            permanentlyExcludedKeys.add(resolved.keyId);
          }

          console.warn(
            `[UnifiedClient] Attempt ${totalAttempts} failed on key ${resolved.keyId} (${resolved.modelId}): ${lastError.message}`,
          );
        }
      }
    }

    if (!lastError) {
      throw new LLMError(
        "No available keys for requested model",
        undefined, // Explicitly no numeric code
        undefined, // No specific provider
        false      // Not retryable
      );
    }

    throw lastError;
  }

  /**
   * Resolve fallback chain + sticky-first logic.
   */
  private resolveChain(
    model: string,
    providerId?: AIProviderId,
  ): string[] {
    let chain: string[] = [];

    const custom = configService.getFallbackChain(model);
    const staticChain = modelDataService.getFallbackChain(model);

    if (custom?.length) {
      chain = [...custom];
    } else if (staticChain?.length) {
      chain = [...staticChain];
    } else {
      const alias =
        configService.getCustomAlias(model) ||
        modelDataService.getAlias(model) ||
        model;

      chain = [alias];
    }

    const sticky = this.stickyModels.get(model);

    if (sticky && !providerId) {
      chain = [
        sticky.modelId,
        ...chain.filter((m) => m !== sticky.modelId),
      ];
    }

    return chain;
  }

  private isPermanentFailure(code?: number) {
    return code === 401 || code === 403;
  }

  private async recordAnalytics(
    resolved: ResolvedKey,
    response: ChatResponse,
    latency: number,
  ) {
    try {
      const { analyticsService } = await import(
        "../services/analytics.service"
      );

      await analyticsService.recordUsage({
        keyId: resolved.keyId,
        providerId: resolved.providerId,
        modelId: response.model,
        inputTokens: response.usage?.promptTokens || 0,
        outputTokens: response.usage?.completionTokens || 0,
        success: true,
        latencyMs: latency,
      });
    } catch {
      // Silent failure
    }
  }

  /**
   * -----------------------------
   * OTHER CAPABILITIES
   * (Single-model resilient flow)
   * -----------------------------
   */

  async embeddings(
    request: EmbeddingRequest,
    options?: { providerId?: AIProviderId; timeout?: number },
  ): Promise<EmbeddingResponse> {
    return this.singleProviderRequest(
      request.model,
      options,
      (adapter, apiKey, providerId) => {
        if (!adapter.embeddings)
          throw new Error(
            `Provider ${providerId} does not support embeddings.`,
          );
        return adapter.embeddings(apiKey, request);
      },
    );
  }

  async generateImage(
    request: ImageGenerationRequest,
    options?: { providerId?: AIProviderId; timeout?: number },
  ): Promise<ImageGenerationResponse> {
    return this.singleProviderRequest(
      request.model,
      options,
      (adapter, apiKey, providerId) => {
        if (!adapter.generateImage)
          throw new Error(
            `Provider ${providerId} does not support image generation.`,
          );
        return adapter.generateImage(apiKey, request);
      },
    );
  }

  async transcribeAudio(
    request: AudioTranscriptionRequest,
    options?: { providerId?: AIProviderId; timeout?: number },
  ): Promise<AudioTranscriptionResponse> {
    return this.singleProviderRequest(
      request.model,
      options,
      (adapter, apiKey, providerId) => {
        if (!adapter.transcribeAudio)
          throw new Error(
            `Provider ${providerId} does not support transcription.`,
          );
        return adapter.transcribeAudio(apiKey, request);
      },
    );
  }

  async textToSpeech(
    request: TextToSpeechRequest,
    options?: { providerId?: AIProviderId; timeout?: number },
  ): Promise<TextToSpeechResponse> {
    return this.singleProviderRequest(
      request.model,
      options,
      (adapter, apiKey, providerId) => {
        if (!adapter.textToSpeech)
          throw new Error(
            `Provider ${providerId} does not support TTS.`,
          );
        return adapter.textToSpeech(apiKey, request);
      },
    );
  }

  private async singleProviderRequest<T>(
    model: string,
    options: { providerId?: AIProviderId; timeout?: number } | undefined,
    executor: (
      adapter: any,
      apiKey: string,
      providerId: AIProviderId,
    ) => Promise<T>,
  ): Promise<T> {
    const providerId =
      options?.providerId || this.inferProvider(model);

    if (!providerId) {
      throw new Error(`Could not infer provider for model: ${model}`);
    }

    const result = await resilientHandler.executeRequest(
      providerId,
      async (apiKey) => {
        const adapter = getProviderAdapter(providerId);
        return executor(adapter, apiKey, providerId);
      },
      { timeout: options?.timeout },
    );

    if (!result.success || !result.data) {
      throw result.error || new Error("Request failed");
    }

    return result.data;
  }

  private inferProvider(model: string): AIProviderId | null {
    return resolveProviderId(model);
  }
}

export const llmClient = new UnifiedLLMClient();
