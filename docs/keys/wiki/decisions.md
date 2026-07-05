# Decisions (ADRs)

## ADR-1 — React 19 + external store (not Vue/Svelte)
Verified (July 2026): Figma, Penpot, tldraw, Excalidraw, Polotno all use React;
no design-tool team has switched frameworks for performance — they fix the
store/renderer layer. Hard rule: document state lives in OpenDoc, hot paths
bypass React. React also has the best LLM codegen (matters for the AI-first
subsystem) and largest contributor pool. Runner-up Vue 3 (OpenPencil parity).

## ADR-2 — Core engine operates directly ON Y.Doc
Single source of truth (OpenPencil pattern): no dual-model sync bugs; sync,
offline merge, and undo come from the CRDT. Undo via Y.UndoManager with
trackedOrigins={openmake:local} so remote edits are never undone.

## ADR-3 — CanvasKit/Skia WASM behind a Renderer interface
Figma-grade path/text/blend fidelity now; WebGPU swappable later. Rejected:
Canvas2D (fidelity ceiling), custom WebGL (months of work). Both Penpot's 2025
engine and OpenPencil landed on Skia. Learned in E2E: the renderer must OWN
surface recreation on resize, and browser WASM must load via the bundler's
asset URL (`canvaskit-wasm/bin/canvaskit.wasm?url`), never node resolution.

## ADR-4 — Fastify (not Express/Hono)
Self-hosted long-running Node server → Fastify's perf + schema-first plugins.
Hono optimizes for edge (not our target); Express slower, legacy. Note:
Fastify rejects empty JSON bodies — custom parser added for cookie-only POSTs.

## ADR-5 — PostgreSQL 16 + pgvector as system of record (master-plan mandate)
Prisma ORM + Migrate. Yjs updates in an append-only log + snapshot compaction
— durable multi-user persistence without extra infra. Redis reserved for
presence/pubsub scale-out; MinIO/S3 for binary assets (Postgres holds refs).

## ADR-6 — Auth: argon2id + 15m JWT + rotating refresh w/ reuse detection
Refresh in httpOnly SameSite=lax cookie scoped to /api/v1/auth (also body for
non-browser clients). Reuse of a revoked token revokes the whole family.
Non-members get 404 (not 403) to prevent resource enumeration.

## ADR-7 — AI: provider-agnostic BYO-key via AI SDK; keys AES-256-GCM at rest
OPENAI/ANTHROPIC/GOOGLE/LOCAL (openai-compatible, e.g. Ollama). Engine depends
only on a ModelPort interface → all AI logic testable with zero network.
Component intelligence (Skills/Agents/Workflows attached to components, all in
Postgres) is exposed to ANY MCP client — the "OpenClaw-style" integration.

## ADR-8 — MCP server with injected store ports
@openmake/mcp depends on DocumentStore/IntelligenceStore interfaces; the
server wires Prisma-backed adapters, tests use in-memory ones. Scoped om_ API
keys (sha256-stored) gate read vs write at the transport boundary.

## ADR-9 — Supply-chain: 4-layer npm protection from first install
ignore-scripts=true, min-release-age=7d, audit-level=high, save-exact.
Proved its worth: caught a never-published version pin and a fresh transitive
CVE (@hono/node-server → overridden to patched). Cooldown exceptions are
allowed only for targeted security patches.

## ADR-10 — Deferred (explicit, user-acknowledged)
Boolean ops/shape-builder, full vector-network pen editing, animated
prototyping, Tauri desktop, comments UI, version-history UI, plugin runtime/
registry (SDK types shipped), full Figma importer (stub + compatibility matrix
shipped), generative image AI, a11y checker, web importer, Motion/3D.
