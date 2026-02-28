/**
 * @file viewport-config.ts — Viewport Breakpoint Definitions & Parser
 *
 * Defines standard viewport breakpoints (Desktop, Tablet, Mobile) and
 * parses viewport spec strings from the CLI.
 */

// =============================================================================
// TYPES
// =============================================================================

/** A named viewport breakpoint. */
export interface ViewportBreakpoint {
  /** Breakpoint name (e.g., "desktop", "tablet", "mobile"). */
  name: string;

  /** Viewport width in pixels. */
  width: number;

  /** Viewport height in pixels. */
  height: number;
}

// =============================================================================
// DEFAULT BREAKPOINTS
// =============================================================================

/** Standard viewport breakpoints. */
const DEFAULT_BREAKPOINTS: Record<string, ViewportBreakpoint> = {
  desktop: { name: 'desktop', width: 1440, height: 900 },
  tablet: { name: 'tablet', width: 768, height: 1024 },
  mobile: { name: 'mobile', width: 375, height: 812 },
};

// =============================================================================
// PARSER
// =============================================================================

/**
 * Parses a viewport spec string into an array of viewport breakpoints.
 *
 * Supported formats:
 * - Named presets: "desktop", "tablet", "mobile"
 * - Comma-separated list: "desktop,tablet,mobile"
 * - Custom WxH format: "1920x1080"
 * - Mixed: "desktop,768x1024,mobile"
 *
 * @param spec - The viewport spec string from CLI.
 * @returns Array of viewport breakpoints.
 * @throws Error if any spec segment is invalid.
 *
 * @example
 * parseViewportSpec("desktop,mobile")
 * // [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 375, height: 812 }]
 *
 * @example
 * parseViewportSpec("1920x1080")
 * // [{ name: "1920x1080", width: 1920, height: 1080 }]
 */
export function parseViewportSpec(spec: string): ViewportBreakpoint[] {
  const segments = spec.split(',').map((s) => s.trim()).filter((s) => s.length > 0);

  if (segments.length === 0) {
    throw new Error('Viewport spec cannot be empty.');
  }

  return segments.map(parseSegment);
}

/**
 * Parses a single viewport spec segment.
 */
function parseSegment(segment: string): ViewportBreakpoint {
  // Check if it's a named preset
  const preset = DEFAULT_BREAKPOINTS[segment.toLowerCase()];
  if (preset) {
    return preset;
  }

  // Try WxH format
  if (segment.includes('x')) {
    const parts = segment.split('x');
    const widthStr = parts[0];
    const heightStr = parts[1];

    if (widthStr === undefined || heightStr === undefined) {
      throw new Error(`Invalid viewport format: "${segment}". Expected "WIDTHxHEIGHT".`);
    }

    const width = parseInt(widthStr, 10);
    const height = parseInt(heightStr, 10);

    if (Number.isNaN(width) || Number.isNaN(height) || width <= 0 || height <= 0) {
      throw new Error(`Invalid viewport dimensions: "${segment}". Width and height must be positive integers.`);
    }

    return { name: segment, width, height };
  }

  throw new Error(
    `Unknown viewport preset: "${segment}". Use "desktop", "tablet", "mobile", or "WIDTHxHEIGHT".`,
  );
}
