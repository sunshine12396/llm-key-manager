
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { llmClient } from '../../core/unified-llm.client';
import { resilientHandler } from '../../services/engines/resilience.engine';
import { ChatResponse, ChatRequest } from '../../models/workloads';

// Mock Dependencies
vi.mock('../../services/engines/resilience.engine', () => ({
    resilientHandler: {
        executeRequest: vi.fn()
    }
}));

describe('Unified API Interface', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should automatically select OpenAI provider for gpt-4', async () => {
        // Setup mock to succeed immediately
        const mockResponse: ChatResponse = {
            content: 'Hello from OpenAI',
            model: 'gpt-4',
            usage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 }
        };

        vi.mocked(resilientHandler.executeRequest).mockResolvedValue({
            success: true,
            data: mockResponse,
            keyUsed: 'key-1',
            attempts: 1,
            duration: 100
        });

        const response = await llmClient.chat({
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Hi' }]
        });

        // Verify Abstraction: We got a clean response
        expect(response.content).toBe('Hello from OpenAI');

        // Verify Smart Selection: It called executeRequest with 'openai'
        expect(resilientHandler.executeRequest).toHaveBeenCalledWith(
            'openai',
            expect.any(Function), // The callback
            expect.anything()
        );
    });

    it('should automatically select Anthropic provider for claude-3', async () => {
        const mockResponse: ChatResponse = {
            content: 'Hello from Claude',
            model: 'claude-3-opus-20240229',
            usage: { totalTokens: 15, promptTokens: 10, completionTokens: 5 }
        };

        vi.mocked(resilientHandler.executeRequest).mockResolvedValue({
            success: true,
            data: mockResponse,
            keyUsed: 'key-2',
            attempts: 1,
            duration: 120
        });

        await llmClient.chat({
            model: 'claude-3-opus-20240229',
            messages: [{ role: 'user', content: 'Hi' }]
        });

        expect(resilientHandler.executeRequest).toHaveBeenCalledWith(
            'anthropic',
            expect.any(Function),
            expect.anything()
        );
    });

    it('should throw proper error if provider cannot be inferred', async () => {
        // Assuming 'unknown-model' is not in our registry
        await expect(llmClient.chat({
            model: 'unknown-model-xyz',
            messages: [{ role: 'user', content: 'Hi' }]
        })).rejects.toThrow(/Failover Exhausted/);
        // Note: It throws "Failover Exhausted" because inferProvider returns null, 
        // so providersInOrder is empty, loop doesn't run, and it hits the end throw.
    });

    it('should hide provider complexities (Standardized Interface)', async () => {
        // Regardless of provider, the input and output types are identical
        const request: ChatRequest = {
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Test' }]
        };

        vi.mocked(resilientHandler.executeRequest).mockResolvedValue({
            success: true,
            data: { content: 'Standardized', model: 'gpt-4' },
            keyUsed: 'k1',
            attempts: 1
        });

        const result = await llmClient.chat(request);

        // Consumer doesn't need to know about "choices[0].message" (OpenAI) or "content[0].text" (Claude)
        expect(result).toHaveProperty('content');
        expect(result).toHaveProperty('model');
    });
});
