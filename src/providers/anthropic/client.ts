import Anthropic from '@anthropic-ai/sdk';

export function createAnthropicClient(apiKey: string) {
    return new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true
    });
}
