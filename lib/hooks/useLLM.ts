import { useState, useCallback } from "react";
import { llmClient } from "../core/unified-llm.client";
import {
  ChatRequest,
  EmbeddingRequest,
  ImageGenerationRequest,
  AudioTranscriptionRequest,
  TextToSpeechRequest,
} from "../models/workloads";
import { AIProviderId } from "../models/metadata";

export function useLLM() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const chat = useCallback(
    async (
      request: ChatRequest,
      options?: { providerId?: AIProviderId; timeout?: number },
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await llmClient.chat(request, options);
        return response;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const embeddings = useCallback(
    async (
      request: EmbeddingRequest,
      options?: { providerId?: AIProviderId; timeout?: number },
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        return await llmClient.embeddings(request, options);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const generateImage = useCallback(
    async (
      request: ImageGenerationRequest,
      options?: { providerId?: AIProviderId; timeout?: number },
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        return await llmClient.generateImage(request, options);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const transcribeAudio = useCallback(
    async (
      request: AudioTranscriptionRequest,
      options?: { providerId?: AIProviderId; timeout?: number },
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        return await llmClient.transcribeAudio(request, options);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const textToSpeech = useCallback(
    async (
      request: TextToSpeechRequest,
      options?: { providerId?: AIProviderId; timeout?: number },
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        return await llmClient.textToSpeech(request, options);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return {
    chat,
    embeddings,
    generateImage,
    transcribeAudio,
    textToSpeech,
    isLoading,
    error,
  };
}
