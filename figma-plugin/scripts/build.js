/**
 * @file build.js — Figma Plugin Build Script
 *
 * Builds the Figma plugin by:
 * 1. Bundling code.ts → dist/code.js (for the Figma sandbox)
 * 2. Copying ui.html → dist/ui.html (the plugin UI)
 *
 * The Figma sandbox requires a single bundled JS file (no ES modules).
 * The UI is a single HTML file with inline scripts.
 *
 * Usage: node figma-plugin/scripts/build.js
 */

import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(currentDirectory, '..');
const distDirectory = resolve(pluginRoot, 'dist');

async function buildPlugin() {
  // Ensure dist directory exists
  mkdirSync(distDirectory, { recursive: true });

  // Bundle the sandbox code (code.ts + its imports)
  await build({
    entryPoints: [resolve(pluginRoot, 'src/code.ts')],
    bundle: true,
    format: 'cjs',
    target: 'es6',
    outfile: resolve(distDirectory, 'code.js'),
    platform: 'neutral',
    minify: false,
    sourcemap: false,
  });

  // Copy the UI HTML file (already self-contained with inline scripts)
  copyFileSync(
    resolve(pluginRoot, 'src/ui.html'),
    resolve(distDirectory, 'ui.html'),
  );

  console.log('Figma plugin built successfully:');
  console.log(`  Sandbox: ${resolve(distDirectory, 'code.js')}`);
  console.log(`  UI:      ${resolve(distDirectory, 'ui.html')}`);
}

buildPlugin().catch((error) => {
  console.error('Figma plugin build failed:', error);
  process.exit(1);
});
