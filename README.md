# openmake

Open-source, self-hostable, AI-first design platform — an infinite-canvas
design editor (Figma-like) with real-time collaboration, a component system,
design tokens, and a first-class AI subsystem: every component can carry
attached **Skills, Agents, and Workflows**, exposed to any AI client through a
built-in **MCP server**.

Built by [webdevdot](https://github.com/webdevdot).

## Stack

- **Editor:** React 19 + Vite + Tailwind v4, CanvasKit (Skia WASM) rendering
- **Engine:** headless scene graph operating directly on Yjs (CRDT, local-first)
- **Server:** Node 22 + Fastify — REST, WebSocket sync, JWT auth, MCP
- **Data:** PostgreSQL 16 + pgvector (primary), Redis (presence), MinIO/S3 (assets)
- **AI:** provider-agnostic (OpenAI / Anthropic / Google / local), bring-your-own-key

## Self-hosting (Docker)

```bash
cp .env.example .env   # fill in secrets (see comments)
docker compose --profile app up -d
# editor:  http://localhost:3000
# api:     http://localhost:8080
# minio:   http://localhost:9001
```

## Development

```bash
pnpm install
docker compose up -d          # infra only: postgres, redis, minio
pnpm --filter @openmake/database db:migrate
pnpm dev                      # all dev servers
```

## Monorepo layout

| Path                      | Package                    | Purpose                                             |
| ------------------------- | -------------------------- | --------------------------------------------------- |
| `apps/editor`             | `@openmake/editor`         | Web editor UI                                       |
| `apps/server`             | `@openmake/server`         | API + sync + MCP host                               |
| `packages/core`           | `@openmake/core`           | Headless scene-graph engine (on Y.Doc)              |
| `packages/renderer`       | `@openmake/renderer`       | CanvasKit renderer behind a `Renderer` interface    |
| `packages/layout`         | `@openmake/layout`         | Auto-layout (Yoga flex) + constraints               |
| `packages/collab`         | `@openmake/collab`         | Yjs sync, offline persistence, awareness            |
| `packages/database`       | `@openmake/database`       | Prisma schema, migrations, repositories             |
| `packages/ai`             | `@openmake/ai`             | Providers, Skills/Agents/Workflows, Context Builder |
| `packages/mcp`            | `@openmake/mcp`            | MCP server (stdio + HTTP), design read/write tools  |
| `packages/codegen`        | `@openmake/codegen`        | Design-to-code generators                           |
| `packages/cli`            | `@openmake/cli`            | Headless CLI (export, query, workflows)             |
| `packages/plugin-sdk`     | `@openmake/plugin-sdk`     | Plugin API types                                    |
| `packages/figma-importer` | `@openmake/figma-importer` | Figma migration framework (stub)                    |
| `packages/shared`         | `@openmake/shared`         | Shared types + zod schemas                          |

## License

[MIT](LICENSE)
