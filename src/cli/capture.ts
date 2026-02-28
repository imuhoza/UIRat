/**
 * @file capture.ts — Playwright Page Capture Orchestration
 *
 * Orchestrates the full capture flow for a single web page:
 * 1. Creates a stealth+auth configured browser via browser-factory
 * 2. Navigates to the target URL and waits for the page to settle
 * 3. Scrolls through the page to trigger lazy-loaded content
 * 4. Injects the DOM Serializer bundle into the page
 * 5. Optionally collects assets (images, SVGs, fonts)
 * 6. Extracts and returns the CIR document JSON
 *
 * This module is the bridge between the CLI and the browser-side serializer.
 * Browser lifecycle management is delegated to browser-factory.ts.
 *
 * Input: URL string + CaptureOptions (viewport, stealth, auth, assets)
 * Output: CIRDocument object (ready for JSON serialization or transformation)
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Page } from 'playwright';
import type { CIRDocument } from '../types/cir.js';
import { createBrowserContext, closeBrowserInstance } from '../crawler/browser-factory.js';
import type { BrowserLaunchOptions } from '../crawler/browser-factory.js';
import type { AuthConfig } from '../crawler/auth/auth-types.js';

// =============================================================================
// CONFIGURATION CONSTANTS
// =============================================================================

/** Maximum time (ms) to wait for page navigation to complete. */
const NAVIGATION_TIMEOUT_MS = 30_000;

/** Time (ms) to wait after page load for JavaScript rendering and CSS transitions to settle. */
const POST_LOAD_SETTLE_TIME_MS = 2000;

/** Time (ms) to wait after scrolling for lazy content to load. */
const POST_SCROLL_SETTLE_TIME_MS = 1000;

/** Number of pixels to scroll in each step during the lazy-load scroll pass. */
const SCROLL_STEP_DISTANCE_PX = 300;

/** Delay (ms) between each scroll step to simulate natural scrolling. */
const SCROLL_STEP_DELAY_MS = 100;

// =============================================================================
// CAPTURE OPTIONS
// =============================================================================

/**
 * Options for page capture. All fields are optional — sensible defaults
 * are used when not specified, preserving Phase 1 backward compatibility.
 */
export interface CaptureOptions {
  /** Browser viewport dimensions. Default: { width: 1440, height: 900 }. */
  viewport?: { width: number; height: number };

  /** Whether to apply stealth patches. Default: false. */
  stealth?: boolean;

  /** Authentication configuration. Default: { method: 'none' }. */
  auth?: AuthConfig;

  /** Passphrase for decrypting session files. */
  sessionPassphrase?: string;

  /** Whether to collect assets (images, SVGs, fonts). Default: false. */
  collectAssets?: boolean;

  /** Directory to save downloaded assets. Default: './uirat-assets'. */
  assetsDir?: string;
}

// =============================================================================
// SERIALIZER BUNDLE LOADING
// =============================================================================

/**
 * Loads the pre-built serializer bundle from disk.
 *
 * The bundle is built by scripts/build-serializer.js and lives at dist/serializer-bundle.js.
 * It's a self-executing IIFE that returns a CIRDocument when evaluated in a browser.
 *
 * @returns The serializer bundle JavaScript code as a string.
 * @throws Error if the bundle file doesn't exist (needs `npm run build:serializer` first).
 */
function loadSerializerBundle(): string {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));
  const bundlePath = resolve(currentDirectory, '../../dist/serializer-bundle.js');

  try {
    return readFileSync(bundlePath, 'utf-8');
  } catch {
    throw new Error(
      'Serializer bundle not found at dist/serializer-bundle.js. ' +
      'Run "npm run build:serializer" first to build it.',
    );
  }
}

// =============================================================================
// VIEWPORT PARSING
// =============================================================================

/**
 * Parses a viewport size string (e.g., "1440x900") into width and height numbers.
 *
 * @param viewportString - Viewport dimensions in "WIDTHxHEIGHT" format.
 * @returns Object with width and height in pixels.
 * @throws Error if the format is invalid.
 *
 * @example
 * parseViewportString("1440x900")  // { width: 1440, height: 900 }
 * parseViewportString("375x812")   // { width: 375, height: 812 }
 */
export function parseViewportString(viewportString: string): { width: number; height: number } {
  const parts = viewportString.split('x');
  const widthString = parts[0];
  const heightString = parts[1];

  if (widthString === undefined || heightString === undefined) {
    throw new Error(
      `Invalid viewport format: "${viewportString}". Expected "WIDTHxHEIGHT" (e.g., "1440x900").`,
    );
  }

  const width = parseInt(widthString, 10);
  const height = parseInt(heightString, 10);

  if (Number.isNaN(width) || Number.isNaN(height) || width <= 0 || height <= 0) {
    throw new Error(
      `Invalid viewport dimensions: "${viewportString}". Width and height must be positive integers.`,
    );
  }

  return { width, height };
}

// =============================================================================
// MAIN CAPTURE FUNCTION
// =============================================================================

/**
 * Captures a web page and produces a CIR document.
 *
 * This is the primary entry point for the capture flow. It delegates browser
 * creation to the browser-factory module and handles the capture lifecycle:
 * navigate → scroll → serialize → (optionally collect assets) → cleanup.
 *
 * @param targetUrl - The full URL to capture (e.g., "https://example.com").
 * @param options - Capture options (viewport, stealth, auth, assets). All optional.
 * @returns A CIRDocument containing the serialized page.
 * @throws Error if navigation fails, times out, or the serializer returns invalid data.
 *
 * @example
 * // Phase 1 backward-compatible call
 * const cir = await capturePage("https://example.com");
 *
 * @example
 * // Phase 2 call with stealth and auth
 * const cir = await capturePage("https://app.example.com", {
 *   viewport: { width: 1440, height: 900 },
 *   stealth: true,
 *   auth: { method: 'token', token: 'eyJ...', originUrl: 'https://app.example.com' },
 * });
 */
