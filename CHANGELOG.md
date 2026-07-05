# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-07-06

### Added

- **Monorepo** (pnpm, TS strict): 11 packages + 2 apps + E2E suite, CI, MIT.
- **@openmake/core** — headless scene-graph engine on Y.Doc: 14 node types,
  mutations w/ cycle guards, undo/redo (local-origin only), world-bounds with
  rotation, hit-testing, component/instance resolution with overrides.
- **@openmake/renderer** — CanvasKit/Skia WASM behind a `Renderer` interface:
  fills/gradients/images, strokes, shadows/blur, blend modes, text paragraphs,
  camera, PNG export; pure-TS SVG export.
- **@openmake/layout** — Yoga flexbox auto-layout (HUG/FILL/FIXED, wrap,
  nesting) + 5-mode constraints.
- **@openmake/collab** — Yjs sync protocol, reconnecting client, offline
  persistence (IndexedDB), awareness, server hub with Postgres update-log +
  snapshot compaction.
- **@openmake/database** — Prisma schema (21 models incl. component
  intelligence, pgvector embeddings), 14 repositories, seeded AI skills.
- **@openmake/ai** — BYO-key providers (OpenAI/Anthropic/Google/local),
  AES-256-GCM key encryption, Context Builder Engine, layered prompt
  assembly, Skills/Agents/Workflows sequential pipeline.
- **@openmake/mcp** — MCP server (stdio + streamable HTTP): 19 read/write
  design tools, component context bundles, workflow execution, codegen.
- **@openmake/codegen** — deterministic React / HTML+Tailwind / HTML+CSS
  generators from design context.
- **@openmake/cli** — `new`, `export-json`, `codegen`.
- **@openmake/plugin-sdk** — Figma-style plugin API types + manifest schema.
- **@openmake/figma-importer** — import framework stub: types, compatibility
  matrix, minimal Figma-REST conversion with migration report.
- **apps/server** — Fastify: argon2id auth with rotating refresh tokens and
  reuse detection, org RBAC, REST /api/v1, WS document sync, MCP endpoint
  with scoped API keys, rate limiting, helmet, zod validation, audit log.
- **apps/editor** — React 19 + CanvasKit editor: infinite canvas (pan/zoom),
  draw tools (frame/rect/ellipse/line/text), selection/marquee/resize/rotate,
  layers tree, pages, inspector (geometry/fills/strokes/effects/auto-layout/
  text/interactions/export), components, live multiplayer cursors, presence,
  present mode, dark/light theme.
- **Self-hosting** — docker compose: Postgres 16 + pgvector, Redis, MinIO,
  server + web images (`--profile app`); `.env.example` documents all secrets.
- **Security** — 4-layer npm supply-chain protection; full OWASP gate passed.

### Verified

- 250 unit/integration tests green across the monorepo.
- Playwright E2E green: full user journey (register → draw → edit → export →
  relogin persistence), two-browser real-time convergence, auth guard.
