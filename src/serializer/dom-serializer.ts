/**
 * @file dom-serializer.ts — DOM Tree Serializer (Browser-Side)
 *
 * This is the core serialization engine of UIRat. It is injected into a web page
 * via Playwright's page.evaluate() and recursively walks the live DOM tree,
 * extracting all visual information into the CIR (UIRat Intermediate Representation) format.
 *
 * HOW IT WORKS:
 * 1. Starts at document.body
 * 2. For each element, calls getBoundingClientRect() and getComputedStyle()
 * 3. Applies visibility/exclusion filters (hidden elements, ads, cookie banners)
 * 4. Extracts styles, layout, assets, and metadata into a CIRNode
 * 5. Captures pseudo-elements (::before, ::after) as synthetic child nodes
 * 6. Extracts direct text content from text nodes
 * 7. Recursively processes child elements
 * 8. Merges empty wrapper divs/spans to flatten the tree
 * 9. Returns a complete CIRDocument JSON object
 *
 * IMPORTANT: This entire file runs inside the browser. It must be self-contained
 * and cannot import Node.js modules. The import statements below are for TypeScript
 * type-checking only — at build time, esbuild bundles everything into a single IIFE.
 *
 * SAFETY LIMITS:
 * - Maximum tree depth: 50 levels (prevents infinite recursion on deeply nested DOMs)
 * - Maximum node count: 5000 nodes (prevents memory issues on extremely large pages)
 */

import type { CIRDocument, CIRNode } from '../types/cir.js';
import {
  isElementVisible,
  isElementInViewport,
  isNonVisualTag,
  isAdvertisingIframe,
  isCookieConsentBanner,
  isMergeableWrapper,
} from './filters.js';
import {
  extractStyles,
  extractLayout,
  extractAssets,
  extractMeta,
} from './style-extractor.js';

// =============================================================================
// SAFETY LIMITS — Prevent runaway serialization on huge pages
// =============================================================================

/** Maximum depth of DOM tree traversal. Deeper elements are silently skipped. */
const MAX_TREE_DEPTH = 50;

/** Maximum total number of CIR nodes to generate. Once reached, remaining elements are skipped. */
const MAX_NODE_COUNT = 5000;

// =============================================================================
// MAIN ENTRY POINT — Called by page.evaluate()
// =============================================================================

/**
 * Serializes the entire visible DOM of the current page into a CIR document.
 *
 * This function is the entry point called by Playwright's page.evaluate().
 * It returns a complete CIRDocument JSON object representing everything
 * visible on the page.
 *
 * @returns A CIRDocument object ready for JSON serialization.
 *
 * @example
 * // In Playwright:
 * const cirDocument = await page.evaluate(serializeDom);
 * fs.writeFileSync('output.cir.json', JSON.stringify(cirDocument, null, 2));
 */
