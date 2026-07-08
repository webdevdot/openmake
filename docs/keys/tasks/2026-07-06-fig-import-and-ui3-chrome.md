# .fig binary import + finish UI3 chrome (from Figma-clone research report)

- **Flow:** FEATURE
- **Started:** 2026-07-06
- **Status:** in-progress
- **Source doc:** `/Users/hardik/Downloads/compass_artifact_wf-55306b6f-acf4-45ac-bef5-18934eb8ade6_text_markdown.md`
- **Absorbs:** 2026-07-06-figma-chrome-rebuild.md (its remaining wiring/restyle steps close under this task)

## Brainstorm (confirmed 2026-07-06)

- **Scope:** BOTH — (a) downloaded-`.fig` upload → parse → document import pipeline,
  (b) finish wiring the already-built UI3 chrome components into EditorPage.
- **Parser foundation:** low-level primitives — `kiwi-schema` (MIT, evanw) +
  `fzstd` (MIT) + `fflate` (MIT; substituted for report's `pako` because the
  `.fig` container is a ZIP and fflate covers unzip + inflate in one tiny dep).
  Rejected: `@open-pencil/core` (self-described not production-ready),
  pure in-repo codecs (too much codec-bug risk), Penpot adoption (report's
  alternative path; repo already owns its editor).
- **Known risk (from report):** `.fig` is Figma's undocumented internal Kiwi
  format — unstable, may break on any Figma release, arguable ToS gray zone.
  Ship labeled experimental/unofficial, degrade gracefully to partial import.

## Plan

### A — .fig import service (packages/figma-importer + apps/server + editor)

1. `packages/figma-importer/src/fig/` — container reader: detect ZIP (`PK`) vs
   raw `fig-kiwi` magic; extract `canvas.fig`; read 8-byte header + LE u32
   version; chunk 1 = Kiwi schema (deflate), chunk 2 = data (zstd magic
   `28 B5 2F FD`, else deflate fallback — older files used deflate for both).
2. Decode schema + message via `kiwi-schema`; rebuild parent/child tree from
   flat `nodeChanges`; map to `@openmake/shared` DocumentData (reuse existing
   REST-importer mapping conventions + ImportResult/ImportIssue types).
3. **Transport decision (revised after scout, 2026-07-06):** parse client-side
   in the browser (fflate/fzstd/kiwi-schema are pure JS, browser-safe; editor
   API client is JSON-only), POST resulting DocumentData JSON to new
   `POST /projects/:projectId/files/import` (EDITOR role, bodyLimit ~25 MiB,
   node-count cap, zod + OpenDoc.fromJSON validation → files.create +
   docs.saveSnapshot(fileId, 0, state) per files.ts convention).
   Rejected: server-side multipart parse — CPU-bound zstd/Kiwi decode of
   untrusted binary would block the Fastify event loop, needs a new dep,
   larger server attack surface. Parser DoS guards live client-side too
   (decompressed-size + node-count caps in packages/figma-importer).
4. Editor UI: "Import .fig" (beta-labeled) beside "New file" in DashboardPage,
   hidden file input, partial-import warnings surfaced before create,
   create → navigate(`/file/:id`) per existing pattern.

### B — UI3 chrome finish (apps/editor)

5. Wire TopBar + IconRail + BottomToolbar + PageInspector into EditorPage,
   retire old top Toolbar (relocate undo/redo, zoom, export, present, share,
   collab status per figma-chrome-rebuild task record).
6. Dark chrome restyle per styles.css tokens; keep tests/shortcuts green.

## Gates

- [x] security-gate (upload endpoint is the hot spot)
- [x] post-task-review
- [x] wiki update (ingest research report + architecture/decisions entries)

## Security Gate

Status: PASSED (2026-07-07)
Findings:

- ✅ Authz parity: import endpoint uses identical preHandler strength as sibling
  create route (EDITOR role, org resolution, 404-not-403 existence hiding).
- ✅ Input validated at 3 layers: zod body schema → cheap structural caps
  (50k nodes / combined-entries cap, before hydration) → DocumentDataSchema
  via OpenDoc.fromJSON. Server never trusts the client parser's output.
- ✅ Rate limiting: route-level 10/min/IP + global 200/min; bodyLimit 10 MiB.
- ✅ Deps: kiwi-schema 0.5.0, fflate 0.8.3, fzstd 0.1.1 — exact-pinned, no
  install scripts, no transitive deps, `pnpm audit` clean.
