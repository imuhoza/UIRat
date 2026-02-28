/**
 * @file standard-transformer.ts — CIR to Figma-Ready JSON Transformer (Standard Mode)
 *
 * The Standard Transformer is a deterministic (no AI) mapper that converts a CIR
 * node tree into a Figma-ready node tree. It implements the mapping rules defined
 * in IDEA.md Section 8.1.1.
 *
 * WHAT IT DOES:
 * - Determines the Figma node type for each CIR node (FRAME, TEXT, RECTANGLE, VECTOR)
 * - Maps CSS visual properties to Figma equivalents (fills, strokes, effects, etc.)
 * - Maps CSS flexbox layout to Figma auto-layout
 * - Converts coordinates from absolute (page-relative) to relative (parent-relative)
 * - Generates generic names for the Figma layers panel (e.g., "div-node_001")
 *
 * WHAT IT DOES NOT DO (Standard mode limitations):
 * - No semantic naming (that's AI Design mode)
 * - No component detection (that's AI Design mode)
 * - No Design System generation (that's AI Design mode)
 * - No CSS Grid support (Phase 1 limitation)
 *
 * This module is a pure function: CIRNode tree in → FigmaNodeData tree out.
 * No side effects, no I/O, no state. Easy to test in isolation.
 *
 * @example
 * import { transformCirToFigma } from './standard-transformer';
 * const figmaTree = transformCirToFigma(cirDocument.pages[0].rootNode);
 * // figmaTree is ready to be consumed by the Figma plugin
 */

import type { CIRNode } from '../types/cir.js';
import type { FigmaNodeData, FigmaPaint, FigmaStroke, FigmaEffect } from '../types/figma.js';
import { cssColorToFigma } from './color-utils.js';
import { applyLayoutMapping } from './layout-mapper.js';

// =============================================================================
// TAG CLASSIFICATION CONSTANTS
// =============================================================================

/**
 * HTML tags that are primarily text containers.
 * When these tags have direct text content and no child elements,
 * they are mapped to Figma TEXT nodes.
 */
const TEXT_CONTAINER_TAGS: ReadonlySet<string> = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'SPAN', 'LABEL', 'A', 'STRONG', 'EM', 'B', 'I',
  'SMALL', 'MARK', 'DEL', 'INS', 'SUB', 'SUP',
  'CODE', 'PRE', 'BLOCKQUOTE', 'CITE', 'Q',
  'ABBR', 'TIME', 'LI',
]);

/**
 * CSS font-weight numeric values mapped to Figma font style names.
 * Figma uses descriptive style names rather than numeric weights.
 */
const FONT_WEIGHT_TO_STYLE_NAME: ReadonlyMap<string, string> = new Map([
  ['100', 'Thin'],
  ['200', 'ExtraLight'],
  ['300', 'Light'],
  ['400', 'Regular'],
  ['500', 'Medium'],
  ['600', 'SemiBold'],
  ['700', 'Bold'],
  ['800', 'ExtraBold'],
  ['900', 'Black'],
]);

// =============================================================================
// MAIN TRANSFORM FUNCTION
// =============================================================================

/**
 * Transforms a CIR node tree into a Figma-ready node tree.
 *
 * This is the main entry point for the Standard Transformer.
 * It recursively processes each CIR node, determining its Figma type,
 * mapping visual properties, and converting coordinates from absolute
 * to parent-relative.
 *
 * @param cirNode - The root CIR node to transform (typically the page's rootNode).
 * @returns A FigmaNodeData tree ready for consumption by the Figma plugin.
 *
 * @example
 * const cirDocument = JSON.parse(fs.readFileSync('capture.cir.json', 'utf-8'));
 * const figmaTree = transformCirToFigma(cirDocument.pages[0].rootNode);
 * fs.writeFileSync('output.figma.json', JSON.stringify(figmaTree, null, 2));
 */
export function transformCirToFigma(cirNode: CIRNode): FigmaNodeData {
  const figmaNode = transformNode(cirNode);

  // Convert root node coordinates to start at (0, 0)
  // This makes the Figma frame start at the origin of the canvas
  figmaNode.x = 0;
  figmaNode.y = 0;

  return figmaNode;
}

// =============================================================================
// NODE TRANSFORMATION (RECURSIVE)
// =============================================================================

/**
 * Transforms a single CIR node into a FigmaNodeData object.
 * Recursively processes children and converts their coordinates
 * from absolute to relative-to-parent.
 *
 * @param cirNode - The CIR node to transform.
 * @returns The corresponding FigmaNodeData object.
 */
