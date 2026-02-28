/**
 * @file semantic-namer.test.ts — Tests for LLM-Powered Semantic Naming
 *
 * Mocks the AI client to avoid real API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CIRPage, CIRNode } from '../src/types/cir.js';

// Mock the AI client before importing the module under test
vi.mock('../src/ai/ai-client.js', () => ({
  queryLLMStructured: vi.fn(),
}));

import { applySemanticNaming } from '../src/ai/transformers/semantic-namer.js';
import { queryLLMStructured } from '../src/ai/ai-client.js';
import type { LanguageModel } from 'ai';

const mockModel = {} as LanguageModel;
const mockQueryLLM = vi.mocked(queryLLMStructured);

function createMockCirNode(overrides: Partial<CIRNode> = {}): CIRNode {
  return {
    id: 'node_001',
    tagName: 'DIV',
    textContent: null,
    classList: [],
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
  return {
    route: '/',
    title: 'Test Page',
    screenshot: null,
    rootNode,
    interactiveStates: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('applySemanticNaming', () => {
  it('applies LLM-assigned names to nodes', async () => {
    const child = createMockCirNode({ id: 'btn_001', tagName: 'BUTTON', textContent: 'Sign Up' });
    const root = createMockCirNode({ id: 'root', children: [child] });
    const page = createMockPage(root);

    mockQueryLLM.mockResolvedValueOnce({
      assignments: [
        { id: 'root', componentHint: 'MainContainer', semanticRole: 'page-content' },
        { id: 'btn_001', componentHint: 'SignUpButton', semanticRole: 'cta-button' },
      ],
    });

    await applySemanticNaming(page, mockModel, 3000);

    expect(root.meta.componentHint).toBe('MainContainer');
    expect(root.meta.semanticRole).toBe('page-content');
    expect(child.meta.componentHint).toBe('SignUpButton');
    expect(child.meta.semanticRole).toBe('cta-button');
  });

  it('handles LLM failure gracefully', async () => {
    const root = createMockCirNode({ id: 'root' });
    const page = createMockPage(root);

    mockQueryLLM.mockRejectedValueOnce(new Error('API timeout'));

    await applySemanticNaming(page, mockModel, 3000);

    // Should not throw, node should remain unchanged
    expect(root.meta.componentHint).toBeNull();
    expect(root.meta.semanticRole).toBeNull();
  });

  it('only assigns names to nodes returned by LLM', async () => {
    const child1 = createMockCirNode({ id: 'c1', textContent: 'Hello' });
    const child2 = createMockCirNode({ id: 'c2', textContent: 'World' });
    const root = createMockCirNode({ id: 'root', children: [child1, child2] });
    const page = createMockPage(root);

    mockQueryLLM.mockResolvedValueOnce({
      assignments: [
        { id: 'c1', componentHint: 'Greeting', semanticRole: 'heading' },
      ],
    });

    await applySemanticNaming(page, mockModel, 3000);

    expect(child1.meta.componentHint).toBe('Greeting');
    expect(child2.meta.componentHint).toBeNull();
  });
});
