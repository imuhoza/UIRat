/**
 * @file figma.ts — Figma-Ready Output Type Definitions
 *
 * These types describe the intermediate format produced by the Standard Transformer.
 * They mirror the relevant subset of the Figma Plugin API node types, but are
 * plain TypeScript interfaces (no dependency on @figma/plugin-typings) so they
 * can be used in the Node.js transformer module.
 *
 * The Figma Plugin reads these structures and creates actual Figma nodes from them.
 *
 * Data flow:
 *   CIR JSON → Standard Transformer → FigmaNodeData tree → Figma Plugin → Figma canvas
 */

// =============================================================================
// FIGMA COLOR — RGB + Alpha (all values 0–1)
// =============================================================================

/**
 * A color in the Figma color space.
 * All channels are floating-point values from 0 to 1.
 *
 * @example
 * Pure red: { r: 1, g: 0, b: 0, a: 1 }
 * Semi-transparent black: { r: 0, g: 0, b: 0, a: 0.5 }
 */
export interface FigmaColor {
  /** Red channel (0 = none, 1 = full red). */
  r: number;

  /** Green channel (0 = none, 1 = full green). */
  g: number;

  /** Blue channel (0 = none, 1 = full blue). */
  b: number;

  /** Alpha / opacity channel (0 = transparent, 1 = opaque). */
  a: number;
}

// =============================================================================
// FIGMA PAINTS — Fill types
// =============================================================================

/**
 * A solid color fill.
 * The most common fill type — maps from CSS background-color.
 */
export interface FigmaSolidPaint {
  /** Discriminator for paint type. */
  type: 'SOLID';

  /** The fill color. Alpha is handled via the color's `a` field. */
  color: FigmaColor;

  /** Optional override for the paint's opacity (0–1). */
  opacity?: number;
}

/**
 * An image fill.
 * Maps from CSS background-image or <img> elements.
 *
 * In Phase 1, imageHash is always null (images are not downloaded).
 * The imageUrl is passed through for future use by the Figma Plugin.
 */
export interface FigmaImagePaint {
  /** Discriminator for paint type. */
  type: 'IMAGE';

  /** How the image is scaled within its container. */
  scaleMode: 'FILL' | 'FIT' | 'CROP' | 'TILE';

  /**
   * Figma image hash. Null in Phase 1 — the Figma Plugin would populate this
   * after downloading and uploading the image to Figma's CDN.
   */
  imageHash: string | null;

  /**
   * Original image URL from the source page.
   * Passed through so the Figma Plugin (or Asset Collector) can download it later.
   */
  imageUrl?: string;
}

/** Union of all supported Figma paint (fill) types. */
export type FigmaPaint = FigmaSolidPaint | FigmaImagePaint;

// =============================================================================
// FIGMA STROKES — Border representation
// =============================================================================

/**
 * A solid color stroke (border).
 * Maps from CSS border properties.
 */
export interface FigmaStroke {
  /** Always SOLID for Phase 1. Dashed/dotted not supported yet. */
  type: 'SOLID';

  /** Stroke color. */
  color: FigmaColor;
}

// =============================================================================
// FIGMA EFFECTS — Shadows
// =============================================================================

/**
 * A drop shadow effect.
 * Maps from CSS box-shadow (without the `inset` keyword).
 */
export interface FigmaDropShadow {
  /** Discriminator for effect type. */
  type: 'DROP_SHADOW';

  /** Shadow color including alpha. */
  color: FigmaColor;

  /** Shadow offset from the element. */
  offset: { x: number; y: number };

  /** Blur radius in pixels. 0 = sharp edge. */
  radius: number;

  /** Spread radius in pixels. Expands or contracts the shadow. */
  spread: number;

  /** Whether this shadow is visible. Always true when exported from CIR. */
  visible: boolean;
}

/**
 * An inner shadow effect.
 * Maps from CSS box-shadow with the `inset` keyword.
 */
export interface FigmaInnerShadow {
  /** Discriminator for effect type. */
  type: 'INNER_SHADOW';

  /** Shadow color including alpha. */
  color: FigmaColor;

  /** Shadow offset. */
  offset: { x: number; y: number };

  /** Blur radius in pixels. */
  radius: number;

  /** Spread radius in pixels. */
  spread: number;

  /** Whether this shadow is visible. Always true when exported from CIR. */
  visible: boolean;
}

/** Union of all supported Figma effect types. */
export type FigmaEffect = FigmaDropShadow | FigmaInnerShadow;

// =============================================================================
// FIGMA NODE DATA — The complete Figma-ready node structure
// =============================================================================

/**
 * A Figma-ready node produced by the Standard Transformer.
 * Contains all properties needed for the Figma Plugin to create the corresponding
 * Figma node on the canvas.
 *
 * The node tree structure mirrors the CIR tree, with coordinates converted
 * from absolute (page-relative) to relative (parent-relative).
 *
 * @example
 * A simple colored rectangle:
 * ```json
 * {
 *   "type": "FRAME",
 *   "name": "div-node_001",
 *   "x": 0,
 *   "y": 0,
 *   "width": 200,
 *   "height": 100,
 *   "fills": [{ "type": "SOLID", "color": { "r": 1, "g": 0, "b": 0, "a": 1 } }],
 *   "cornerRadius": 8,
 *   "children": []
 * }
 * ```
 */
