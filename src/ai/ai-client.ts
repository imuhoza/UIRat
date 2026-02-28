/**
 * @file ai-client.ts — Vercel AI SDK Wrapper (Multi-Provider)
 *
 * Provides a unified interface for querying LLMs via the Vercel AI SDK.
 * Supports Anthropic, OpenAI, Google, and OpenAI-compatible custom endpoints.
 *
 * Uses `generateObject` for structured (Zod-validated) output and
 * `generateText` for free-form text responses.
 */

import { generateObject, generateText } from 'ai';
import type { LanguageModel } from 'ai';
import type { z } from 'zod';
import type { AIDesignConfig } from './ai-types.js';
import { getDefaultModel, resolveApiKey, validateProviderConfig } from './ai-config.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum retry attempts for LLM calls. */
const MAX_RETRIES = 2;

/** Backoff delays in ms between retries. */
const RETRY_DELAYS = [1000, 3000];

/** Request timeout in milliseconds. */
const REQUEST_TIMEOUT_MS = 60_000;

// =============================================================================
// MODEL INSTANTIATION
// =============================================================================

/**
 * Creates a Vercel AI SDK model instance from the AI design config.
 *
 * @param config - The AI design configuration.
 * @returns A LanguageModel instance ready for use with generateObject/generateText.
 */
export async function createModelInstance(config: AIDesignConfig): Promise<LanguageModel> {
  const modelId = config.modelId ?? getDefaultModel(config.provider);
  const apiKey = resolveApiKey(config.provider, config.apiKey);

  validateProviderConfig(config.provider, apiKey, config.baseUrl);

  switch (config.provider) {
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      const provider = createAnthropic({ apiKey });
      return provider(modelId);
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai');
      const provider = createOpenAI({ apiKey });
      return provider(modelId);
    }
    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      const provider = createGoogleGenerativeAI({ apiKey });
      return provider(modelId);
    }
    case 'custom': {
      const { createOpenAI } = await import('@ai-sdk/openai');
      const provider = createOpenAI({
        baseURL: config.baseUrl,
        apiKey: apiKey ?? 'no-key-needed',
      });
      return provider(modelId);
    }
  }
}

// =============================================================================
// STRUCTURED QUERIES (generateObject)
// =============================================================================

/**
 * Queries the LLM for a structured response validated against a Zod schema.
 *
 * @param model - The language model instance.
 * @param systemPrompt - System prompt with instructions.
 * @param userPrompt - User prompt with data.
 * @param schema - Zod schema for response validation.
 * @returns The validated response object.
 */
export async function queryLLMStructured<T>(
  model: LanguageModel,
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await generateObject({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        schema,
        abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return result.object;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt] ?? 1000;
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('LLM query failed after retries');
}

// =============================================================================
// TEXT QUERIES (generateText)
// =============================================================================

/**
 * Queries the LLM for a free-form text response.
 *
 * @param model - The language model instance.
 * @param systemPrompt - System prompt with instructions.
 * @param userPrompt - User prompt with data.
 * @returns The text response string.
 */
export async function queryLLMText(
  model: LanguageModel,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return result.text;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt] ?? 1000;
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('LLM query failed after retries');
}

// =============================================================================
// HELPERS
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
