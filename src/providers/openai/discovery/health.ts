import { KeyFormatValidationResult } from "../../types";

/**
 * Validate OpenAI key format locally (no network request)
 * OpenAI keys: sk-xxx... or sk-proj-xxx...
 */
export function validateKeyFormat(apiKey: string): KeyFormatValidationResult {
  const key = apiKey.trim();

  if (!key) {
    return {
      isValid: false,
      errorMessage: "API key cannot be empty",
      hint: "Please enter your OpenAI API key",
    };
  }

  // OpenAI standard + project keys
  if (!key.startsWith("sk-")) {
    return {
      isValid: false,
      errorMessage: 'OpenAI keys usually start with "sk-"',
      hint: "Check your API key from OpenAI dashboard",
    };
  }

  // Catch obviously broken keys only
  if (key.length < 20) {
    return {
      isValid: false,
      errorMessage: "API key appears too short",
      hint: "Please double-check the copied key",
    };
  }

  // Avoid overly strict regex validation
  if (!/^sk-[A-Za-z0-9\-_]+$/.test(key)) {
    return {
      isValid: false,
      errorMessage: "API key contains invalid characters",
      hint: "Check for accidental spaces or truncation",
    };
  }

  return { isValid: true };
}