function transformNode(cirNode: CIRNode): FigmaNodeData {
  // Step 1: Determine what type of Figma node this becomes
  const nodeType = determineNodeType(cirNode);
  const nodeName = generateNodeName(cirNode, nodeType);

  // Step 2: Create the base Figma node with position and size
  const figmaNode: FigmaNodeData = {
    type: nodeType,
    name: nodeName,
    x: cirNode.bounds.x,
    y: cirNode.bounds.y,
    width: Math.max(1, cirNode.bounds.width),  // Figma requires minimum size of 1
    height: Math.max(1, cirNode.bounds.height),
  };

  // Step 3: Apply visual properties (fills, strokes, corners, shadows, opacity)
  applyFills(figmaNode, cirNode);
  applyStrokes(figmaNode, cirNode);
  applyCornerRadius(figmaNode, cirNode);
  applyShadowEffects(figmaNode, cirNode);
  applyOpacity(figmaNode, cirNode);

  // Step 4: Apply type-specific properties
  switch (nodeType) {
    case 'FRAME':
      applyFrameProperties(figmaNode, cirNode);
      break;
    case 'TEXT':
      applyTextProperties(figmaNode, cirNode);
      break;
    case 'RECTANGLE':
      applyRectangleProperties(figmaNode, cirNode);
      break;
    case 'VECTOR':
      applyVectorProperties(figmaNode, cirNode);
      break;
  }

  return figmaNode;
}

// =============================================================================
// NODE TYPE DETERMINATION
// =============================================================================

/**
 * Determines what Figma node type a CIR node should become.
 *
 * Decision logic:
 * 1. Inline SVG → VECTOR
 * 2. Image element (img src or background-image) → RECTANGLE (with image fill)
 * 3. Text element with direct text and no child elements → TEXT
 * 4. Everything else → FRAME (container)
 *
 * @param cirNode - The CIR node to classify.
 * @returns The Figma node type: "FRAME", "TEXT", "RECTANGLE", or "VECTOR".
 */
function determineNodeType(cirNode: CIRNode): 'FRAME' | 'TEXT' | 'RECTANGLE' | 'VECTOR' {
  const tagName = cirNode.tagName.toUpperCase();

  // Inline SVG elements become vector nodes
  if (tagName === 'SVG' && cirNode.assets.svgContent !== null) {
    return 'VECTOR';
  }

  // Image elements become rectangles with image fills
  if (tagName === 'IMG' && cirNode.assets.imgSrc !== null) {
    return 'RECTANGLE';
  }

  // Elements with background images also become rectangles
  if (cirNode.assets.backgroundImage !== null && cirNode.children.length === 0) {
    return 'RECTANGLE';
  }

  // Text container tags with direct text and no children → TEXT node
  if (
    TEXT_CONTAINER_TAGS.has(tagName) &&
    cirNode.textContent !== null &&
    cirNode.children.length === 0
  ) {
    return 'TEXT';
  }

  // Pseudo-elements with text content → TEXT node
  if (cirNode.meta.isPseudo && cirNode.textContent !== null) {
    return 'TEXT';
  }

  // Everything else (div, section, nav, form, ul, ol, table, etc.) → FRAME
  return 'FRAME';
}

/**
 * Generates a display name for the Figma layers panel.
 *
 * In Standard mode, names are generic: "tagname-nodeId" (e.g., "div-node_001").
 * This keeps things predictable and machine-readable.
 * AI Design mode (Phase 3) will replace these with semantic names.
 *
 * @param cirNode - The CIR node.
 * @param nodeType - The determined Figma node type.
 * @returns A display name string.
 */
function generateNodeName(
  cirNode: CIRNode,
  nodeType: 'FRAME' | 'TEXT' | 'RECTANGLE' | 'VECTOR',
): string {
  // AI Design mode: use semantic name if available
  if (cirNode.meta.componentHint) {
    return cirNode.meta.componentHint;
  }

  const tagName = cirNode.tagName.toLowerCase();

  // For text nodes, include a preview of the text content
  if (nodeType === 'TEXT' && cirNode.textContent !== null) {
    const textPreview = cirNode.textContent.slice(0, 30);
    const suffix = cirNode.textContent.length > 30 ? '...' : '';
    return `${tagName}: "${textPreview}${suffix}"`;
  }

  // For images, include a hint
  if (nodeType === 'RECTANGLE' && (cirNode.assets.imgSrc || cirNode.assets.backgroundImage)) {
    return `image-${cirNode.id}`;
  }

  // For SVGs, mark as vector
  if (nodeType === 'VECTOR') {
    return `svg-${cirNode.id}`;
  }

  return `${tagName}-${cirNode.id}`;
}

