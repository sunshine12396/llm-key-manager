import { KeyFormatValidationResult } from '../../types';

/**
 * Validate Anthropic key format locally
 */
export function validateKeyFormat(apiKey: string): KeyFormatValidationResult {
    const trimmedKey = apiKey.trim();

    if (!trimmedKey) {
        return {
            isValid: false,
            errorMessage: 'API key cannot be empty',
            hint: 'Please enter your API key'
        };
    }

    if (!trimmedKey.startsWith('sk-ant-')) {
        return {
            isValid: false,
            errorMessage: 'Anthropic keys must start with "sk-ant-"',
            hint: 'Get your API key from https://console.anthropic.com/settings/keys'
        };
    }

    if (trimmedKey.length < 80) {
        return {
            isValid: false,
            errorMessage: 'Anthropic key appears too short',
            hint: 'Anthropic keys are typically 100+ characters'
        };
    }

    if (!/^sk-ant-[a-zA-Z0-9_-]{40,}$/.test(trimmedKey)) {
        return {
            isValid: false,
            errorMessage: 'Invalid Anthropic key format',
            hint: 'Keys should match: sk-ant-api03-xxx...'
        };
    }

    return { isValid: true };
}
