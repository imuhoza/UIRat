/**
 * @file semantic-namer.ts — LLM-Powered Semantic Node Naming
 *
 * Chunks the CIR page tree, sends each chunk to the LLM for semantic naming,
 * and applies the results back to the CIR nodes (componentHint + semanticRole).
 */

import { z } from 'zod';
import type { LanguageModel } from 'ai';
import type { CIRPage } from '../../types/cir.js';
import type { CIRNode } from '../../types/cir.js';
import type { SemanticNamingResult } from '../ai-types.js';
import { chunkCirTree } from '../chunker.js';
import { queryLLMStructured } from '../ai-client.js';
import { buildSystemPrompt, buildUserPrompt } from '../prompts/semantic-naming.js';

// =============================================================================
// ZOD SCHEMA FOR LLM RESPONSE
// =============================================================================

const semanticNamingSchema = z.object({
  assignments: z.array(z.object({
    id: z.string(),
    componentHint: z.string(),
    semanticRole: z.string(),
  })),
});

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Applies semantic naming to all nodes in a CIR page via LLM analysis.
 *
 * Process:
 * 1. Chunk the page tree into LLM-sized pieces
 * 2. Send each chunk to the LLM for naming
 * 3. Collect all assignments into a lookup map
 * 4. Walk the tree and apply assignments by node ID
 *
 * Modifies the page's rootNode in place.
 *
 * @param page - The CIR page to process.
 * @param model - The language model instance.
 * @param maxChunkTokens - Maximum tokens per chunk.
 */
export async function applySemanticNaming(
  page: CIRPage,
  model: LanguageModel,
  maxChunkTokens: number,
): Promise<void> {
  const chunks = chunkCirTree(page.rootNode, maxChunkTokens);
  const systemPrompt = buildSystemPrompt();

  // Process all chunks and collect assignments
  const assignmentMap = new Map<string, { componentHint: string; semanticRole: string }>();

  for (const chunk of chunks) {
    try {
      const userPrompt = buildUserPrompt(chunk.nodes, chunk.ancestorPath);
      const result: SemanticNamingResult = await queryLLMStructured(
        model,
        systemPrompt,
        userPrompt,
        semanticNamingSchema,
      );

      for (const assignment of result.assignments) {
        assignmentMap.set(assignment.id, {
          componentHint: assignment.componentHint,
          semanticRole: assignment.semanticRole,
        });
      }
    } catch (error) {
      console.warn(
        `Semantic naming failed for chunk (${chunk.nodes.length} nodes): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // Apply assignments to the tree
  applyToTree(page.rootNode, assignmentMap);
}

// =============================================================================
// TREE WALKING
// =============================================================================

function applyToTree(
  node: CIRNode,
  assignments: Map<string, { componentHint: string; semanticRole: string }>,
): void {
  const assignment = assignments.get(node.id);
  if (assignment) {
    node.meta.componentHint = assignment.componentHint;
    node.meta.semanticRole = assignment.semanticRole;
  }

  for (const child of node.children) {
    applyToTree(child, assignments);
  }
}
