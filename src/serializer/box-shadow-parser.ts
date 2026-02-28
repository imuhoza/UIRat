/**
 * @file box-shadow-parser.ts — CSS Box-Shadow String Parser
 *
 * Parses the computed value of CSS `box-shadow` into structured objects.
 *
 * CSS box-shadow syntax (from getComputedStyle) returns a single string like:
 *   "rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.06) 0px 2px 4px -1px"
 *
 * This parser splits multiple shadows (comma-separated, respecting parentheses),
 * then extracts the color, offsets, blur, spread, and inset flag from each.
 *
 * This file runs inside the browser via page.evaluate() — no Node.js imports allowed.
 *
 * @example
 * const shadows = parseBoxShadows("rgba(0,0,0,0.1) 0px 4px 6px -1px");
 * // Returns: [{ inset: false, offsetX: 0, offsetY: 4, blurRadius: 6, spreadRadius: -1, color: "rgba(0,0,0,0.1)" }]
 */

import type { CIRBoxShadow } from '../types/cir.js';

/**
 * Parses a CSS box-shadow string into an array of structured shadow objects.
 *
 * Handles multiple comma-separated shadows, being careful not to split on
 * commas that appear inside rgba() or rgb() color functions.
 *
 * @param rawBoxShadow - The raw box-shadow string from getComputedStyle().
 *                       Can be "none", empty string, or a valid shadow definition.
 * @returns Array of parsed shadow objects. Empty array if no valid shadows.
 *
 * @example
 * // Single shadow
 * parseBoxShadows("rgba(0, 0, 0, 0.1) 0px 4px 6px -1px")
 * // → [{ inset: false, offsetX: 0, offsetY: 4, blurRadius: 6, spreadRadius: -1, color: "rgba(0, 0, 0, 0.1)" }]
 *
 * @example
 * // Multiple shadows
 * parseBoxShadows("rgba(0,0,0,0.1) 0px 4px 6px, inset rgba(0,0,0,0.3) 0px 2px 4px 0px")
 * // → [{ inset: false, ... }, { inset: true, ... }]
 *
 * @example
 * // No shadow
 * parseBoxShadows("none") // → []
 * parseBoxShadows("")     // → []
 */
export function parseBoxShadows(rawBoxShadow: string): CIRBoxShadow[] {
  if (!rawBoxShadow || rawBoxShadow === 'none') {
    return [];
  }

  const individualShadows = splitShadowString(rawBoxShadow);
  const parsedShadows: CIRBoxShadow[] = [];

  for (const shadowString of individualShadows) {
    const parsed = parseSingleShadow(shadowString);
    if (parsed !== null) {
      parsedShadows.push(parsed);
    }
  }

  return parsedShadows;
}

/**
 * Splits a multi-shadow CSS string into individual shadow strings.
 *
 * We cannot simply split on "," because rgba(r, g, b, a) contains commas.
 * Instead, we track parenthesis depth and only split when depth is 0.
 *
 * @param rawBoxShadow - The full box-shadow string with potentially multiple shadows.
 * @returns Array of individual shadow strings, trimmed.
 */
function splitShadowString(rawBoxShadow: string): string[] {
  const shadows: string[] = [];
  let parenthesisDepth = 0;
  let currentShadow = '';

  for (const character of rawBoxShadow) {
    if (character === '(') {
      parenthesisDepth++;
    } else if (character === ')') {
      parenthesisDepth--;
    }

    if (character === ',' && parenthesisDepth === 0) {
      const trimmed = currentShadow.trim();
      if (trimmed.length > 0) {
        shadows.push(trimmed);
      }
      currentShadow = '';
    } else {
      currentShadow += character;
    }
  }

  const lastShadow = currentShadow.trim();
  if (lastShadow.length > 0) {
    shadows.push(lastShadow);
  }

  return shadows;
}

