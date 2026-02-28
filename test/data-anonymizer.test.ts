/**
 * @file data-anonymizer.test.ts — Tests for Data Anonymization
 *
 * Mocks the AI client to avoid real API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CIRPage, CIRNode } from '../src/types/cir.js';

vi.mock('../src/ai/ai-client.js', () => ({
  queryLLMStructured: vi.fn(),
}));

import { anonymizeData } from '../src/ai/transformers/data-anonymizer.js';
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
  vi.resetAllMocks();
});

describe('anonymizeData', () => {
  it('replaces PII text with placeholders', async () => {
    const nameNode = createMockCirNode({ id: 'name', textContent: 'John Smith' });
    const emailNode = createMockCirNode({ id: 'email', textContent: 'john@example.com' });
    const root = createMockCirNode({ children: [nameNode, emailNode] });
    const page = createMockPage(root);

    mockQueryLLM.mockResolvedValueOnce({
      mappings: [
        { original: 'John Smith', replacement: 'Jane Doe' },
        { original: 'john@example.com', replacement: 'user@example.com' },
      ],
    });

    await anonymizeData(page, mockModel);

    expect(nameNode.textContent).toBe('Jane Doe');
    expect(emailNode.textContent).toBe('user@example.com');
  });

  it('leaves non-PII text unchanged', async () => {
    const label = createMockCirNode({ id: 'label', textContent: 'Settings' });
    const root = createMockCirNode({ children: [label] });
    const page = createMockPage(root);

    mockQueryLLM.mockResolvedValueOnce({
      mappings: [], // LLM identifies no PII
    });

    await anonymizeData(page, mockModel);
    expect(label.textContent).toBe('Settings');
  });

  it('skips nodes with no text content', async () => {
    const emptyNode = createMockCirNode({ textContent: null });
    const root = createMockCirNode({ children: [emptyNode] });
    const page = createMockPage(root);

    mockQueryLLM.mockResolvedValueOnce({ mappings: [] });

    await anonymizeData(page, mockModel);
    expect(emptyNode.textContent).toBeNull();
  });

  it('handles deeply nested text', async () => {
    const deep = createMockCirNode({ id: 'deep', textContent: 'secret@corp.com' });
    const mid = createMockCirNode({ children: [deep] });
    const root = createMockCirNode({ children: [mid] });
    const page = createMockPage(root);

    mockQueryLLM.mockResolvedValueOnce({
      mappings: [{ original: 'secret@corp.com', replacement: 'user@example.com' }],
    });

    await anonymizeData(page, mockModel);
    expect(deep.textContent).toBe('user@example.com');
  });

  it('deduplicates text before sending to LLM', async () => {
    const node1 = createMockCirNode({ id: 'n1', textContent: 'John Smith' });
    const node2 = createMockCirNode({ id: 'n2', textContent: 'John Smith' });
    const root = createMockCirNode({ children: [node1, node2] });
    const page = createMockPage(root);

    mockQueryLLM.mockResolvedValueOnce({
      mappings: [{ original: 'John Smith', replacement: 'Jane Doe' }],
    });

    await anonymizeData(page, mockModel);

    // Both should be replaced
    expect(node1.textContent).toBe('Jane Doe');
    expect(node2.textContent).toBe('Jane Doe');

    // LLM should have been called with deduplicated list
    expect(mockQueryLLM).toHaveBeenCalledTimes(1);
  });
});
