/**
 * @file component-detector.ts — LLM-Powered Component Pattern Detection
 *
 * Identifies repeated UI patterns across CIR pages and groups them as
 * reusable Figma components. Uses a two-pass approach:
 * 1. Per-page local detection (cards, list items, etc.)
 * 2. Cross-page global detection (navbar, footer, sidebar)
 */

import { z } from 'zod';
import type { LanguageModel } from 'ai';
import type { CIRPage } from '../../types/cir.js';
import type { ComponentDetectionResult, CIRNodeSummary } from '../ai-types.js';
import { summarizeNode } from '../chunker.js';
import { queryLLMStructured } from '../ai-client.js';
import { buildSystemPrompt, buildUserPrompt } from '../prompts/component-detection.js';

// =============================================================================
// ZOD SCHEMA FOR LLM RESPONSE
// =============================================================================

const componentDetectionSchema = z.object({
  components: z.array(z.object({
    name: z.string(),
    instanceNodeIds: z.array(z.string()),
    description: z.string(),
  })),
});

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Detects reusable component patterns across CIR pages.
 *
 * Two-pass approach:
 * 1. Local pass: Analyze each page individually for repeated patterns
 * 2. Global pass: Analyze top-level nodes across pages for shared components
 *
 * @param pages - Array of CIR pages to analyze.
 * @param model - The language model instance.
 * @returns Detected component patterns.
 */
export async function detectComponents(
  pages: CIRPage[],
  model: LanguageModel,
): Promise<ComponentDetectionResult> {
  const allComponents: ComponentDetectionResult = { components: [] };
  const systemPrompt = buildSystemPrompt();

  // Pass 1: Per-page local detection
  for (const page of pages) {
    try {
      const summary = summarizeNode(page.rootNode, 3);
      const flatNodes = flattenSummary(summary);

      if (flatNodes.length < 2) continue;

      const userPrompt = buildUserPrompt(flatNodes, 'local');
      const result = await queryLLMStructured(
        model,
        systemPrompt,
        userPrompt,
        componentDetectionSchema,
      );

      allComponents.components.push(...result.components);
    } catch (error) {
      console.warn(
        `Component detection failed for page ${page.route}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // Pass 2: Cross-page global detection (if multiple pages)
  if (pages.length > 1) {
    try {
      const topLevelNodes: CIRNodeSummary[] = pages.map((page) =>
        summarizeNode(page.rootNode, 2),
      );

      const userPrompt = buildUserPrompt(topLevelNodes, 'global');
      const result = await queryLLMStructured(
        model,
        systemPrompt,
        userPrompt,
        componentDetectionSchema,
      );

      allComponents.components.push(...result.components);
    } catch (error) {
      console.warn(
        `Global component detection failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // Deduplicate components by name
  const uniqueComponents = deduplicateComponents(allComponents.components);
  return { components: uniqueComponents };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Flattens a node summary tree into a flat array.
 */
function flattenSummary(summary: CIRNodeSummary): CIRNodeSummary[] {
  const result: CIRNodeSummary[] = [summary];
  for (const child of summary.children) {
    result.push(...flattenSummary(child));
  }
  return result;
}

/**
 * Deduplicates components by name, merging instance node IDs.
 */
function deduplicateComponents(
  components: ComponentDetectionResult['components'],
): ComponentDetectionResult['components'] {
  const byName = new Map<string, ComponentDetectionResult['components'][number]>();

  for (const comp of components) {
    const existing = byName.get(comp.name);
    if (existing) {
      const mergedIds = new Set([...existing.instanceNodeIds, ...comp.instanceNodeIds]);
      existing.instanceNodeIds = Array.from(mergedIds);
    } else {
      byName.set(comp.name, { ...comp });
    }
  }

  return Array.from(byName.values());
}