// =============================================================================
// FILL MAPPING
// =============================================================================

/**
 * Maps CSS background-color and images to Figma fills.
 *
 * Priority:
 * 1. If the node has an image (imgSrc or backgroundImage), create an IMAGE fill
 * 2. Otherwise, if backgroundColor is not transparent, create a SOLID fill
 * 3. Otherwise, no fill (empty array)
 *
 * @param figmaNode - The Figma node to apply fills to.
 * @param cirNode - The source CIR node.
 */
function applyFills(figmaNode: FigmaNodeData, cirNode: CIRNode): void {
  const fills: FigmaPaint[] = [];

  // Image fills take priority
  const imageUrl = cirNode.assets.imgSrc || cirNode.assets.backgroundImage;
  if (imageUrl !== null) {
    fills.push({
      type: 'IMAGE',
      scaleMode: 'FILL',
      imageHash: null,
      imageUrl: imageUrl,
    });
    figmaNode.fills = fills;
    return;
  }

  // Solid background color
  const backgroundColor = cirNode.styles.backgroundColor;
  if (backgroundColor && backgroundColor !== 'rgba(0, 0, 0, 0)' && backgroundColor !== 'transparent') {
    const figmaColor = cssColorToFigma(backgroundColor);
    fills.push({
      type: 'SOLID',
      color: figmaColor,
    });
  }

  figmaNode.fills = fills;
}

// =============================================================================
// STROKE (BORDER) MAPPING
// =============================================================================

/**
 * Maps CSS borders to Figma strokes.
 *
 * For simplicity in Phase 1, we use the top border as representative.
 * If the top border has a non-zero width and isn't style "none",
 * it becomes a Figma stroke.
 *
 * @param figmaNode - The Figma node to apply strokes to.
 * @param cirNode - The source CIR node.
 */
function applyStrokes(figmaNode: FigmaNodeData, cirNode: CIRNode): void {
  // Use the top border as representative (most common case is uniform borders)
  const borderWidth = cirNode.styles.borderTopWidth;
  const borderStyle = cirNode.styles.borderTopStyle;
  const borderColor = cirNode.styles.borderTopColor;

  if (borderWidth > 0 && borderStyle !== 'none') {
    const stroke: FigmaStroke = {
      type: 'SOLID',
      color: cssColorToFigma(borderColor),
    };

    figmaNode.strokes = [stroke];
    figmaNode.strokeWeight = borderWidth;
    figmaNode.strokeAlign = 'INSIDE';
  }
}

// =============================================================================
// CORNER RADIUS MAPPING
// =============================================================================

/**
 * Maps CSS border-radius to Figma corner radius.
 *
 * If all four corners have the same radius, uses the uniform `cornerRadius` property.
 * If corners differ, sets individual corner radius properties.
 *
 * @param figmaNode - The Figma node to apply corner radius to.
 * @param cirNode - The source CIR node.
 */
function applyCornerRadius(figmaNode: FigmaNodeData, cirNode: CIRNode): void {
  const topLeft = cirNode.styles.borderTopLeftRadius;
  const topRight = cirNode.styles.borderTopRightRadius;
  const bottomRight = cirNode.styles.borderBottomRightRadius;
  const bottomLeft = cirNode.styles.borderBottomLeftRadius;

  // If all corners are the same, use the uniform property
  if (topLeft === topRight && topRight === bottomRight && bottomRight === bottomLeft) {
    if (topLeft > 0) {
      figmaNode.cornerRadius = topLeft;
    }
  } else {
    // Individual corner radii
    figmaNode.topLeftRadius = topLeft;
    figmaNode.topRightRadius = topRight;
    figmaNode.bottomRightRadius = bottomRight;
    figmaNode.bottomLeftRadius = bottomLeft;
  }
}

// =============================================================================
// SHADOW EFFECTS MAPPING
// =============================================================================

/**
 * Maps CSS box-shadow to Figma drop shadow / inner shadow effects.
 *
 * Each CIR box shadow becomes a Figma effect:
 * - Non-inset shadows → DROP_SHADOW
 * - Inset shadows → INNER_SHADOW
 *
 * @param figmaNode - The Figma node to apply effects to.
 * @param cirNode - The source CIR node.
 */
