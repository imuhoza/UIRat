/**
 * @file ai-design-orchestrator.ts — AI Design Mode Pipeline Orchestrator
 *
 * Runs all AI enrichment steps in sequence on a CIR document:
 * 1. Data anonymization (if enabled) — protects PII before LLM processing
 * 2. Hierarchy cleanup — deterministic tree simplification
 * 3. Semantic naming — LLM assigns component names and roles
 * 4. Component detection — LLM identifies reusable patterns
 * 5. Design token extraction — hybrid deterministic + LLM naming
 *
 * The enriched CIR document then flows into the standard transformer.
 */

import type { LanguageModel } from 'ai';
import type { CIRDocument } from '../types/cir.js';
import type { AIDesignConfig } from './ai-types.js';
import { createModelInstance } from './ai-client.js';
import { cleanupHierarchy } from './transformers/hierarchy-cleaner.js';
import { applySemanticNaming } from './transformers/semantic-namer.js';
import { anonymizeData } from './transformers/data-anonymizer.js';
import { extractDesignTokens } from './transformers/design-token-extractor.js';
import { detectComponents } from './transformers/component-detector.js';

// =============================================================================
// MAIN ORCHESTRATOR
// =============================================================================

/**
 * Enriches a CIR document with AI-powered semantic analysis.
 *
 * Pipeline: anonymize (optional) → cleanup → naming → components → tokens
 *
 * Each step degrades gracefully on failure — if one step fails, the pipeline
 * continues with what it has. The original CIR document is modified in place
 * for efficiency (tree nodes get componentHint/semanticRole set).
 *
 * @param cirDocument - The CIR document to enrich.
 * @param config - AI design configuration.
 * @returns The enriched CIR document (same reference, modified).
 */
export async function enrichCirWithAI(
  cirDocument: CIRDocument,
  config: AIDesignConfig,
): Promise<CIRDocument> {
  console.log('\n--- AI Design Mode ---\n');

  // Create the model instance
  let model: LanguageModel;
  try {
    model = await createModelInstance(config);
  } catch (error) {
    console.error(
      `Failed to initialize AI provider: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.log('Falling back to standard mode (no AI enrichment).\n');
    return cirDocument;
  }

  // Step 1: Anonymize data (if enabled)
  if (config.anonymize) {
    console.log('[1/5] Anonymizing data...');
    for (const page of cirDocument.pages) {
      try {
        await anonymizeData(page, model);
      } catch (error) {
        console.warn(
          `Anonymization failed for ${page.route}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    console.log('[1/5] Anonymization complete.');
  } else {
    console.log('[1/5] Anonymization skipped (not enabled).');
  }

  // Step 2: Hierarchy cleanup (deterministic, no LLM)
  console.log('[2/5] Cleaning up hierarchy...');
  for (let i = 0; i < cirDocument.pages.length; i++) {
    const page = cirDocument.pages[i]!;
    page.rootNode = cleanupHierarchy(page.rootNode);
  }
  console.log('[2/5] Hierarchy cleanup complete.');

  // Step 3: Semantic naming
  console.log('[3/5] Applying semantic naming...');
  for (const page of cirDocument.pages) {
    try {
      await applySemanticNaming(page, model, config.maxChunkTokens);
    } catch (error) {
      console.warn(
        `Semantic naming failed for ${page.route}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  console.log('[3/5] Semantic naming complete.');

  // Step 4: Component detection
  if (!config.skipComponentDetection) {
    console.log('[4/5] Detecting components...');
    try {
      const result = await detectComponents(cirDocument.pages, model);
      console.log(`[4/5] Detected ${result.components.length} component patterns.`);

      // Apply component hints for detected instances
      for (const component of result.components) {
        for (const page of cirDocument.pages) {
          applyComponentHints(page.rootNode, component.name, component.instanceNodeIds);
        }
      }
    } catch (error) {
      console.warn(
        `Component detection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    console.log('[4/5] Component detection skipped.');
  }

  // Step 5: Design token extraction
  console.log('[5/5] Extracting design tokens...');
  try {
    cirDocument.designTokens = await extractDesignTokens(cirDocument.pages, model);
    console.log('[5/5] Design tokens extracted.');
  } catch (error) {
    console.warn(
      `Token extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  console.log('\n--- AI Design Mode complete ---\n');
  return cirDocument;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Applies a component name to specific nodes by ID.
 * Only sets componentHint if not already set by semantic naming.
 */
function applyComponentHints(
  node: import('../types/cir.js').CIRNode,
  componentName: string,
  instanceNodeIds: string[],
): void {
  if (instanceNodeIds.includes(node.id) && node.meta.componentHint === null) {
    node.meta.componentHint = componentName;
  }
  for (const child of node.children) {
    applyComponentHints(child, componentName, instanceNodeIds);
  }
}
