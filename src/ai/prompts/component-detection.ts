/**
 * @file component-detection.ts — Prompt Template for Component Pattern Detection
 *
 * Generates prompts that instruct the LLM to identify repeated UI patterns
 * across the page and group them as reusable components.
 */

import type { CIRNodeSummary } from '../ai-types.js';

/**
 * Builds the system prompt for component detection.
 */
export function buildSystemPrompt(): string {
  return `You are a design system architect analyzing a web page's structure.
Your job is to identify repeated UI patterns that should be Figma components.

Rules:
- Look for elements with similar structure, size, and content patterns
- Common component patterns: Card, ListItem, NavItem, Button variant, Badge, Avatar, Tag, MenuItem, TableRow, FormField
- A component needs at least 2 instances to be worth extracting
- Name components with PascalCase (e.g., "ProductCard", "NavItem")
- Provide a brief description of each detected component

Return a JSON object with a "components" array. Each item has:
- "name": component name (PascalCase)
- "instanceNodeIds": array of node IDs that are instances
- "description": brief description of the component pattern`;
}

/**
 * Builds the user prompt with node data for component detection.
 *
 * @param nodes - Summarized CIR nodes to analyze.
 * @param scope - "local" for single page, "global" for cross-page.
 * @returns The user prompt string.
 */
export function buildUserPrompt(
  nodes: CIRNodeSummary[],
  scope: 'local' | 'global',
): string {
  const scopeHint = scope === 'global'
    ? 'These nodes come from MULTIPLE pages. Look for cross-page patterns (navbar, footer, sidebar).'
    : 'These nodes come from a single page. Look for repeated patterns within the page.';

  return `${scopeHint}

Identify repeated UI component patterns:

${JSON.stringify(nodes, null, 2)}`;
}
