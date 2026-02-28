/**
 * @file transformer.test.ts — Unit Tests for the Standard Transformer
 *
 * Tests the CIR → Figma node tree transformation, including:
 * - Node type determination (FRAME, TEXT, RECTANGLE, VECTOR)
 * - Layout mapping (flex → auto-layout)
 * - Visual property mapping (fills, strokes, corners, shadows)
 * - Coordinate conversion (absolute → parent-relative)
 */

import { describe, it, expect } from 'vitest';
import { transformCirToFigma } from '../src/transformer/standard-transformer.js';
import type { CIRNode } from '../src/types/cir.js';

/**
 * Creates a minimal CIR node with sensible defaults.
 * Override specific properties for each test case.
 */
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
      borderTopWidth: 0,
      borderRightWidth: 0,
      borderBottomWidth: 0,
      borderLeftWidth: 0,
      borderTopColor: 'rgba(0, 0, 0, 0)',
      borderRightColor: 'rgba(0, 0, 0, 0)',
      borderBottomColor: 'rgba(0, 0, 0, 0)',
      borderLeftColor: 'rgba(0, 0, 0, 0)',
      borderTopStyle: 'none',
      borderRightStyle: 'none',
      borderBottomStyle: 'none',
      borderLeftStyle: 'none',
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      borderBottomRightRadius: 0,
      borderBottomLeftRadius: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
      boxShadow: [],
      opacity: 1,
      overflow: 'visible',
      position: 'static',
      zIndex: 0,
    },
    layout: {
      display: 'block',
      flexDirection: 'row',
      justifyContent: 'flex-start',
      alignItems: 'stretch',
      flexWrap: 'nowrap',
      gap: 0,
      alignSelf: 'auto',
      flexGrow: 0,
      flexShrink: 1,
      flexBasis: 'auto',
    },
    assets: {
      backgroundImage: null,
      imgSrc: null,
      svgContent: null,
    },
    meta: {
      isPseudo: false,
      isInteractive: false,
      zIndex: 0,
      componentHint: null,
      semanticRole: null,
    },
    children: [],
    ...overrides,
  };
}

// =============================================================================
// NODE TYPE DETERMINATION
// =============================================================================

describe('node type determination', () => {
  it('maps a DIV to FRAME', () => {
    const cirNode = createMockCirNode({ tagName: 'DIV' });
    const result = transformCirToFigma(cirNode);
    expect(result.type).toBe('FRAME');
  });

  it('maps a P with text and no children to TEXT', () => {
    const cirNode = createMockCirNode({
      tagName: 'P',
      textContent: 'Hello world',
      children: [],
    });
    const result = transformCirToFigma(cirNode);
    expect(result.type).toBe('TEXT');
    expect(result.characters).toBe('Hello world');
  });

  it('maps an IMG with src to RECTANGLE', () => {
    const cirNode = createMockCirNode({
      tagName: 'IMG',
      assets: { imgSrc: 'https://example.com/img.png', backgroundImage: null, svgContent: null },
    });
    const result = transformCirToFigma(cirNode);
    expect(result.type).toBe('RECTANGLE');
    expect(result.imageUrl).toBe('https://example.com/img.png');
  });

  it('maps an SVG with content to VECTOR', () => {
    const cirNode = createMockCirNode({
      tagName: 'SVG',
      assets: { svgContent: '<svg><circle/></svg>', imgSrc: null, backgroundImage: null },
    });
    const result = transformCirToFigma(cirNode);
    expect(result.type).toBe('VECTOR');
    expect(result.svgContent).toBe('<svg><circle/></svg>');
  });

  it('maps H1 with text to TEXT', () => {
    const cirNode = createMockCirNode({
      tagName: 'H1',
      textContent: 'Title',
      children: [],
    });
    const result = transformCirToFigma(cirNode);
    expect(result.type).toBe('TEXT');
  });

  it('maps A tag with text and no children to TEXT', () => {
    const cirNode = createMockCirNode({
      tagName: 'A',
      textContent: 'Click me',
      children: [],
    });
    const result = transformCirToFigma(cirNode);
    expect(result.type).toBe('TEXT');
  });
});

// =============================================================================
// LAYOUT MAPPING
// =============================================================================

