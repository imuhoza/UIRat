# UIRat — Feature Tracker & Implementation Status

**Last updated**: 2026-02-28
**Phase 1 Status**: ✅ COMPLETE — All 19 features implemented, 58 tests passing
**Phase 2 Status**: ✅ COMPLETE — All 10 features implemented, 153+ tests passing

---

## Code Quality Standards (MANDATORY)

All code in this project MUST follow these non-negotiable standards:

### Security
- Zero tolerance for injection vulnerabilities (XSS, command injection, prototype pollution)
- All user inputs sanitized and validated at system boundaries
- No secrets, credentials, or API keys hardcoded — environment variables only
- All external data treated as untrusted — validate before processing
- Dependencies audited regularly — no known CVE in production deps
- Encrypted storage for any sensitive state (auth tokens, session data)

### Clean & Structured Code
- Strict TypeScript — `strict: true`, no `any` types unless absolutely justified with a comment
- Single Responsibility Principle — one function does one thing
- Max function length: ~40 lines. If longer, decompose into named helpers
- Max file length: ~300 lines. If longer, split into focused modules
- Consistent naming: `camelCase` for variables/functions, `PascalCase` for types/classes, `UPPER_SNAKE` for constants
- No dead code, no commented-out code in main branch
- Explicit error handling — no silent catches, no swallowed errors

### Human-Readable & Junior-Friendly
- Every file starts with a block comment explaining its purpose, inputs, outputs, and where it fits in the pipeline
- Every exported function has a JSDoc comment with `@param`, `@returns`, and a usage example
- Complex logic has inline comments explaining **why**, not **what**
- No clever one-liners — prefer readability over brevity
- Variable names describe their content: `filteredVisibleNodes` not `fvn`
- No abbreviations unless universally understood (`url`, `id`, `svg` are OK — `bg`, `el`, `cs` are NOT)
- Each module has a short README section in this file explaining what it does in plain language

### Documentation
- Every module documented in this tracker file
- All type interfaces have JSDoc on every field
- Public API functions have complete JSDoc with examples
- Architecture decisions documented with rationale
- Error messages are descriptive and actionable

### Updatability
- No magic numbers — use named constants with descriptive names
- Configuration values externalized (not buried in logic)
- Clear module boundaries — modules communicate through typed interfaces
- Test coverage for all business logic — any junior dev can refactor with confidence
- Git commits are atomic and descriptive

---

## Pipeline Overview

```
URL → [Headless Crawler] → [DOM Serializer] → CIR JSON → [Asset Collector] → CIR Enriched
                                                                                    │
                                                    ┌───────────────────────────────┤
                                                    ▼               ▼               ▼
                                             Standard Map    AI Design Map    AI Build Map
                                                    │               │               │
                                                    ▼               ▼               ▼
                                              Figma Basic    Figma Pro      React/HTML Project
```

---

## Phase 1 — PoC (Current)

**Goal**: Capture a single public web page → CIR JSON → Figma-ready JSON → Figma plugin import

| # | Feature | Module | Status | Notes |
|---|---------|--------|--------|-------|
| 1.1 | CIR type definitions | `src/types/` | ✅ Complete | Core interfaces: CIRDocument, CIRNode, FigmaNodeData |
| 1.2 | DOM Serializer — DOM tree walker | `src/serializer/dom-serializer.ts` | ✅ Complete | Recursive traversal of document.body |
| 1.3 | DOM Serializer — Style extraction | `src/serializer/style-extractor.ts` | ✅ Complete | getComputedStyle → CIRStyles (~40 properties) |
| 1.4 | DOM Serializer — Visibility filters | `src/serializer/filters.ts` | ✅ Complete | Exclude hidden, off-viewport, scripts, ads, cookie banners |
| 1.5 | DOM Serializer — Box-shadow parser | `src/serializer/box-shadow-parser.ts` | ✅ Complete | Parse CSS box-shadow string → CIRBoxShadow[] |
| 1.6 | DOM Serializer — Pseudo-element capture | `src/serializer/dom-serializer.ts` | ✅ Complete | ::before / ::after as child nodes with isPseudo flag |
| 1.7 | DOM Serializer — Wrapper merging | `src/serializer/filters.ts` | ✅ Complete | Skip empty div/span wrappers with single child |
| 1.8 | Serializer bundle build | `scripts/build-serializer.js` | ✅ Complete | esbuild bundles serializer into single IIFE for injection |
| 1.9 | CLI entry point | `src/cli/index.ts` | ✅ Complete | `uirat capture <url>` command with options |
| 1.10 | Playwright capture orchestration | `src/cli/capture.ts` | ✅ Complete | Launch browser, navigate, scroll, inject, extract CIR |
| 1.11 | Standard Transformer — Color utils | `src/transformer/color-utils.ts` | ✅ Complete | CSS rgba/hex → Figma {r,g,b,a} (0-1 range) |
| 1.12 | Standard Transformer — Layout mapper | `src/transformer/layout-mapper.ts` | ✅ Complete | CSS flex → Figma auto-layout properties |
| 1.13 | Standard Transformer — Main mapper | `src/transformer/standard-transformer.ts` | ✅ Complete | Full CIR tree → FigmaNodeData tree conversion |
| 1.14 | Figma Plugin — Manifest + UI | `figma-plugin/` | ✅ Complete | Plugin shell with JSON paste/upload UI |
| 1.15 | Figma Plugin — Node factory | `figma-plugin/src/node-factory.ts` | ✅ Complete | Create Frame, Text, Rectangle nodes in Figma |
| 1.16 | Figma Plugin — Font loader | `figma-plugin/src/font-loader.ts` | ✅ Complete | CSS weight→style mapping, family aliases, fallback |
| 1.17 | Unit tests — Transformer | `test/` | ✅ Complete | 56 unit tests (color, shadow, layout, transform) |
| 1.18 | Integration tests — Serializer | `test/` | ✅ Complete | E2E capture of example.com validates CIR structure |
| 1.19 | E2E tests — Full pipeline | `test/` | ✅ Complete | URL → CIR → Figma JSON → validates text nodes exist |

