import { KeyFormatValidationResult } from '../../types';

/**
 * Validate OpenAI key format locally (no network request)
 * OpenAI keys: sk-xxx... or sk-proj-xxx...
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

    if (!trimmedKey.startsWith('sk-')) {
        return {
            isValid: false,
            errorMessage: 'OpenAI keys must start with "sk-"',
            hint: 'Get your API key from https://platform.openai.com/api-keys'
        };
    }

    if (trimmedKey.length < 40) {
        return {
            isValid: false,
            errorMessage: 'OpenAI key appears too short',
            hint: 'OpenAI keys are typically 51+ characters'
        };
    }

    if (!/^sk-(proj-)?[A-Za-z0-9_-]{30,}$/.test(trimmedKey)) {
        return {
            isValid: false,
            errorMessage: 'Invalid OpenAI key format',
            hint: 'Keys should match: sk-xxx... or sk-proj-xxx...'
        };
    }

    return { isValid: true };
}
