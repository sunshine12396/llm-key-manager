import { AIProviderId, RateLimitData } from "./provider-metadata";

// Re-export ModelState from state machine for convenience
export type {
  ModelState,
  TransitionEvent,
} from "../../services/availability/state-machine";
import type { ModelState } from "../../services/availability/state-machine";

// Model capability types for filtering
export type ModelCapability =
  | "text-chat" // Generic text generation/chat
  | "text-reasoning" // Advanced reasoning (thinking models)
  | "code" // Code generation
  | "image-gen" // Image generation
  | "image-input" // Can process images as input
  | "audio-tts" // Text to speech
  | "audio-input" // Can process audio as input
  | "video-gen" // Video generation
  | "embedding"; // Text embeddings

/**
 * Priority levels for models and keys.
 * Higher number = higher priority = tried first.
 */
export type ModelPriority = 1 | 2 | 3 | 4 | 5;

/**
 * Detailed metadata for a verified model.
 * Stored per (key, model) combination to track availability, rate limits, and capabilities.
 */
export interface VerifiedModelMetadata {
  modelId: string;
  providerId: AIProviderId;
  keyId: string; // Which key this model was verified with

  // Availability tracking (State Machine)
  isAvailable: boolean;
  /**
   * Current state in the availability state machine.
   * Use ModelStateMachine.transition() to change this value.
   */
  state: ModelState;
  lastCheckedAt: number;

  // Priority for selection (data-driven)
  modelPriority: ModelPriority;

  // Retry tracking (data-driven backoff)
  retryCount: number;
  nextRetryAt: number | null; // null = don't auto-retry (permanent failure)
  lastErrorCode?: number;
  errorMessage?: string;

  // Quota tracking (client-side estimation)
  quotaRemaining?: number; // Estimated remaining quota
  quotaResetAt?: number; // When quota resets

  // Model capabilities
  capabilities?: ModelCapability[];
  rateLimits?: RateLimitData;
  contextWindow?: number;
  maxOutput?: number;
}

// Configuration types
export interface ModelTypeConfig {
  [modelId: string]: ModelCapability[];
}

export interface SpecialModelConfig {
  [alias: string]: string; // e.g. 'fast' -> 'gpt-4o-mini'
}

export interface LLMManagerConfig {
  /**
   * Add or override model capabilities
   * e.g. { 'custom-model': ['text-chat', 'code'] }
   */
  supportedModelTypes?: ModelTypeConfig;

  /**
   * Add or override special model aliases
   * e.g. { 'super-smart': 'gpt-4o' }
   */
  specialModels?: SpecialModelConfig;

  /**
   * Add or override fallback chains for capability groups
   * e.g. { 'fast': ['gpt-3.5-turbo', 'claude-haiku'] }
   */
  fallbackChains?: Record<string, string[]>;
}