export interface FigmaNodeData {
  /**
   * The Figma node type to create.
   * - FRAME: Container with optional auto-layout (from divs, sections, etc.)
   * - TEXT: Text layer (from p, h1–h6, span, etc.)
   * - RECTANGLE: Image placeholder or decorative shape (from img, styled divs)
   * - VECTOR: SVG vector (from inline SVG elements)
   */
  type: 'FRAME' | 'TEXT' | 'RECTANGLE' | 'VECTOR';

  /**
   * Display name for this node in the Figma layers panel.
   * Standard mode uses generic names like "div-node_001" or "button-node_003".
   * AI Design mode uses semantic names like "Header" or "ProductCard".
   */
  name: string;

  /** X position relative to the parent node (pixels). */
  x: number;

  /** Y position relative to the parent node (pixels). */
  y: number;

  /** Node width in pixels. Minimum: 1. */
  width: number;

  /** Node height in pixels. Minimum: 1. */
  height: number;

  // ---- Layout properties (FRAME only) ----

  /**
   * Auto-layout direction. NONE means no auto-layout (absolute positioning).
   * - HORIZONTAL: Children flow left-to-right (CSS flex-direction: row)
   * - VERTICAL: Children flow top-to-bottom (CSS flex-direction: column)
   * - NONE: No auto-layout, children use absolute positions
   */
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';

  /**
   * Main axis alignment (equivalent to CSS justify-content).
   * - MIN: flex-start
   * - CENTER: center
   * - MAX: flex-end
   * - SPACE_BETWEEN: space-between
   */
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';

  /**
   * Cross axis alignment (equivalent to CSS align-items).
   * - MIN: flex-start
   * - CENTER: center
   * - MAX: flex-end
   */
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX';

  /** Gap between children in pixels (equivalent to CSS gap). */
  itemSpacing?: number;

  /** Left padding in pixels. */
  paddingLeft?: number;

  /** Right padding in pixels. */
  paddingRight?: number;

  /** Top padding in pixels. */
  paddingTop?: number;

  /** Bottom padding in pixels. */
  paddingBottom?: number;

  /** Whether content that overflows the frame is clipped (CSS overflow: hidden). */
  clipsContent?: boolean;

  // ---- Visual properties ----

  /** Fill paints (background colors, image fills). Empty array = no fill. */
  fills?: FigmaPaint[];

  /** Stroke paints (borders). */
  strokes?: FigmaStroke[];

  /** Stroke (border) width in pixels. */
  strokeWeight?: number;

  /** Where the stroke is drawn relative to the node boundary. */
  strokeAlign?: 'INSIDE' | 'OUTSIDE' | 'CENTER';

  /**
   * Uniform corner radius in pixels. Used when all four corners are equal.
   * When corners differ, the individual radius properties are used instead.
   */
  cornerRadius?: number;

  /** Top-left corner radius (when corners are not uniform). */
  topLeftRadius?: number;

  /** Top-right corner radius. */
  topRightRadius?: number;

  /** Bottom-right corner radius. */
  bottomRightRadius?: number;

  /** Bottom-left corner radius. */
  bottomLeftRadius?: number;

  /** Visual effects (drop shadows, inner shadows). */
  effects?: FigmaEffect[];

  /** Node opacity (0 = invisible, 1 = fully visible). */
  opacity?: number;

  // ---- Text-specific properties ----

  /** The actual text content to display. Only set for TEXT nodes. */
  characters?: string;

  /**
   * Font specification. Family is the font name, style is the weight name.
   * Example: { family: "Inter", style: "Bold" }
   */
  fontName?: { family: string; style: string };

  /** Font size in pixels. Only set for TEXT nodes. */
  fontSize?: number;

  /** Horizontal text alignment within the text box. */
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';

  /**
   * How the text box resizes to fit its content.
   * - WIDTH_AND_HEIGHT: Box shrinks to fit text (default for most text)
   * - HEIGHT: Width is fixed, height adjusts
   * - NONE: Fixed size, text may overflow
   */
  textAutoResize?: 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'NONE';

  /**
   * Line height specification.
   * - PIXELS: Absolute line height (e.g., 24px)
   * - PERCENT: Relative to font size (e.g., 150%)
   * - AUTO: Browser default line height
   */
  lineHeight?: { value: number; unit: 'PIXELS' | 'PERCENT' | 'AUTO' };

  /**
   * Letter spacing specification.
   * - PIXELS: Absolute spacing (e.g., 0.5px)
   * - PERCENT: Relative to font size
   */
  letterSpacing?: { value: number; unit: 'PIXELS' | 'PERCENT' };

  // ---- SVG-specific properties ----

  /**
   * Raw SVG markup for VECTOR nodes. The Figma Plugin can use
   * figma.createNodeFromSvg() to create the vector from this.
   */
  svgContent?: string;

  // ---- Asset passthrough ----

  /**
   * Original image URL from the source page.
   * Passed through so the Figma Plugin or Asset Collector can download it.
   * Only set for RECTANGLE nodes that represent images.
   */
  imageUrl?: string;

  // ---- Children ----

  /**
   * Child nodes. Only FRAME nodes can have children.
   * Coordinates are relative to this node's position.
   */
  children?: FigmaNodeData[];
}