/**
 * Parses a single CSS box-shadow value into a CIRBoxShadow object.
 *
 * Expected format (from getComputedStyle, which normalizes to this order):
 *   [inset] <color> <offset-x> <offset-y> [blur-radius] [spread-radius]
 *
 * Some browsers may output color at the end instead of the beginning.
 * This parser handles both orderings.
 *
 * @param shadowString - A single shadow definition string.
 * @returns Parsed shadow object, or null if parsing fails.
 */
function parseSingleShadow(shadowString: string): CIRBoxShadow | null {
  const trimmed = shadowString.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Detect and remove the "inset" keyword
  const isInset = trimmed.includes('inset');
  const withoutInset = trimmed.replace(/\binset\b/g, '').trim();

  // Extract the color portion — either rgb()/rgba() or a hex value
  const colorAndRemainder = extractColorFromShadow(withoutInset);
  if (colorAndRemainder === null) {
    return null;
  }

  const { color, remainder } = colorAndRemainder;

  // The remainder should be numeric values: offset-x, offset-y, [blur], [spread]
  const numericValues = extractPixelValues(remainder);

  if (numericValues.length < 2) {
    // At minimum we need offset-x and offset-y
    return null;
  }

  return {
    inset: isInset,
    offsetX: numericValues[0] ?? 0,
    offsetY: numericValues[1] ?? 0,
    blurRadius: numericValues[2] ?? 0,
    spreadRadius: numericValues[3] ?? 0,
    color: color,
  };
}

/**
 * Extracts the color portion from a shadow string and returns the remaining numeric parts.
 *
 * Handles two cases:
 * 1. Color at the start: "rgba(0, 0, 0, 0.1) 0px 4px 6px"
 * 2. Color at the end: "0px 4px 6px rgba(0, 0, 0, 0.1)"
 *
 * @param shadowWithoutInset - Shadow string with "inset" already removed.
 * @returns Object with extracted color string and remainder, or null if no color found.
 */
function extractColorFromShadow(
  shadowWithoutInset: string,
): { color: string; remainder: string } | null {
  // Try to match rgb()/rgba() color function
  const rgbaPattern = /rgba?\([^)]+\)/;
  const rgbaMatch = shadowWithoutInset.match(rgbaPattern);

  if (rgbaMatch !== null && rgbaMatch[0] !== undefined) {
    const color = rgbaMatch[0];
    const remainder = shadowWithoutInset.replace(color, '').trim();
    return { color, remainder };
  }

  // Try to match hex color (#RGB, #RRGGBB, #RRGGBBAA)
  const hexPattern = /#[0-9a-fA-F]{3,8}\b/;
  const hexMatch = shadowWithoutInset.match(hexPattern);

  if (hexMatch !== null && hexMatch[0] !== undefined) {
    const color = hexMatch[0];
    const remainder = shadowWithoutInset.replace(color, '').trim();
    return { color, remainder };
  }

  // Try to match named colors (rare in computed styles, but possible)
  // In computed styles, browsers usually convert to rgb()/rgba(), so this is a fallback
  const namedColorPattern = /\b(transparent|black|white|red|green|blue|gray|grey)\b/i;
  const namedMatch = shadowWithoutInset.match(namedColorPattern);

  if (namedMatch !== null && namedMatch[0] !== undefined) {
    const color = namedMatch[0];
    const remainder = shadowWithoutInset.replace(color, '').trim();
    return { color, remainder };
  }

  // No color found — this shouldn't happen with valid computed styles
  return null;
}

/**
 * Extracts numeric pixel values from the non-color portion of a shadow string.
 *
 * Input is something like "0px 4px 6px -1px" or "0 4 6 -1".
 * Returns an array of numbers: [0, 4, 6, -1].
 *
 * @param numericString - The portion of the shadow string containing only numeric values.
 * @returns Array of extracted numbers. Pixel units ("px") are stripped.
 */
function extractPixelValues(numericString: string): number[] {
  // Match numbers (including negative and decimal) with optional "px" suffix
  const pixelValuePattern = /-?[\d.]+(?:px)?/g;
  const matches = numericString.match(pixelValuePattern);

  if (matches === null) {
    return [];
  }

  return matches.map((value) => parseFloat(value));
}
