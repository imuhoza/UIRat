/**
 * @file filters.ts — DOM Element Visibility and Exclusion Filters
 *
 * Determines which DOM elements should be included in the CIR output.
 * The serializer calls these filter functions during tree traversal to skip
 * invisible, irrelevant, or parasitic elements (ads, trackers, cookie banners).
 *
 * This file runs inside the browser via page.evaluate() — no Node.js imports allowed.
 *
 * Filtering philosophy:
 * - Be conservative: when in doubt, INCLUDE the element (false negatives are worse
 *   than false positives — a user can delete an extra node in Figma, but can't
 *   recover a missing one).
 * - Use computed styles, not class names, for visibility checks (class names are
 *   unreliable and framework-specific).
 */

// =============================================================================
// HTML tags that should never appear in the visual output
// =============================================================================

/**
 * Tags that are never visual and should always be excluded from the CIR.
 * These are metadata, scripting, or structural tags with no visual representation.
 */
const NON_VISUAL_TAGS: ReadonlySet<string> = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'LINK',
  'META',
  'HEAD',
  'BR',
  'WBR',
  'TEMPLATE',
  'SLOT',
  'BASE',
  'TITLE',
  'COLGROUP',
  'COL',
  'DATALIST',
  'PARAM',
  'SOURCE',
  'TRACK',
]);

// =============================================================================
// Known ad/tracking iframe URL patterns
// =============================================================================

/**
 * Regex pattern matching common ad network and tracking iframe URLs.
 * Used to exclude advertising iframes from the CIR output.
 */
const AD_IFRAME_URL_PATTERN =
  /doubleclick|googlesyndication|adservice|googletagmanager|facebook\.com\/tr|analytics|adsense|adnxs|criteo|taboola|outbrain/i;

// =============================================================================
// Cookie banner detection keywords
// =============================================================================

/**
 * Regex pattern matching text content commonly found in cookie consent banners.
 * Combined with position/z-index checks for more reliable detection.
 */
const COOKIE_BANNER_TEXT_PATTERN =
  /cookie|consent|gdpr|privacy policy|accept all|accepter|reject all|manage preferences/i;

/**
 * Minimum z-index threshold for an element to be considered a cookie banner.
 * Cookie banners typically use very high z-index values to overlay all content.
 */
const COOKIE_BANNER_MIN_Z_INDEX = 900;

// =============================================================================
// FILTER FUNCTIONS
// =============================================================================

/**
 * Checks whether a DOM element is visually visible on the page.
 *
 * An element is considered invisible if:
 * - display is "none" (element takes no space)
 * - visibility is "hidden" (element is invisible but takes space)
 * - opacity is 0 AND there is no CSS transition on opacity
 *   (opacity:0 with transition may be an animation target — keep it)
 * - Both width and height are 0 (collapsed element)
 *
 * @param computedStyle - The element's computed style from getComputedStyle().
 * @param bounds - The element's bounding rectangle from getBoundingClientRect().
 * @returns True if the element should be included (is visible), false to exclude.
 *
 * @example
 * const style = getComputedStyle(element);
 * const rect = element.getBoundingClientRect();
 * if (!isElementVisible(style, rect)) {
 *   // Skip this element
 * }
 */
export function isElementVisible(
  computedStyle: CSSStyleDeclaration,
  bounds: DOMRect,
): boolean {
  // display:none — element doesn't exist visually at all
  if (computedStyle.display === 'none') {
    return false;
  }

  // visibility:hidden — invisible but still takes space. Exclude it
  // (but note: children with visibility:visible can override this)
  if (computedStyle.visibility === 'hidden') {
    return false;
  }

  // opacity:0 without a transition — truly invisible
  // If there's an opacity transition, the element might be a fade target, so keep it
  if (parseFloat(computedStyle.opacity) === 0) {
    const transitionProperty = computedStyle.transition || '';
    const hasOpacityTransition = transitionProperty.includes('opacity') || transitionProperty.includes('all');
    if (!hasOpacityTransition) {
      return false;
    }
  }

  // Zero-size element — collapsed or empty
  if (bounds.width === 0 && bounds.height === 0) {
    return false;
  }

  return true;
}

/**
 * Checks whether an element's bounding box is within (or near) the viewport.
 *
 * Elements positioned far off-screen (e.g., left: -9999px for screen-reader-only
 * content) are excluded. A margin of 50px is used to include elements that are
 * partially visible at the edges.
 *
 * @param bounds - The element's bounding rectangle from getBoundingClientRect().
 * @param viewportWidth - The current viewport width in pixels.
 * @param viewportHeight - The current viewport height in pixels.
 * @param scrollHeight - The full scrollable height of the document.
 * @returns True if the element is within the visible area, false to exclude.
 */
export function isElementInViewport(
  bounds: DOMRect,
  viewportWidth: number,
  viewportHeight: number,
  scrollHeight: number,
): boolean {
  const EDGE_MARGIN_PX = 50;

  // Element is entirely to the left of the viewport
  if (bounds.right < -EDGE_MARGIN_PX) {
    return false;
  }

  // Element is entirely to the right of the viewport
  if (bounds.left > viewportWidth + EDGE_MARGIN_PX) {
    return false;
  }

  // Element is entirely above the page top
  if (bounds.bottom < -EDGE_MARGIN_PX) {
    return false;
  }

  // Element is entirely below the full scrollable page
  // (use scrollHeight instead of viewportHeight to capture below-the-fold content)
  if (bounds.top > scrollHeight + EDGE_MARGIN_PX) {
    return false;
  }

  return true;
}

