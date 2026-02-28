#!/usr/bin/env node

/**
 * @file index.ts — UIRat CLI Entry Point
 *
 * Provides the command-line interface for UIRat.
 *
 * Commands:
 *   capture <url>       — Capture a single page to CIR JSON
 *   crawl <url>         — Crawl multiple pages and produce multi-page CIR JSON
 *   auth export         — Open headed browser, login, export encrypted session
 *   auth import <path>  — Verify and inspect an encrypted session file
 *
 * Usage:
 *   uirat capture <url>                                  # Basic capture
 *   uirat capture <url> --stealth --collect-assets       # Stealth + assets
 *   uirat capture <url> --auth-session ./app.session.enc # Authenticated capture
 *   uirat crawl <url> --max-pages 10 --interactive       # Multi-page crawl
 *   uirat auth export --url <url> -o session.enc         # Export auth session
 */

import { Command } from 'commander';
import { writeFileSync } from 'fs';
import { capturePage, parseViewportString } from './capture.js';
import type { CaptureOptions } from './capture.js';
import { transformCirToFigma } from '../transformer/standard-transformer.js';
import type { AuthConfig } from '../crawler/auth/auth-types.js';
import type { AIDesignConfig, AIProvider } from '../ai/ai-types.js';
import { parseViewportSpec } from '../crawler/viewport-config.js';
import type { ViewportBreakpoint } from '../crawler/viewport-config.js';

// =============================================================================
// CLI PROGRAM DEFINITION
// =============================================================================

const program = new Command();

program
  .name('uirat')
  .description('UIRat — UI Reverse-Engineering & Reconstruction Pipeline.\nCapture any web page and convert it to Figma designs or frontend code.')
  .version('0.2.0');

// =============================================================================
// CAPTURE COMMAND
// =============================================================================

