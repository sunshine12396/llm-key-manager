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
import { availabilityManager } from "../services/availability";
import { configService } from "../services/config.service";
import { modelDataService } from "../services/model-data.service";
import { extractErrorCode, LLMError } from "./errors";
import { matchModelsToVerified } from "./model-matching";

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
    // 1. Determine the capability category (for stickiness)
    const capabilityKey = request.model;

    // 2. Determine the chain of models to try
    let fullModelChain: string[] = [];

    // Check dynamic config fallback chains first
    const customChain = configService.getFallbackChain(request.model);

    if (customChain) {
      fullModelChain = [...customChain];
    } else if (modelDataService.getFallbackChain(request.model)) {
      fullModelChain = [...modelDataService.getFallbackChain(request.model)!];
    } else {
      // Check dynamic config for aliases first, then data-driven defaults
      const customAlias = configService.getCustomAlias(request.model);
      const mapped = customAlias || modelDataService.getAlias(request.model);
      fullModelChain = [mapped];
    }

    // Apply Stickiness: If we have a working model for this capability, try it FIRST
    const sticky = this.stickyModels.get(capabilityKey);
    if (sticky && !options?.providerId) {
      // Remove from chain if it exists, and prepend to start
      fullModelChain = [
        sticky.modelId,
        ...fullModelChain.filter((m) => m !== sticky.modelId),
      ];
    }

    // 3. Identify unique providers in the chain in order of appearance
    const providersInOrder: AIProviderId[] = [];
    for (const modelId of fullModelChain) {
      const p = this.inferProvider(modelId);
      if (p && !providersInOrder.includes(p)) {
        if (options?.providerId && p !== options.providerId) continue;
        providersInOrder.push(p);
      }
    }

    let totalAttempts = 0;
    let lastError: Error | null = null;

    // 4. Iterate through Providers
    for (const providerId of providersInOrder) {
      const providerModels = fullModelChain.filter(
        (m) => this.inferProvider(m) === providerId,
      );

      try {
        const result = await resilientHandler.executeRequest(
          providerId,
          async (apiKey, keyMetadata) => {
            let keyLastError: Error | null = null;

            // Use extracted model matching utility
            const matchResult = matchModelsToVerified(
              providerModels,
              keyMetadata,
              providerId,
            );

            // Log all messages from matching
            matchResult.logMessages.forEach((msg) => {
              if (msg.includes("[Strict Mode]")) {
                console.warn(msg);
              } else {
                console.log(msg);
              }
            });

            const modelsToTry = matchResult.modelsToTry;

            if (modelsToTry.length === 0) {
              throw new LLMError(
                `Key ${keyMetadata.label} has no verified models available.`,
                undefined,
                providerId,
              );
            }

            // Try every model in the list
            for (const modelId of modelsToTry) {
              // Logic Fix: Check if model is actually available (state-aware)
              const isUsable = await availabilityManager.isModelUsable(
                keyMetadata.id,
                modelId,
              );
              if (!isUsable) {
                console.log(
                  `[Failover] Skipping ${modelId} on ${keyMetadata.label} (Not AVAILABLE or in COOLDOWN)`,
                );
                continue;
              }

              totalAttempts++;
              try {
                const adapter = getProviderAdapter(providerId);
                const result = await adapter.chat(apiKey, {
                  ...request,
                  model: modelId,
                });

                // Success - mark model as available
                availabilityManager
                  .markModelAvailable(keyMetadata.id, modelId)
                  .catch(() => { });

                return result;
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                keyLastError = e instanceof Error ? e : new Error(msg);

                // Extract error code from message using imported utility
                const errorCode = extractErrorCode(msg);

                if (errorCode) {
                  availabilityManager
                    .handleRuntimeError(keyMetadata.id, modelId, errorCode, msg)
                    .catch(() => { });
                }

                if (
                  errorCode === 401 ||
                  msg.includes("unauthorized") ||
                  msg.includes("invalid_api_key")
                ) {
                  console.error(
                    `[Fatal] Key ${keyMetadata.label} is invalid. Skipping all models.`,
                  );
                  throw e;
                }

                if (errorCode === 429) {
                  console.warn(
                    `[RateLimit] Model ${modelId} hit rate limit on ${keyMetadata.label}. Trying next model...`,
                  );
                  continue;
                }

                if (errorCode === 404) {
                  console.warn(
                    `[NotFound] Model ${modelId} not found. Trying next model...`,
                  );
                  continue;
                }

                console.warn(
                  `[Retry] Model ${modelId} failed: ${msg}. Trying next model on same key...`,
                );
              }
            }

            throw (
              keyLastError ||
              new Error(`All models failed for key ${keyMetadata.label}`)
            );
          },
          { timeout: options?.timeout, modelId: providerModels[0] },
        );

        if (result.success && result.data && result.keyUsed) {
          // Save stickiness
          this.stickyModels.set(capabilityKey, {
            modelId: result.data.model,
            providerId,
          });

          // Record analytics
          try {
            const { analyticsService } =
              await import("../services/analytics.service");
            analyticsService.recordUsage({
              keyId: result.keyUsed,
              providerId,
              modelId: result.data.model,
              inputTokens: result.data.usage?.promptTokens || 0,
              outputTokens: result.data.usage?.completionTokens || 0,
              success: true,
              latencyMs: result.duration || 0,
            });
          } catch (e) {
            // Ignore analytics errors
          }

          return {
            ...result.data,
            providerId,
            attempts: totalAttempts,
          };
        }

        if (result.error) {
          const isGenericError =
            result.error.message.includes("No available keys") ||
            (result.error.message.includes("No ") &&
              result.error.message.includes("keys configured"));
          if (!lastError || !isGenericError) {
            lastError = result.error;
          }
          console.warn(
            `[Failover] Provider ${providerId} failed: ${result.error.message}`,
          );
        }
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        console.warn(
          `[Failover] Provider ${providerId} threw:`,
          lastError.message,
        );
      }
    }

    const triedProviders = providersInOrder.join(", ") || "none";
    const lastContext = lastError?.message || "Unknown reason";
    throw new Error(
      `UnifiedLLMClient Failover Exhausted (after ${totalAttempts} total attempts across keys). Tried providers: [${triedProviders}]. Last failure: ${lastContext}`,
    );
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
