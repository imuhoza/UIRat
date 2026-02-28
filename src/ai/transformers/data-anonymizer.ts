/**
 * @file data-anonymizer.ts — LLM-Powered Data Anonymization
 *
 * Collects all text content from the CIR page, sends it to the LLM to
 * identify PII, and replaces sensitive text with placeholder values.
 *
 * Runs BEFORE semantic naming so PII never reaches the naming LLM.
 */

import { z } from 'zod';
import type { LanguageModel } from 'ai';
import type { CIRPage, CIRNode } from '../../types/cir.js';
import type { AnonymizationResult } from '../ai-types.js';
import { queryLLMStructured } from '../ai-client.js';
import { buildSystemPrompt, buildUserPrompt } from '../prompts/data-anonymization.js';

// =============================================================================
// ZOD SCHEMA FOR LLM RESPONSE
// =============================================================================

const anonymizationSchema = z.object({
  mappings: z.array(z.object({
    original: z.string(),
    replacement: z.string(),
  })),
});

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Anonymizes PII in all text content of a CIR page via LLM analysis.
 *
 * Process:
 * 1. Walk the tree and collect all unique text content
 * 2. Send to LLM to identify PII and generate replacements
 * 3. Walk the tree again and apply replacements
 *
 * Modifies the page's rootNode in place.
 *
 * @param page - The CIR page to anonymize.
 * @param model - The language model instance.
 */
export async function anonymizeData(
  page: CIRPage,
  model: LanguageModel,
): Promise<void> {
  // Collect all unique text content
  const textContents = new Set<string>();
  collectTextContent(page.rootNode, textContents);

  const uniqueTexts = Array.from(textContents);
  if (uniqueTexts.length === 0) return;

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(uniqueTexts);

  const result: AnonymizationResult = await queryLLMStructured(
    model,
    systemPrompt,
    userPrompt,
    anonymizationSchema,
  );

  // Build replacement map
  const replacementMap = new Map<string, string>();
  for (const mapping of result.mappings) {
    replacementMap.set(mapping.original, mapping.replacement);
  }

  // Apply replacements
  applyReplacements(page.rootNode, replacementMap);
}

// =============================================================================
// HELPERS
// =============================================================================

function collectTextContent(node: CIRNode, texts: Set<string>): void {
  if (node.textContent !== null && node.textContent.trim().length > 0) {
    texts.add(node.textContent);
  }
  for (const child of node.children) {
    collectTextContent(child, texts);
  }
}

function applyReplacements(node: CIRNode, replacements: Map<string, string>): void {
  if (node.textContent !== null) {
    const replacement = replacements.get(node.textContent);
    if (replacement !== undefined) {
      node.textContent = replacement;
    }
  }
  for (const child of node.children) {
    applyReplacements(child, replacements);
  }
}
