/**
 * @file ai-types.ts — Type definitions for AI Design Mode (Phase 3)
 *
 * Defines configuration, prompt/response, and chunk types used throughout
 * the AI enrichment pipeline.
 */

// =============================================================================
// PROVIDER & CONFIGURATION
// =============================================================================

/** Supported AI providers. 'custom' uses OpenAI-compatible endpoints (Ollama, LM Studio, etc.). */
export type AIProvider = 'anthropic' | 'openai' | 'google' | 'custom';

/**
 * Configuration for AI Design mode.
 * Passed from CLI options to the AI orchestrator.
 */
export interface AIDesignConfig {
  /** Which AI provider to use. */
  provider: AIProvider;

  /** Override the default model ID for the chosen provider. */
  modelId?: string;

  /** API key override (otherwise read from environment). */
  apiKey?: string;

  /** Base URL for custom provider (e.g., http://localhost:11434/v1). */
  baseUrl?: string;

  /** Maximum tokens per CIR chunk sent to the LLM. Default: 3000. */
  maxChunkTokens: number;

  /** Whether to anonymize data before sending to LLM. Default: false. */
  anonymize: boolean;

  /** Skip component detection pass (faster, less thorough). Default: false. */
  skipComponentDetection: boolean;
}

// =============================================================================
// CIR CHUNKING — Splitting tree for LLM context windows
// =============================================================================

/**
 * A chunk of CIR nodes prepared for LLM processing.
 * Contains summarized node info within the token budget.
 */
export interface CIRChunk {
  /** Summarized nodes in this chunk. */
  nodes: CIRNodeSummary[];

  /** Path from root to this chunk's parent (for context). */
  ancestorPath: string[];

  /** Estimated token count for this chunk. */
  estimatedTokens: number;
}

/**
 * Lightweight summary of a CIR node for LLM consumption.
 * Strips full style objects and keeps only structural/semantic info.
 */
export interface CIRNodeSummary {
  /** Node ID (maps back to the full CIR node). */
  id: string;

  /** HTML tag name (e.g., "DIV", "BUTTON", "NAV"). */
  tagName: string;

  /** Direct text content (trimmed). */
  textContent: string | null;

  /** CSS class list. */
  classList: string[];

  /** Bounding box dimensions. */
  bounds: { w: number; h: number };

  /** Number of direct children. */
  childCount: number;

  /** Whether this node has an image asset. */
  hasImage: boolean;

  /** Whether this node has an SVG asset. */
  hasSvg: boolean;

  /** Whether this node is interactive (button, link, input, etc.). */
  isInteractive: boolean;

  /** Summarized children (recursive, depth-limited). */
  children: CIRNodeSummary[];
}

// =============================================================================
// LLM RESPONSE TYPES
// =============================================================================

/** A single node naming assignment from the LLM. */
export interface SemanticNameAssignment {
  /** The CIR node ID. */
  id: string;

  /** Figma layer name (e.g., "Primary CTA Button", "Hero Section"). */
  componentHint: string;

  /** Semantic role (e.g., "navigation", "hero-section", "card"). */
  semanticRole: string;
}

/** Result from the semantic naming LLM pass. */
export interface SemanticNamingResult {
  /** Node name assignments. */
  assignments: SemanticNameAssignment[];
}

/** A detected component pattern. */
export interface DetectedComponent {
  /** Component name (e.g., "NavItem", "ProductCard", "Footer"). */
  name: string;

  /** IDs of nodes that are instances of this component. */
  instanceNodeIds: string[];

  /** Description of the component pattern. */
  description: string;
}

/** Result from the component detection LLM pass. */
export interface ComponentDetectionResult {
  /** Detected component patterns. */
  components: DetectedComponent[];
}

/** A semantic name for a design token. */
export interface TokenNameAssignment {
  /** The raw value (e.g., "rgba(59, 130, 246, 1)", "16", "8"). */
  rawValue: string;

  /** The semantic name (e.g., "primary", "spacing-md", "radius-sm"). */
  semanticName: string;
}

/** Result from the design token naming LLM pass. */
export interface TokenNamingResult {
  /** Color token names. */
  colors: TokenNameAssignment[];

  /** Spacing token names. */
  spacings: TokenNameAssignment[];

  /** Border radius token names. */
  radii: TokenNameAssignment[];

  /** Typography token names. */
  typography: TokenNameAssignment[];
}

/** Text anonymization mapping from the LLM. */
export interface AnonymizationMapping {
  /** Original text content. */
  original: string;

  /** Replacement placeholder text. */
  replacement: string;
}

/** Result from the data anonymization LLM pass. */
export interface AnonymizationResult {
  /** Text replacement mappings. */
  mappings: AnonymizationMapping[];
}
