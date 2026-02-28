/**
 * @file chunker.ts — CIR Tree Splitting for LLM Context Windows
 *
 * Splits a CIR node tree into chunks that fit within an LLM's context window.
 * Each chunk contains summarized node info (stripped styles) with ancestor
 * context for hierarchical understanding.
 *
 * Pure functions — no side effects, no I/O.
 */

import type { CIRNode } from '../types/cir.js';
import type { CIRChunk, CIRNodeSummary } from './ai-types.js';

// =============================================================================
// NODE SUMMARIZATION
// =============================================================================

/**
 * Summarizes a CIR node into a lightweight representation for LLM consumption.
 * Strips full style objects and recursively summarizes children up to maxDepth.
 *
 * @param node - The CIR node to summarize.
 * @param maxDepth - Maximum recursion depth for children. Default: 3.
 * @returns A lightweight CIRNodeSummary.
 */
export function summarizeNode(node: CIRNode, maxDepth: number = 3): CIRNodeSummary {
  return {
    id: node.id,
    tagName: node.tagName,
    textContent: node.textContent,
    classList: node.classList,
    bounds: { w: node.bounds.width, h: node.bounds.height },
    childCount: node.children.length,
    hasImage: node.assets.imgSrc !== null || node.assets.backgroundImage !== null,
    hasSvg: node.assets.svgContent !== null,
    isInteractive: node.meta.isInteractive,
    children: maxDepth > 0
      ? node.children.map((child) => summarizeNode(child, maxDepth - 1))
      : [],
  };
}

// =============================================================================
// TOKEN ESTIMATION
// =============================================================================

/**
 * Estimates the token count of a node summary.
 * Uses the rough heuristic: 1 token ≈ 4 characters of JSON.
 *
 * @param summary - The node summary to estimate.
 * @returns Estimated token count.
 */
export function estimateTokens(summary: CIRNodeSummary): number {
  return Math.ceil(JSON.stringify(summary).length / 4);
}

// =============================================================================
// TREE CHUNKING
// =============================================================================

/**
 * Splits a CIR node tree into chunks sized for LLM context windows.
 *
 * Uses depth-first traversal. When adding a node would exceed the token budget,
 * the current chunk is flushed and a new one started. Each chunk preserves
 * the ancestor path for hierarchical context.
 *
 * @param rootNode - The root CIR node to chunk.
 * @param maxTokens - Maximum estimated tokens per chunk. Default: 3000.
 * @returns Array of CIR chunks.
 */
export function chunkCirTree(rootNode: CIRNode, maxTokens: number = 3000): CIRChunk[] {
  const chunks: CIRChunk[] = [];
  let currentNodes: CIRNodeSummary[] = [];
  let currentTokens = 0;
  let currentAncestorPath: string[] = [];

  function flushChunk(): void {
    if (currentNodes.length > 0) {
      chunks.push({
        nodes: currentNodes,
        ancestorPath: currentAncestorPath,
        estimatedTokens: currentTokens,
      });
      currentNodes = [];
      currentTokens = 0;
    }
  }

  function walk(node: CIRNode, ancestorPath: string[]): void {
    // Summarize this node without deep children (children handled by recursion)
    const summary = summarizeNode(node, 0);
    const tokens = estimateTokens(summary);

    // If adding this node exceeds budget, flush current chunk
    if (currentTokens + tokens > maxTokens && currentNodes.length > 0) {
      flushChunk();
    }

    currentAncestorPath = ancestorPath;
    currentNodes.push(summary);
    currentTokens += tokens;

    // Recurse into children
    const childPath = [...ancestorPath, `${node.tagName}#${node.id}`];
    for (const child of node.children) {
      walk(child, childPath);
    }
  }

  walk(rootNode, []);
  flushChunk();

  return chunks;
}