- ✅ No injection: file name via Prisma parameterized create; document stored
  as Yjs binary; nothing reaches SQL/HTML as a string.
- ✅ FIXED during gate: zstd frame-header window pre-allocation could bypass
  the 256 MiB budget (crafted 6-byte header → ~512 MiB+ alloc before ondata);
  declared window/content size now rejected up front + regression test.
- ✅ FIXED during gate: schema-validation log no longer records the full Zod
  error (attacker-supplied field paths/values); logs error name only.
- ✅ FIXED during gate: kiwi codegen invariant (schema.package === null must
  hold or `new Function` source could embed attacker bytes) now asserted.
- 🟡 Logged: kiwi-schema compileSchema requires CSP 'unsafe-eval' in browsers;
  parseFigFile degrades to a 'fig-schema-invalid' error issue under strict CSP.

## Code Review

Status: APPROVED (2026-07-07)
Notes:

- ✅ 4 adversarial workflow reviewers (parser correctness/DoS, server security,
  editor frontend, repo conventions); 1 high + 2 medium findings all fixed with
  regression tests (deflate-slice streaming, pre-decode nodeChanges bounds scan,
  server combined-entries cap + 10 MiB bodyLimit + per-IP throttle).
- ✅ Evidence: 305 unit tests + 3/3 e2e green at root; typecheck, eslint,
  prettier, pnpm audit all clean (CI-parity run).
- ✅ e2e journey spec updated: empty selection now asserts page-inspector
  (UI3 behavior) instead of the retired inspector-empty placeholder.
- 🟡 SUGGESTION: smoke-test with a real downloaded .fig (synthetic fixtures
  only so far); TopBar shows embedded doc name for imports (needs core rename
  API, deferred).

## Outcome

Shipped (uncommitted, on main working tree):

- `packages/figma-importer/src/fig/` — experimental `.fig` binary parser
  (parseFigFile: ZIP/raw container, deflate+zstd sniffing, Kiwi schema+message
  decode, flat-nodeChanges → tree rebuild, mapper to DocumentData; 26 tests).
- `apps/server` — POST /api/v1/projects/:projectId/files/import (31 tests).
- `apps/editor` — Dashboard "Import .fig" (beta) flow with dynamic parser
  import; UI3 chrome finished: TopBar + floating BottomToolbar wired into
  EditorPage, old Toolbar deleted (81 tests).
- Env fix: stale editor preview build (VITE_API_URL=host.docker.internal)
  rebuilt with localhost default — e2e was red for this pre-existing reason.

## Live MCP-driven verification (2026-07-07)

Drove the real app in Chrome (Playwright MCP): register → dashboard →
Import .fig (synthetic Kiwi fixture built via the unit-test schema, saved to
e2e/fixtures/sample.fig) → editor opened with correct name (MCP Import Demo),
page (Landing, bg #17171C), and layer tree (Hero frame ▸ Accent Dot / Headline
/ CTA Button in correct fractional-index order). Screenshots in the session.

**Two real defects surfaced and fixed by this exercise:**

1. The running dev server (up 26h) predated the import route → 404. Not a code
   bug; restarted the server. NOTE: the API server is NOT auto-restarted by a
   watcher in this setup — killing the tsx worker took the whole server down
   (no respawn); had to `pnpm --filter @openmake/server start` fresh.
2. **Renderer BUG_FIX (packages/renderer/src/renderer.ts drawText):** the
   CanvasKit paragraph style was a bare object literal; CanvasKit 0.41.1's
   emscripten `toWireType` marshaller throws `Missing field: "disableHinting"`
   for any TEXT node with a registered font, killing the entire render loop
   (blank canvas). Fix: wrap in `new ck.ParagraphStyle({...})` — its documented
   job is filling optional struct fields with defaults. Added a renderer
   regression test (registers real Inter, draws text, asserts ink) — verified
   it fails with the exact error on the old code and passes on the fix. This
   bug pre-existed the import work; no renderer test previously exercised
   drawText because none registered a font (the guard early-returns).
   Security (BUG_FIX): not exploitable, no adjacent vulns, no controls touched.
   Post-review: root cause named (marshaller struct-defaults), regression test
   added, full suite green (306 unit + 3 e2e). APPROVED.
