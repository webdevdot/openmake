# openmake — User Journey Map & Gap-Closing Design

- **Date:** 2026-07-09
- **Flow:** superpowers brainstorming → design (dual-agent, Approach A)
- **Figma artifact (partial):** https://www.figma.com/design/AYXwQ09ryWZwqqzIJ2tT2f — skeleton (title, 8 stages, action row) committed; emotion curve + gap cards blocked by a Starter-plan MCP quota paywall, captured verbatim below instead.

---

## Part 1 — The Journey Map

A designer's end-to-end path through openmake, eight stages, mapped by action and emotional state, with the three gaps that break the flow marked.

| # | Stage | Action | Emotion |
|---|---|---|---|
| 1 | Sign up / Sign in | Enter email + password. Land on the dashboard. | 😐 neutral (routine) |
| 2 | Dashboard | Switch org, browse projects & Recents/Trash, scan file cards with real canvas thumbnails, search, New file / Import .fig. | 😃 rising (real thumbnails earn trust) |
| 3 | Open editor | Icon rail (File/Agents/Assets/Tools/Variables), pages+layers panel, canvas, floating toolbar, inspector. | 😃 high (familiar, complete-feeling editor) |
| 4 | Draw & arrange | Shapes (rect/ellipse/line/polygon/star), pen, text, image tool. Select/move/resize/rotate. Align/distribute/flip. Auto-layout + snapping. | 😞 **CLIFF** — image evaporates on reload |
| 5 | Design systems | Components → variants (combine as variants), instances. Variables: collections, modes, typed vars, aliasing, color-fill binding. | 😐 sags — work is saved but invisible |
| 6 | Motion | Attach animation presets (fade/rotate/scale), timeline with keyframes, scrub/play, export animation to CSS. | 😐 sags — no way to see/restore iteration history |
| 7 | Dev handoff | Tools panel: copy code (HTML/CSS), export PNG/SVG. | 😃 recovers (handoff works) |
| 8 | Collaborate | Real-time multiplayer sync + presence cursors. | 😞 **CLIFF** — multiplayer sings, but nowhere to comment |

