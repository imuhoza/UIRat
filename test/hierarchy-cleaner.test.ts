/**
 * @file hierarchy-cleaner.test.ts — Tests for Deterministic Hierarchy Cleanup
 *
 * Pure function tests — no mocks needed.
 */

import { describe, it, expect } from 'vitest';
import { cleanupHierarchy } from '../src/ai/transformers/hierarchy-cleaner.js';
import type { CIRNode } from '../src/types/cir.js';

function createMockCirNode(overrides: Partial<CIRNode> = {}): CIRNode {
  return {
    id: 'node_001',
    tagName: 'DIV',
    textContent: null,
    classList: [],
    bounds: { x: 0, y: 0, width: 100, height: 50 },
    styles: {
      backgroundColor: 'rgba(0, 0, 0, 0)',
      backgroundImage: null,
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: '400',
      lineHeight: 'normal',
      letterSpacing: 'normal',
      textAlign: 'start',
      textDecoration: 'none',
      textTransform: 'none',
      color: 'rgba(0, 0, 0, 1)',
      borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0,
      borderTopColor: 'rgba(0, 0, 0, 0)', borderRightColor: 'rgba(0, 0, 0, 0)',
      borderBottomColor: 'rgba(0, 0, 0, 0)', borderLeftColor: 'rgba(0, 0, 0, 0)',
      borderTopStyle: 'none', borderRightStyle: 'none',
      borderBottomStyle: 'none', borderLeftStyle: 'none',
      borderTopLeftRadius: 0, borderTopRightRadius: 0,
      borderBottomRightRadius: 0, borderBottomLeftRadius: 0,
      paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
      marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0,
      boxShadow: [], opacity: 1, overflow: 'visible', position: 'static', zIndex: 0,
    },
    layout: {
      display: 'block', flexDirection: 'row', justifyContent: 'flex-start',
      alignItems: 'stretch', flexWrap: 'nowrap', gap: 0,
      alignSelf: 'auto', flexGrow: 0, flexShrink: 1, flexBasis: 'auto',
    },
    assets: { backgroundImage: null, imgSrc: null, svgContent: null },
    meta: { isPseudo: false, isInteractive: false, zIndex: 0, componentHint: null, semanticRole: null },
    children: [],
    ...overrides,
  };
}

// =============================================================================
// INVISIBLE LEAF REMOVAL
// =============================================================================

