/**
 * @file design-token-extractor.ts — Hybrid Design Token Extraction
 *
 * Two-phase process:
 * 1. DETERMINISTIC: Walk all nodes and collect unique colors, spacings, radii,
 *    and typography combinations with usage counts.
 * 2. LLM: Send the top tokens to the LLM for semantic naming.
 */

import { z } from 'zod';
import type { LanguageModel } from 'ai';
import type { CIRPage, CIRNode, CIRDesignTokens } from '../../types/cir.js';
import type { TokenNamingResult } from '../ai-types.js';
import { queryLLMStructured } from '../ai-client.js';
import { buildSystemPrompt, buildUserPrompt } from '../prompts/design-tokens.js';
import type { RawTokenData } from '../prompts/design-tokens.js';

// =============================================================================
// ZOD SCHEMA FOR LLM RESPONSE
// =============================================================================

const tokenNamingSchema = z.object({
  colors: z.array(z.object({ rawValue: z.string(), semanticName: z.string() })),
  spacings: z.array(z.object({ rawValue: z.string(), semanticName: z.string() })),
  radii: z.array(z.object({ rawValue: z.string(), semanticName: z.string() })),
  typography: z.array(z.object({ rawValue: z.string(), semanticName: z.string() })),
});

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Extracts design tokens from CIR pages.
 *
 * @param pages - Array of CIR pages to extract tokens from.
 * @param model - The language model instance for semantic naming.
 * @returns Populated CIRDesignTokens with semantic names.
 */
export async function extractDesignTokens(
  pages: CIRPage[],
  model: LanguageModel,
): Promise<CIRDesignTokens> {
  // Phase 1: Deterministic extraction
  const rawTokens = extractRawTokens(pages);

  // Phase 2: LLM naming
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(rawTokens);

  const naming: TokenNamingResult = await queryLLMStructured(
    model,
    systemPrompt,
    userPrompt,
    tokenNamingSchema,
  );

  // Merge raw data with LLM names
  return mergeTokenNames(rawTokens, naming);
}

// =============================================================================
// DETERMINISTIC EXTRACTION
// =============================================================================

/**
 * Walks all nodes across all pages and extracts raw token values with counts.
 */
export function extractRawTokens(pages: CIRPage[]): RawTokenData {
  const colorCounts = new Map<string, number>();
  const spacingCounts = new Map<number, number>();
  const radiusCounts = new Map<number, number>();
  const typoCounts = new Map<string, { fontFamily: string; fontSize: number; fontWeight: string; lineHeight: string; count: number }>();

  for (const page of pages) {
    walkForTokens(page.rootNode, colorCounts, spacingCounts, radiusCounts, typoCounts);
  }

  return {
    colors: topEntries(colorCounts, 20).map(([value, usageCount]) => ({ value, usageCount })),
    spacings: topEntries(spacingCounts, 15).map(([value, usageCount]) => ({ value, usageCount })),
    radii: topEntries(radiusCounts, 10).map(([value, usageCount]) => ({ value, usageCount })),
    typography: Array.from(typoCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(({ fontFamily, fontSize, fontWeight, lineHeight, count }) => ({
        fontFamily, fontSize, fontWeight, lineHeight, usageCount: count,
      })),
  };
}

function walkForTokens(
  node: CIRNode,
  colors: Map<string, number>,
  spacings: Map<number, number>,
  radii: Map<number, number>,
  typography: Map<string, { fontFamily: string; fontSize: number; fontWeight: string; lineHeight: string; count: number }>,
): void {
  // Colors
  const bg = node.styles.backgroundColor;
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
    colors.set(bg, (colors.get(bg) ?? 0) + 1);
  }
  const fg = node.styles.color;
  if (fg && fg !== 'rgba(0, 0, 0, 0)') {
    colors.set(fg, (colors.get(fg) ?? 0) + 1);
  }

  // Spacings (padding and gap values > 0)
  const spacingValues = [
    node.styles.paddingTop, node.styles.paddingRight,
    node.styles.paddingBottom, node.styles.paddingLeft,
    node.layout.gap,
  ];
  for (const val of spacingValues) {
    if (val > 0) {
      spacings.set(val, (spacings.get(val) ?? 0) + 1);
    }
  }

  // Radii
  const radiusValues = [
    node.styles.borderTopLeftRadius, node.styles.borderTopRightRadius,
    node.styles.borderBottomRightRadius, node.styles.borderBottomLeftRadius,
  ];
  for (const val of radiusValues) {
    if (val > 0) {
      radii.set(val, (radii.get(val) ?? 0) + 1);
    }
  }

  // Typography (only for text-bearing nodes)
  if (node.textContent !== null) {
    const key = `${node.styles.fontFamily}|${node.styles.fontSize}|${node.styles.fontWeight}|${node.styles.lineHeight}`;
    const existing = typography.get(key);
    if (existing) {
      existing.count++;
    } else {
      typography.set(key, {
        fontFamily: node.styles.fontFamily,
        fontSize: node.styles.fontSize,
        fontWeight: node.styles.fontWeight,
        lineHeight: node.styles.lineHeight,
        count: 1,
      });
    }
  }

  for (const child of node.children) {
    walkForTokens(child, colors, spacings, radii, typography);
  }
}

// =============================================================================
// MERGE NAMING RESULTS
// =============================================================================

function mergeTokenNames(raw: RawTokenData, naming: TokenNamingResult): CIRDesignTokens {
  const colorNameMap = new Map(naming.colors.map((c) => [c.rawValue, c.semanticName]));
  const spacingNameMap = new Map(naming.spacings.map((s) => [s.rawValue, s.semanticName]));
  const radiusNameMap = new Map(naming.radii.map((r) => [r.rawValue, r.semanticName]));
  const typoNameMap = new Map(naming.typography.map((t) => [t.rawValue, t.semanticName]));

  return {
    colors: raw.colors.map((c) => ({
      name: colorNameMap.get(c.value) ?? `color-${c.value}`,
      value: c.value,
      usageCount: c.usageCount,
    })),
    spacings: raw.spacings.map((s) => ({
      name: spacingNameMap.get(String(s.value)) ?? `spacing-${s.value}`,
      value: s.value,
      usageCount: s.usageCount,
    })),
    radii: raw.radii.map((r) => ({
      name: radiusNameMap.get(String(r.value)) ?? `radius-${r.value}`,
      value: r.value,
      usageCount: r.usageCount,
    })),
    typography: raw.typography.map((t) => {
      const key = `${t.fontFamily}|${t.fontSize}|${t.fontWeight}|${t.lineHeight}`;
      return {
        name: typoNameMap.get(key) ?? `type-${t.fontSize}`,
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
        lineHeight: t.lineHeight,
        usageCount: t.usageCount,
      };
    }),
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function topEntries<T>(map: Map<T, number>, limit: number): Array<[T, number]> {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}
