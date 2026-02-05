import { IProviderAdapter } from "./types";
import { OpenAIPlugin } from "./openai/openai.plugin";
import { AnthropicPlugin } from "./anthropic/anthropic.plugin";
import { GeminiPlugin } from "./gemini/gemini.plugin";
import { AIProviderId } from "../models/metadata";

const adapters: Record<string, IProviderAdapter> = {};

// Register default adapters
function registerAdapter(adapter: IProviderAdapter) {
  adapters[adapter.providerId] = adapter;
}

registerAdapter(new OpenAIPlugin());
registerAdapter(new AnthropicPlugin());
registerAdapter(new GeminiPlugin());

export function getProviderAdapter(providerId: AIProviderId): IProviderAdapter {
  const adapter = adapters[providerId];
  if (!adapter) {
    throw new Error(`No adapter registered for provider: ${providerId}`);
  }
  return adapter;
}

export function registerCustomAdapter(adapter: IProviderAdapter) {
  registerAdapter(adapter);
}

export function resolveProviderId(model: string): AIProviderId | null {
  for (const key of Object.keys(adapters)) {
    const adapter = adapters[key];
    if (adapter.ownsModel(model)) {
      return adapter.providerId;
    }
  }
  return null;
}