**Emotion curve (Maya's read, verbatim):** The curve climbs fast at Dashboard and Open editor (real thumbnails, a familiar editor — the product earns trust early), then falls off a cliff twice. The deepest troughs are Draw & arrange, where an image evaporates on reload, and Collaborate, where multiplayer sings but there's nowhere to leave a comment — the two moments a designer feels most betrayed because the surface *looked* finished. Between them the curve sags through the Design systems → Motion iterate loop: work is technically saved, but with no version history the user can't feel it, so confidence quietly leaks out of the exact loop where they iterate most. **openmake's pain isn't where it's weak — it's where it's almost done.**

### The three gaps (pain-points row)

- **GAP 1 — image lost on reload** (Stage 4, Draw & arrange). Image bytes live only in the editor-local `useImageStore`; the doc stores an `AssetRef` (SHA-256 hash + mime + size) but the pixels are never uploaded. Reload → correctly-placed but blank node. Teammates never see the image. *Verified live 2026-07-09.*
- **GAP 2 — can't comment** (Stage 8, Collaborate). `Comment` entity + REST endpoints (`POST/GET/PATCH/DELETE /files/:id/comments`) exist and are tested; there is no comment UI — no pins, no threads, no @mentions surface.
- **GAP 3 — can't see or restore history** (Stages 5–6, iterate loop). `DocUpdate` append-log + `DocSnapshot` compaction persist every edit; there is no UI to name a version, browse history, diff, or restore.

---

## Part 2 — Gap-closing specs (build order = journey order)

Each gap is built as its own vertical slice via the dual-agent loop (Maya designs the UX + states, Dev owns the contract + implementation), verified before the next starts.

### Spec 1 — Image server upload (GAP 1)

**Existing seams (verified):** `AssetRef = {hash, mime, width, height}` in `@openmake/shared`; `doc.setAsset`/`getAssets` on the CRDT; `useImageStore` byte cache; `useCreateImage` the single write path; MinIO container provisioned but **no** server asset routes; `files.ts` route pattern for authz (`requireOrgRole`/`resolveOrgIdFromFile`), documented `bodyLimit`, per-route rate limits.

**Decisions (dual-agent converged defaults):**
1. **Upload = optimistic/immediate.** Node appears instantly from the local cache; `POST` upload fires in the background after `setAsset`, must complete before a second client can fetch.
2. **Download = lazy on-demand.** On doc load, an `AssetRef` with no cached bytes triggers a per-asset `GET` only when that node is actually rendered.
3. **Storage = per-org content-addressed key** (`<orgId>/<assetHash>`). Org-scoped isolation matches the rest of the API; dedup loss is a non-issue at this scale.
4. **Limits + integrity:** cap 10 MiB (mirrors the import bodyLimit precedent), `image/png|jpeg` only, **re-hash server-side** and reject mismatch (prevents a corrupt AssetRef).
5. **Auth = authenticated proxy through the API** (`GET/POST /files/:fileId/assets/:hash`, JWT-bearer, `requireOrgRole` editor+ for upload, viewer+ for download). No presigned URLs in v1 — no expiry edge cases.

**New surface:** an S3/MinIO client in the server (`@aws-sdk/client-s3` or `minio`), `AssetStore` service, two routes, `@fastify/multipart` (or raw-body) for the upload, editor `uploadAsset`/`fetchAsset` in the api client, and a small change in `useCreateImage` (fire upload) + a fetch-on-miss hook feeding `useImageStore`.

**Done =** place image → reload → renders; second browser sees it; server re-hash rejects tampered bytes; tests green (server route + editor hook); live-verified in Chrome.

### Spec 2 — Comments UI (GAP 2)

**Existing:** `Comment` model (file, optional `nodeId` anchor, `parentId` threads) + full REST CRUD, tested. **Missing:** the entire front-end.

**Scope v1:** a comment mode toggle; click-to-drop a pin on canvas (anchored to a world point, optionally a node); a thread popover (body + replies); a comments list panel; resolve toggle. Rendered in the existing `OverlayLayer` (DOM overlay, like selection/snap guides). @mentions/reactions deferred to v2 (state it).

**Done =** drop a pin, type a comment, reload → pin + thread persist; resolve hides it; second browser sees it; tests + live-verify.

### Spec 3 — Version-history UI (GAP 3)

**Existing:** `DocUpdate` (per-file seq append log) + `DocSnapshot` (compaction). **Missing:** named versions, a browse/restore UI, and likely a "named checkpoint" concept + a restore endpoint.

**Scope v1:** a "save named version" action (writes a labeled snapshot marker); a version-history panel listing versions (auto-checkpoints + named) newest-first with author+timestamp; a "restore to this version" action (server rebuilds doc state at that seq → new update). Visual diff between versions deferred to v2 (state it).

**Done =** name a version, edit more, restore the named version → canvas reverts; list shows both named + auto checkpoints; tests + live-verify.

---

## Part 3 — Prototyping (deferred to its own spec, per user)

Prototyping (spec §4: triggers/actions/overlays/conditionals/prototype-scoped variables) is a new subsystem — the data model has **zero** Interaction entities. It gets its own dedicated spec + build cycle immediately after these three ship. Not bundled here.

---

## Known facts / Assumptions / Open questions

**Known facts:** all 8 journey stages except the 3 gaps are shipped + verified (this session's 14 tasks). GAP 1 verified live 2026-07-09. Comments + version-history backends exist with tests. MinIO provisioned, unused.

**Assumptions:** no external users yet (justifies v1 scoping — defer @mentions, visual diff, presigned URLs). Agent-orchestrated capacity continues. Figma MCP quota resets daily (emotion+gap rows re-applied then).

**Open questions:** (1) exact MinIO client lib (`@aws-sdk/client-s3` vs `minio`) — Dev picks per bundle/footprint at build time. (2) version "restore" semantics — new-update-that-reverts (undoable) vs hard-reset — Dev proposes at Spec 3 time.
