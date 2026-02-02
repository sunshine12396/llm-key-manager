/**
 * Model Matching Utilities
 *
 * Provides fuzzy matching logic for mapping requested models to verified models.
 * Extracted from unified-llm.client.ts for better maintainability.
 */

import { AIProviderId, KeyMetadata } from "../models/metadata";

// ============================================
// PROVIDER CONSTANTS
// ============================================

/** Gemini model family identifiers */
const GEMINI_FAMILIES = {
  flash: "flash",
  pro: "pro",
} as const;

const GEMINI_PREFIX = "gemini-";

// ============================================
// MODEL MATCHING LOGIC
// ============================================

export interface ModelMatchResult {
  modelsToTry: string[];
  matchMode: "verified" | "fuzzy" | "fallback" | "speculative" | "none";
  logMessages: string[];
}

/**
 * Match requested models against verified models for a key.
 * Implements smart fuzzy matching for provider-specific model naming.
 *
 * @param requestedModels - Models requested by the user
 * @param keyMetadata - Key metadata including verified models
 * @param providerId - The provider ID for provider-specific matching
 * @returns Models to try with match mode and log messages
 */
export function matchModelsToVerified(
  requestedModels: string[],
  keyMetadata: KeyMetadata,
  providerId: AIProviderId,
): ModelMatchResult {
  const logs: string[] = [];
  const isFullyVerified = keyMetadata.verificationStatus === "valid";
  const verifiedModels = keyMetadata.verifiedModels ?? [];
  const hasVerifiedModels = verifiedModels.length > 0;

  // Case 1: Key is explicitly marked invalid
  if (keyMetadata.verificationStatus === "invalid") {
    logs.push(
      `[Strict Mode] Key ${keyMetadata.label} is explicitly marked INVALID. Skipping.`,
    );
    return { modelsToTry: [], matchMode: "none", logMessages: logs };
  }

  // Case 2: Key is not fully verified - use speculative mode
  if (!isFullyVerified || !hasVerifiedModels) {
    logs.push(
      `[Speculative Mode] Key ${keyMetadata.label} is ${keyMetadata.verificationStatus || "untested"}. Trying based on requested models.`,
    );
    return {
      modelsToTry: [...new Set(requestedModels)],
      matchMode: "speculative",
      logMessages: logs,
    };
  }

  // Case 3: Smart fuzzy matching for verified keys
  const verifiedSet = new Set(verifiedModels);
  let matchMode: "verified" | "fuzzy" | "fallback" = "verified";

  const matchedModels = requestedModels
    .map((requested) => {
      // 1. Try exact match
      if (verifiedSet.has(requested)) {
        return requested;
      }

      // 2. Provider-specific fuzzy matching
      const fuzzyMatch = fuzzyMatchModel(requested, verifiedModels, providerId);
      if (fuzzyMatch) {
        logs.push(
          `[Fuzzy Match] Upgrading ${requested} -> ${fuzzyMatch} for ${providerId} on ${keyMetadata.label}`,
        );
        matchMode = "fuzzy";
        return fuzzyMatch;
      }

      return requested;
    })
    .filter((m) => verifiedSet.has(m));

  // Case 4: If no matches found, fall back to all verified models
  if (matchedModels.length === 0 && verifiedModels.length > 0) {
    logs.push(
      `[Fallback] No exact match found. Trying ALL ${verifiedModels.length} verified models on ${keyMetadata.label}`,
    );
    return {
      modelsToTry: [...new Set(verifiedModels)],
      matchMode: "fallback",
      logMessages: logs,
    };
  }

  return {
    modelsToTry: [...new Set(matchedModels)],
    matchMode,
    logMessages: logs,
  };
}

/**
 * Provider-specific fuzzy matching for model names.
 * Handles naming variations across provider model versions.
 */
function fuzzyMatchModel(
  requested: string,
  verifiedModels: string[],
  providerId: AIProviderId,
): string | null {
  switch (providerId) {
    case "gemini":
      return fuzzyMatchGemini(requested, verifiedModels);
    case "openai":
      return fuzzyMatchOpenAI(requested, verifiedModels);
    case "anthropic":
      return fuzzyMatchAnthropic(requested, verifiedModels);
    default:
      return null;
  }
}

/**
 * Gemini-specific fuzzy matching.
 * Matches model families (flash, pro) when exact version isn't available.
 */
function fuzzyMatchGemini(
  requested: string,
  verifiedModels: string[],
): string | null {
  if (!requested.startsWith(GEMINI_PREFIX)) {
    return null;
  }

  // Determine family from requested model
  const family = requested.includes(GEMINI_FAMILIES.flash)
    ? GEMINI_FAMILIES.flash
    : requested.includes(GEMINI_FAMILIES.pro)
      ? GEMINI_FAMILIES.pro
      : null;

  if (!family) {
    return null;
  }

  // Find a verified model in the same family
  return verifiedModels.find((m) => m.includes(family)) ?? null;
}

/**
 * OpenAI-specific fuzzy matching.
 * Matches base model names when specific versions aren't available.
 */
function fuzzyMatchOpenAI(
  requested: string,
  verifiedModels: string[],
): string | null {
  // Extract base model name
  // 1. Try reasoning models first (o1, o3)
  const reasoningPatterns = ["o1", "o3-mini"];
  for (const base of reasoningPatterns) {
    if (requested.startsWith(base)) {
      // Find verified model with same base
      const match = verifiedModels.find((m) => m.startsWith(base));
      if (match && match !== requested) return match;
    }
  }

  // 2. Try GPT models
  const gptPatterns = ["gpt-4o", "gpt-4", "gpt-3.5"];
  for (const base of gptPatterns) {
    if (requested.startsWith(base)) {
      // Find verified model with same base, preferring non-dated versions or newer ones
      const matches = verifiedModels.filter((m) => m.startsWith(base));

      // If we found matches, try to pick the best one
      if (matches.length > 0) {
        // Prefer exact base match if available (e.g. 'gpt-4')
        if (matches.includes(base)) return base;

        // Otherwise take the first available one (usually sorted by newer in discovery)
        return matches[0];
      }
    }
  }

  // 3. Fallback: Strip dates (e.g. gpt-4-0125 -> gpt-4)
  const dateStripped = requested.replace(/-\d{4}-\d{2}-\d{2}|-\d{4}/g, "");
  if (dateStripped !== requested) {
    const match = verifiedModels.find((m) => m.startsWith(dateStripped));
    if (match) return match;
  }

  return null;
}

/**
 * Anthropic-specific fuzzy matching.
 * Matches Claude model families when specific versions aren't available.
 */
function fuzzyMatchAnthropic(
  requested: string,
  verifiedModels: string[],
): string | null {
  // Claude model patterns: claude-3-opus, claude-3-sonnet, claude-3-haiku
  const claudeFamilies = ["opus", "sonnet", "haiku"];

  for (const family of claudeFamilies) {
    if (requested.includes(family)) {
      const match = verifiedModels.find((m) => m.includes(family));
      if (match && match !== requested) {
        return match;
      }
    }
  }

  return null;
}
