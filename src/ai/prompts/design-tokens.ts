/**
 * @file design-tokens.ts — Prompt Template for Design Token Naming
 *
 * Generates prompts that instruct the LLM to assign semantic names
 * to extracted design tokens (colors, spacings, radii, typography).
 */

/**
 * Token data prepared for the LLM.
 */
export interface RawTokenData {
  colors: Array<{ value: string; usageCount: number }>;
  spacings: Array<{ value: number; usageCount: number }>;
  radii: Array<{ value: number; usageCount: number }>;
  typography: Array<{ fontFamily: string; fontSize: number; fontWeight: string; lineHeight: string; usageCount: number }>;
}

/**
 * Builds the system prompt for design token naming.
 */
export function buildSystemPrompt(): string {
  return `You are a design system engineer naming design tokens.
Your job is to assign semantic names to raw design values extracted from a web page.

Rules for naming:
- Colors: Use purpose-based names (primary, secondary, accent, background, surface, text-primary, text-secondary, border, error, success, warning)
- Spacings: Use t-shirt sizes (spacing-xs, spacing-sm, spacing-md, spacing-lg, spacing-xl, spacing-2xl)
- Radii: Use descriptive sizes (radius-sm, radius-md, radius-lg, radius-full)
- Typography: Use role-based names (heading-1, heading-2, heading-3, body-text, body-small, caption, label, button-text)

Return a JSON object with:
- "colors": array of { "rawValue": string, "semanticName": string }
- "spacings": array of { "rawValue": string, "semanticName": string }
- "radii": array of { "rawValue": string, "semanticName": string }
- "typography": array of { "rawValue": string, "semanticName": string }`;
}

/**
 * Builds the user prompt with extracted raw token data.
 *
 * @param tokens - Raw design token values with usage counts.
 * @returns The user prompt string.
 */
export function buildUserPrompt(tokens: RawTokenData): string {
  return `Assign semantic names to these design tokens (sorted by usage frequency):

${JSON.stringify(tokens, null, 2)}`;
}
