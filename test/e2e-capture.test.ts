/**
 * @file e2e-capture.test.ts — End-to-End Capture Test
 *
 * Tests the full pipeline: URL → Playwright capture → CIR JSON → Figma JSON.
 * Uses example.com as a simple, stable test target.
 *
 * This test requires network access and takes ~10 seconds.
 */

import { describe, it, expect } from 'vitest';
import { capturePage } from '../src/cli/capture.js';
import { transformCirToFigma } from '../src/transformer/standard-transformer.js';

describe('end-to-end capture pipeline', () => {
  it('captures example.com and produces valid CIR', async () => {
    const cirDocument = await capturePage('https://example.com', { width: 1440, height: 900 });

    // Validate CIR document structure
    expect(cirDocument.version).toBe('1.0');
    expect(cirDocument.tool).toBe('UIRat');
    expect(cirDocument.sourceUrl).toBe('https://example.com/');
    expect(cirDocument.viewport).toEqual({ width: 1440, height: 900 });
    expect(cirDocument.pages).toHaveLength(1);

    const page = cirDocument.pages[0]!;
    expect(page.route).toBe('/');
    expect(page.title).toBe('Example Domain');
    expect(page.rootNode).toBeDefined();
    expect(page.rootNode.tagName).toBe('BODY');
    expect(page.rootNode.children.length).toBeGreaterThan(0);
  }, 30000);

  it('transforms CIR to valid Figma JSON', async () => {
    const cirDocument = await capturePage('https://example.com', { width: 1440, height: 900 });
    const figmaTree = transformCirToFigma(cirDocument.pages[0]!.rootNode);

    // Root frame starts at (0, 0)
    expect(figmaTree.x).toBe(0);
    expect(figmaTree.y).toBe(0);
    expect(figmaTree.type).toBe('FRAME');
    expect(figmaTree.width).toBeGreaterThan(0);
    expect(figmaTree.height).toBeGreaterThan(0);

    // Should contain text nodes (Example Domain has headings and paragraphs)
    function findTextNodes(node: typeof figmaTree): typeof figmaTree[] {
      const texts: typeof figmaTree[] = [];
      if (node.type === 'TEXT') texts.push(node);
      if (node.children) {
        for (const child of node.children) {
          texts.push(...findTextNodes(child));
        }
      }
      return texts;
    }

    const textNodes = findTextNodes(figmaTree);
    expect(textNodes.length).toBeGreaterThan(0);

    // "Example Domain" should appear as text content
    const titleNode = textNodes.find((node) =>
      node.characters?.includes('Example Domain'),
    );
    expect(titleNode).toBeDefined();
    expect(titleNode!.fontSize).toBeGreaterThan(0);
  }, 30000);
});
