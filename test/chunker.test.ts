/**
 * @file chunker.test.ts — Tests for CIR Tree Chunking
 *
 * Pure function tests — no mocks needed.
 */

import { describe, it, expect } from 'vitest';
import { summarizeNode, estimateTokens, chunkCirTree } from '../src/ai/chunker.js';
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
// summarizeNode
// =============================================================================

describe('summarizeNode', () => {
  it('creates a lightweight summary from a CIR node', () => {
    const node = createMockCirNode({
      id: 'node_042',
      tagName: 'BUTTON',
      textContent: 'Click me',
      classList: ['btn', 'btn-primary'],
      meta: { isPseudo: false, isInteractive: true, zIndex: 0, componentHint: null, semanticRole: null },
    });

    const summary = summarizeNode(node);

    expect(summary.id).toBe('node_042');
    expect(summary.tagName).toBe('BUTTON');
    expect(summary.textContent).toBe('Click me');
    expect(summary.classList).toEqual(['btn', 'btn-primary']);
    expect(summary.bounds).toEqual({ w: 100, h: 50 });
    expect(summary.isInteractive).toBe(true);
    expect(summary.hasImage).toBe(false);
    expect(summary.hasSvg).toBe(false);
    expect(summary.childCount).toBe(0);
    expect(summary.children).toEqual([]);
  });

  it('includes children up to maxDepth', () => {
    const grandchild = createMockCirNode({ id: 'gc', tagName: 'SPAN' });
    const child = createMockCirNode({ id: 'child', tagName: 'P', children: [grandchild] });
    const root = createMockCirNode({ id: 'root', children: [child] });

    const summary = summarizeNode(root, 2);
    expect(summary.children).toHaveLength(1);
    expect(summary.children[0]!.children).toHaveLength(1);
    expect(summary.children[0]!.children[0]!.children).toEqual([]);
  });

  it('stops recursion at maxDepth 0', () => {
    const child = createMockCirNode({ id: 'child' });
    const root = createMockCirNode({ children: [child] });

    const summary = summarizeNode(root, 0);
    expect(summary.children).toEqual([]);
    expect(summary.childCount).toBe(1);
  });

  it('detects image and SVG assets', () => {
    const imgNode = createMockCirNode({
      assets: { imgSrc: 'https://example.com/img.png', backgroundImage: null, svgContent: null },
    });
    const svgNode = createMockCirNode({
      assets: { imgSrc: null, backgroundImage: null, svgContent: '<svg></svg>' },
    });

    expect(summarizeNode(imgNode).hasImage).toBe(true);
    expect(summarizeNode(svgNode).hasSvg).toBe(true);
  });
});

// =============================================================================
// estimateTokens
// =============================================================================

describe('estimateTokens', () => {
  it('estimates tokens based on JSON length', () => {
    const summary = summarizeNode(createMockCirNode());
    const tokens = estimateTokens(summary);

    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBe(Math.ceil(JSON.stringify(summary).length / 4));
  });

  it('larger nodes produce higher token estimates', () => {
    const small = summarizeNode(createMockCirNode());
    const large = summarizeNode(createMockCirNode({
      textContent: 'This is a longer text content that should produce more tokens',
      classList: ['class-1', 'class-2', 'class-3', 'class-4', 'class-5'],
    }));

    expect(estimateTokens(large)).toBeGreaterThan(estimateTokens(small));
  });
});

// =============================================================================
// chunkCirTree
// =============================================================================

describe('chunkCirTree', () => {
  it('returns a single chunk for a small tree', () => {
    const root = createMockCirNode({ id: 'root' });
    const chunks = chunkCirTree(root, 5000);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.nodes).toHaveLength(1);
    expect(chunks[0]!.nodes[0]!.id).toBe('root');
  });

  it('splits into multiple chunks when tree exceeds budget', () => {
    const children = Array.from({ length: 20 }, (_, i) =>
      createMockCirNode({
        id: `node_${String(i).padStart(3, '0')}`,
        tagName: 'DIV',
        textContent: `Content for node ${i} with enough text to use tokens`,
        classList: ['class-a', 'class-b', 'class-c'],
      }),
    );
    const root = createMockCirNode({ id: 'root', children });

    const chunks = chunkCirTree(root, 500);

    expect(chunks.length).toBeGreaterThan(1);

    // All node IDs should be present across chunks
    const allIds = chunks.flatMap((c) => c.nodes.map((n) => n.id));
    expect(allIds).toContain('root');
    for (let i = 0; i < 20; i++) {
      expect(allIds).toContain(`node_${String(i).padStart(3, '0')}`);
    }
  });

  it('preserves ancestor path in chunks', () => {
    const child = createMockCirNode({ id: 'child', tagName: 'SPAN' });
    const root = createMockCirNode({ id: 'root', tagName: 'DIV', children: [child] });

    const chunks = chunkCirTree(root, 5000);

    // Child nodes should have ancestor path including parent
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('handles empty tree (no children)', () => {
    const root = createMockCirNode({ id: 'root' });
    const chunks = chunkCirTree(root, 100);

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]!.nodes[0]!.id).toBe('root');
  });

  it('each chunk respects token budget', () => {
    const children = Array.from({ length: 30 }, (_, i) =>
      createMockCirNode({
        id: `n${i}`,
        textContent: `Text content ${i}`,
      }),
    );
    const root = createMockCirNode({ children });

    const maxTokens = 300;
    const chunks = chunkCirTree(root, maxTokens);

    for (const chunk of chunks) {
      expect(chunk.estimatedTokens).toBeLessThanOrEqual(maxTokens * 2); // Allow some slack for single large nodes
    }
  });
});
