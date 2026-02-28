# UIRat

**UI Reverse-Engineering & Reconstruction Pipeline**

Capture any web page and convert it to Figma designs or frontend code. UIRat uses headless browser automation to serialize the DOM into an intermediate representation (CIR), then transforms it into pixel-perfect Figma JSON with optional AI-powered semantic analysis.

## How It Works

```
Web Page → [Playwright Crawler] → [DOM Serializer] → CIR JSON → [Transformer] → Figma JSON
                                                         ↓
                                              [AI Enricher] (optional)
                                          semantic naming, component detection,
                                          design tokens, data anonymization
```

## Quick Start

```bash
# Install
npm install

# Build (required before first use)
npm run build

# Capture a page
uirat capture https://example.com --transform

# Capture with AI semantic analysis
uirat capture https://example.com --ai-design --transform

# Multi-viewport capture
uirat capture https://example.com --viewports desktop,tablet,mobile
```

## Commands

### `capture <url>` — Single Page Capture

```bash
uirat capture https://example.com [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <path>` | Output CIR JSON path | `./output.cir.json` |
| `--viewport <WxH>` | Viewport size | `1440x900` |
| `--viewports <specs>` | Multi-viewport: `desktop,tablet,mobile` or `WxH,WxH` | |
| `--transform` | Also generate Figma-ready JSON | `false` |
| `--stealth` | Anti-bot detection patches | `false` |
| `--collect-assets` | Download images, SVGs, fonts | `false` |
| `--assets-dir <path>` | Asset output directory | `./uirat-assets` |
| `--auth-session <path>` | Encrypted session file | |
| `--auth-token <token>` | Bearer token | |
| `--ai-design` | Enable AI semantic analysis | `false` |
| `--ai-provider <name>` | `anthropic\|openai\|google\|custom` | `anthropic` |
| `--ai-model <id>` | Override default model | |
| `--ai-base-url <url>` | Custom endpoint (Ollama, LM Studio) | |
| `--ai-anonymize` | Strip PII before LLM processing | `false` |

### `crawl <url>` — Multi-Page Crawl

```bash
uirat crawl https://example.com --max-pages 20 --interactive
```

Additional options beyond `capture`:

| Option | Description | Default |
|--------|-------------|---------|
| `--max-pages <n>` | Maximum pages to capture | `10` |
| `--max-depth <n>` | BFS link depth | `3` |
| `--include <regex>` | Only crawl matching URLs | |
| `--exclude <regex>` | Skip matching URLs | |
| `--interactive` | Capture hover/click/focus states | `false` |

### `auth export` / `auth import` — Session Management

```bash
# Open browser, log in manually, export encrypted session
uirat auth export --url https://app.example.com -o session.enc

# Verify session file
uirat auth import session.enc

# Use session for authenticated capture
uirat capture https://app.example.com --auth-session session.enc
```

## AI Design Mode

When `--ai-design` is enabled, UIRat enriches the CIR before transformation:

1. **Data Anonymization** (optional) — Replaces PII with placeholders
2. **Hierarchy Cleanup** — Collapses wrapper divs, removes invisible nodes
3. **Semantic Naming** — LLM assigns meaningful Figma layer names (`HeroSection`, `PrimaryButton`)
4. **Component Detection** — Identifies repeated patterns across pages
5. **Design Token Extraction** — Extracts and names colors, spacing, typography

### Provider Support

```bash
# Anthropic Claude (default)
uirat capture https://example.com --ai-design
export ANTHROPIC_API_KEY=sk-ant-...

# OpenAI GPT-4o
uirat capture https://example.com --ai-design --ai-provider openai
export OPENAI_API_KEY=sk-...

# Google Gemini
uirat capture https://example.com --ai-design --ai-provider google
export GOOGLE_GENERATIVE_AI_API_KEY=...

# Self-hosted (Ollama, LM Studio)
uirat capture https://example.com --ai-design \
  --ai-provider custom \
  --ai-base-url http://localhost:11434/v1 \
  --ai-model llama3
```

## Multi-Viewport Capture

Capture the same page at multiple breakpoints:

```bash
# Named presets
uirat capture https://example.com --viewports desktop,tablet,mobile

# Custom dimensions
uirat capture https://example.com --viewports 1920x1080,768x1024,375x812

# Mixed
uirat capture https://example.com --viewports desktop,390x844
```

| Preset | Dimensions |
|--------|-----------|
| `desktop` | 1440x900 |
| `tablet` | 768x1024 |
| `mobile` | 375x812 |

## Project Structure

```
src/
├── cli/                  # CLI entry point & commands
├── crawler/              # Playwright browser, auth, crawl engine
│   └── auth/             # Session export/import, token injection
├── serializer/           # DOM → CIR JSON (runs in browser context)
├── transformer/          # CIR → Figma JSON mapping
├── ai/                   # AI Design mode
│   ├── prompts/          # LLM prompt templates
│   └── transformers/     # AI enrichment passes
├── assets/               # Image, SVG, font collection
└── types/                # CIR & Figma type definitions
test/                     # Vitest test suite
figma-plugin/             # Figma plugin for importing JSON
```

## CIR Format

The **CIR (UIRat Intermediate Representation)** is the central JSON format:

```json
{
  "version": "1.0",
  "tool": "UIRat",
  "capturedAt": "2026-02-28T14:30:00.000Z",
  "sourceUrl": "https://example.com",
  "viewport": { "width": 1440, "height": 900 },
  "pages": [
    {
      "route": "/",
      "title": "Example Domain",
      "rootNode": { "id": "node_001", "tagName": "BODY", "children": [...] }
    }
  ],
  "assets": { "images": [], "fonts": [], "svgs": [] },
  "designTokens": { "colors": [], "spacings": [], "radii": [], "typography": [] }
}
```

Each `CIRNode` contains bounds, computed styles, layout info, asset references, and optional AI-assigned semantic metadata.

## Development

```bash
# Run directly without building
npm run dev -- capture https://example.com

# Run tests
npm test

# Watch mode
npm run test:watch

# Type check
npm run lint

# Clean build artifacts
npm run clean
```

## Requirements

- Node.js 20+
- Playwright browsers (`npx playwright install` on first use)

## Tech Stack

- **TypeScript** — Strict mode, ESM modules
- **Playwright** — Headless browser automation
- **Vercel AI SDK** — Multi-provider LLM integration
- **Sharp** — Image processing
- **SVGO** — SVG optimization
- **Commander** — CLI framework
- **Zod** — Schema validation
- **Vitest** — Test runner

## License

UNLICENSED