/**
 * Checks whether an HTML tag is a non-visual tag that should always be excluded.
 *
 * @param tagName - The element's tag name in UPPERCASE (e.g., "SCRIPT", "DIV").
 * @returns True if the tag is non-visual and should be excluded, false to include.
 *
 * @example
 * isNonVisualTag("SCRIPT") // true — exclude
 * isNonVisualTag("DIV")    // false — include
 */
export function isNonVisualTag(tagName: string): boolean {
  return NON_VISUAL_TAGS.has(tagName);
}

/**
 * Checks whether an iframe element is likely an advertising or tracking iframe.
 *
 * Detection is based on URL pattern matching against known ad networks.
 * Only call this for IFRAME elements.
 *
 * @param element - The iframe DOM element.
 * @returns True if the iframe appears to be an ad/tracker, false to include.
 */
export function isAdvertisingIframe(element: Element): boolean {
  if (element.tagName !== 'IFRAME') {
    return false;
  }

  const sourceUrl = element.getAttribute('src') || '';
  return AD_IFRAME_URL_PATTERN.test(sourceUrl);
}

/**
 * Checks whether an element is likely a cookie consent banner.
 *
 * Detection uses a combination of signals:
 * 1. The element has position: fixed or sticky (overlays the page)
 * 2. The element has a high z-index (appears above all content)
 * 3. The element's text content matches common cookie banner phrases
 *
 * All three conditions must be true to classify as a cookie banner.
 * This reduces false positives compared to checking any single signal.
 *
 * @param element - The DOM element to check.
 * @param computedStyle - The element's computed style.
 * @returns True if the element appears to be a cookie banner, false to include.
 */
export function isCookieConsentBanner(
  element: Element,
  computedStyle: CSSStyleDeclaration,
): boolean {
  // Must be a fixed/sticky overlay
  const positionValue = computedStyle.position;
  if (positionValue !== 'fixed' && positionValue !== 'sticky') {
    return false;
  }

  // Must have a high z-index (cookie banners need to overlay everything)
  const zIndexValue = parseInt(computedStyle.zIndex, 10) || 0;
  if (zIndexValue < COOKIE_BANNER_MIN_Z_INDEX) {
    return false;
  }

  // Must contain cookie-related text
  const textContent = (element.textContent || '').slice(0, 2000); // Limit text scan for performance
  return COOKIE_BANNER_TEXT_PATTERN.test(textContent);
}

/**
 * Checks whether a wrapper element can be "merged" — skipped in the CIR tree,
 * with its single child promoted to take its place.
 *
 * A wrapper is mergeable when it adds no visual information:
 * - It's a DIV or SPAN (generic containers)
 * - It has no background color (transparent)
 * - It has no border
 * - It has no padding
 * - It has no meaningful CSS classes
 * - It has exactly one child element
 *
 * Merging empty wrappers produces a cleaner, flatter CIR tree that's easier
 * to work with in Figma (fewer unnecessary groups).
 *
 * @param element - The DOM element to check.
 * @param computedStyle - The element's computed style.
 * @param childElementCount - Number of child elements (not text nodes).
 * @returns True if this wrapper should be skipped (child promoted), false to keep.
 */
export function isMergeableWrapper(
  element: Element,
  computedStyle: CSSStyleDeclaration,
  childElementCount: number,
): boolean {
  // Must have exactly one child element to be a candidate for merging
  if (childElementCount !== 1) {
    return false;
  }

  // Only generic container tags are eligible for merging
  const tagName = element.tagName;
  if (tagName !== 'DIV' && tagName !== 'SPAN') {
    return false;
  }

  // Has a visible background? Not a pure wrapper — keep it
  const backgroundColor = computedStyle.backgroundColor;
  if (
    backgroundColor !== 'rgba(0, 0, 0, 0)' &&
    backgroundColor !== 'transparent'
  ) {
    return false;
  }

  // Has a border? Not a pure wrapper — keep it
  if (parseFloat(computedStyle.borderTopWidth) > 0) {
    return false;
  }
  if (parseFloat(computedStyle.borderRightWidth) > 0) {
    return false;
  }
  if (parseFloat(computedStyle.borderBottomWidth) > 0) {
    return false;
  }
  if (parseFloat(computedStyle.borderLeftWidth) > 0) {
    return false;
  }

  // Has padding? Not a pure wrapper — keep it
  if (parseFloat(computedStyle.paddingTop) > 0) {
    return false;
  }
  if (parseFloat(computedStyle.paddingRight) > 0) {
    return false;
  }
  if (parseFloat(computedStyle.paddingBottom) > 0) {
    return false;
  }
  if (parseFloat(computedStyle.paddingLeft) > 0) {
    return false;
  }

  // Has box-shadow? Not a pure wrapper — keep it
  if (computedStyle.boxShadow && computedStyle.boxShadow !== 'none') {
    return false;
  }

  // Has CSS classes? Might be meaningful styling or a framework component — keep it
  // (This is conservative: some classes like "container" have important layout effects)
  if (element.classList.length > 0) {
    return false;
  }

  return true;
}
