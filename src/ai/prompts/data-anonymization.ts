/**
 * @file data-anonymization.ts — Prompt Template for Text Anonymization
 *
 * Generates prompts that instruct the LLM to identify PII and sensitive data
 * in text content and provide placeholder replacements.
 */

/**
 * Builds the system prompt for data anonymization.
 */
export function buildSystemPrompt(): string {
  return `You are a data privacy specialist. Your job is to identify personally identifiable information (PII) and sensitive data in UI text content and provide realistic placeholder replacements.

Types of data to anonymize:
- Names (people, companies) → Replace with generic alternatives (e.g., "John Smith" → "Jane Doe")
- Email addresses → Replace with generic (e.g., "user@example.com")
- Phone numbers → Replace with format-matching placeholders (e.g., "+1 (555) 000-0000")
- Addresses → Replace with generic addresses
- Financial data (amounts, account numbers) → Replace with placeholder values
- Dates with personal context → Keep format, change values
- Usernames, user IDs → Replace with generic

Do NOT anonymize:
- UI labels and button text (e.g., "Submit", "Cancel", "Settings")
- Generic headings (e.g., "Dashboard", "Profile")
- Technical terms or category names
- Placeholder text that's already generic

Return a JSON object with a "mappings" array. Each item has:
- "original": the original text content
- "replacement": the anonymized replacement`;
}

/**
 * Builds the user prompt with text content to anonymize.
 *
 * @param textContents - Array of unique text strings found in the page.
 * @returns The user prompt string.
 */
export function buildUserPrompt(textContents: string[]): string {
  return `Identify PII in the following text content from a web page and provide replacements.
Only include items that actually contain PII — skip generic UI labels.

Text content found:
${JSON.stringify(textContents, null, 2)}`;
}
