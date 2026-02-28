/**
 * @file component-detector.test.ts — Tests for Component Detection
 *
 * Mocks the AI client to avoid real API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CIRPage, CIRNode } from '../src/types/cir.js';

vi.mock('../src/ai/ai-client.js', () => ({
  queryLLMStructured: vi.fn(),
}));

import { detectComponents } from '../src/ai/transformers/component-detector.js';
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

function createMockPage(rootNode: CIRNode, route: string = '/'): CIRPage {
  return { route, title: 'Test', screenshot: null, rootNode, interactiveStates: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('detectComponents', () => {
  it('detects components on a single page', async () => {
    const card1 = createMockCirNode({ id: 'card_1', tagName: 'DIV' });
    const card2 = createMockCirNode({ id: 'card_2', tagName: 'DIV' });
    const root = createMockCirNode({ children: [card1, card2] });
    const pages = [createMockPage(root)];

    mockQueryLLM.mockResolvedValueOnce({
      components: [
        { name: 'Card', instanceNodeIds: ['card_1', 'card_2'], description: 'Content card' },
      ],
    });

    const result = await detectComponents(pages, mockModel);

    expect(result.components).toHaveLength(1);
    expect(result.components[0]!.name).toBe('Card');
    expect(result.components[0]!.instanceNodeIds).toEqual(['card_1', 'card_2']);
  });

  it('performs global detection across multiple pages', async () => {
    const nav1 = createMockCirNode({ id: 'nav_1', tagName: 'NAV' });
    const nav2 = createMockCirNode({ id: 'nav_2', tagName: 'NAV' });
    const root1 = createMockCirNode({ children: [nav1] });
    const root2 = createMockCirNode({ children: [nav2] });
    const pages = [createMockPage(root1, '/'), createMockPage(root2, '/about')];

    // Local pass for each page
    mockQueryLLM.mockResolvedValueOnce({ components: [] });
    mockQueryLLM.mockResolvedValueOnce({ components: [] });

    // Global pass
    mockQueryLLM.mockResolvedValueOnce({
      components: [
        { name: 'NavBar', instanceNodeIds: ['nav_1', 'nav_2'], description: 'Main navigation' },
      ],
    });

    const result = await detectComponents(pages, mockModel);
    expect(result.components).toHaveLength(1);
    expect(result.components[0]!.name).toBe('NavBar');
  });

  it('deduplicates components by name', async () => {
    const root = createMockCirNode({
      children: [
        createMockCirNode({ id: 'a' }),
        createMockCirNode({ id: 'b' }),
      ],
    });
    const pages = [createMockPage(root, '/'), createMockPage(root, '/about')];

    // Both pages detect same component
    mockQueryLLM.mockResolvedValueOnce({
      components: [{ name: 'Card', instanceNodeIds: ['a'], description: 'Card' }],
    });
    mockQueryLLM.mockResolvedValueOnce({
      components: [{ name: 'Card', instanceNodeIds: ['b'], description: 'Card' }],
    });
    // Global pass
    mockQueryLLM.mockResolvedValueOnce({ components: [] });

    const result = await detectComponents(pages, mockModel);
    expect(result.components).toHaveLength(1);
    expect(result.components[0]!.instanceNodeIds).toContain('a');
    expect(result.components[0]!.instanceNodeIds).toContain('b');
  });

  it('handles LLM failure gracefully', async () => {
    const root = createMockCirNode();
    const pages = [createMockPage(root)];

    mockQueryLLM.mockRejectedValueOnce(new Error('API error'));

    const result = await detectComponents(pages, mockModel);
    expect(result.components).toEqual([]);
  });
});
