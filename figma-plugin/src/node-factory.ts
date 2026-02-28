/**
 * @file node-factory.ts — Figma Node Creation Factory
 *
 * Creates actual Figma nodes from FigmaNodeData objects produced by the
 * Standard Transformer.
 *
 * This module runs inside Figma's plugin sandbox (QuickJS) and uses the
 * Figma Plugin API to create Frame, Text, Rectangle, and Vector nodes.
 *
 * Each function in this module handles one Figma node type, applying all
 * relevant visual properties (fills, strokes, effects, layout, text).
 *
 * Used by: figma-plugin/src/code.ts (the main plugin sandbox entry point).
 */

import { loadFontWithFallback, resolveFontFamily, cssWeightToFigmaStyle } from './font-loader.js';

// =============================================================================
// TYPE DEFINITIONS (mirrored from src/types/figma.ts for sandbox isolation)
// =============================================================================

// The Figma plugin sandbox cannot import from the main project's src/ folder.
// These types are minimal mirrors of the FigmaNodeData interface.
// We keep them in sync manually during the PoC phase.

/** Color with channels 0–1. */
interface PluginColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A fill paint. */
interface PluginPaint {
  type: 'SOLID' | 'IMAGE';
  color?: PluginColor;
  opacity?: number;
  scaleMode?: string;
  imageHash?: string | null;
  imageUrl?: string;
}

/** A stroke. */
interface PluginStroke {
  type: 'SOLID';
  color: PluginColor;
}

/** A shadow effect. */
interface PluginEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW';
  color: PluginColor;
  offset: { x: number; y: number };
  radius: number;
  spread: number;
  visible: boolean;
}

/** The Figma-ready node data structure. */
export interface PluginNodeData {
  type: 'FRAME' | 'TEXT' | 'RECTANGLE' | 'VECTOR';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;

  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX';
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  clipsContent?: boolean;

  fills?: PluginPaint[];
  strokes?: PluginStroke[];
  strokeWeight?: number;
  strokeAlign?: 'INSIDE' | 'OUTSIDE' | 'CENTER';
  cornerRadius?: number;
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomRightRadius?: number;
  bottomLeftRadius?: number;
  effects?: PluginEffect[];
  opacity?: number;

  characters?: string;
  fontName?: { family: string; style: string };
  fontSize?: number;
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  textAutoResize?: 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'NONE';
  lineHeight?: { value: number; unit: 'PIXELS' | 'PERCENT' | 'AUTO' };
  letterSpacing?: { value: number; unit: 'PIXELS' | 'PERCENT' };

  svgContent?: string;
  imageUrl?: string;
  children?: PluginNodeData[];
}

// =============================================================================
// MAIN NODE CREATION FUNCTION
// =============================================================================

/**
 * Recursively creates Figma nodes from a FigmaNodeData tree.
 *
 * This is the main entry point for node creation. It determines the node type,
 * creates the appropriate Figma node, applies all visual properties, and
 * recursively processes children.
 *
 * @param nodeData - The Figma-ready node data to create.
 * @param parentNode - The parent Figma node to append the created node to.
 *                     Pass figma.currentPage for the root level.
 * @returns The created Figma SceneNode.
 *
 * @example
 * const rootData = JSON.parse(jsonString);
 * const rootFrame = await createFigmaNode(rootData, figma.currentPage);
 * figma.viewport.scrollAndZoomIntoView([rootFrame]);
 */
export async function createFigmaNode(
  nodeData: PluginNodeData,
  parentNode: BaseNode & ChildrenMixin,
): Promise<SceneNode> {
  let createdNode: SceneNode;

  switch (nodeData.type) {
    case 'FRAME':
      createdNode = await createFrameNode(nodeData);
      break;
    case 'TEXT':
      createdNode = await createTextNode(nodeData);
      break;
    case 'RECTANGLE':
      createdNode = createRectangleNode(nodeData);
      break;
    case 'VECTOR':
      createdNode = createVectorNode(nodeData);
      break;
    default:
      createdNode = await createFrameNode(nodeData);
  }

  // Set common properties
  createdNode.name = nodeData.name;
  createdNode.x = nodeData.x;
  createdNode.y = nodeData.y;
  createdNode.resize(Math.max(1, nodeData.width), Math.max(1, nodeData.height));

  if (nodeData.opacity !== undefined && nodeData.opacity < 1) {
    createdNode.opacity = nodeData.opacity;
  }

  // Append to parent
  parentNode.appendChild(createdNode);

  // Recursively create children (FRAME only)
  if (nodeData.children && nodeData.children.length > 0 && createdNode.type === 'FRAME') {
    for (const childData of nodeData.children) {
      await createFigmaNode(childData, createdNode);
    }
  }

  return createdNode;
}

// =============================================================================
// FRAME NODE CREATION
// =============================================================================

