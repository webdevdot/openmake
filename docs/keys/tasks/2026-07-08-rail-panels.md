# Left-rail panels: Agents, Assets, Tools, Variables v1

- **Flow:** FEATURE ×3 (ultracode workflow `wf_3ff76d04-005`, 3 Opus 4.8 agents in isolated worktrees; audit + plan by Fable 5)
- **Date:** 2026-07-08
- **Status:** merged to main, all panels verified live

## Origin

User challenged whether the rail items were ever checked in detail. Audit: IconRail's own comment admitted "inert placeholders"; LeftPanel had ONLY a `file` branch — clicking Agents/Assets/Tools/Variables collapsed the panel entirely. Meanwhile the backends mostly existed (AI subsystem, components, codegen/export/import).

## Delivered

- **Agents panel (task #10)**: Skills/Agents/Workflows lists via existing REST (org resolved file→project→org), BUILT-IN badges, run-workflow per workflow gated on single-COMPONENT selection with inline status. Verified live: 5 seeded skills render.
- **Assets + Tools (task #11)**: Assets = live component/set browser (useDocVersion walk, purple iconography, search, insert-instance at viewport center reusing shared lib/instances.ts extracted from ComponentSection). Tools = codegen Copy-code (HTML_CSS), shared PNG/SVG export handlers (extracted to lib/nodeExport.ts — single renderer path), import link. Notable: @openmake/ai gained a browser-safe ./context-builder subpath export so the editor avoids pulling node:crypto into the bundle.
- **Variables v1 (task #12)**: collections/modes/typed variables in the doc (variableCollectionsMap mirroring the assets pattern; full CRUD + resolveVariableValue with default-mode fallback); SolidPaint.boundVariableId (color fills only, scoped deliberately); renderer threads a VariableColors map like images/overrides; VariablesPanel CRUD; FillsSection bind/unbind picker (hex edit while bound unbinds first); per-collection active mode is EDITOR view state, not CRDT.

## Merge + integration findings (the valuable part)

- 3-way LeftPanel/EditorPage conflicts resolved by union (pinned insertion pattern kept them trivial); LeftPanel now takes fileId + viewport/export callbacks.
- **Real cross-agent break caught only in union testing**: variables agent replaced OpenDoc's stub `setVariable` with collection-scoped CRUD; packages/ai's context-builder tests (old API) passed in the assets agent's pre-variables worktree but failed on main — `doc.setVariable is not a function` ×6. Fixed by migrating the test to createVariableCollection/createVariable with captured ids (95e84ac). Lesson: **each agent's "full suite of touched packages" does not cover packages OTHER agents' changes break — union must run every package.**
- rtk tee swallowed the ai vitest output; ground truth read from the tee log per memory note.
- nodeExport.ts extraction (agent 2) vs variableColors threading (agent 3) collided semantically: resolved by having nodeExport build variable colors itself, so all export surfaces honor bindings.

## Verification

- Union: shared 7, core 122, renderer 28, ai 28, editor 238, codegen untouched; all tsc clean; build ✓.
- Live: all five rail items open real panels (screenshots in session) — Agents lists the 5 built-in skills from the real API; Variables shows Collections+add; Tools shows selection-gated Copy-code/exports/import; Assets shows search+empty state.

## Gates

- [x] security-gate (panels consume existing authed REST only; no key material client-side; variables are doc data validated by zod; ai browser subpath avoids bundling node crypto)
- [x] post-task-review (union suites green incl. cross-agent fix, build green, all panels behaviorally verified)
- [x] wiki close (this record)
