import { GoogleGenerativeAI } from '@google/generative-ai';

export function createGeminiClient(apiKey: string) {
    return new GoogleGenerativeAI(apiKey);
}