program
  .command('capture')
  .description('Capture a web page and produce CIR JSON (UIRat Intermediate Representation)')
  .argument('<url>', 'The URL of the page to capture (e.g., https://example.com)')
  .option('-o, --output <path>', 'Output file path for the CIR JSON', './output.cir.json')
  .option('--viewport <size>', 'Browser viewport size in WIDTHxHEIGHT format', '1440x900')
  .option('--transform', 'Also produce a Figma-ready JSON file alongside the CIR', false)
  .option('--stealth', 'Enable stealth mode (anti-bot detection patches)', false)
  .option('--auth-session <path>', 'Path to encrypted session file for authentication')
  .option('--auth-token <token>', 'Bearer token for API authentication')
  .option('--session-passphrase <passphrase>', 'Passphrase for decrypting session file')
  .option('--collect-assets', 'Download and process page assets (images, SVGs, fonts)', false)
  .option('--assets-dir <path>', 'Directory to save downloaded assets', './uirat-assets')
  .option('--ai-design', 'Enable AI Design mode for semantic analysis', false)
  .option('--ai-provider <provider>', 'AI provider: anthropic|openai|google|custom', 'anthropic')
  .option('--ai-model <model>', 'Override default model ID')
  .option('--ai-base-url <url>', 'Base URL for custom provider (e.g., http://localhost:11434/v1)')
  .option('--ai-anonymize', 'Anonymize data before sending to LLM', false)
  .option('--viewports <specs>', 'Viewport breakpoints: desktop,tablet,mobile or WxH')
  .action(async (targetUrl: string, options: CaptureCommandOptions) => {
    try {
      const validatedUrl = validateAndNormalizeUrl(targetUrl);

      console.log(`\nUIRat v0.2.0 — Capturing: ${validatedUrl}\n`);

      // Determine viewports to capture
      const viewports: ViewportBreakpoint[] = options.viewports
        ? parseViewportSpec(options.viewports)
        : [{ name: 'default', ...parseViewportString(options.viewport) }];

      let cirDocument: import('../types/cir.js').CIRDocument | null = null;

      for (const vp of viewports) {
        console.log(`\nCapturing at ${vp.name} (${vp.width}x${vp.height})...`);

        const captureOptions: CaptureOptions = {
          viewport: { width: vp.width, height: vp.height },
          stealth: options.stealth,
          auth: buildAuthConfig(options),
          sessionPassphrase: options.sessionPassphrase,
          collectAssets: options.collectAssets,
          assetsDir: options.assetsDir,
        };

        const result = await capturePage(validatedUrl, captureOptions);

        if (cirDocument === null) {
          cirDocument = result;
          // Tag pages with viewport info
          for (const page of cirDocument.pages) {
            page.viewport = { width: vp.width, height: vp.height };
          }
        } else {
          // Merge additional viewport pages
          for (const page of result.pages) {
            page.viewport = { width: vp.width, height: vp.height };
            cirDocument.pages.push(page);
          }
        }
      }

      if (!cirDocument) {
        console.error('No pages captured.');
        process.exit(1);
      }

      // AI Design mode enrichment
      if (options.aiDesign) {
        const aiConfig = buildAIDesignConfig(options);
        const { enrichCirWithAI } = await import('../ai/ai-design-orchestrator.js');
        cirDocument = await enrichCirWithAI(cirDocument, aiConfig);
      }

      // Write the CIR JSON output
      const cirJson = JSON.stringify(cirDocument, null, 2);
      writeFileSync(options.output, cirJson, 'utf-8');

      const cirFileSizeKb = (Buffer.byteLength(cirJson, 'utf-8') / 1024).toFixed(1);
      console.log(`\nCIR JSON saved to: ${options.output} (${cirFileSizeKb} KB)`);

      // Optionally transform to Figma-ready JSON
      if (options.transform) {
        const firstPage = cirDocument.pages[0];
        if (firstPage === undefined) {
          console.error('No pages found in CIR document.');
          process.exit(1);
        }

        const figmaData = transformCirToFigma(firstPage.rootNode);
        const figmaOutputPath = options.output.replace('.cir.json', '.figma.json');
        const figmaJson = JSON.stringify(figmaData, null, 2);
        writeFileSync(figmaOutputPath, figmaJson, 'utf-8');

        const figmaFileSizeKb = (Buffer.byteLength(figmaJson, 'utf-8') / 1024).toFixed(1);
        console.log(`Figma JSON saved to: ${figmaOutputPath} (${figmaFileSizeKb} KB)`);
      }

      console.log('\nDone!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`\nError: ${errorMessage}`);
      process.exit(1);
    }
  });

// =============================================================================
// CRAWL COMMAND
// =============================================================================

program
  .command('crawl')
  .description('Crawl a web application and capture multiple pages')
  .argument('<url>', 'The starting URL to crawl from')
  .option('-o, --output <path>', 'Output file path for the CIR JSON', './output.cir.json')
  .option('--viewport <size>', 'Browser viewport size in WIDTHxHEIGHT format', '1440x900')
  .option('--max-pages <n>', 'Maximum number of pages to crawl', '10')
  .option('--max-depth <n>', 'Maximum link depth from the starting page', '3')
  .option('--include <pattern>', 'Only crawl URLs matching this pattern (regex)')
  .option('--exclude <pattern>', 'Skip URLs matching this pattern (regex)')
  .option('--interactive', 'Capture interactive states (hover, click, focus)', false)
  .option('--stealth', 'Enable stealth mode', false)
  .option('--auth-session <path>', 'Path to encrypted session file')
  .option('--auth-token <token>', 'Bearer token for API authentication')
  .option('--session-passphrase <passphrase>', 'Passphrase for decrypting session file')
  .option('--collect-assets', 'Download and process page assets', false)
  .option('--assets-dir <path>', 'Directory to save downloaded assets', './uirat-assets')
  .option('--ai-design', 'Enable AI Design mode for semantic analysis', false)
  .option('--ai-provider <provider>', 'AI provider: anthropic|openai|google|custom', 'anthropic')
  .option('--ai-model <model>', 'Override default model ID')
  .option('--ai-base-url <url>', 'Base URL for custom provider')
  .option('--ai-anonymize', 'Anonymize data before sending to LLM', false)
  .option('--viewports <specs>', 'Viewport breakpoints: desktop,tablet,mobile or WxH')
  .action(async (targetUrl: string, options: CrawlCommandOptions) => {
    try {
      const validatedUrl = validateAndNormalizeUrl(targetUrl);
      const viewport = parseViewportString(options.viewport);

      console.log(`\nUIRat v0.2.0 — Crawling: ${validatedUrl}\n`);

      const { crawlApplication } = await import('../crawler/crawl-orchestrator.js');

      let crawlResult = await crawlApplication({
        startUrl: validatedUrl,
        viewport,
        maxPages: parseInt(options.maxPages, 10),
        maxDepth: parseInt(options.maxDepth, 10),
        includePattern: options.include ? new RegExp(options.include) : undefined,
        excludePattern: options.exclude ? new RegExp(options.exclude) : undefined,
        captureInteractive: options.interactive,
        stealth: options.stealth,
        auth: buildAuthConfig(options),
        sessionPassphrase: options.sessionPassphrase,
        collectAssets: options.collectAssets,
        assetsDir: options.assetsDir,
      });

      // AI Design mode enrichment
      if (options.aiDesign) {
        const aiConfig = buildAIDesignConfig(options);
        const { enrichCirWithAI } = await import('../ai/ai-design-orchestrator.js');
        crawlResult = await enrichCirWithAI(crawlResult, aiConfig);
      }

      const cirJson = JSON.stringify(crawlResult, null, 2);
      writeFileSync(options.output, cirJson, 'utf-8');

      const fileSizeKb = (Buffer.byteLength(cirJson, 'utf-8') / 1024).toFixed(1);
      console.log(`\nCIR JSON saved to: ${options.output} (${fileSizeKb} KB)`);
      console.log(`Pages captured: ${crawlResult.pages.length}`);
      console.log('\nDone!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`\nError: ${errorMessage}`);
      process.exit(1);
    }
  });

// =============================================================================
// AUTH COMMANDS
// =============================================================================

const authCommand = program
  .command('auth')
  .description('Manage authentication sessions');

authCommand
  .command('export')
  .description('Open a headed browser, log in manually, and export the session')
  .requiredOption('--url <url>', 'The URL to open for manual login')
  .option('-o, --output <path>', 'Output file path for the encrypted session', './session.session.enc')
  .action(async (options: { url: string; output: string }) => {
    try {
      const { exportAuthSession } = await import('../crawler/auth/session-import.js');
      const validatedUrl = validateAndNormalizeUrl(options.url);
      await exportAuthSession(validatedUrl, options.output);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`\nError: ${errorMessage}`);
      process.exit(1);
    }
  });

authCommand
  .command('import')
  .description('Verify and inspect an encrypted session file')
  .argument('<path>', 'Path to the encrypted session file')
  .action(async (sessionPath: string) => {
    try {
      const { importAuthSession } = await import('../crawler/auth/session-import.js');
      await importAuthSession(sessionPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`\nError: ${errorMessage}`);
      process.exit(1);
    }
  });

// =============================================================================
// OPTION TYPES
// =============================================================================

/** Options parsed from the capture command. */
interface CaptureCommandOptions {
  output: string;
  viewport: string;
  transform: boolean;
  stealth: boolean;
  authSession?: string;
  authToken?: string;
  sessionPassphrase?: string;
  collectAssets: boolean;
  assetsDir: string;
  aiDesign: boolean;
  aiProvider: string;
  aiModel?: string;
  aiBaseUrl?: string;
  aiAnonymize: boolean;
  viewports?: string;
}

/** Options parsed from the crawl command. */
interface CrawlCommandOptions {
  output: string;
  viewport: string;
  maxPages: string;
  maxDepth: string;
  include?: string;
  exclude?: string;
  interactive: boolean;
  stealth: boolean;
  authSession?: string;
  authToken?: string;
  sessionPassphrase?: string;
  collectAssets: boolean;
  assetsDir: string;
  aiDesign: boolean;
  aiProvider: string;
  aiModel?: string;
  aiBaseUrl?: string;
  aiAnonymize: boolean;
  viewports?: string;
}

// =============================================================================
// AI DESIGN CONFIG BUILDER
// =============================================================================

/**
 * Builds an AIDesignConfig from CLI options.
 *
 * @param options - CLI options containing AI settings.
 * @returns The AI design configuration.
 */
function buildAIDesignConfig(options: { aiProvider: string; aiModel?: string; aiBaseUrl?: string; aiAnonymize: boolean }): AIDesignConfig {
  return {
    provider: options.aiProvider as AIProvider,
    modelId: options.aiModel,
    baseUrl: options.aiBaseUrl,
    maxChunkTokens: 3000,
    anonymize: options.aiAnonymize,
    skipComponentDetection: false,
  };
}

// =============================================================================
// AUTH CONFIG BUILDER
// =============================================================================

/**
 * Builds an AuthConfig from CLI options.
 * Determines which auth method to use based on which options are provided.
 *
 * @param options - CLI options that may contain auth settings.
 * @returns The appropriate AuthConfig.
 */
function buildAuthConfig(options: { authSession?: string; authToken?: string }): AuthConfig {
  if (options.authSession) {
    return { method: 'session', sessionFilePath: options.authSession };
  }

  if (options.authToken) {
    return { method: 'token', token: options.authToken, originUrl: '' };
  }

  return { method: 'none' };
}

// =============================================================================
// URL VALIDATION
// =============================================================================

/**
 * Validates and normalizes a user-provided URL.
 *
 * @param rawUrl - The user-provided URL string.
 * @returns A normalized, validated URL string.
 * @throws Error if the URL is invalid or uses a non-HTTP protocol.
 */
function validateAndNormalizeUrl(rawUrl: string): string {
  let urlWithProtocol = rawUrl;

  if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
    urlWithProtocol = `https://${rawUrl}`;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlWithProtocol);
  } catch {
    throw new Error(
      `Invalid URL: "${rawUrl}". Please provide a valid URL (e.g., https://example.com).`,
    );
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(
      `Unsupported protocol: "${parsedUrl.protocol}". Only HTTP and HTTPS are allowed.`,
    );
  }

  return parsedUrl.toString();
}

// =============================================================================
// RUN
// =============================================================================

program.parse();
