/**
 * @file semantic-naming.ts — Prompt Template for Semantic Node Naming
 *
 * Generates prompts that instruct the LLM to assign meaningful Figma layer
 * names and semantic roles to CIR nodes based on their structure and content.
 */

import type { CIRNodeSummary } from '../ai-types.js';

/**
 * Builds the system prompt for semantic naming.
 * Instructs the LLM on how to analyze UI nodes and assign names.
 */
export function buildSystemPrompt(): string {
  return `You are a senior UI/UX designer analyzing a web page's DOM structure.
Your job is to assign semantic names to UI elements for use in Figma layer panels.

Rules:
- Use PascalCase for component names (e.g., "PrimaryButton", "NavBar", "HeroSection")
- Use kebab-case for semantic roles (e.g., "navigation", "hero-section", "card-grid")
- Names should describe the component's PURPOSE, not its HTML tag
- Be concise: 1-3 words per name
- Consider the element's tag, text content, CSS classes, size, interactivity, and children
- Common patterns: Header, Footer, Sidebar, NavBar, NavItem, Card, Button, Badge, Avatar, Modal, Form, Input, SearchBar, Logo, HeroSection, FeatureGrid, Testimonial, PricingCard

Return a JSON object with an "assignments" array. Each item has:
- "id": the node ID
- "componentHint": the Figma layer name (PascalCase)
- "semanticRole": the semantic purpose (kebab-case)`;
}

/**
 * Builds the user prompt with the actual node data.
 *
 * @param nodes - Summarized CIR nodes to name.
 * @param ancestorPath - Path from root for context.
 * @returns The user prompt string.
 */
export function buildUserPrompt(
  nodes: CIRNodeSummary[],
  ancestorPath: string[],
): string {
  const context = ancestorPath.length > 0
    ? `\nParent context: ${ancestorPath.join(' > ')}\n`
    : '';

  return `${context}
Assign semantic names to each UI element:

${JSON.stringify(nodes, null, 2)}`;
}
