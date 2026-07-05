# Architecture (as built — 2026-07-06)

openmake is a self-hostable, local-first, AI-first design platform (org
`webdevdot`, monorepo `openmake`, packages `@openmake/*`). pnpm workspaces,
TypeScript strict everywhere, internal packages ship TS source directly.

## System shape

```
apps/editor (React 19 + Vite + Tailwind v4)
  │  chrome only — document state NEVER lives in React
  ├─► @openmake/core      headless scene-graph engine operating ON Y.Doc
  ├─► @openmake/renderer  CanvasKit/Skia WASM behind a Renderer interface
  ├─► @openmake/layout    Yoga flexbox auto-layout + 5-mode constraints
  └─► @openmake/collab/client  WS sync + y-indexeddb offline + awareness
                │ ws(s)://…/sync/:fileId?token=JWT
apps/server (Fastify, Node 22)
  ├─ REST /api/v1 (JWT access 15m + rotating httpOnly refresh cookie)
  ├─ WS /sync/:fileId → @openmake/collab/server DocSyncHub
  ├─ MCP /mcp (streamable HTTP, Bearer om_ API keys, scoped read/write)
  ├─► @openmake/database  Prisma → PostgreSQL 16 + pgvector (system of record)
  ├─► @openmake/ai        BYO-key providers, Skills/Agents/Workflows engine
  ├─► @openmake/mcp       19 design tools over injected store ports
  └─► @openmake/codegen   deterministic design→code (React/HTML-TW/HTML-CSS)
infra (docker compose): postgres(pgvector) + redis + minio [+ server + web via --profile app]
```

## Key mechanics

- **The Y.Doc IS the document.** `OpenDoc` (core) wraps Y.Maps/Y.Arrays; every
  mutation is a Yjs transaction with origin `openmake:local`. Undo =
  Y.UndoManager filtered to local origin, so remote edits are never undone.
- **Hot-path rule (from framework research):** drag/pan/zoom write to refs +
  imperative `doc.updateNode`, then a single dirty-flag rAF loop
  (`apps/editor/src/canvas/render-loop.ts`) re-renders CanvasKit. React
  re-reads via `useSyncExternalStore` on `doc.version`. Selection overlays are
  DOM, positioned imperatively during gestures.
- **Renderer owns its surface.** `resize()` recreates the WebGL surface —
  assigning `canvas.width` orphans the old one (root cause of the blank-canvas
  bug found in E2E). `preserveDrawingBuffer: 1` keeps readbacks reliable.
- **Sync persistence:** DocSyncHub appends every Yjs update to Postgres
  (`doc_updates`, per-file seq); snapshot + compaction after N updates
  (`doc_snapshots`). A fresh server reconstructs any doc from snapshot+log.
- **Editor↔server contract:** REST base is `<API>/api/v1`; resource responses
  are enveloped (`{orgs}`, `{file}`, …), auth register/login are flat.
  Refresh: `om_refresh` httpOnly cookie path=/api/v1/auth; page reload
  exchanges cookie → access token via `restoreSession`.
- **Self-host:** `cp .env.example .env` (all secrets must be filled; no
  defaults in prod), `docker compose --profile app up -d`. Dev Postgres runs
  on host port **5433** (5432 was occupied on the dev machine).

## Verification status (2026-07-06)

- 250 unit/integration tests green across 13 packages (`pnpm test`).
- Playwright E2E (e2e/): full journey, two-browser real-time convergence,
  auth guard — all green against the running stack.
