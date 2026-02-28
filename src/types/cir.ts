/**
 * @file cir.ts — UIRat Intermediate Representation (CIR) Type Definitions
 *
 * The CIR is the central data format of the UIRat pipeline. It serves as a universal
 * bridge between the browser DOM and all output formats (Figma, React, HTML).
 *
 * Data flow:
 *   DOM Serializer → CIR JSON → Transformer → Figma / Code output
 *
 * Every visual element on a web page becomes a CIRNode. The full captured page
 * becomes a CIRDocument containing one or more CIRPages.
 *
 * This file defines the TypeScript interfaces for the CIR format version 1.0.
 * All modules in the pipeline import these types as their shared contract.
 */

// =============================================================================
// CIR DOCUMENT — Top-level structure representing a full capture session
// =============================================================================

/**
 * A complete CIR document representing one or more captured web pages.
 * This is the root object serialized to JSON by the DOM Serializer.
 *
 * @example
 * ```json
 * {
 *   "version": "1.0",
 *   "tool": "UIRat",
 *   "capturedAt": "2026-02-28T14:30:00.000Z",
 *   "sourceUrl": "https://example.com",
 *   "viewport": { "width": 1440, "height": 900 },
 *   "pages": [ ... ],
 *   "assets": { "images": [], "fonts": [], "svgs": [] },
 *   "designTokens": { "colors": [], "spacings": [], "radii": [], "typography": [] }
 * }
 * ```
 */
export interface CIRDocument {
  /** CIR format version. Always "1.0" for this version of UIRat. */
  version: '1.0';

  /** Tool identifier. Always "UIRat". */
  tool: 'UIRat';

  /** ISO 8601 timestamp of when the capture was performed. */
  capturedAt: string;

  /** The root URL of the application that was captured. */
  sourceUrl: string;

  /** The browser viewport dimensions used during capture. */
  viewport: CIRViewport;

  /** Array of captured pages. Phase 1 captures a single page. */
  pages: CIRPage[];

  /**
   * Catalog of all collected assets (images, fonts, SVGs).
   * Empty in Phase 1 — populated by the Asset Collector module in Phase 2.
   */
  assets: CIRAssetCatalog;

  /**
   * Design tokens extracted from the captured pages (colors, spacings, etc.).
   * Empty in Phase 1 — populated by the AI Design transformer in Phase 3.
   */
  designTokens: CIRDesignTokens;

  /**
   * Metadata about the crawl session (multi-page captures only).
   * Undefined for single-page captures.
   */
  crawlMetadata?: CIRCrawlMetadata;
}

// =============================================================================
// VIEWPORT
// =============================================================================

/**
 * Browser viewport dimensions used during the capture.
 * Determines which CSS media queries and responsive breakpoints are active.
 */
export interface CIRViewport {
  /** Viewport width in pixels. Default: 1440. */
  width: number;

  /** Viewport height in pixels. Default: 900. */
  height: number;
}

// =============================================================================
// PAGE — One captured web page
// =============================================================================

/**
 * Represents a single captured web page within the CIR document.
 * Contains the full node tree and metadata about the page.
 */
export interface CIRPage {
  /** The URL path of this page (e.g., "/dashboard", "/settings"). */
  route: string;

  /** The `<title>` content of the page. */
  title: string;

  /**
   * Viewport dimensions used to capture this specific page.
   * Useful for multi-viewport captures where each page may be captured
   * at different breakpoints. Undefined for single-viewport captures.
   */
  viewport?: CIRViewport;

  /**
   * Full-page screenshot encoded as a base64 PNG string.
   * Null in Phase 1 — will be captured by Playwright in later phases.
   */
  screenshot: string | null;

  /** The root CIR node representing `<body>` and all its visible descendants. */
  rootNode: CIRNode;

  /**
   * Captured interactive states (hover effects, open modals, dropdowns).
   * Each state is a separate CIR snapshot linked to this page.
   * Empty in Phase 1 — populated by the Crawler module in Phase 2.
   */
  interactiveStates: CIRInteractiveState[];
}

