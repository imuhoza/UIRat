/**
 * @file ai-design-orchestrator.test.ts — Tests for the AI Design Orchestrator
 *
 * All AI modules are mocked — tests orchestration flow, not individual transformers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CIRDocument, CIRNode } from '../src/types/cir.js';

vi.mock('../src/ai/ai-client.js', () => ({
  createModelInstance: vi.fn().mockResolvedValue({}),
}));

vi.mock('../src/ai/transformers/hierarchy-cleaner.js', () => ({
  cleanupHierarchy: vi.fn((node: CIRNode) => node),
}));

vi.mock('../src/ai/transformers/semantic-namer.js', () => ({
  applySemanticNaming: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/ai/transformers/data-anonymizer.js', () => ({
  anonymizeData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/ai/transformers/design-token-extractor.js', () => ({
  extractDesignTokens: vi.fn().mockResolvedValue({
    colors: [{ name: 'primary', value: 'rgba(0,0,255,1)', usageCount: 10 }],
    spacings: [], radii: [], typography: [],
  }),
}));

vi.mock('../src/ai/transformers/component-detector.js', () => ({
  detectComponents: vi.fn().mockResolvedValue({ components: [] }),
}));

import { enrichCirWithAI } from '../src/ai/ai-design-orchestrator.js';
import { createModelInstance } from '../src/ai/ai-client.js';
import { cleanupHierarchy } from '../src/ai/transformers/hierarchy-cleaner.js';
import { applySemanticNaming } from '../src/ai/transformers/semantic-namer.js';
import { anonymizeData } from '../src/ai/transformers/data-anonymizer.js';
import { extractDesignTokens } from '../src/ai/transformers/design-token-extractor.js';
import { detectComponents } from '../src/ai/transformers/component-detector.js';
import type { AIDesignConfig } from '../src/ai/ai-types.js';

function createMockDocument(): CIRDocument {
  return {
    version: '1.0',
    tool: 'UIRat',
    capturedAt: '2026-02-28T00:00:00.000Z',
    sourceUrl: 'https://example.com',
    viewport: { width: 1440, height: 900 },
    pages: [{
      route: '/',
      title: 'Test',
      screenshot: null,
      rootNode: {
        id: 'root', tagName: 'BODY', textContent: null, classList: [],
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        styles: {
          backgroundColor: 'rgba(255,255,255,1)', backgroundImage: null,
          fontFamily: 'Inter', fontSize: 16, fontWeight: '400', lineHeight: 'normal',
          letterSpacing: 'normal', textAlign: 'start', textDecoration: 'none',
          textTransform: 'none', color: 'rgba(0, 0, 0, 1)',
          borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0,
          borderTopColor: 'rgba(0,0,0,0)', borderRightColor: 'rgba(0,0,0,0)',
          borderBottomColor: 'rgba(0,0,0,0)', borderLeftColor: 'rgba(0,0,0,0)',
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
      },
      interactiveStates: [],
    }],
    assets: { images: [], fonts: [], svgs: [] },
    designTokens: { colors: [], spacings: [], radii: [], typography: [] },
  };
}

const baseConfig: AIDesignConfig = {
  provider: 'anthropic',
  maxChunkTokens: 3000,
  anonymize: false,
  skipComponentDetection: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('enrichCirWithAI', () => {
  it('runs the full pipeline in order', async () => {
    const doc = createMockDocument();
    const result = await enrichCirWithAI(doc, baseConfig);

    expect(createModelInstance).toHaveBeenCalledTimes(1);
    expect(cleanupHierarchy).toHaveBeenCalledTimes(1);
    expect(applySemanticNaming).toHaveBeenCalledTimes(1);
    expect(detectComponents).toHaveBeenCalledTimes(1);
    expect(extractDesignTokens).toHaveBeenCalledTimes(1);
    expect(anonymizeData).not.toHaveBeenCalled();

    expect(result).toBe(doc);
  });

  it('runs anonymization when enabled', async () => {
    const doc = createMockDocument();
    await enrichCirWithAI(doc, { ...baseConfig, anonymize: true });

    expect(anonymizeData).toHaveBeenCalledTimes(1);
  });

  it('skips component detection when configured', async () => {
    const doc = createMockDocument();
    await enrichCirWithAI(doc, { ...baseConfig, skipComponentDetection: true });

    expect(detectComponents).not.toHaveBeenCalled();
  });

  it('returns document even if model creation fails', async () => {
    vi.mocked(createModelInstance).mockRejectedValueOnce(new Error('Bad API key'));

    const doc = createMockDocument();
    const result = await enrichCirWithAI(doc, baseConfig);

    expect(result).toBe(doc);
    expect(cleanupHierarchy).not.toHaveBeenCalled();
  });

  it('continues pipeline if semantic naming fails', async () => {
    vi.mocked(applySemanticNaming).mockRejectedValueOnce(new Error('LLM error'));

    const doc = createMockDocument();
    await enrichCirWithAI(doc, baseConfig);

    // Should still run subsequent steps
    expect(detectComponents).toHaveBeenCalledTimes(1);
    expect(extractDesignTokens).toHaveBeenCalledTimes(1);
  });

  it('updates designTokens on the document', async () => {
    const doc = createMockDocument();
    await enrichCirWithAI(doc, baseConfig);

    expect(doc.designTokens.colors).toHaveLength(1);
    expect(doc.designTokens.colors[0]!.name).toBe('primary');
  });
});