describe('layout mapping', () => {
  it('maps display:flex + row to HORIZONTAL', () => {
    const cirNode = createMockCirNode();
    cirNode.layout.display = 'flex';
    cirNode.layout.flexDirection = 'row';
    const result = transformCirToFigma(cirNode);
    expect(result.layoutMode).toBe('HORIZONTAL');
  });

  it('maps display:flex + column to VERTICAL', () => {
    const cirNode = createMockCirNode();
    cirNode.layout.display = 'flex';
    cirNode.layout.flexDirection = 'column';
    const result = transformCirToFigma(cirNode);
    expect(result.layoutMode).toBe('VERTICAL');
  });

  it('maps display:block to NONE (absolute positioning)', () => {
    const cirNode = createMockCirNode();
    cirNode.layout.display = 'block';
    const result = transformCirToFigma(cirNode);
    expect(result.layoutMode).toBe('NONE');
  });

  it('maps justify-content:center to CENTER', () => {
    const cirNode = createMockCirNode();
    cirNode.layout.display = 'flex';
    cirNode.layout.justifyContent = 'center';
    const result = transformCirToFigma(cirNode);
    expect(result.primaryAxisAlignItems).toBe('CENTER');
  });

  it('maps justify-content:space-between to SPACE_BETWEEN', () => {
    const cirNode = createMockCirNode();
    cirNode.layout.display = 'flex';
    cirNode.layout.justifyContent = 'space-between';
    const result = transformCirToFigma(cirNode);
    expect(result.primaryAxisAlignItems).toBe('SPACE_BETWEEN');
  });

  it('maps align-items:center to CENTER', () => {
    const cirNode = createMockCirNode();
    cirNode.layout.display = 'flex';
    cirNode.layout.alignItems = 'center';
    const result = transformCirToFigma(cirNode);
    expect(result.counterAxisAlignItems).toBe('CENTER');
  });

  it('maps gap to itemSpacing', () => {
    const cirNode = createMockCirNode();
    cirNode.layout.display = 'flex';
    cirNode.layout.gap = 16;
    const result = transformCirToFigma(cirNode);
    expect(result.itemSpacing).toBe(16);
  });

  it('maps padding values', () => {
    const cirNode = createMockCirNode();
    cirNode.styles.paddingTop = 10;
    cirNode.styles.paddingRight = 20;
    cirNode.styles.paddingBottom = 10;
    cirNode.styles.paddingLeft = 20;
    const result = transformCirToFigma(cirNode);
    expect(result.paddingTop).toBe(10);
    expect(result.paddingRight).toBe(20);
    expect(result.paddingBottom).toBe(10);
    expect(result.paddingLeft).toBe(20);
  });
});

// =============================================================================
// VISUAL PROPERTY MAPPING
// =============================================================================