export async function capturePage(
  targetUrl: string,
  options?: CaptureOptions | { width: number; height: number },
): Promise<CIRDocument> {
  // Support legacy signature: capturePage(url, { width, height })
  const captureOptions = normalizeCaptureOptions(options);
  const viewport = captureOptions.viewport ?? { width: 1440, height: 900 };

  // Load the serializer bundle before launching the browser
  const serializerBundle = loadSerializerBundle();

  console.log(`Launching browser (viewport: ${viewport.width}x${viewport.height})...`);

  const browserOptions: BrowserLaunchOptions = {
    viewport,
    stealth: captureOptions.stealth,
    auth: captureOptions.auth,
    sessionPassphrase: captureOptions.sessionPassphrase,
  };

  const instance = await createBrowserContext(browserOptions);

  try {
    // Navigate to the target URL and wait for network activity to settle
    console.log(`Navigating to ${targetUrl}...`);
    await instance.page.goto(targetUrl, {
      waitUntil: 'networkidle',
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    // Wait for JavaScript-rendered content and CSS transitions to settle
    console.log('Waiting for page to settle...');
    await instance.page.waitForTimeout(POST_LOAD_SETTLE_TIME_MS);

    // Scroll through the entire page to trigger lazy-loaded content
    console.log('Scrolling page to trigger lazy loading...');
    await scrollEntirePage(instance.page);

    // Wait for lazy content to finish loading after scrolling
    await instance.page.waitForTimeout(POST_SCROLL_SETTLE_TIME_MS);

    // Inject the serializer and extract the CIR document
    console.log('Serializing DOM...');
    const cirDocument = await instance.page.evaluate(serializerBundle) as CIRDocument;

    // Validate the result
    if (!cirDocument || !cirDocument.pages || cirDocument.pages.length === 0) {
      throw new Error('Serializer returned an invalid or empty CIR document.');
    }

    const firstPage = cirDocument.pages[0];
    const nodeCount = countNodes(firstPage?.rootNode);
    console.log(`Serialization complete: ${nodeCount} nodes captured.`);

    // Collect assets if requested (Phase 2)
    if (captureOptions.collectAssets) {
      const { collectAssets } = await import('../assets/asset-collector.js');
      const assetsDir = captureOptions.assetsDir ?? './uirat-assets';
      console.log(`Collecting assets to ${assetsDir}...`);
      await collectAssets(cirDocument, { outputDir: assetsDir }, instance.page);
      console.log('Asset collection complete.');
    }

    return cirDocument;
  } finally {
    await closeBrowserInstance(instance);
  }
}

// =============================================================================
// OPTIONS NORMALIZATION
// =============================================================================

/**
 * Normalizes capture options, supporting the legacy viewport-only signature.
 *
 * @param options - Either CaptureOptions or a legacy { width, height } object.
 * @returns Normalized CaptureOptions.
 */
function normalizeCaptureOptions(
  options?: CaptureOptions | { width: number; height: number },
): CaptureOptions {
  if (!options) {
    return {};
  }

  // Detect legacy viewport-only signature: { width: number, height: number }
  if ('width' in options && 'height' in options && !('viewport' in options)) {
    return { viewport: { width: options.width, height: options.height } };
  }

  return options as CaptureOptions;
}

// =============================================================================
// SCROLL HELPER — Triggers lazy-loaded content
// =============================================================================

/**
 * Scrolls through the entire page from top to bottom, then back to top.
 *
 * This triggers lazy loading, intersection observers, and scroll-based
 * animations that only activate when elements enter the viewport.
 *
 * @param page - The Playwright page instance to scroll.
 */
async function scrollEntirePage(page: Page): Promise<void> {
  await page.evaluate(
    ({ stepDistance, stepDelay }) => {
      return new Promise<void>((resolveScrollComplete) => {
        let totalScrolled = 0;
        const fullHeight = document.documentElement.scrollHeight;

        const scrollTimer = setInterval(() => {
          window.scrollBy(0, stepDistance);
          totalScrolled += stepDistance;

          if (totalScrolled >= fullHeight) {
            clearInterval(scrollTimer);
            // Scroll back to the top so serialization captures from the top
            window.scrollTo(0, 0);
            // Small delay to let the page stabilize after scroll-to-top
            setTimeout(resolveScrollComplete, 500);
          }
        }, stepDelay);
      });
    },
    { stepDistance: SCROLL_STEP_DISTANCE_PX, stepDelay: SCROLL_STEP_DELAY_MS },
  );
}

// =============================================================================
// NODE COUNTING — For progress reporting
// =============================================================================

/**
 * Recursively counts all nodes in a CIR node tree.
 * Used for progress reporting in the CLI output.
 *
 * @param node - The root CIR node to count from.
 * @returns Total number of nodes in the tree (including the root).
 */
function countNodes(node: CIRDocument['pages'][number]['rootNode'] | undefined): number {
  if (!node) {
    return 0;
  }

  let count = 1;
  for (const child of node.children) {
    count += countNodes(child);
  }
  return count;
}