/**
 * An interactive state captured on a page (e.g., a hover effect or an open modal).
 * Stored as a separate CIR node tree linked to the trigger element.
 */
export interface CIRInteractiveState {
  /** What type of interaction triggered this state. */
  trigger: 'hover' | 'click' | 'focus';

  /** The CIR node ID of the element that was interacted with. */
  triggerNodeId: string;

  /** Human-readable description (e.g., "Dropdown menu opened"). */
  description: string;

  /** The CIR node tree representing the visual state after the interaction. */
  rootNode: CIRNode;
}

// =============================================================================
// CIR NODE — A single visual element
// =============================================================================

/**
 * Represents a single visual element extracted from the DOM.
 * This is the fundamental building block of the CIR format.
 *
 * Each CIRNode maps to one DOM element (or pseudo-element) and contains
 * all the visual information needed to reconstruct it in Figma or code.
 *
 * The node tree is recursive — each node can contain child nodes,
 * mirroring the DOM hierarchy (after filtering and wrapper merging).
 *
 * @example
 * ```json
 * {
 *   "id": "node_001",
 *   "tagName": "BUTTON",
 *   "textContent": "Sign Up",
 *   "classList": ["btn", "btn-primary"],
 *   "bounds": { "x": 100, "y": 200, "width": 120, "height": 40 },
 *   "styles": { ... },
 *   "layout": { ... },
 *   "assets": { "backgroundImage": null, "imgSrc": null, "svgContent": null },
 *   "meta": { "isPseudo": false, "isInteractive": true, "zIndex": 0, ... },
 *   "children": []
 * }
 * ```
 */
export interface CIRNode {
  /**
   * Unique identifier for this node within the document.
   * Format: "node_001", "node_002", etc. Sequential, zero-padded.
   */
  id: string;

  /**
   * The HTML tag name in UPPERCASE (e.g., "DIV", "BUTTON", "IMG", "SVG").
   * For text-only nodes extracted from Text DOM nodes, this is "#text".
   * For pseudo-elements, this is "::before" or "::after".
   */
  tagName: string;

  /**
   * Direct text content of this element (not including children's text).
   * Null if the element has no direct text nodes.
   * Trimmed and whitespace-normalized.
   */
  textContent: string | null;

  /** List of CSS class names applied to this element. */
  classList: string[];

  /** Absolute position and dimensions of this element on the page. */
  bounds: CIRBounds;

  /** All computed visual styles extracted via getComputedStyle(). */
  styles: CIRStyles;

  /** CSS layout properties (flexbox configuration). */
  layout: CIRLayout;

  /** References to images, SVGs, and background images. */
  assets: CIRNodeAssets;

  /** Metadata flags about this node's role and behavior. */
  meta: CIRNodeMeta;

  /** Child nodes in visual hierarchy order (front-to-back in the DOM). */
  children: CIRNode[];
}

// =============================================================================
// BOUNDS — Position and dimensions
// =============================================================================

/**
 * Absolute position and dimensions of an element on the page.
 * Extracted from getBoundingClientRect() plus scroll offset.
 * All values are in CSS pixels.
 */
export interface CIRBounds {
  /** Horizontal position from the left edge of the page (not viewport). */
  x: number;

  /** Vertical position from the top edge of the page (not viewport). */
  y: number;

  /** Element width in pixels. */
  width: number;

  /** Element height in pixels. */
  height: number;
}

// =============================================================================
// STYLES — Computed visual properties
// =============================================================================

/**
 * All computed visual styles for a CIR node, extracted via getComputedStyle().
 * Contains ~40 properties covering background, typography, borders,
 * spacing, effects, and positioning.
 *
 * All color values are CSS color strings (e.g., "rgba(255, 0, 0, 1)").
 * All numeric values are in CSS pixels unless otherwise noted.
 */
export interface CIRStyles {
  // ---- Background ----

