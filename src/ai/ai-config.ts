/**
 * @file ai-config.ts — AI Provider Registry and Model Defaults
 *
 * Manages provider-specific configuration: default model IDs, environment
 * variable resolution, and provider instantiation settings.
 */

import type { AIProvider } from './ai-types.js';

// =============================================================================
// DEFAULT MODELS PER PROVIDER
// =============================================================================

/** Default model ID for each provider. */
const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
  custom: 'gpt-4o',
};

/** Environment variable names for API keys. */
const API_KEY_ENV_VARS: Record<Exclude<AIProvider, 'custom'>, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
};

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Gets the default model ID for a provider.
 *
 * @param provider - The AI provider.
 * @returns The default model ID string.
 */
export function getDefaultModel(provider: AIProvider): string {
  return DEFAULT_MODELS[provider];
}

/**
 * Resolves the API key for a provider from config or environment variables.
 *
 * @param provider - The AI provider.
 * @param configApiKey - Optional API key from config override.
 * @returns The resolved API key, or undefined if not found.
 */
export function resolveApiKey(
  provider: AIProvider,
  configApiKey?: string,
): string | undefined {
  if (configApiKey) return configApiKey;

  if (provider === 'custom') return undefined;

  const envVar = API_KEY_ENV_VARS[provider];
  return process.env[envVar];
}

/**
 * Validates that a provider configuration is usable.
 *
 * @param provider - The AI provider.
 * @param apiKey - The resolved API key.
 * @param baseUrl - The base URL (required for custom provider).
 * @throws Error if configuration is invalid.
 */
export function validateProviderConfig(
  provider: AIProvider,
  apiKey: string | undefined,
  baseUrl: string | undefined,
): void {
  if (provider === 'custom' && !baseUrl) {
    throw new Error(
      'Custom provider requires --ai-base-url (e.g., http://localhost:11434/v1)',
    );
  }

  if (provider !== 'custom' && !apiKey) {
    const envVar = API_KEY_ENV_VARS[provider];
    throw new Error(
      `No API key found for ${provider}. Set ${envVar} or pass --ai-api-key.`,
    );
  }
}
