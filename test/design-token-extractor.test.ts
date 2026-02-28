/**
 * @file design-token-extractor.test.ts — Tests for Design Token Extraction
 *
 * Hybrid tests: deterministic extraction is pure, LLM naming is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CIRPage, CIRNode } from '../src/types/cir.js';

vi.mock('../src/ai/ai-client.js', () => ({
  queryLLMStructured: vi.fn(),
}));

import { extractDesignTokens, extractRawTokens } from '../src/ai/transformers/design-token-extractor.js';
import { queryLLMStructured } from '../src/ai/ai-client.js';
import type { LanguageModel } from 'ai';

const mockModel = {} as LanguageModel;
const mockQueryLLM = vi.mocked(queryLLMStructured);

function createMockCirNode(overrides: Partial<CIRNode> = {}): CIRNode {
  return {
    id: 'node_001', tagName: 'DIV', textContent: null, classList: [],
    bounds: { x: 0, y: 0, width: 100, height: 50 },
    styles: {
      backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: null,
      fontFamily: 'Inter', fontSize: 16, fontWeight: '400', lineHeight: 'normal',
      letterSpacing: 'normal', textAlign: 'start', textDecoration: 'none',
      textTransform: 'none', color: 'rgba(0, 0, 0, 1)',
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

function createMockPage(rootNode: CIRNode): CIRPage {
  return { route: '/', title: 'Test', screenshot: null, rootNode, interactiveStates: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// DETERMINISTIC TOKEN EXTRACTION
// =============================================================================

describe('extractRawTokens', () => {
  it('extracts colors from background and text', () => {
    const node = createMockCirNode({
      styles: {
        ...createMockCirNode().styles,
        backgroundColor: 'rgba(59, 130, 246, 1)',
        color: 'rgba(255, 255, 255, 1)',
      },
    });
    const pages = [createMockPage(node)];

    const raw = extractRawTokens(pages);
    expect(raw.colors).toHaveLength(2);
    expect(raw.colors.map((c) => c.value)).toContain('rgba(59, 130, 246, 1)');
    expect(raw.colors.map((c) => c.value)).toContain('rgba(255, 255, 255, 1)');
  });

  it('counts color usage across nodes', () => {
    const node1 = createMockCirNode({
      styles: { ...createMockCirNode().styles, backgroundColor: 'rgba(255, 0, 0, 1)' },
    });
    const node2 = createMockCirNode({
      id: 'n2',
      styles: { ...createMockCirNode().styles, backgroundColor: 'rgba(255, 0, 0, 1)' },
    });
    const root = createMockCirNode({ children: [node1, node2] });
    const pages = [createMockPage(root)];

    const raw = extractRawTokens(pages);
    const red = raw.colors.find((c) => c.value === 'rgba(255, 0, 0, 1)');
    expect(red?.usageCount).toBe(2);
  });

  it('extracts spacing values from padding and gap', () => {
    const node = createMockCirNode({
      styles: { ...createMockCirNode().styles, paddingTop: 16, paddingBottom: 8 },
      layout: { ...createMockCirNode().layout, gap: 12 },
    });
    const pages = [createMockPage(node)];

    const raw = extractRawTokens(pages);
    const spacingValues = raw.spacings.map((s) => s.value);
    expect(spacingValues).toContain(16);
    expect(spacingValues).toContain(8);
    expect(spacingValues).toContain(12);
  });

  it('extracts border radius values', () => {
    const node = createMockCirNode({
      styles: { ...createMockCirNode().styles, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
    });
    const pages = [createMockPage(node)];

    const raw = extractRawTokens(pages);
    const radiusValues = raw.radii.map((r) => r.value);
    expect(radiusValues).toContain(8);
  });

  it('extracts typography combinations', () => {
    const textNode = createMockCirNode({
      textContent: 'Hello',
      styles: {
        ...createMockCirNode().styles,
        fontFamily: 'Inter',
        fontSize: 24,
        fontWeight: '700',
        lineHeight: '32px',
      },
    });
    const pages = [createMockPage(textNode)];

    const raw = extractRawTokens(pages);
    expect(raw.typography).toHaveLength(1);
    expect(raw.typography[0]!.fontFamily).toBe('Inter');
    expect(raw.typography[0]!.fontSize).toBe(24);
    expect(raw.typography[0]!.fontWeight).toBe('700');
  });

  it('ignores transparent colors', () => {
    const node = createMockCirNode(); // default bg is rgba(0,0,0,0)
    const pages = [createMockPage(node)];

    const raw = extractRawTokens(pages);
    expect(raw.colors.find((c) => c.value === 'rgba(0, 0, 0, 0)')).toBeUndefined();
  });
});

// =============================================================================
// FULL EXTRACTION WITH LLM NAMING
// =============================================================================

describe('extractDesignTokens', () => {
  it('combines deterministic extraction with LLM naming', async () => {
    const node = createMockCirNode({
      textContent: 'Hello',
      styles: {
        ...createMockCirNode().styles,
        backgroundColor: 'rgba(59, 130, 246, 1)',
        color: 'rgba(255, 255, 255, 1)',
        paddingTop: 16,
        borderTopLeftRadius: 8,
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: '400',
        lineHeight: '24px',
      },
    });
    const pages = [createMockPage(node)];

    mockQueryLLM.mockResolvedValueOnce({
      colors: [
        { rawValue: 'rgba(59, 130, 246, 1)', semanticName: 'primary' },
        { rawValue: 'rgba(255, 255, 255, 1)', semanticName: 'text-on-primary' },
      ],
      spacings: [{ rawValue: '16', semanticName: 'spacing-md' }],
      radii: [{ rawValue: '8', semanticName: 'radius-md' }],
      typography: [{ rawValue: 'Inter|16|400|24px', semanticName: 'body-text' }],
    });

    const tokens = await extractDesignTokens(pages, mockModel);

    expect(tokens.colors[0]!.name).toBe('primary');
    expect(tokens.spacings[0]!.name).toBe('spacing-md');
    expect(tokens.radii[0]!.name).toBe('radius-md');
    expect(tokens.typography[0]!.name).toBe('body-text');
  });
});