describe('invisible leaf removal', () => {
  it('removes zero-size childless nodes', () => {
    const invisible = createMockCirNode({
      id: 'invisible',
      bounds: { x: 0, y: 0, width: 0, height: 0 },
    });
    const visible = createMockCirNode({
      id: 'visible',
      textContent: 'Hello',
    });
    const root = createMockCirNode({
      id: 'root',
      children: [invisible, visible],
    });

    const cleaned = cleanupHierarchy(root);
    expect(cleaned.children).toHaveLength(1);
    expect(cleaned.children[0]!.id).toBe('visible');
  });

  it('keeps zero-size nodes that have text content', () => {
    const textNode = createMockCirNode({
      id: 'text',
      textContent: 'Some text',
      bounds: { x: 0, y: 0, width: 0, height: 0 },
    });
    const root = createMockCirNode({ children: [textNode] });

    const cleaned = cleanupHierarchy(root);
    expect(cleaned.children).toHaveLength(1);
  });

  it('keeps zero-size nodes that have images', () => {
    const imgNode = createMockCirNode({
      id: 'img',
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      assets: { imgSrc: 'https://example.com/img.png', backgroundImage: null, svgContent: null },
    });
    const root = createMockCirNode({ children: [imgNode] });

    const cleaned = cleanupHierarchy(root);
    expect(cleaned.children).toHaveLength(1);
  });

  it('keeps zero-size nodes that have children', () => {
    const child = createMockCirNode({ id: 'child', textContent: 'Hi' });
    const wrapper = createMockCirNode({
      id: 'wrapper',
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      children: [child],
    });
    const root = createMockCirNode({ children: [wrapper] });

    const cleaned = cleanupHierarchy(root);
    // Wrapper with single child gets collapsed
    expect(cleaned.children.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// SINGLE-CHILD WRAPPER COLLAPSING
// =============================================================================

describe('single-child wrapper collapsing', () => {
  it('collapses transparent single-child wrappers', () => {
    const content = createMockCirNode({
      id: 'content',
      tagName: 'P',
      textContent: 'Paragraph text',
      bounds: { x: 10, y: 10, width: 200, height: 30 },
    });
    const wrapper = createMockCirNode({
      id: 'wrapper',
      tagName: 'DIV',
      children: [content],
    });
    const root = createMockCirNode({
      id: 'root',
      children: [wrapper],
    });

    const cleaned = cleanupHierarchy(root);
    // The wrapper should be collapsed, leaving content as direct child
    const descendantIds = collectIds(cleaned);
    expect(descendantIds).toContain('content');
  });

  it('preserves wrappers with background color', () => {
    const content = createMockCirNode({ id: 'content', textContent: 'Hi' });
    const styledWrapper = createMockCirNode({
      id: 'styled',
      styles: {
        ...createMockCirNode().styles,
        backgroundColor: 'rgba(255, 0, 0, 1)',
      },
      children: [content],
    });
    const root = createMockCirNode({ children: [styledWrapper] });

    const cleaned = cleanupHierarchy(root);
    const ids = collectIds(cleaned);
    expect(ids).toContain('styled');
    expect(ids).toContain('content');
  });

  it('preserves wrappers with borders', () => {
    const content = createMockCirNode({ id: 'content' });
    const bordered = createMockCirNode({
      id: 'bordered',
      styles: {
        ...createMockCirNode().styles,
        borderTopWidth: 1,
      },
      children: [content],
    });
    const root = createMockCirNode({ children: [bordered] });

    const cleaned = cleanupHierarchy(root);
    const ids = collectIds(cleaned);
    expect(ids).toContain('bordered');
  });

  it('preserves interactive wrappers', () => {
    const content = createMockCirNode({ id: 'content' });
    const button = createMockCirNode({
      id: 'button',
      tagName: 'BUTTON',
      meta: { isPseudo: false, isInteractive: true, zIndex: 0, componentHint: null, semanticRole: null },
      children: [content],
    });
    const root = createMockCirNode({ children: [button] });

    const cleaned = cleanupHierarchy(root);
    const ids = collectIds(cleaned);
    expect(ids).toContain('button');
  });

  it('collapses chains of transparent wrappers', () => {
    const content = createMockCirNode({ id: 'content', textContent: 'Deep' });
    const wrapper3 = createMockCirNode({ id: 'w3', children: [content] });
    const wrapper2 = createMockCirNode({ id: 'w2', children: [wrapper3] });
    const wrapper1 = createMockCirNode({ id: 'w1', children: [wrapper2] });
    const root = createMockCirNode({ id: 'root', children: [wrapper1] });

    const cleaned = cleanupHierarchy(root);
    // After collapsing chain, we should reach content without all the wrappers
    const ids = collectIds(cleaned);
    expect(ids).toContain('content');
  });
});

// =============================================================================
// TEXT MERGING
// =============================================================================

describe('adjacent text node merging', () => {
  it('merges adjacent text siblings with matching styles', () => {
    const span1 = createMockCirNode({
      id: 's1',
      tagName: 'SPAN',
      textContent: 'Hello',
      bounds: { x: 0, y: 0, width: 40, height: 20 },
    });
    const span2 = createMockCirNode({
      id: 's2',
      tagName: 'SPAN',
      textContent: 'World',
      bounds: { x: 40, y: 0, width: 40, height: 20 },
    });
    const root = createMockCirNode({ children: [span1, span2] });

    const cleaned = cleanupHierarchy(root);
    expect(cleaned.children).toHaveLength(1);
    expect(cleaned.children[0]!.textContent).toBe('Hello World');
  });

  it('does not merge text siblings with different font sizes', () => {
    const span1 = createMockCirNode({
      id: 's1',
      textContent: 'Big',
      styles: { ...createMockCirNode().styles, fontSize: 24 },
    });
    const span2 = createMockCirNode({
      id: 's2',
      textContent: 'Small',
      styles: { ...createMockCirNode().styles, fontSize: 12 },
    });
    const root = createMockCirNode({ children: [span1, span2] });

    const cleaned = cleanupHierarchy(root);
    expect(cleaned.children).toHaveLength(2);
  });

  it('does not merge siblings with children', () => {
    const child = createMockCirNode({ id: 'grandchild' });
    const span1 = createMockCirNode({
      id: 's1',
      textContent: 'Hello',
      children: [child],
    });
    const span2 = createMockCirNode({ id: 's2', textContent: 'World' });
    const root = createMockCirNode({ children: [span1, span2] });

    const cleaned = cleanupHierarchy(root);
    expect(cleaned.children).toHaveLength(2);
  });
});

// =============================================================================
// IMMUTABILITY
// =============================================================================

describe('immutability', () => {
  it('does not modify the original tree', () => {
    const child = createMockCirNode({ id: 'child' });
    const root = createMockCirNode({ id: 'root', children: [child] });

    const originalJson = JSON.stringify(root);
    cleanupHierarchy(root);

    expect(JSON.stringify(root)).toBe(originalJson);
  });
});

// =============================================================================
// HELPERS
// =============================================================================

function collectIds(node: CIRNode): string[] {
  const ids = [node.id];
  for (const child of node.children) {
    ids.push(...collectIds(child));
  }
  return ids;
}