  /** Background color as a CSS rgba string. "rgba(0, 0, 0, 0)" means transparent. */
  backgroundColor: string;

  /** Background image URL or CSS gradient string. Null if none. */
  backgroundImage: string | null;

  // ---- Typography ----

  /** Font family name (e.g., "Inter", "Arial", "Times New Roman"). */
  fontFamily: string;

  /** Font size in pixels. */
  fontSize: number;

  /** Font weight as a numeric string (e.g., "400" for normal, "700" for bold). */
  fontWeight: string;

  /**
   * Line height as a CSS value string.
   * Can be "normal", a pixel value like "24px", or a unitless ratio like "1.5".
   */
  lineHeight: string;

  /** Letter spacing as a CSS value string (e.g., "0px", "0.5px", "normal"). */
  letterSpacing: string;

  /** Text alignment: "left", "center", "right", "justify", "start", "end". */
  textAlign: string;

  /** Text decoration: "none", "underline", "line-through", "overline". */
  textDecoration: string;

  /** Text transform: "none", "uppercase", "lowercase", "capitalize". */
  textTransform: string;

  /** Text (foreground) color as a CSS rgba string. */
  color: string;

  // ---- Borders (individual sides for accuracy) ----

  /** Top border width in pixels. 0 means no top border. */
  borderTopWidth: number;

  /** Right border width in pixels. */
  borderRightWidth: number;

  /** Bottom border width in pixels. */
  borderBottomWidth: number;

  /** Left border width in pixels. */
  borderLeftWidth: number;

  /** Top border color as a CSS rgba string. */
  borderTopColor: string;

  /** Right border color as a CSS rgba string. */
  borderRightColor: string;

  /** Bottom border color as a CSS rgba string. */
  borderBottomColor: string;

  /** Left border color as a CSS rgba string. */
  borderLeftColor: string;

  /** Top border style: "none", "solid", "dashed", "dotted", etc. */
  borderTopStyle: string;

  /** Right border style. */
  borderRightStyle: string;

  /** Bottom border style. */
  borderBottomStyle: string;

  /** Left border style. */
  borderLeftStyle: string;

  /** Top-left corner radius in pixels. */
  borderTopLeftRadius: number;

  /** Top-right corner radius in pixels. */
  borderTopRightRadius: number;

  /** Bottom-right corner radius in pixels. */
  borderBottomRightRadius: number;

  /** Bottom-left corner radius in pixels. */
  borderBottomLeftRadius: number;

  // ---- Spacing ----

  /** Top padding in pixels. */
  paddingTop: number;

  /** Right padding in pixels. */
  paddingRight: number;

  /** Bottom padding in pixels. */
  paddingBottom: number;

  /** Left padding in pixels. */
  paddingLeft: number;

  /** Top margin in pixels. */
  marginTop: number;

  /** Right margin in pixels. */
  marginRight: number;

  /** Bottom margin in pixels. */
  marginBottom: number;

  /** Left margin in pixels. */
  marginLeft: number;

  // ---- Effects ----

  /**
   * Parsed box shadows. Each shadow object contains offset, blur, spread, color,
   * and an inset flag. Empty array means no box shadow.
   */
  boxShadow: CIRBoxShadow[];

  /** Element opacity from 0 (fully transparent) to 1 (fully opaque). */
  opacity: number;

  /** CSS overflow behavior: "visible", "hidden", "scroll", "auto". */
  overflow: string;

  // ---- Position ----

  /** CSS position property: "static", "relative", "absolute", "fixed", "sticky". */
  position: string;

  /** CSS z-index value. 0 if "auto" or not specified. */
  zIndex: number;
}

// =============================================================================
// BOX SHADOW — Parsed shadow definition
// =============================================================================

/**
 * A single parsed box-shadow value.
 * CSS box-shadow can contain multiple shadows separated by commas.
 * Each one is parsed into this structure.
 *
 * @example
 * CSS: "rgba(0, 0, 0, 0.1) 0px 4px 6px -1px"
 * Parsed: { inset: false, offsetX: 0, offsetY: 4, blurRadius: 6, spreadRadius: -1, color: "rgba(0,0,0,0.1)" }
 */
