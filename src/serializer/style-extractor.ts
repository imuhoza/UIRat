/**
 * @file style-extractor.ts — Computed Style Extraction Helpers
 *
 * Extracts the ~40 relevant CSS properties from a getComputedStyle() result
 * into the CIRStyles and CIRLayout structures defined in our type system.
 *
 * Browsers return 300+ computed style properties. We only extract the properties
 * that are meaningful for visual reconstruction in Figma or frontend code.
 *
 * This file runs inside the browser via page.evaluate() — no Node.js imports allowed.
 */

import type { CIRStyles, CIRLayout, CIRNodeAssets, CIRNodeMeta } from '../types/cir.js';
import { parseBoxShadows } from './box-shadow-parser.js';

// =============================================================================
// INTERACTIVE ELEMENT TAGS
// =============================================================================

/**
 * HTML tags that are inherently interactive (clickable, focusable, or input-capable).
 * Used to set the isInteractive flag in CIRNodeMeta.
 */
const INTERACTIVE_TAG_NAMES: ReadonlySet<string> = new Set([
  'A',
  'BUTTON',
  'INPUT',
  'SELECT',
  'TEXTAREA',
  'DETAILS',
  'SUMMARY',
  'LABEL',
]);

// =============================================================================
// STYLE EXTRACTION
// =============================================================================

/**
 * Extracts all relevant visual styles from a computed style declaration.
 *
 * Converts CSS string values to appropriate numeric types where needed
 * (e.g., "16px" → 16 for fontSize, "rgba(0,0,0,1)" stays as string for colors).
 *
 * @param computedStyle - The result of getComputedStyle(element).
 * @returns A CIRStyles object with all visual properties populated.
 *
 * @example
 * const style = getComputedStyle(element);
 * const cirStyles = extractStyles(style);
 * // cirStyles.fontSize === 16
 * // cirStyles.backgroundColor === "rgba(255, 255, 255, 1)"
 */
export function extractStyles(computedStyle: CSSStyleDeclaration): CIRStyles {
  return {
    // Background
    backgroundColor: computedStyle.backgroundColor || 'rgba(0, 0, 0, 0)',
    backgroundImage: normalizeBackgroundImage(computedStyle.backgroundImage),

    // Typography
    fontFamily: computedStyle.fontFamily || 'sans-serif',
    fontSize: parsePixelValue(computedStyle.fontSize),
    fontWeight: computedStyle.fontWeight || '400',
    lineHeight: computedStyle.lineHeight || 'normal',
    letterSpacing: computedStyle.letterSpacing || 'normal',
    textAlign: computedStyle.textAlign || 'start',
    textDecoration: extractTextDecoration(computedStyle),
    textTransform: computedStyle.textTransform || 'none',
    color: computedStyle.color || 'rgba(0, 0, 0, 1)',

    // Borders — widths
    borderTopWidth: parsePixelValue(computedStyle.borderTopWidth),
    borderRightWidth: parsePixelValue(computedStyle.borderRightWidth),
    borderBottomWidth: parsePixelValue(computedStyle.borderBottomWidth),
    borderLeftWidth: parsePixelValue(computedStyle.borderLeftWidth),

    // Borders — colors
    borderTopColor: computedStyle.borderTopColor || 'rgba(0, 0, 0, 0)',
    borderRightColor: computedStyle.borderRightColor || 'rgba(0, 0, 0, 0)',
    borderBottomColor: computedStyle.borderBottomColor || 'rgba(0, 0, 0, 0)',
    borderLeftColor: computedStyle.borderLeftColor || 'rgba(0, 0, 0, 0)',

    // Borders — styles
    borderTopStyle: computedStyle.borderTopStyle || 'none',
    borderRightStyle: computedStyle.borderRightStyle || 'none',
    borderBottomStyle: computedStyle.borderBottomStyle || 'none',
    borderLeftStyle: computedStyle.borderLeftStyle || 'none',

    // Borders — radii
    borderTopLeftRadius: parsePixelValue(computedStyle.borderTopLeftRadius),
    borderTopRightRadius: parsePixelValue(computedStyle.borderTopRightRadius),
    borderBottomRightRadius: parsePixelValue(computedStyle.borderBottomRightRadius),
    borderBottomLeftRadius: parsePixelValue(computedStyle.borderBottomLeftRadius),

    // Spacing
    paddingTop: parsePixelValue(computedStyle.paddingTop),
    paddingRight: parsePixelValue(computedStyle.paddingRight),
    paddingBottom: parsePixelValue(computedStyle.paddingBottom),
    paddingLeft: parsePixelValue(computedStyle.paddingLeft),
    marginTop: parsePixelValue(computedStyle.marginTop),
    marginRight: parsePixelValue(computedStyle.marginRight),
    marginBottom: parsePixelValue(computedStyle.marginBottom),
    marginLeft: parsePixelValue(computedStyle.marginLeft),

    // Effects
    boxShadow: parseBoxShadows(computedStyle.boxShadow || ''),
    opacity: parseFloat(computedStyle.opacity) || 1,
    overflow: computedStyle.overflow || 'visible',

    // Position
    position: computedStyle.position || 'static',
    zIndex: parseInt(computedStyle.zIndex, 10) || 0,
  };
}