function applyShadowEffects(figmaNode: FigmaNodeData, cirNode: CIRNode): void {
  if (cirNode.styles.boxShadow.length === 0) {
    return;
  }

  const effects: FigmaEffect[] = cirNode.styles.boxShadow.map((shadow) => ({
    type: shadow.inset ? 'INNER_SHADOW' as const : 'DROP_SHADOW' as const,
    color: cssColorToFigma(shadow.color),
    offset: { x: shadow.offsetX, y: shadow.offsetY },
    radius: shadow.blurRadius,
    spread: shadow.spreadRadius,
    visible: true,
  }));

  figmaNode.effects = effects;
}

// =============================================================================
// OPACITY MAPPING
// =============================================================================

/**
 * Maps CSS opacity to Figma opacity.
 * Only sets the property when opacity is not 1 (fully opaque).
 *
 * @param figmaNode - The Figma node to apply opacity to.
 * @param cirNode - The source CIR node.
 */
function applyOpacity(figmaNode: FigmaNodeData, cirNode: CIRNode): void {
  if (cirNode.styles.opacity < 1) {
    figmaNode.opacity = cirNode.styles.opacity;
  }
}

// =============================================================================
// FRAME-SPECIFIC PROPERTIES
// =============================================================================

/**
 * Applies frame-specific properties: auto-layout, padding, clipping, and children.
 *
 * Children are recursively transformed and their coordinates are converted
 * from absolute (page-relative) to relative (parent-relative).
 *
 * @param figmaNode - The Figma FRAME node to populate.
 * @param cirNode - The source CIR node.
 */
function applyFrameProperties(figmaNode: FigmaNodeData, cirNode: CIRNode): void {
  // Apply auto-layout mapping (flex → Figma layout)
  applyLayoutMapping(figmaNode, cirNode.layout, cirNode.styles);

  // Apply content clipping (CSS overflow: hidden → Figma clipsContent)
  figmaNode.clipsContent =
    cirNode.styles.overflow === 'hidden' ||
    cirNode.styles.overflow === 'scroll' ||
    cirNode.styles.overflow === 'auto';

  // Transform and attach children
  if (cirNode.children.length > 0) {
    figmaNode.children = cirNode.children.map((childCir) => {
      const childFigma = transformNode(childCir);

      // Convert from absolute coordinates to parent-relative
      childFigma.x = childCir.bounds.x - cirNode.bounds.x;
      childFigma.y = childCir.bounds.y - cirNode.bounds.y;

      return childFigma;
    });
  }
}

// =============================================================================
// TEXT-SPECIFIC PROPERTIES
// =============================================================================

/**
 * Applies text-specific properties: font, size, color, alignment, line height.
 *
 * The text content becomes the Figma `characters` property.
 * CSS font properties are mapped to Figma font specification.
 *
 * @param figmaNode - The Figma TEXT node to populate.
 * @param cirNode - The source CIR node.
 */
function applyTextProperties(figmaNode: FigmaNodeData, cirNode: CIRNode): void {
  figmaNode.characters = cirNode.textContent || '';

  // Font specification
  const fontFamily = extractPrimaryFontFamily(cirNode.styles.fontFamily);
  const fontStyle = mapFontWeightToStyle(cirNode.styles.fontWeight);
  figmaNode.fontName = { family: fontFamily, style: fontStyle };
  figmaNode.fontSize = cirNode.styles.fontSize;

  // Text color — applied as a solid fill on the text node
  const textColor = cssColorToFigma(cirNode.styles.color);
  figmaNode.fills = [{ type: 'SOLID', color: textColor }];

  // Horizontal alignment
  figmaNode.textAlignHorizontal = mapTextAlign(cirNode.styles.textAlign);

  // Text auto-resize (default: shrink-to-fit)
  figmaNode.textAutoResize = 'WIDTH_AND_HEIGHT';

  // Line height
  figmaNode.lineHeight = parseLineHeight(cirNode.styles.lineHeight, cirNode.styles.fontSize);

  // Letter spacing
  figmaNode.letterSpacing = parseLetterSpacing(cirNode.styles.letterSpacing);
}

// =============================================================================
// RECTANGLE-SPECIFIC PROPERTIES
// =============================================================================

/**
 * Applies rectangle-specific properties for image placeholder nodes.
 * Passes through the image URL for later download by the Figma plugin.
 *
 * @param figmaNode - The Figma RECTANGLE node.
 * @param cirNode - The source CIR node.
 */