export interface CIRBoxShadow {
  /** Whether this is an inset (inner) shadow. */
  inset: boolean;

  /** Horizontal offset in pixels. Positive = right. */
  offsetX: number;

  /** Vertical offset in pixels. Positive = down. */
  offsetY: number;

  /** Blur radius in pixels. 0 = sharp edge. */
  blurRadius: number;

  /** Spread radius in pixels. Positive = larger, negative = smaller. */
  spreadRadius: number;

  /** Shadow color as a CSS rgba string. */
  color: string;
}

// =============================================================================
// LAYOUT — Flexbox configuration
// =============================================================================

/**
 * CSS layout properties for a CIR node.
 * Focused on flexbox for Phase 1. CSS Grid support will be added in later phases.
 */
export interface CIRLayout {
  /** Display type: "block", "flex", "inline", "inline-flex", "grid", "inline-block", "none". */
  display: string;

  /** Flex direction: "row", "column", "row-reverse", "column-reverse". Only meaningful when display is flex. */
  flexDirection: string;

  /** Main axis alignment: "flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly". */
  justifyContent: string;

  /** Cross axis alignment: "flex-start", "center", "flex-end", "stretch", "baseline". */
  alignItems: string;

  /** Whether flex items wrap: "nowrap", "wrap", "wrap-reverse". */
  flexWrap: string;

  /** Gap between flex/grid children in pixels. */
  gap: number;

  /** This element's cross-axis alignment override: "auto", "flex-start", "center", "flex-end", "stretch". */
  alignSelf: string;

  /** Flex grow factor. 0 = don't grow. */
  flexGrow: number;

  /** Flex shrink factor. 1 = can shrink. */
  flexShrink: number;

  /** Flex basis as a CSS value string (e.g., "auto", "0px", "50%"). */
  flexBasis: string;
}

// =============================================================================
// NODE ASSETS — Image, SVG, and background references
// =============================================================================

/**
 * References to visual assets associated with a CIR node.
 * These are URLs or raw markup, not the actual binary data.
 * The Asset Collector module (Phase 2) will download and embed them.
 */
export interface CIRNodeAssets {
  /** CSS background-image URL. Null if none or if the value is "none". */
  backgroundImage: string | null;

  /** `<img>` element src URL (uses currentSrc for responsive images). Null if not an image element. */
  imgSrc: string | null;

  /** Raw SVG markup (outerHTML) for inline `<svg>` elements. Null if not an SVG. */
  svgContent: string | null;
}

// =============================================================================
// NODE META — Metadata and behavioral flags
// =============================================================================

/**
 * Metadata about a CIR node's role, behavior, and origin.
 * These flags help downstream modules make smarter decisions.
 */
export interface CIRNodeMeta {
  /**
   * Whether this node represents a CSS pseudo-element (::before or ::after).
   * Pseudo-elements are inserted as synthetic children of their parent node.
   */
  isPseudo: boolean;

  /**
   * Whether this element is interactive (clickable, hoverable, focusable).
   * True for: <a>, <button>, <input>, <select>, <textarea>,
   * and any element with onclick/cursor:pointer.
   */
  isInteractive: boolean;

  /** The CSS z-index value for stacking context ordering. */
  zIndex: number;

  /**
   * AI-assigned component type hint (e.g., "Button", "Card", "Navbar").
   * Null in Standard mode — populated by the AI Design transformer in Phase 3.
   */
  componentHint: string | null;

  /**
   * AI-assigned semantic role (e.g., "navigation", "hero-section", "footer").
   * Null in Standard mode — populated by the AI Design transformer in Phase 3.
   */
  semanticRole: string | null;
}

// =============================================================================
// ASSET CATALOG — Document-level asset collection (Phase 2+)
// =============================================================================

/**
 * Catalog of all assets collected from the captured pages.
 * Empty arrays in Phase 1 — the Asset Collector populates this in Phase 2.
 */
