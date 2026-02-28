/**
 * @file hierarchy-cleaner.ts — Deterministic CIR Tree Cleanup (No LLM)
 *
 * Simplifies the CIR node tree before AI processing by removing unnecessary
 * wrapper elements, collapsing single-child chains, and merging adjacent
 * text spans. This reduces noise for the LLM and produces cleaner Figma output.
 *
 * Pure function: CIRNode in → CIRNode out (new tree, original unchanged).
 */

import type { CIRNode } from '../../types/cir.js';

// =============================================================================
// MAIN CLEANUP FUNCTION
// =============================================================================

/**
 * Cleans up a CIR node tree by removing unnecessary wrappers and noise.
 *
 * Rules applied (in order):
 * 1. Remove zero-size childless nodes (invisible elements)
 * 2. Collapse single-child wrapper chains (div > div > content → content)
 * 3. Merge adjacent text-only siblings with matching styles
 *
 * Returns a new tree — the original is not modified.
 *
 * @param rootNode - The root CIR node to clean.
 * @returns A new cleaned CIR node tree.
 */
export function cleanupHierarchy(rootNode: CIRNode): CIRNode {
  // Clean children recursively but never collapse the root node itself
  // (root is always <body> — collapsing it would lose the page container)
  let cleanedChildren = rootNode.children
    .map(cleanNode)
    .filter((child) => !isInvisibleLeaf(child));

  cleanedChildren = mergeAdjacentTextNodes(cleanedChildren);

  return {
    ...rootNode,
    children: cleanedChildren,
  };
}

// =============================================================================
// RECURSIVE CLEANUP
// =============================================================================

function cleanNode(node: CIRNode): CIRNode {
  // First, recursively clean all children
  let cleanedChildren = node.children
    .map(cleanNode)
    .filter((child) => !isInvisibleLeaf(child));

  // Merge adjacent text siblings with matching styles
  cleanedChildren = mergeAdjacentTextNodes(cleanedChildren);

  // If this is a passthrough wrapper (single child, no visual contribution),
  // replace it with the child (but keep the root node even if it's a wrapper)
  if (isSingleChildWrapper(node, cleanedChildren)) {
    const child = cleanedChildren[0]!;
    return {
      ...child,
      // Preserve the wrapper's bounds if the child has zero-size
      bounds: child.bounds.width > 0 && child.bounds.height > 0
        ? child.bounds
        : node.bounds,
    };
  }

  return {
    ...node,
    children: cleanedChildren,
  };
}

// =============================================================================
// DETECTION HELPERS
// =============================================================================

/**
 * Checks if a node is invisible and has no children (can be removed).
 * A node is invisible if it has zero width OR zero height.
 */
function isInvisibleLeaf(node: CIRNode): boolean {
  if (node.children.length > 0) return false;
  if (node.textContent !== null) return false;
  if (node.assets.imgSrc !== null) return false;
  if (node.assets.svgContent !== null) return false;
  if (node.assets.backgroundImage !== null) return false;
  return node.bounds.width <= 0 || node.bounds.height <= 0;
}

/**
 * Checks if a node is a passthrough wrapper: a non-visual container with
 * exactly one child that adds no visual properties of its own.
 */
function isSingleChildWrapper(node: CIRNode, children: CIRNode[]): boolean {
  if (children.length !== 1) return false;
  if (node.textContent !== null) return false;
  if (node.assets.imgSrc !== null) return false;
  if (node.assets.svgContent !== null) return false;
  if (node.assets.backgroundImage !== null) return false;
  if (node.meta.isInteractive) return false;

  // Check if the node has any visual contribution
  const styles = node.styles;
  const hasBackground = styles.backgroundColor !== 'rgba(0, 0, 0, 0)'
    && styles.backgroundColor !== 'transparent';
  const hasBorder = styles.borderTopWidth > 0 || styles.borderRightWidth > 0
    || styles.borderBottomWidth > 0 || styles.borderLeftWidth > 0;
  const hasRadius = styles.borderTopLeftRadius > 0 || styles.borderTopRightRadius > 0
    || styles.borderBottomRightRadius > 0 || styles.borderBottomLeftRadius > 0;
  const hasShadow = styles.boxShadow.length > 0;
  const hasOpacity = styles.opacity < 1;

  return !hasBackground && !hasBorder && !hasRadius && !hasShadow && !hasOpacity;
}

/**
 * Merges adjacent text-only children that share the same font properties.
 * This reduces fragmented text spans (e.g., "Hello " + "World" → "Hello World").
 */
function mergeAdjacentTextNodes(children: CIRNode[]): CIRNode[] {
  if (children.length <= 1) return children;

  const merged: CIRNode[] = [];

  for (const child of children) {
    const prev = merged[merged.length - 1];

    if (prev && canMergeText(prev, child)) {
      // Merge text content
      const mergedNode: CIRNode = {
        ...prev,
        textContent: `${prev.textContent ?? ''} ${child.textContent ?? ''}`.trim(),
        bounds: {
          x: Math.min(prev.bounds.x, child.bounds.x),
          y: Math.min(prev.bounds.y, child.bounds.y),
          width: Math.max(
            prev.bounds.x + prev.bounds.width,
            child.bounds.x + child.bounds.width,
          ) - Math.min(prev.bounds.x, child.bounds.x),
          height: Math.max(prev.bounds.height, child.bounds.height),
        },
      };
      merged[merged.length - 1] = mergedNode;
    } else {
      merged.push(child);
    }
  }

  return merged;
}

/**
 * Determines if two nodes can be merged as adjacent text spans.
 */
function canMergeText(a: CIRNode, b: CIRNode): boolean {
  if (a.textContent === null || b.textContent === null) return false;
  if (a.children.length > 0 || b.children.length > 0) return false;

  // Must have matching font properties
  return (
    a.styles.fontFamily === b.styles.fontFamily &&
    a.styles.fontSize === b.styles.fontSize &&
    a.styles.fontWeight === b.styles.fontWeight &&
    a.styles.color === b.styles.color
  );
}