/**
 * Creates a Figma Frame node with layout, fills, strokes, corners, and effects.
 *
 * Frames are the primary container type in Figma. They support auto-layout
 * (equivalent to CSS flexbox), padding, clipping, and all visual properties.
 *
 * @param nodeData - The node data specifying frame properties.
 * @returns A configured FrameNode.
 */
async function createFrameNode(nodeData: PluginNodeData): Promise<FrameNode> {
  const frame = figma.createFrame();

  // Auto-layout (from CSS flexbox)
  if (nodeData.layoutMode && nodeData.layoutMode !== 'NONE') {
    frame.layoutMode = nodeData.layoutMode;

    if (nodeData.primaryAxisAlignItems) {
      frame.primaryAxisAlignItems = nodeData.primaryAxisAlignItems;
    }
    if (nodeData.counterAxisAlignItems) {
      frame.counterAxisAlignItems = nodeData.counterAxisAlignItems;
    }
    if (nodeData.itemSpacing !== undefined) {
      frame.itemSpacing = nodeData.itemSpacing;
    }
  }

  // Padding
  if (nodeData.paddingTop !== undefined) frame.paddingTop = nodeData.paddingTop;
  if (nodeData.paddingRight !== undefined) frame.paddingRight = nodeData.paddingRight;
  if (nodeData.paddingBottom !== undefined) frame.paddingBottom = nodeData.paddingBottom;
  if (nodeData.paddingLeft !== undefined) frame.paddingLeft = nodeData.paddingLeft;

  // Clipping
  if (nodeData.clipsContent !== undefined) {
    frame.clipsContent = nodeData.clipsContent;
  }

  // Apply visual properties
  applySolidFills(frame, nodeData.fills);
  applyStrokes(frame, nodeData.strokes, nodeData.strokeWeight, nodeData.strokeAlign);
  applyCornerRadius(frame, nodeData);
  applyEffects(frame, nodeData.effects);

  return frame;
}

// =============================================================================
// TEXT NODE CREATION
// =============================================================================

/**
 * Creates a Figma Text node with font, size, color, alignment, and spacing.
 *
 * Font loading is async — we must load the font before setting text content.
 * If the requested font is unavailable, we fall back to Inter.
 *
 * @param nodeData - The node data specifying text properties.
 * @returns A configured TextNode.
 */
async function createTextNode(nodeData: PluginNodeData): Promise<TextNode> {
  const textNode = figma.createText();

  // Load font (must happen before setting characters)
  const requestedFamily = nodeData.fontName
    ? resolveFontFamily(nodeData.fontName.family)
    : 'Inter';
  const requestedStyle = nodeData.fontName
    ? cssWeightToFigmaStyle(nodeData.fontName.style)
    : 'Regular';

  const loadedFont = await loadFontWithFallback(requestedFamily, requestedStyle);
  textNode.fontName = loadedFont as FontName;

  // Set text content
  textNode.characters = nodeData.characters || '';

  // Font size
  if (nodeData.fontSize) {
    textNode.fontSize = nodeData.fontSize;
  }

  // Horizontal alignment
  if (nodeData.textAlignHorizontal) {
    textNode.textAlignHorizontal = nodeData.textAlignHorizontal;
  }

  // Auto-resize behavior
  textNode.textAutoResize = nodeData.textAutoResize || 'WIDTH_AND_HEIGHT';

  // Line height
  if (nodeData.lineHeight) {
    if (nodeData.lineHeight.unit === 'AUTO') {
      textNode.lineHeight = { unit: 'AUTO' };
    } else {
      textNode.lineHeight = {
        value: nodeData.lineHeight.value,
        unit: nodeData.lineHeight.unit,
      };
    }
  }

  // Letter spacing
  if (nodeData.letterSpacing && nodeData.letterSpacing.value !== 0) {
    textNode.letterSpacing = {
      value: nodeData.letterSpacing.value,
      unit: nodeData.letterSpacing.unit,
    };
  }

  // Text color (applied as fill)
  applySolidFills(textNode, nodeData.fills);

  return textNode;
}

// =============================================================================
// RECTANGLE NODE CREATION
// =============================================================================

/**
 * Creates a Figma Rectangle node for image placeholders or decorative shapes.
 *
 * In Phase 1, images are represented as colored rectangles with the correct
 * dimensions. The image URL is stored but not downloaded.
 *
 * @param nodeData - The node data specifying rectangle properties.
 * @returns A configured RectangleNode.
 */
function createRectangleNode(nodeData: PluginNodeData): RectangleNode {
  const rectangle = figma.createRectangle();

  // If this is an image placeholder, give it a light gray fill
  if (nodeData.imageUrl) {
    rectangle.fills = [{
      type: 'SOLID',
      color: { r: 0.9, g: 0.9, b: 0.9 },
      opacity: 1,
    }];
  } else {
    applySolidFills(rectangle, nodeData.fills);
  }

  applyStrokes(rectangle, nodeData.strokes, nodeData.strokeWeight, nodeData.strokeAlign);
  applyCornerRadius(rectangle, nodeData);
  applyEffects(rectangle, nodeData.effects);

  return rectangle;
}