export interface CIRAssetCatalog {
  /** Downloaded and processed image assets. */
  images: CIRImageAsset[];

  /** Downloaded font files with family/weight mappings. */
  fonts: CIRFontAsset[];

  /** Cleaned and optimized SVG assets. */
  svgs: CIRSvgAsset[];
}

/** A collected image asset with its original URL and local path. */
export interface CIRImageAsset {
  /** Unique identifier for this asset. */
  id: string;

  /** Original URL where the image was found. */
  originalUrl: string;

  /** Local file path after download (relative to the output directory). */
  localPath: string;

  /** Image dimensions in pixels. */
  width: number;
  height: number;

  /** Image format: "png", "jpg", "webp", "gif". */
  format: string;
}

/** A collected font asset. */
export interface CIRFontAsset {
  /** CSS font-family name as used in the source page. */
  family: string;

  /** Font weight (e.g., "400", "700"). */
  weight: string;

  /** Font style (e.g., "normal", "italic"). */
  style: string;

  /** Original URL of the font file. */
  originalUrl: string;

  /** Local file path after download. */
  localPath: string;
}

/** A collected SVG asset. */
export interface CIRSvgAsset {
  /** Unique identifier for this asset. */
  id: string;

  /** Cleaned and optimized SVG markup. */
  content: string;

  /** Original source (URL or "inline"). */
  source: string;
}

// =============================================================================
// CRAWL METADATA — Multi-page crawl session info (Phase 2+)
// =============================================================================

/**
 * Metadata about a multi-page crawl session.
 * Only present when the document was produced by the crawl orchestrator.
 */
export interface CIRCrawlMetadata {
  /** Total number of unique URLs discovered during crawling. */
  totalPagesDiscovered: number;

  /** Number of pages actually captured (may be less due to maxPages limit). */
  totalPagesCaptured: number;

  /** Maximum depth reached during BFS crawl. */
  maxDepthReached: number;

  /** Total crawl duration in milliseconds. */
  crawlDurationMs: number;
}

// =============================================================================
// DESIGN TOKENS — Extracted design patterns (Phase 3+)
// =============================================================================

/**
 * Design tokens extracted from the captured pages.
 * Empty arrays in Phase 1 — populated by the AI Design transformer in Phase 3.
 */
export interface CIRDesignTokens {
  /** Unique colors found across all pages. */
  colors: CIRColorToken[];

  /** Common spacing values (padding, margin, gap). */
  spacings: CIRSpacingToken[];

  /** Common border radius values. */
  radii: CIRRadiusToken[];

  /** Typography styles (font + size + weight + line-height combinations). */
  typography: CIRTypographyToken[];
}

/** A color token extracted from the design. */
export interface CIRColorToken {
  /** Token name (e.g., "primary", "background", "text-muted"). */
  name: string;

  /** Color value as a CSS rgba string. */
  value: string;

  /** How many times this color appears across all pages. */
  usageCount: number;
}

/** A spacing token. */
export interface CIRSpacingToken {
  /** Token name (e.g., "spacing-sm", "spacing-lg"). */
  name: string;

  /** Spacing value in pixels. */
  value: number;

  /** How many times this spacing value appears. */
  usageCount: number;
}

/** A border radius token. */
export interface CIRRadiusToken {
  /** Token name (e.g., "radius-sm", "radius-full"). */
  name: string;

  /** Radius value in pixels. */
  value: number;

  /** Usage frequency. */
  usageCount: number;
}

/** A typography token (combination of font properties). */
export interface CIRTypographyToken {
  /** Token name (e.g., "heading-1", "body-text", "caption"). */
  name: string;

  /** Font family. */
  fontFamily: string;

  /** Font size in pixels. */
  fontSize: number;

  /** Font weight as a numeric string. */
  fontWeight: string;

  /** Line height as a CSS value string. */
  lineHeight: string;

  /** Usage frequency. */
  usageCount: number;
}
