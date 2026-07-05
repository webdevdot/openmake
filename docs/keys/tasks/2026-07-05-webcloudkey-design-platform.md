# Task: WebCloudKey Design Platform — new project bootstrap

- **status:** IN_PROGRESS
- **flow:** NEW_PROJECT (forced via /keys:new-project)
- **created:** 2026-07-05
- **completed:**

## Request

Build the self-hostable, open-source Figma-like design platform described in:
- `/Users/hardik/Downloads/WebCloudKey_Architecture_Graph.md`
- `/Users/hardik/Downloads/WebCloudKey_Design_Platform_Master_Plan.md`

User constraints:
- Check both source docs first; report anything missing/unclear before building.
- Use the repo/folder naming from the docs — do not invent other names.
- Verification must include opening the running app with Playwright and deep-checking it.
- App must be fully self-hostable (Docker: PostgreSQL primary, Redis, MinIO/S3, pgvector).

## Source-doc check (done)

Both files exist and were read in full. Consistent with each other. Gaps found
(to be resolved in brainstorm): folder-name conflict (cwd `openmake` vs docs
`webcloudkey`), MVP slice for this build, React-vs-Vue ambiguity, rendering
backend choice (Canvas2D vs CanvasKit), whether collab/auth/AI-MCP/Figma-import
ship in the first cut.

## Brainstorm

User answers (2026-07-05):

1. **Naming:** org `webdevdot`, repo/monorepo root = current folder `openmake`
   (monorepo style, package scope `@openmake/*`). Do NOT use `webcloudkey`.
2. **Scope:** FULL MVP — everything in the master plan's MVP list; anything
   that must remain for later flows must be explicitly reported to the user.
3. **Frontend framework:** user asked for deep research first, then re-ask.
   (research in progress)
4. **Rendering:** user asked for my recommendation → CanvasKit/Skia WASM behind
   a Renderer interface (Canvas2D fallback possible, WebGPU path later).
5. **Collaboration:** (a) Yjs from day one — offline persistence + WebSocket
   sync server in Docker.
6. **Auth:** (b) self-hosted email+password JWT on Postgres — multi-user from
   the start (users, orgs, projects, files metadata).
7. **AI/MCP:** FULL custom MCP server (read/write, Figma-MCP-like) + AI-powered
   design system: components can have attached Skills / Agents / Workflows;
   all component metadata, prompts, skills, agents, workflow definitions, and
   generated code stored in Postgres; any MCP client can pull complete context;
   bidirectional design↔code sync; reusable component intelligence across
   projects; provider-agnostic BYO-key AI integration (OpenAI / Anthropic /
   Google / local — "like OpenClaw").
8. **Figma importer:** (b) stub `figma-importer` package with parser
   interfaces now; full implementation in a later flow.

## Plan

**npm-protect: ON** (project .npmrc — all 4 layers, set before first install)
**Confirmed approach:** React 19 + external store + CanvasKit (Approach 1)

### System shape

```
apps/editor (React19+Vite+Tailwind4) ──► @openmake/core (headless engine ON Y.Doc)
        │ chrome only; hot paths bypass React        │
        ▼                                            ▼
@openmake/renderer (CanvasKit WASM,     @openmake/layout (Yoga flex + constraints)
  Renderer interface, WebGPU-later)
        ▲
@openmake/collab (y-indexeddb offline, y-protocols WS sync, awareness)
        │
apps/server (Fastify: JWT auth, REST /api/v1, WS /sync/:docId, rate-limit, helmet)
        │
@openmake/database (Prisma → Postgres+pgvector; Redis presence; MinIO assets)
        │
@openmake/ai (BYO-key providers via AI SDK: OpenAI/Anthropic/Google/local,
  Skills/Agents/Workflows engine, Context Builder) ◄── @openmake/mcp (stdio +
  streamable HTTP MCP server: full read/write design tools, component
  intelligence, run_workflow, codegen) ──► @openmake/codegen (React/HTML-TW)
plus: @openmake/cli, @openmake/plugin-sdk, @openmake/figma-importer (stub), @openmake/shared
```

### Key decisions (ADR-style, full rationale to wiki/decisions.md at close)

