import {
  AIProviderId,
  RateLimitData,
  KeyVerificationStatus,
  LLMManagerConfig,
} from "../models/metadata";
import {
  ChatRequest,
  ChatResponse,
  TokenUsage,
  EmbeddingRequest,
  EmbeddingResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  AudioTranscriptionRequest,
  AudioTranscriptionResponse,
  TextToSpeechRequest,
  TextToSpeechResponse,
  ToolDefinition,
  ToolCall,
} from "../models/workloads";

export type {
  AIProviderId,
  RateLimitData,
  KeyVerificationStatus,
  LLMManagerConfig,
  ChatRequest,
  ChatResponse,
  TokenUsage,
  EmbeddingRequest,
  EmbeddingResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  AudioTranscriptionRequest,
  AudioTranscriptionResponse,
  TextToSpeechRequest,
  TextToSpeechResponse,
  ToolDefinition,
  ToolCall,
};

/**
 * Publicly visible summary of an API key.
 * Sanitized to remove internal database fields and encryption metadata.
 */
export interface KeySummary {
  id: string;
  providerId: AIProviderId;
  label: string;
  status: KeyVerificationStatus;
  tier?: string;
  isEnabled: boolean;
  isRevoked: boolean;
  priority: "high" | "medium" | "low";
  lastUsedAt?: number;
  models: string[]; // List of verified models
  rateLimits?: RateLimitData;
  nextRetryAt?: number;
}