// =============================================================================
// LAYOUT EXTRACTION
// =============================================================================

/**
 * Extracts CSS flexbox layout properties from a computed style declaration.
 *
 * Only flex-related properties are extracted. CSS Grid support is planned
 * for a future phase.
 *
 * @param computedStyle - The result of getComputedStyle(element).
 * @returns A CIRLayout object with all flex layout properties populated.
 */
export function extractLayout(computedStyle: CSSStyleDeclaration): CIRLayout {
  return {
    display: computedStyle.display || 'block',
    flexDirection: computedStyle.flexDirection || 'row',
    justifyContent: computedStyle.justifyContent || 'flex-start',
    alignItems: computedStyle.alignItems || 'stretch',
    flexWrap: computedStyle.flexWrap || 'nowrap',
    gap: parsePixelValue(computedStyle.gap),
    alignSelf: computedStyle.alignSelf || 'auto',
    flexGrow: parseFloat(computedStyle.flexGrow) || 0,
    flexShrink: parseFloat(computedStyle.flexShrink) || 1,
    flexBasis: computedStyle.flexBasis || 'auto',
  };
}

// =============================================================================
// ASSET EXTRACTION
// =============================================================================

/**
 * Extracts asset references (images, SVGs) from a DOM element.
 *
 * @param element - The DOM element to extract assets from.
 * @param computedStyle - The element's computed style.
 * @returns A CIRNodeAssets object with URLs and SVG content where applicable.
 */
export function extractAssets(
  element: Element,
  computedStyle: CSSStyleDeclaration,
): CIRNodeAssets {
  const tagName = element.tagName.toUpperCase();
  const assets: CIRNodeAssets = {
    backgroundImage: null,
    imgSrc: null,
    svgContent: null,
  };

  // Extract <img> source URL (prefer currentSrc for responsive images)
  if (tagName === 'IMG') {
    const imgElement = element as HTMLImageElement;
    assets.imgSrc = imgElement.currentSrc || imgElement.src || null;
  }

  // Extract inline SVG markup
  if (tagName === 'SVG') {
    assets.svgContent = element.outerHTML;
  }

  // Extract CSS background-image URL
  const backgroundImageValue = computedStyle.backgroundImage;
  if (backgroundImageValue && backgroundImageValue !== 'none') {
    const extractedUrl = extractUrlFromCssValue(backgroundImageValue);
    if (extractedUrl !== null) {
      assets.backgroundImage = extractedUrl;
    }
  }

  return assets;
}

// =============================================================================
// META EXTRACTION
// =============================================================================

/**
 * Extracts metadata flags for a CIR node.
 *
 * Determines whether the element is interactive, its z-index,
 * and whether it represents a pseudo-element.
 *
 * @param element - The DOM element.
 * @param computedStyle - The element's computed style.
 * @param isPseudoElement - Whether this node represents a ::before or ::after.
 * @returns A CIRNodeMeta object with all metadata flags set.
 */
