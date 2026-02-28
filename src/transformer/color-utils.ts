/**
 * @file color-utils.ts — CSS Color to Figma Color Converter
 *
 * Converts CSS color strings (from getComputedStyle) into Figma's color format.
 *
 * CSS colors from computed styles are typically in these formats:
 * - "rgba(255, 128, 0, 0.5)" — most common from getComputedStyle()
 * - "rgb(255, 128, 0)"       — opaque colors
 * - "#FF8000"                — hex (less common in computed styles)
 * - "#FF800080"              — hex with alpha
 * - "transparent"            — shorthand for rgba(0,0,0,0)
 *
 * Figma uses a different color model:
 * - Channels are floats from 0 to 1 (not 0 to 255)
 * - Alpha is a separate field in the same object
 *
 * Input:  CSS string  → "rgba(255, 0, 0, 0.5)"
 * Output: FigmaColor  → { r: 1, g: 0, b: 0, a: 0.5 }
 */

import type { FigmaColor } from '../types/figma.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** The maximum value for an 8-bit color channel (0–255 in CSS). */
const CSS_CHANNEL_MAX = 255;

/** Transparent/invisible color — used as fallback for unparseable values. */
const TRANSPARENT_COLOR: FigmaColor = { r: 0, g: 0, b: 0, a: 0 };

/** Fully opaque black — used as fallback for named color "black". */
const BLACK_COLOR: FigmaColor = { r: 0, g: 0, b: 0, a: 1 };

/** Fully opaque white — used as fallback for named color "white". */
const WHITE_COLOR: FigmaColor = { r: 1, g: 1, b: 1, a: 1 };

// =============================================================================
// MAIN CONVERSION FUNCTION
// =============================================================================

/**
 * Converts a CSS color string to a Figma color object.
 *
 * Handles rgba(), rgb(), hex (#RRGGBB, #RRGGBBAA, #RGB), and
 * the common named colors "transparent", "black", "white".
 *
 * For any unrecognized format, returns transparent (all zeros) to avoid
 * breaking the output. This is a safe default because transparent elements
 * are visually invisible — better than crashing on an unexpected color format.
 *
 * @param cssColorString - A CSS color string from getComputedStyle().
 * @returns A FigmaColor object with r, g, b channels (0–1) and alpha (0–1).
 *
 * @example
 * cssColorToFigma("rgba(255, 0, 0, 0.5)")   // { r: 1, g: 0, b: 0, a: 0.5 }
 * cssColorToFigma("rgb(0, 128, 255)")        // { r: 0, g: 0.502, b: 1, a: 1 }
 * cssColorToFigma("#00FF00")                  // { r: 0, g: 1, b: 0, a: 1 }
 * cssColorToFigma("transparent")              // { r: 0, g: 0, b: 0, a: 0 }
 */
export function cssColorToFigma(cssColorString: string): FigmaColor {
  if (!cssColorString) {
    return TRANSPARENT_COLOR;
  }

  const trimmed = cssColorString.trim().toLowerCase();

  // Handle named colors first (most common in edge cases)
  if (trimmed === 'transparent') {
    return TRANSPARENT_COLOR;
  }
  if (trimmed === 'black') {
    return BLACK_COLOR;
  }
  if (trimmed === 'white') {
    return WHITE_COLOR;
  }

  // Try rgba() / rgb() format — the most common from getComputedStyle()
  const rgbaResult = parseRgbaString(trimmed);
  if (rgbaResult !== null) {
    return rgbaResult;
  }

  // Try hex format (#RGB, #RRGGBB, #RRGGBBAA)
  if (trimmed.startsWith('#')) {
    return parseHexString(trimmed);
  }

  // Unrecognized format — return transparent as a safe fallback
  return TRANSPARENT_COLOR;
}

// =============================================================================
// RGBA/RGB PARSER
// =============================================================================

/**
 * Parses an rgb() or rgba() CSS color string into a Figma color.
 *
 * Expected formats:
 * - "rgb(255, 128, 0)"
 * - "rgba(255, 128, 0, 0.5)"
 *
 * @param colorString - Lowercase, trimmed CSS color string.
 * @returns FigmaColor object, or null if the string doesn't match rgb/rgba format.
 */
function parseRgbaString(colorString: string): FigmaColor | null {
  // Match: rgba(R, G, B, A) or rgb(R, G, B)
  const rgbaPattern = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/;
  const match = colorString.match(rgbaPattern);

  if (match === null) {
    return null;
  }

  const redString = match[1];
  const greenString = match[2];
  const blueString = match[3];
  const alphaString = match[4]; // undefined for rgb() without alpha

  if (redString === undefined || greenString === undefined || blueString === undefined) {
    return null;
  }

  return {
    r: clampChannel(parseInt(redString, 10) / CSS_CHANNEL_MAX),
    g: clampChannel(parseInt(greenString, 10) / CSS_CHANNEL_MAX),
    b: clampChannel(parseInt(blueString, 10) / CSS_CHANNEL_MAX),
    a: alphaString !== undefined ? clampChannel(parseFloat(alphaString)) : 1,
  };
}

// =============================================================================
// HEX COLOR PARSER
// =============================================================================

/**
 * Parses a hexadecimal CSS color string into a Figma color.
 *
 * Supported formats:
 * - "#RGB"      — shorthand (each digit is doubled: #F00 → #FF0000)
 * - "#RRGGBB"   — standard 6-digit hex
 * - "#RRGGBBAA" — 8-digit hex with alpha
 *
 * @param hexString - A hex color string starting with "#".
 * @returns FigmaColor object. Returns transparent if the hex is malformed.
 */
function parseHexString(hexString: string): FigmaColor {
  // Remove the "#" prefix
  let hex = hexString.slice(1);

  // Expand shorthand #RGB → #RRGGBB
  if (hex.length === 3) {
    const redChar = hex[0] ?? '0';
    const greenChar = hex[1] ?? '0';
    const blueChar = hex[2] ?? '0';
    hex = redChar + redChar + greenChar + greenChar + blueChar + blueChar;
  }

  // Expand shorthand #RGBA → #RRGGBBAA
  if (hex.length === 4) {
    const redChar = hex[0] ?? '0';
    const greenChar = hex[1] ?? '0';
    const blueChar = hex[2] ?? '0';
    const alphaChar = hex[3] ?? 'f';
    hex = redChar + redChar + greenChar + greenChar + blueChar + blueChar + alphaChar + alphaChar;
  }

  if (hex.length !== 6 && hex.length !== 8) {
    return TRANSPARENT_COLOR;
  }

  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const alpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : CSS_CHANNEL_MAX;

  if (Number.isNaN(red) || Number.isNaN(green) || Number.isNaN(blue) || Number.isNaN(alpha)) {
    return TRANSPARENT_COLOR;
  }

  return {
    r: clampChannel(red / CSS_CHANNEL_MAX),
    g: clampChannel(green / CSS_CHANNEL_MAX),
    b: clampChannel(blue / CSS_CHANNEL_MAX),
    a: clampChannel(alpha / CSS_CHANNEL_MAX),
  };
}

// =============================================================================
// UTILITY
// =============================================================================

/**
 * Clamps a color channel value to the valid range [0, 1].
 *
 * @param value - The channel value to clamp.
 * @returns The clamped value, guaranteed to be between 0 and 1.
 */
function clampChannel(value: number): number {
  return Math.max(0, Math.min(1, value));
}
