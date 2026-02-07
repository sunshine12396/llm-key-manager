import { KeyFormatValidationResult } from '../../types';

/**
 * Validate Gemini key format locally
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

    if (!trimmedKey.startsWith('AIza')) {
        return {
            isValid: false,
            errorMessage: 'Gemini keys must start with "AIza"',
            hint: 'Get your API key from https://aistudio.google.com/apikey'
        };
    }

    if (trimmedKey.length < 39) {
        return {
            isValid: false,
            errorMessage: 'Gemini key appears too short',
            hint: 'Gemini keys are exactly 39 characters'
        };
    }

    if (!/^AIza[0-9A-Za-z_-]{35,}$/.test(trimmedKey)) {
        return {
            isValid: false,
            errorMessage: 'Invalid Gemini key format',
            hint: 'Keys should match: AIzaXXXXXXXXXXXXXXX...'
        };
    }

    return { isValid: true };
}