// =============================================================================
// VECTOR NODE CREATION
// =============================================================================

/**
 * Creates a Figma node for SVG content.
 *
 * In Phase 1, SVGs are rendered as placeholder rectangles with a label.
 * Full SVG-to-vector conversion (via figma.createNodeFromSvg) will be
 * added in a later phase.
 *
 * @param nodeData - The node data with SVG content.
 * @returns A RectangleNode placeholder for the SVG.
 */
function createVectorNode(nodeData: PluginNodeData): RectangleNode {
  // Phase 1: Create a placeholder rectangle for SVGs
  // figma.createNodeFromSvg() requires well-formed SVG which may need cleaning
  const placeholder = figma.createRectangle();
  placeholder.fills = [{
    type: 'SOLID',
    color: { r: 0.85, g: 0.85, b: 0.95 },
    opacity: 1,
  }];

  return placeholder;
}

// =============================================================================
// SHARED PROPERTY APPLICATION HELPERS
// =============================================================================

/**
 * Applies solid color fills to a Figma node.
 * Filters out IMAGE fills (not supported in Phase 1 plugin).
 *
 * @param node - The Figma node that supports fills.
 * @param fills - Array of paint definitions from FigmaNodeData.
 */
function applySolidFills(
  node: GeometryMixin & MinimalFillsMixin,
  fills: PluginPaint[] | undefined,
): void {
  if (!fills || fills.length === 0) {
    node.fills = [];
    return;
  }

  const solidFills: SolidPaint[] = [];

  for (const fill of fills) {
    if (fill.type === 'SOLID' && fill.color) {
      solidFills.push({
        type: 'SOLID',
        color: { r: fill.color.r, g: fill.color.g, b: fill.color.b },
        opacity: fill.color.a,
      });
    }
  }

  if (solidFills.length > 0) {
    node.fills = solidFills;
  }
}

/**
 * Applies strokes (borders) to a Figma node.
 *
 * @param node - The Figma node that supports strokes.
 * @param strokes - Array of stroke definitions.
 * @param strokeWeight - Stroke width in pixels.
 * @param strokeAlign - Where to place the stroke relative to the boundary.
 */
function applyStrokes(
  node: GeometryMixin & MinimalStrokesMixin,
  strokes: PluginStroke[] | undefined,
  strokeWeight: number | undefined,
  strokeAlign: 'INSIDE' | 'OUTSIDE' | 'CENTER' | undefined,
): void {
  if (!strokes || strokes.length === 0) {
    return;
  }

  const figmaStrokes: SolidPaint[] = strokes.map((stroke) => ({
    type: 'SOLID' as const,
    color: { r: stroke.color.r, g: stroke.color.g, b: stroke.color.b },
    opacity: stroke.color.a,
  }));

  node.strokes = figmaStrokes;

  if (strokeWeight !== undefined) {
    node.strokeWeight = strokeWeight;
  }

  if (strokeAlign !== undefined) {
    node.strokeAlign = strokeAlign;
  }
}

/**
 * Applies corner radius to a Figma node.
 * Supports both uniform radius and individual corner radii.
 *
 * @param node - The Figma node that supports corner radius.
 * @param nodeData - The node data with radius properties.
 */
function applyCornerRadius(
  node: CornerMixin & IndividualCornerMixin,
  nodeData: PluginNodeData,
): void {
  if (nodeData.cornerRadius !== undefined && nodeData.cornerRadius > 0) {
    node.cornerRadius = nodeData.cornerRadius;
  } else if (nodeData.topLeftRadius !== undefined) {
    node.topLeftRadius = nodeData.topLeftRadius;
    node.topRightRadius = nodeData.topRightRadius ?? 0;
    node.bottomRightRadius = nodeData.bottomRightRadius ?? 0;
    node.bottomLeftRadius = nodeData.bottomLeftRadius ?? 0;
  }
}

/**
 * Applies shadow effects to a Figma node.
 *
 * @param node - The Figma node that supports effects.
 * @param effects - Array of shadow effect definitions.
 */
function applyEffects(
  node: BlendMixin,
  effects: PluginEffect[] | undefined,
): void {
  if (!effects || effects.length === 0) {
    return;
  }

  const figmaEffects: Effect[] = effects.map((effect) => ({
    type: effect.type,
    color: {
      r: effect.color.r,
      g: effect.color.g,
      b: effect.color.b,
      a: effect.color.a,
    },
    offset: effect.offset,
    radius: effect.radius,
    spread: effect.spread,
    visible: effect.visible,
  }));

  node.effects = figmaEffects;
}
