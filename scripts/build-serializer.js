/**
 * @file build-serializer.js — Bundles the DOM Serializer into an Injectable IIFE
 *
 * The DOM Serializer consists of multiple TypeScript files (dom-serializer.ts,
 * filters.ts, style-extractor.ts, box-shadow-parser.ts) that run inside the
 * browser via Playwright's page.evaluate().
 *
 * This script uses esbuild to:
 * 1. Bundle all serializer files into a single JavaScript file
 * 2. Wrap it as an IIFE (Immediately Invoked Function Expression)
 * 3. Make the serializeDom() function callable from page.evaluate()
 *
 * The output at dist/serializer-bundle.js is a self-executing script that
 * returns the CIR document JSON when evaluated in a browser context.
 *
 * Usage: node scripts/build-serializer.js
 */

import { build } from 'esbuild';
import { writeFileSync, mkdirSync, readFileSync, unlinkSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, '..');

async function buildSerializerBundle() {
  const outputDirectory = resolve(projectRoot, 'dist');

  // Ensure the output directory exists
  mkdirSync(outputDirectory, { recursive: true });

  // Build the serializer as an IIFE bundle that exposes serializeDom via a global.
  // page.evaluate() runs the script in the browser — it cannot use ES modules.
  // The IIFE format wraps everything in a function scope, avoiding global pollution.
  const tempOutputPath = resolve(outputDirectory, 'serializer-temp.js');

  await build({
    entryPoints: [resolve(projectRoot, 'src/serializer/dom-serializer.ts')],
    bundle: true,
    format: 'iife',
    globalName: '__uirat_serializer',
    target: 'es2022',
    outfile: tempOutputPath,
    platform: 'browser',
    external: [],
    minify: false,
    sourcemap: false,
    treeShaking: true,
  });

  // Read the IIFE bundle and append a call to the exported serializeDom function.
  // After the IIFE executes, __uirat_serializer.serializeDom is available.
  // We call it immediately so page.evaluate() receives the CIR document as its return value.
  const builtIife = readFileSync(tempOutputPath, 'utf-8');

  const wrappedBundle = `${builtIife}
__uirat_serializer.serializeDom();`;

  const finalOutputPath = resolve(outputDirectory, 'serializer-bundle.js');
  writeFileSync(finalOutputPath, wrappedBundle, 'utf-8');

  // Clean up temp file
  try {
    unlinkSync(tempOutputPath);
  } catch {
    // Ignore cleanup errors — temp file may already be removed
  }

  const bundleSizeBytes = Buffer.byteLength(wrappedBundle, 'utf-8');
  const bundleSizeKilobytes = (bundleSizeBytes / 1024).toFixed(1);
  console.log(`Serializer bundle built: ${finalOutputPath} (${bundleSizeKilobytes} KB)`);
}

buildSerializerBundle().catch((error) => {
  console.error('Failed to build serializer bundle:', error);
  process.exit(1);
});