export function extractMeta(
  element: Element,
  computedStyle: CSSStyleDeclaration,
  isPseudoElement: boolean,
): CIRNodeMeta {
  const isInteractive = checkIfInteractive(element, computedStyle);
  const zIndex = parseInt(computedStyle.zIndex, 10) || 0;

  return {
    isPseudo: isPseudoElement,
    isInteractive: isInteractive,
    zIndex: zIndex,
    componentHint: null, // Populated by AI Design mode in Phase 3
    semanticRole: null,  // Populated by AI Design mode in Phase 3
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Parses a CSS pixel value string (e.g., "16px", "0px") into a number.
 * Returns 0 for non-numeric values like "auto", "normal", or empty strings.
 *
 * @param cssValue - The CSS value string to parse.
 * @returns The numeric value in pixels, or 0 if not parseable.
 */
export function parsePixelValue(cssValue: string | undefined): number {
  if (!cssValue || cssValue === 'auto' || cssValue === 'normal' || cssValue === 'none') {
    return 0;
  }
  const numericValue = parseFloat(cssValue);
  return Number.isNaN(numericValue) ? 0 : numericValue;
}

/**
 * Normalizes a CSS background-image value.
 *
 * Returns null for "none" or empty values.
 * Keeps gradient values as-is (e.g., "linear-gradient(...)").
 * Extracts URLs from url("...") syntax.
 *
 * @param backgroundImage - The raw background-image computed style value.
 * @returns Normalized value or null if none.
 */
function normalizeBackgroundImage(backgroundImage: string | undefined): string | null {
  if (!backgroundImage || backgroundImage === 'none') {
    return null;
  }
  return backgroundImage;
}

/**
 * Extracts a URL from a CSS url("...") value.
 *
 * @param cssValue - A CSS value that may contain url("...").
 * @returns The extracted URL string, or null if no URL found.
 *
 * @example
 * extractUrlFromCssValue('url("https://example.com/image.png")') // "https://example.com/image.png"
 * extractUrlFromCssValue('linear-gradient(red, blue)')           // null
 */
function extractUrlFromCssValue(cssValue: string): string | null {
  const urlMatch = cssValue.match(/url\(["']?([^"')]+)["']?\)/);
  if (urlMatch !== null && urlMatch[1] !== undefined) {
    return urlMatch[1];
  }
  return null;
}

/**
 * Extracts the text-decoration value, handling browser differences.
 *
 * Modern browsers use `text-decoration-line` while older ones use `text-decoration`.
 * We normalize to a simple string like "none", "underline", "line-through".
 *
 * @param computedStyle - The element's computed style.
 * @returns The normalized text decoration value.
 */
function extractTextDecoration(computedStyle: CSSStyleDeclaration): string {
  // Modern browsers split text-decoration into sub-properties
  const decorationLine = (computedStyle as unknown as Record<string, string>)['textDecorationLine'];
  if (decorationLine && decorationLine !== 'none') {
    return decorationLine;
  }

  // Fallback to the shorthand property
  const decoration = computedStyle.textDecoration || 'none';
  // The shorthand can include color and style — extract just the line type
  // e.g., "underline solid rgb(0, 0, 0)" → "underline"
  const firstWord = decoration.split(' ')[0];
  return firstWord || 'none';
}

/**
 * Determines whether an element is interactive (clickable, hoverable, focusable).
 *
 * An element is considered interactive if:
 * - Its tag name is in the INTERACTIVE_TAG_NAMES set
 * - It has an onclick attribute
 * - It has role="button" or role="link"
 * - Its cursor is "pointer" (strong hint of clickability)
 * - It has a tabindex attribute (keyboard-focusable)
 *
 * @param element - The DOM element.
 * @param computedStyle - The element's computed style.
 * @returns True if the element appears to be interactive.
 */
function checkIfInteractive(
  element: Element,
  computedStyle: CSSStyleDeclaration,
): boolean {
  // Check tag name
  if (INTERACTIVE_TAG_NAMES.has(element.tagName)) {
    return true;
  }

  // Check ARIA role
  const role = element.getAttribute('role');
  if (role === 'button' || role === 'link' || role === 'tab' || role === 'menuitem') {
    return true;
  }

  // Check for onclick handler
  if (element.hasAttribute('onclick')) {
    return true;
  }

  // Check for tabindex (keyboard-focusable)
  if (element.hasAttribute('tabindex')) {
    return true;
  }

  // Check cursor style — pointer means clickable
  if (computedStyle.cursor === 'pointer') {
    return true;
  }

  return false;
}