describe('visual property mapping', () => {
  it('maps background-color to solid fill', () => {
    const cirNode = createMockCirNode();
    cirNode.styles.backgroundColor = 'rgba(255, 0, 0, 1)';
    const result = transformCirToFigma(cirNode);
    expect(result.fills).toHaveLength(1);
    expect(result.fills![0]!.type).toBe('SOLID');
    if (result.fills![0]!.type === 'SOLID') {
      expect(result.fills![0]!.color).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    }
  });

  it('produces empty fills for transparent background', () => {
    const cirNode = createMockCirNode();
    cirNode.styles.backgroundColor = 'rgba(0, 0, 0, 0)';
    const result = transformCirToFigma(cirNode);
    expect(result.fills).toEqual([]);
  });

  it('maps border to stroke', () => {
    const cirNode = createMockCirNode();
    cirNode.styles.borderTopWidth = 2;
    cirNode.styles.borderTopStyle = 'solid';
    cirNode.styles.borderTopColor = 'rgba(0, 0, 0, 1)';
    const result = transformCirToFigma(cirNode);
    expect(result.strokes).toHaveLength(1);
    expect(result.strokeWeight).toBe(2);
    expect(result.strokeAlign).toBe('INSIDE');
  });

  it('maps uniform border-radius', () => {
    const cirNode = createMockCirNode();
    cirNode.styles.borderTopLeftRadius = 8;
    cirNode.styles.borderTopRightRadius = 8;
    cirNode.styles.borderBottomRightRadius = 8;
    cirNode.styles.borderBottomLeftRadius = 8;
    const result = transformCirToFigma(cirNode);
    expect(result.cornerRadius).toBe(8);
    expect(result.topLeftRadius).toBeUndefined();
  });

  it('maps individual border radii when not uniform', () => {
    const cirNode = createMockCirNode();
    cirNode.styles.borderTopLeftRadius = 4;
    cirNode.styles.borderTopRightRadius = 8;
    cirNode.styles.borderBottomRightRadius = 12;
    cirNode.styles.borderBottomLeftRadius = 16;
    const result = transformCirToFigma(cirNode);
    expect(result.cornerRadius).toBeUndefined();
    expect(result.topLeftRadius).toBe(4);
    expect(result.topRightRadius).toBe(8);
    expect(result.bottomRightRadius).toBe(12);
    expect(result.bottomLeftRadius).toBe(16);
  });

  it('maps box-shadow to DROP_SHADOW effect', () => {
    const cirNode = createMockCirNode();
    cirNode.styles.boxShadow = [{
      inset: false,
      offsetX: 0,
      offsetY: 4,
      blurRadius: 6,
      spreadRadius: -1,
      color: 'rgba(0, 0, 0, 0.1)',
    }];
    const result = transformCirToFigma(cirNode);
    expect(result.effects).toHaveLength(1);
    expect(result.effects![0]!.type).toBe('DROP_SHADOW');
    expect(result.effects![0]!.radius).toBe(6);
  });

  it('maps inset box-shadow to INNER_SHADOW effect', () => {
    const cirNode = createMockCirNode();
    cirNode.styles.boxShadow = [{
      inset: true,
      offsetX: 0,
      offsetY: 2,
      blurRadius: 4,
      spreadRadius: 0,
      color: 'rgba(0, 0, 0, 0.3)',
    }];
    const result = transformCirToFigma(cirNode);
    expect(result.effects).toHaveLength(1);
    expect(result.effects![0]!.type).toBe('INNER_SHADOW');
  });

  it('maps overflow:hidden to clipsContent', () => {
    const cirNode = createMockCirNode();
    cirNode.styles.overflow = 'hidden';
    const result = transformCirToFigma(cirNode);
    expect(result.clipsContent).toBe(true);
  });

  it('maps opacity < 1', () => {
    const cirNode = createMockCirNode();
    cirNode.styles.opacity = 0.5;
    const result = transformCirToFigma(cirNode);
    expect(result.opacity).toBe(0.5);
  });

  it('does not set opacity when fully opaque', () => {
    const cirNode = createMockCirNode();
    cirNode.styles.opacity = 1;
    const result = transformCirToFigma(cirNode);
    expect(result.opacity).toBeUndefined();
  });
});

// =============================================================================
// COORDINATE CONVERSION
// =============================================================================

describe('coordinate conversion', () => {
  it('converts root node to (0, 0)', () => {
    const cirNode = createMockCirNode();
    cirNode.bounds = { x: 100, y: 200, width: 500, height: 300 };
    const result = transformCirToFigma(cirNode);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('converts children from absolute to parent-relative coordinates', () => {
    const child = createMockCirNode({
      id: 'node_002',
      bounds: { x: 150, y: 220, width: 80, height: 30 },
    });
    const parent = createMockCirNode({
      bounds: { x: 100, y: 200, width: 500, height: 300 },
      children: [child],
    });

    const result = transformCirToFigma(parent);
    expect(result.children).toHaveLength(1);
    expect(result.children![0]!.x).toBe(50);  // 150 - 100
    expect(result.children![0]!.y).toBe(20);  // 220 - 200
  });
});

// =============================================================================
// TEXT PROPERTIES
// =============================================================================

describe('text properties', () => {
  it('maps text content to characters', () => {
    const cirNode = createMockCirNode({
      tagName: 'P',
      textContent: 'Hello world',
    });
    const result = transformCirToFigma(cirNode);
    expect(result.characters).toBe('Hello world');
  });

  it('maps font family and weight to fontName', () => {
    const cirNode = createMockCirNode({
      tagName: 'H1',
      textContent: 'Title',
    });
    cirNode.styles.fontFamily = '"Roboto", sans-serif';
    cirNode.styles.fontWeight = '700';
    const result = transformCirToFigma(cirNode);
    expect(result.fontName).toEqual({ family: 'Roboto', style: 'Bold' });
  });

  it('maps text color as fill', () => {
    const cirNode = createMockCirNode({
      tagName: 'SPAN',
      textContent: 'Colored text',
    });
    cirNode.styles.color = 'rgba(255, 0, 0, 1)';
    const result = transformCirToFigma(cirNode);
    expect(result.fills).toHaveLength(1);
    expect(result.fills![0]!.type).toBe('SOLID');
  });

  it('maps text-align:center to CENTER', () => {
    const cirNode = createMockCirNode({
      tagName: 'P',
      textContent: 'Centered',
    });
    cirNode.styles.textAlign = 'center';
    const result = transformCirToFigma(cirNode);
    expect(result.textAlignHorizontal).toBe('CENTER');
  });
});
