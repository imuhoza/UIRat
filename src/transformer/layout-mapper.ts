/**
 * @file layout-mapper.ts — CSS Flexbox to Figma Auto-Layout Mapper
 *
 * Converts CSS flexbox properties (from the CIR format) into Figma's
 * auto-layout properties.
 *
 * Mapping table (from IDEA.md Section 8.1.1):
 *   CSS display: flex        → Figma layoutMode: HORIZONTAL or VERTICAL
 *   CSS flex-direction       → Determines HORIZONTAL vs VERTICAL
 *   CSS justify-content      → Figma primaryAxisAlignItems
 *   CSS align-items          → Figma counterAxisAlignItems
 *   CSS gap                  → Figma itemSpacing
 *
 * Non-flex elements (display: block, inline, etc.) get layoutMode: NONE,
 * which means their children use absolute positioning in Figma.
 *
 * CSS Grid is NOT supported in Phase 1 — grid elements fall back to absolute
 * positioning (layoutMode: NONE) with children placed at their computed bounds.
 */

import type { CIRLayout, CIRStyles } from '../types/cir.js';
import type { FigmaNodeData } from '../types/figma.js';

// =============================================================================
// MAIN LAYOUT MAPPING FUNCTION
// =============================================================================

/**
 * Maps CSS flexbox layout properties to Figma auto-layout properties.
 *
 * This function reads the CIR node's layout and styles, then sets the
 * appropriate auto-layout properties on the Figma node data.
 *
 * Only flex containers get auto-layout. Block, inline, grid, and other
 * display types fall back to absolute positioning (layoutMode: NONE).
 *
 * @param figmaNode - The Figma node data object to populate with layout properties.
 * @param layout - The CIR layout properties (display, flex-direction, etc.).
 * @param styles - The CIR styles (padding values are applied here too).
 *
 * @example
 * const figmaNode: Partial<FigmaNodeData> = {};
 * applyLayoutMapping(figmaNode, cirNode.layout, cirNode.styles);
 * // figmaNode.layoutMode === "HORIZONTAL"
 * // figmaNode.itemSpacing === 16
 */
export function applyLayoutMapping(
  figmaNode: Partial<FigmaNodeData>,
  layout: CIRLayout,
  styles: CIRStyles,
): void {
  // Only flex containers get Figma auto-layout
  const isFlexContainer = layout.display === 'flex' || layout.display === 'inline-flex';

  if (isFlexContainer) {
    figmaNode.layoutMode = mapFlexDirectionToLayoutMode(layout.flexDirection);
    figmaNode.primaryAxisAlignItems = mapJustifyContent(layout.justifyContent);
    figmaNode.counterAxisAlignItems = mapAlignItems(layout.alignItems);
    figmaNode.itemSpacing = layout.gap;
  } else {
    // Non-flex elements: children will use absolute positions
    figmaNode.layoutMode = 'NONE';
  }

  // Padding applies to all frames, regardless of layout mode
  figmaNode.paddingTop = styles.paddingTop;
  figmaNode.paddingRight = styles.paddingRight;
  figmaNode.paddingBottom = styles.paddingBottom;
  figmaNode.paddingLeft = styles.paddingLeft;
}

// =============================================================================
// INDIVIDUAL PROPERTY MAPPINGS
// =============================================================================

/**
 * Maps CSS flex-direction to Figma layoutMode.
 *
 * - "row" / "row-reverse"       → HORIZONTAL (children flow left-to-right)
 * - "column" / "column-reverse" → VERTICAL (children flow top-to-bottom)
 *
 * Note: Figma does not support reversed flex directions. "row-reverse" maps
 * to HORIZONTAL (the visual order in the CIR already reflects the final layout).
 *
 * @param flexDirection - CSS flex-direction value.
 * @returns Figma layout mode: "HORIZONTAL" or "VERTICAL".
 */
function mapFlexDirectionToLayoutMode(flexDirection: string): 'HORIZONTAL' | 'VERTICAL' {
  if (flexDirection === 'column' || flexDirection === 'column-reverse') {
    return 'VERTICAL';
  }
  return 'HORIZONTAL';
}

/**
 * Maps CSS justify-content to Figma primaryAxisAlignItems.
 *
 * Mapping:
 *   flex-start / start / normal → MIN
 *   center                      → CENTER
 *   flex-end / end              → MAX
 *   space-between               → SPACE_BETWEEN
 *   space-around / space-evenly → SPACE_BETWEEN (closest Figma equivalent)
 *
 * @param justifyContent - CSS justify-content value.
 * @returns Figma primary axis alignment.
 */
function mapJustifyContent(justifyContent: string): 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN' {
  switch (justifyContent) {
    case 'center':
      return 'CENTER';
    case 'flex-end':
    case 'end':
      return 'MAX';
    case 'space-between':
    case 'space-around':
    case 'space-evenly':
      return 'SPACE_BETWEEN';
    case 'flex-start':
    case 'start':
    case 'normal':
    default:
      return 'MIN';
  }
}

/**
 * Maps CSS align-items to Figma counterAxisAlignItems.
 *
 * Mapping:
 *   flex-start / start / stretch / baseline → MIN
 *   center                                  → CENTER
 *   flex-end / end                          → MAX
 *
 * Note: Figma does not have a "stretch" alignment mode. "stretch" maps to MIN
 * because in Figma, "Fill container" sizing on children achieves the same effect.
 *
 * @param alignItems - CSS align-items value.
 * @returns Figma counter axis alignment.
 */
function mapAlignItems(alignItems: string): 'MIN' | 'CENTER' | 'MAX' {
  switch (alignItems) {
    case 'center':
      return 'CENTER';
    case 'flex-end':
    case 'end':
      return 'MAX';
    case 'flex-start':
    case 'start':
    case 'stretch':
    case 'baseline':
    case 'normal':
    default:
      return 'MIN';
  }
}