function applyRectangleProperties(figmaNode: FigmaNodeData, cirNode: CIRNode): void {
  const imageUrl = cirNode.assets.imgSrc || cirNode.assets.backgroundImage;
  if (imageUrl !== null) {
    figmaNode.imageUrl = imageUrl;
  }
}

// =============================================================================
// VECTOR-SPECIFIC PROPERTIES
// =============================================================================

/**
 * Applies vector-specific properties for SVG nodes.
 * Passes through the SVG markup for the Figma plugin to create the vector.
 *
 * @param figmaNode - The Figma VECTOR node.
 * @param cirNode - The source CIR node.
 */
function applyVectorProperties(figmaNode: FigmaNodeData, cirNode: CIRNode): void {
  if (cirNode.assets.svgContent !== null) {
    figmaNode.svgContent = cirNode.assets.svgContent;
  }
}

// =============================================================================
// TEXT HELPER FUNCTIONS
// =============================================================================

/**
 * Extracts the first (primary) font family from a CSS font-family string.
 *
 * CSS font-family is comma-separated: "Inter, system-ui, sans-serif"
 * We extract "Inter" and strip quotes.
 *
 * @param cssFontFamily - The CSS font-family value.
 * @returns The primary font family name.
 */
function extractPrimaryFontFamily(cssFontFamily: string): string {
  const firstFamily = cssFontFamily.split(',')[0];
  if (firstFamily === undefined) {
    return 'Inter';
  }
  return firstFamily.trim().replace(/^["']|["']$/g, '');
}

/**
 * Maps a CSS font-weight number to a Figma font style name.
 *
 * @param fontWeight - CSS font-weight as a string (e.g., "400", "700").
 * @returns Figma style name (e.g., "Regular", "Bold").
 */
function mapFontWeightToStyle(fontWeight: string): string {
  return FONT_WEIGHT_TO_STYLE_NAME.get(fontWeight) ?? 'Regular';
}

/**
 * Maps CSS text-align to Figma text alignment.
 *
 * @param textAlign - CSS text-align value.
 * @returns Figma horizontal text alignment.
 */
function mapTextAlign(textAlign: string): 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED' {
  switch (textAlign) {
    case 'center':
      return 'CENTER';
    case 'right':
    case 'end':
      return 'RIGHT';
    case 'justify':
      return 'JUSTIFIED';
    case 'left':
    case 'start':
    default:
      return 'LEFT';
  }
}

/**
 * Parses a CSS line-height value into Figma's line height format.
 *
 * CSS line-height can be:
 * - "normal" → Figma AUTO
 * - "24px"   → Figma 24 PIXELS
 * - "1.5"    → Figma 150 PERCENT (relative to font size)
 *
 * @param lineHeight - CSS line-height string.
 * @param fontSize - CSS font-size in pixels (for calculating percentages).
 * @returns Figma line height specification.
 */
function parseLineHeight(
  lineHeight: string,
  fontSize: number,
): { value: number; unit: 'PIXELS' | 'PERCENT' | 'AUTO' } {
  if (lineHeight === 'normal') {
    return { value: 0, unit: 'AUTO' };
  }

  // Pixel value: "24px"
  if (lineHeight.endsWith('px')) {
    const pixelValue = parseFloat(lineHeight);
    if (!Number.isNaN(pixelValue)) {
      return { value: pixelValue, unit: 'PIXELS' };
    }
  }

  // Unitless number: "1.5" means 150% of font size
  const numericValue = parseFloat(lineHeight);
  if (!Number.isNaN(numericValue)) {
    // If the value seems to be a multiplier (< 10), treat as percent
    if (numericValue < 10) {
      return { value: numericValue * 100, unit: 'PERCENT' };
    }
    // Otherwise it's likely a pixel value without "px" suffix
    return { value: numericValue, unit: 'PIXELS' };
  }

  return { value: 0, unit: 'AUTO' };
}

/**
 * Parses a CSS letter-spacing value into Figma's letter spacing format.
 *
 * @param letterSpacing - CSS letter-spacing string (e.g., "0px", "0.5px", "normal").
 * @returns Figma letter spacing specification.
 */
function parseLetterSpacing(
  letterSpacing: string,
): { value: number; unit: 'PIXELS' | 'PERCENT' } {
  if (letterSpacing === 'normal' || !letterSpacing) {
    return { value: 0, unit: 'PIXELS' };
  }

  const pixelValue = parseFloat(letterSpacing);
  if (!Number.isNaN(pixelValue)) {
    return { value: pixelValue, unit: 'PIXELS' };
  }

  return { value: 0, unit: 'PIXELS' };
}