1. **Core engine operates directly ON Y.Doc** (OpenPencil pattern) — single source
   of truth, no dual-model sync bugs; undo via Y.UndoManager.
2. **React 19 chrome + framework-external document store** — drag-time updates go
   imperatively to CanvasKit, never through setState (tldraw/Excalidraw pattern).
3. **CanvasKit/Skia WASM behind a Renderer interface** — Figma-grade fidelity now,
   WebGPU swappable later. Rejected: Canvas2D (fidelity), custom WebGL (cost).
4. **Fastify over Express/Hono** — self-hosted perf target, not edge.
5. **Prisma + Postgres 16 + pgvector** — mandated by master plan ADR.
6. **Yjs updates appended to Postgres + periodic snapshot compaction** — durable
   self-hosted persistence without extra infra. Redis for presence/pubsub only.
7. **AI SDK provider abstraction, keys AES-256-GCM encrypted at rest** — BYO-key
   multi-provider incl. local (Ollama/openai-compatible).

### Data model (core entities)

User · Session/RefreshToken · Organization · OrgMember(role) · Project · File
· DocUpdate(yjs log) · DocSnapshot · Component · Skill · Agent · Workflow
· ComponentAttachment(component↔skill/agent/workflow+prompts) · GeneratedCode
(component, framework, code, version) · AiProvider(encrypted key) ·
AiConversation/AiMessage · DesignToken/Variable · Comment · ApiKey(MCP auth,
hashed, scoped) · AuditLog · ComponentEmbedding(pgvector)

### API surface (REST /api/v1 + WS + MCP)

auth: register/login/refresh/logout · orgs/projects/files CRUD ·
files/:id/snapshot|export · skills|agents|workflows|providers CRUD ·
workflows/:id/run · components + components/:id/context ·
WS /sync/:docId (y-protocols+awareness) · MCP tools: read/write nodes,
component context, attach intelligence, run workflow, save/get generated
code, semantic component search, export images

### Task breakdown (phases; TDD bottom-up per layer)

- [ ] 1. Scaffold monorepo (pnpm workspaces, TS refs, Vitest, ESLint, Prettier, docker-compose: pg16+pgvector/redis/minio, CI) → verify: `pnpm -r build` + `docker compose up -d` healthy
- [ ] 2. @openmake/database — Prisma schema, migrations, repositories → verify: vitest green vs dockerized PG
- [ ] 3. @openmake/core — scene graph on Y.Doc, node types, commands, undo/redo, hit-testing, serialization → verify: vitest green
- [ ] 4. @openmake/layout — Yoga flex auto-layout + constraints pass → verify: vitest green
- [ ] 5. @openmake/renderer — CanvasKit renderer, viewport, export PNG/SVG → verify: vitest + golden-image smoke
- [ ] 6. @openmake/collab — WS sync, offline persist, awareness, server persistence → verify: two-client merge test green
- [ ] 7. apps/server — auth(argon2+JWT+refresh rotation), RBAC, REST, rate-limit, helmet → verify: fastify.inject integration tests green
- [ ] 8. apps/editor — canvas view, tools (select/frame/rect/ellipse/line/text/image/pen-basic), layers panel, inspector, components/variants, tokens/styles, prototyping links, comments-ready, export UI → verify: dev server + manual smoke
- [ ] 9. @openmake/ai — provider layer, skills/agents/workflows engine, Context Builder → verify: vitest w/ mocked LLM
- [ ] 10. @openmake/mcp — MCP server (stdio+HTTP), full toolset vs core+db → verify: vitest via in-memory MCP transport
- [ ] 11. @openmake/codegen + cli + plugin-sdk + figma-importer stub → verify: cli export + codegen tests green
- [ ] 12. E2E (Playwright deep check incl. self-host docker stack) → security-gate (12-pt OWASP + security-auditor) → post-task-review → wiki seed → close

### Explicitly deferred to later flows (user informed)

boolean ops/shape-builder · full vector-network pen editing · animated
prototyping · Tauri desktop · comments UI · version-history UI · plugin
runtime/registry (SDK types only now) · full Figma importer · generative
image AI · a11y checker · web importer · Motion/3D

## Security Gate

(pending)

## Review

(pending)

## Verification

(pending — must include Playwright live check of the self-hosted app)