---

## Phase 2 — Crawler + Auth + Assets

| # | Feature | Module | Status | Notes |
|---|---------|--------|--------|-------|
| 2.1 | Playwright stealth integration | `src/crawler/stealth.ts` | ✅ Complete | 22 user-agents, webdriver/chrome.runtime/plugins/WebGL patches, humanized delays |
| 2.2 | Auth — Session import | `src/crawler/auth/session-import.ts` | ✅ Complete | Headed browser → manual login → AES-256-GCM encrypted export |
| 2.3 | Auth — Token injection | `src/crawler/auth/token-injection.ts` | ✅ Complete | page.route() injects Bearer header on same-origin requests only |
| 2.4 | Auth — Direct credentials | `src/crawler/auth/credentials.ts` | ✅ Complete | Auto-detect login form, humanized typing, credentials overwritten after use |
| 2.5 | Route discovery engine | `src/crawler/route-discovery.ts` | ✅ Complete | <a href> extraction + pushState/replaceState interception |
| 2.6 | Route deduplication | `src/crawler/route-dedup.ts` | ✅ Complete | Numeric/UUID/hex segment detection → pattern grouping |
| 2.7 | Interactive state capture | `src/crawler/interactive-capture.ts` | ✅ Complete | Hover/click on buttons/links/dropdowns, DOM re-serialization, max 10/page |
| 2.8 | Asset Collector — Images | `src/assets/image-processor.ts` | ✅ Complete | Download + Sharp PNG conversion with size limits |
| 2.9 | Asset Collector — SVGs | `src/assets/svg-processor.ts` | ✅ Complete | SVGO optimization preserving viewBox/IDs |
| 2.10 | Asset Collector — Fonts | `src/assets/font-collector.ts` | ✅ Complete | @font-face extraction, download, Figma font mapping |

---

## Phase 3 — AI Design Mode (Future)

| # | Feature | Module | Status | Notes |
|---|---------|--------|--------|-------|
| 3.1 | LLM integration (Vercel AI SDK) | `src/ai/` | ⬜ Not started | Multi-provider abstraction |
| 3.2 | Semantic naming | `src/ai/transformers/` | ⬜ Not started | LLM renames nodes: Header, Sidebar, CardProduct |
| 3.3 | Component detection | `src/ai/transformers/` | ⬜ Not started | Detect repeated patterns → master components |
| 3.4 | Hierarchy cleanup | `src/ai/transformers/` | ⬜ Not started | Remove empty wrappers, simplify tree |
| 3.5 | Design System extraction | `src/ai/transformers/` | ⬜ Not started | Extract tokens → Figma Variables + Styles |
| 3.6 | Data anonymization | `src/ai/transformers/` | ⬜ Not started | Replace real data with Lorem Ipsum |
| 3.7 | Multi-viewport capture | `src/crawler/` | ⬜ Not started | Desktop + Tablet + Mobile breakpoints |

---

## Phase 4 — AI Build Mode (Future)

| # | Feature | Module | Status | Notes |
|---|---------|--------|--------|-------|
| 4.1 | Project scaffolder | `src/builder/` | ⬜ Not started | Templates: Vite + React + Tailwind |
| 4.2 | LLM code generation pipeline | `src/builder/` | ⬜ Not started | CIR chunks → React components + pages |
| 4.3 | Shared component detection | `src/builder/` | ⬜ Not started | Cross-page: navbar, footer, sidebar |
| 4.4 | Tailwind config generation | `src/builder/` | ⬜ Not started | Design tokens → tailwind.config.js |
| 4.5 | React Router setup | `src/builder/` | ⬜ Not started | Auto-generate App.jsx with routes |
| 4.6 | Auto dev server launch | `src/builder/` | ⬜ Not started | npm install + vite dev on port 3000 |
| 4.7 | HTML/CSS static output | `src/builder/` | ⬜ Not started | Alternative: plain HTML + live-server |

---

## Phase 5 — Polish + Launch (Future)

| # | Feature | Module | Status | Notes |
|---|---------|--------|--------|-------|
| 5.1 | Fastify API backend | `src/api/` | ⬜ Not started | REST API for captures |
| 5.2 | BullMQ job queue | `src/api/` | ⬜ Not started | Async crawl + rate limiting |
| 5.3 | Web dashboard (React + Tailwind) | `web/` | ⬜ Not started | Capture management UI |
| 5.4 | Database (SQLite/PostgreSQL) | `src/api/` | ⬜ Not started | Sessions, capture history |
| 5.5 | Figma REST API integration | `src/figma/` | ⬜ Not started | Direct .fig export |
| 5.6 | Performance optimization | — | ⬜ Not started | Parallelization, Redis cache |
| 5.7 | Landing page + pricing | `web/` | ⬜ Not started | Public website |

---

## Legend

| Icon | Meaning |
|------|---------|
| ⬜ | Not started |
| 🔧 | In progress |
| ✅ | Complete |
| ⏸️ | Paused / blocked |
| ❌ | Cancelled |
