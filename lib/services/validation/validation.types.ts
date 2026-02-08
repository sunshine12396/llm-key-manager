/**
 * Validation Types
 *
 * Types and events for the key validation system.
 */

import type { AIProviderId, VerifiedModelMetadata } from "../../models/types";

// ============================================
// LOG ENTRY
// ============================================

export interface ValidationLogEntry {
  keyId: string;
  provider: AIProviderId;
  label: string;
  timestamp: number;
  model: string;
  status: "success" | "error";
  message: string;
  duration: number;
}

// ============================================
// EVENTS
// ============================================

export type ValidationEventType =
  | "validation:start"
  | "validation:model"
  | "validation:complete"
  | "validation:error";

export type ValidationEvent =
  | {
      type: "validation:start";
      keyId: string;
      provider: AIProviderId;
      label: string;
      totalModels?: number;
    }
  | {
      type: "validation:model";
      keyId: string;
      provider: AIProviderId;
      label: string;
      model: string;
      status: VerifiedModelMetadata;
      current: number;
      total: number;
    }
  | {
      type: "validation:complete";
      keyId: string;
      provider: AIProviderId;
      label: string;
      success: boolean;
      modelsFound: number;
      totalModels: number;
    }
  | {
      type: "validation:error";
      keyId: string;
      provider: AIProviderId;
      label: string;
      error: Error;
    };

export type ValidationEventListener = (event: ValidationEvent) => void;

// ============================================
// TASK QUEUE
// ============================================

export interface ValidationTask {
  keyId: string;
  providerId: AIProviderId;
  label: string;
  apiKey: string;
  isRetry: boolean;
  priority: number; // 0 = low, 1 = normal, 2 = high (user action)
  queuedAt: number;
}

// ============================================
// CONFIGURATION
// ============================================

/**
 * Models to check per provider.
 * - If a provider has models configured → use those
 * - If empty array or not configured → uses dynamic discovery via adapter.listModels()
 */
export type ProviderModelsConfig = Partial<Record<AIProviderId, string[]>>;

export interface ValidationConfig {
  maxConcurrency: number;
  batchSize: number;
  /**
   * Provider-keyed model lists for targeted validation.
   * If empty for a provider, uses dynamic discovery via adapter.listModels().
   * Example: { openai: ["gpt-4", "gpt-3.5-turbo"], gemini: ["gemini-pro"] }
   */
  modelsByProvider: ProviderModelsConfig;
}

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  maxConcurrency: 3,
  batchSize: 5,
  modelsByProvider: {
    openai: [],
    anthropic: [],
    gemini: [],
  },
};
