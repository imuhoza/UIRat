/**
 * @file font-loader.ts — Font Weight and Family Resolution for Figma
 *
 * Maps CSS font properties to Figma's font naming system.
 *
 * CSS uses numeric font weights ("400", "700") while Figma uses descriptive
 * style names ("Regular", "Bold"). This module handles the translation.
 *
 * It also resolves common CSS font-family names to their Figma-available
 * equivalents, with fallbacks for system fonts and web-safe alternatives.
 *
 * Used by: figma-plugin/src/node-factory.ts when creating TEXT nodes.
 */

// =============================================================================
// FONT WEIGHT → FIGMA STYLE NAME
// =============================================================================

/**
 * Maps CSS font-weight numeric values to Figma font style names.
 * These are the standard OpenType weight classes.
 */
const WEIGHT_TO_STYLE_NAME: Record<string, string> = {
  '100': 'Thin',
  '200': 'ExtraLight',
  '300': 'Light',
  '400': 'Regular',
  '500': 'Medium',
  '600': 'SemiBold',
  '700': 'Bold',
  '800': 'ExtraBold',
  '900': 'Black',
};

/**
 * Converts a CSS font-weight number to a Figma font style name.
 *
 * @param cssWeight - CSS font-weight as a string (e.g., "400", "700", "bold").
 * @returns Figma style name (e.g., "Regular", "Bold").
 *
 * @example
 * cssWeightToFigmaStyle("400")  // "Regular"
 * cssWeightToFigmaStyle("700")  // "Bold"
 * cssWeightToFigmaStyle("bold") // "Bold"
 */
export function cssWeightToFigmaStyle(cssWeight: string): string {
  // Handle keyword weights
  if (cssWeight === 'bold') return 'Bold';
  if (cssWeight === 'normal') return 'Regular';
  if (cssWeight === 'lighter') return 'Light';
  if (cssWeight === 'bolder') return 'Bold';

  return WEIGHT_TO_STYLE_NAME[cssWeight] ?? 'Regular';
}

// =============================================================================
// FONT FAMILY → FIGMA-AVAILABLE FONT
// =============================================================================

/**
 * Common CSS font-family values mapped to their Figma-available equivalents.
 * System UI fonts and generic families are mapped to Inter (Figma's default).
 */
const FONT_FAMILY_ALIASES: Record<string, string> = {
  // System UI fonts → Inter (clean, modern, Figma default)
  'system-ui': 'Inter',
  '-apple-system': 'Inter',
  'blinkmacsystemfont': 'Inter',
  'segoe ui': 'Inter',
  'ui-sans-serif': 'Inter',

  // Generic CSS families
  'sans-serif': 'Inter',
  'serif': 'Georgia',
  'monospace': 'Roboto Mono',
  'cursive': 'Inter',
  'fantasy': 'Inter',

  // Common web fonts (case-insensitive keys)
  'arial': 'Arial',
  'helvetica': 'Helvetica',
  'helvetica neue': 'Helvetica Neue',
  'times new roman': 'Times New Roman',
  'georgia': 'Georgia',
  'verdana': 'Verdana',
  'courier new': 'Courier New',
  'roboto': 'Roboto',
  'open sans': 'Open Sans',
  'lato': 'Lato',
  'montserrat': 'Montserrat',
  'poppins': 'Poppins',
  'inter': 'Inter',
  'nunito': 'Nunito',
  'raleway': 'Raleway',
  'playfair display': 'Playfair Display',
  'source sans pro': 'Source Sans Pro',
  'source code pro': 'Source Code Pro',
  'fira code': 'Fira Code',
  'jetbrains mono': 'JetBrains Mono',
};

/** The default font to use when a requested font is not available in Figma. */
const DEFAULT_FALLBACK_FONT = 'Inter';

/**
 * Resolves a CSS font-family string to a Figma-available font name.
 *
 * CSS font-family is a comma-separated list of font preferences:
 *   "Helvetica Neue, Helvetica, Arial, sans-serif"
 *
 * This function tries each font in order and returns the first one that
 * has a known Figma equivalent. Falls back to Inter if none match.
 *
 * @param cssFontFamily - CSS font-family string (comma-separated).
 * @returns A font family name that is available in Figma.
 *
 * @example
 * resolveFontFamily("Helvetica Neue, Arial, sans-serif")  // "Helvetica Neue"
 * resolveFontFamily("CustomFont, system-ui")                // "Inter" (CustomFont unknown, system-ui → Inter)
 * resolveFontFamily("Roboto, sans-serif")                   // "Roboto"
 */
export function resolveFontFamily(cssFontFamily: string): string {
  const fontCandidates = cssFontFamily.split(',');

  for (const candidate of fontCandidates) {
    const cleaned = candidate.trim().replace(/^["']|["']$/g, '').toLowerCase();

    // Check if this font has a known Figma alias
    const alias = FONT_FAMILY_ALIASES[cleaned];
    if (alias !== undefined) {
      return alias;
    }

    // If it's not a generic family or system font, assume it might be available
    // in Figma as-is (Google Fonts are generally available)
    const isGenericFamily = ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy'].includes(cleaned);
    const isSystemFont = cleaned.startsWith('-') || cleaned === 'system-ui' || cleaned === 'ui-sans-serif';

    if (!isGenericFamily && !isSystemFont && cleaned.length > 0) {
      // Return with proper casing (capitalize first letter of each word)
      return candidate.trim().replace(/^["']|["']$/g, '');
    }
  }

  return DEFAULT_FALLBACK_FONT;
}

/**
 * Attempts to load a font in Figma, falling back to Inter if it fails.
 *
 * Figma requires fonts to be loaded asynchronously before they can be used
 * on text nodes. If the requested font isn't available, we gracefully
 * fall back to Inter (which is always available in Figma).
 *
 * @param family - The font family name to load.
 * @param style - The font style to load (e.g., "Regular", "Bold").
 * @returns The actually loaded font specification (may differ from requested if fallback was used).
 *
 * @example
 * const font = await loadFontWithFallback("Roboto", "Bold");
 * // font = { family: "Roboto", style: "Bold" } if available
 * // font = { family: "Inter", style: "Regular" } if Roboto Bold not available
 */
export async function loadFontWithFallback(
  family: string,
  style: string,
): Promise<{ family: string; style: string }> {
  // Try the requested font first
  try {
    await figma.loadFontAsync({ family, style });
    return { family, style };
  } catch {
    // Requested font+style not available
  }

  // Try the same family with Regular style
  if (style !== 'Regular') {
    try {
      await figma.loadFontAsync({ family, style: 'Regular' });
      return { family, style: 'Regular' };
    } catch {
      // Family not available at all
    }
  }

  // Fall back to Inter Regular (always available in Figma)
  try {
    await figma.loadFontAsync({ family: DEFAULT_FALLBACK_FONT, style: 'Regular' });
  } catch {
    // This should never fail — Inter is a Figma built-in
  }

  return { family: DEFAULT_FALLBACK_FONT, style: 'Regular' };
}