export function serializeDom(): CIRDocument {
  // State shared across the recursive traversal
  let nodeCounter = 0;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const documentScrollHeight = document.documentElement.scrollHeight;

  /**
   * Generates a unique, sequential ID for each CIR node.
   * Format: "node_001", "node_002", etc.
   * The zero-padding ensures consistent sorting up to 99,999 nodes.
   */
  function generateNodeId(): string {
    nodeCounter++;
    return `node_${String(nodeCounter).padStart(3, '0')}`;
  }

  /**
   * Checks whether we've hit the maximum node count safety limit.
   * @returns True if no more nodes should be created.
   */
  function hasReachedNodeLimit(): boolean {
    return nodeCounter >= MAX_NODE_COUNT;
  }

  // ---------------------------------------------------------------------------
  // TEXT CONTENT EXTRACTION
  // ---------------------------------------------------------------------------

  /**
   * Extracts only the direct text content of an element, excluding text
   * that belongs to child elements.
   *
   * For example, given: <p>Hello <strong>world</strong></p>
   * This returns "Hello " for the <p> element (not "Hello world").
   *
   * @param element - The DOM element to extract text from.
   * @returns Trimmed text content, or null if no direct text exists.
   */
  function extractDirectTextContent(element: Element): string | null {
    let directText = '';

    for (const childNode of element.childNodes) {
      // nodeType 3 = Text node
      if (childNode.nodeType === 3) {
        directText += childNode.textContent || '';
      }
    }

    const trimmed = directText.trim().replace(/\s+/g, ' ');
    return trimmed.length > 0 ? trimmed : null;
  }

  // ---------------------------------------------------------------------------
  // PSEUDO-ELEMENT CAPTURE
  // ---------------------------------------------------------------------------

  /**
   * Captures a CSS pseudo-element (::before or ::after) as a synthetic CIR node.
   *
   * Pseudo-elements don't exist in the DOM, but they can be visually significant
   * (decorative icons, separators, badges). We capture them by reading their
   * computed styles from the parent element.
   *
   * @param parentElement - The element that owns the pseudo-element.
   * @param pseudoSelector - Either "::before" or "::after".
   * @returns A CIRNode representing the pseudo-element, or null if it doesn't exist.
   */
  function capturePseudoElement(
    parentElement: Element,
    pseudoSelector: '::before' | '::after',
  ): CIRNode | null {
    if (hasReachedNodeLimit()) {
      return null;
    }

    const pseudoStyle = window.getComputedStyle(parentElement, pseudoSelector);

    // Skip pseudo-elements that don't render (no content or content: "none")
    const contentValue = pseudoStyle.content;
    if (!contentValue || contentValue === 'none' || contentValue === 'normal' || contentValue === '""') {
      return null;
    }

    // Skip pseudo-elements with display:none
    if (pseudoStyle.display === 'none') {
      return null;
    }

    // Use the parent's bounding rect as an approximation for position.
    // Pseudo-elements don't have their own getBoundingClientRect().
    const parentBounds = parentElement.getBoundingClientRect();

    // Extract the text content from the CSS content property
    // Content values are quoted strings like '"→"' or 'counter(...)' or 'attr(...)'
    let textContent: string | null = null;
    const contentTextMatch = contentValue.match(/^["'](.*)["']$/);
    if (contentTextMatch !== null && contentTextMatch[1] !== undefined) {
      textContent = contentTextMatch[1];
    }

    return {
      id: generateNodeId(),
      tagName: pseudoSelector,
      textContent: textContent,
      classList: [],
      bounds: {
        x: parentBounds.left + window.scrollX,
        y: parentBounds.top + window.scrollY,
        width: parentBounds.width,
        height: parentBounds.height,
      },
      styles: extractStyles(pseudoStyle),
      layout: extractLayout(pseudoStyle),
      assets: { backgroundImage: null, imgSrc: null, svgContent: null },
      meta: extractMeta(parentElement, pseudoStyle, true),
      children: [],
    };
  }

  // ---------------------------------------------------------------------------
  // RECURSIVE NODE SERIALIZATION
  // ---------------------------------------------------------------------------

  /**
   * Recursively serializes a DOM element and all its visible descendants
   * into a CIR node tree.
   *
   * This is the heart of the serializer. For each element it:
   * 1. Checks safety limits (depth, node count)
   * 2. Applies visibility and exclusion filters
   * 3. Extracts all visual properties
   * 4. Captures pseudo-elements as synthetic children
   * 5. Recursively processes child elements
   * 6. Applies wrapper merging to flatten the tree
   *
   * @param element - The DOM element to serialize.
   * @param currentDepth - Current recursion depth (starts at 0 for body).
   * @returns A CIRNode representing the element, or null if it should be excluded.
   */
  function serializeElement(element: Element, currentDepth: number): CIRNode | null {
    // Safety: don't exceed max depth
    if (currentDepth > MAX_TREE_DEPTH) {
      return null;
    }

    // Safety: don't exceed max node count
    if (hasReachedNodeLimit()) {
      return null;
    }

    const tagName = element.tagName.toUpperCase();

    // Filter: skip non-visual tags (SCRIPT, STYLE, META, etc.)
    if (isNonVisualTag(tagName)) {
      return null;
    }

    // Filter: skip advertising/tracking iframes
    if (isAdvertisingIframe(element)) {
      return null;
    }

    // Get computed style (needed for all subsequent checks)
    const computedStyle = window.getComputedStyle(element);
    const boundingRect = element.getBoundingClientRect();

    // Filter: skip invisible elements
    if (!isElementVisible(computedStyle, boundingRect)) {
      return null;
    }

    // Filter: skip off-viewport elements (but allow scrollable content)
    if (!isElementInViewport(boundingRect, viewportWidth, viewportHeight, documentScrollHeight)) {
      return null;
    }

    // Filter: skip cookie consent banners
    if (isCookieConsentBanner(element, computedStyle)) {
      return null;
    }

    // --- All filters passed: extract properties ---

    const bounds = {
      x: Math.round(boundingRect.left + window.scrollX),
      y: Math.round(boundingRect.top + window.scrollY),
      width: Math.round(boundingRect.width),
      height: Math.round(boundingRect.height),
    };

    const styles = extractStyles(computedStyle);
    const layout = extractLayout(computedStyle);
    const assets = extractAssets(element, computedStyle);
    const meta = extractMeta(element, computedStyle, false);
    const textContent = extractDirectTextContent(element);

    // For SVG elements, capture the markup but don't recurse into SVG children
    // (SVG internals are not meaningful as CIR nodes)
    if (tagName === 'SVG') {
      return {
        id: generateNodeId(),
        tagName: tagName,
        textContent: null,
        classList: Array.from(element.classList),
        bounds: bounds,
        styles: styles,
        layout: layout,
        assets: assets,
        meta: meta,
        children: [],
      };
    }

    // --- Process children ---

    const childNodes: CIRNode[] = [];

    // Capture ::before pseudo-element (appears before real children)
    const beforePseudo = capturePseudoElement(element, '::before');
    if (beforePseudo !== null) {
      childNodes.push(beforePseudo);
    }

    // Process child elements recursively
    const childElements = element.children;
    for (let index = 0; index < childElements.length; index++) {
      const childElement = childElements[index];
      if (childElement === undefined) {
        continue;
      }

      const serializedChild = serializeElement(childElement, currentDepth + 1);
      if (serializedChild !== null) {
        childNodes.push(serializedChild);
      }
    }

    // Capture ::after pseudo-element (appears after real children)
    const afterPseudo = capturePseudoElement(element, '::after');
    if (afterPseudo !== null) {
      childNodes.push(afterPseudo);
    }

    // --- Wrapper merging ---
    // If this element is a pure wrapper (no visual properties, single child),
    // skip it and promote the child directly.

    const childElementCount = element.children.length;
    if (isMergeableWrapper(element, computedStyle, childElementCount) && childNodes.length === 1) {
      const promotedChild = childNodes[0];
      if (promotedChild !== undefined) {
        return promotedChild;
      }
    }

    return {
      id: generateNodeId(),
      tagName: tagName,
      textContent: textContent,
      classList: Array.from(element.classList),
      bounds: bounds,
      styles: styles,
      layout: layout,
      assets: assets,
      meta: meta,
      children: childNodes,
    };
  }

  // ---------------------------------------------------------------------------
  // BUILD THE CIR DOCUMENT
  // ---------------------------------------------------------------------------

  const bodyElement = document.body;
  const rootNode = serializeElement(bodyElement, 0);

  // Fallback: if body produced no output (extremely unlikely), create an empty root
  const safeRootNode: CIRNode = rootNode ?? {
    id: generateNodeId(),
    tagName: 'BODY',
    textContent: null,
    classList: [],
    bounds: { x: 0, y: 0, width: viewportWidth, height: viewportHeight },
    styles: extractStyles(window.getComputedStyle(bodyElement)),
    layout: extractLayout(window.getComputedStyle(bodyElement)),
    assets: { backgroundImage: null, imgSrc: null, svgContent: null },
    meta: { isPseudo: false, isInteractive: false, zIndex: 0, componentHint: null, semanticRole: null },
    children: [],
  };

  return {
    version: '1.0',
    tool: 'UIRat',
    capturedAt: new Date().toISOString(),
    sourceUrl: window.location.href,
    viewport: {
      width: viewportWidth,
      height: viewportHeight,
    },
    pages: [
      {
        route: window.location.pathname,
        title: document.title,
        screenshot: null,
        rootNode: safeRootNode,
        interactiveStates: [],
      },
    ],
    assets: { images: [], fonts: [], svgs: [] },
    designTokens: { colors: [], spacings: [], radii: [], typography: [] },
  };
}
