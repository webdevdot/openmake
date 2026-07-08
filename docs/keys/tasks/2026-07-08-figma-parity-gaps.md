# Figma-parity gaps: toolbar tools, auto-layout panel, align/flip

- **Flow:** FEATURE ×3 (ultracode workflow `wf_7bd17a79-705`, 3 Opus 4.8 agents in isolated worktrees; plan by Fable 5)
- **Date:** 2026-07-08
- **Status:** merged to main (d21389d), verified

## Origin

Chrome side-by-side of local editor vs Figma Polaris UI Kit surfaced 4 gaps:
1. polygon/star/image tools not in toolbar (seams existed since f60bda3)
2. auto-layout inspector was a bare toggle (Yoga engine existed)
3. no align/distribute/flip controls
4. component variants/instance UI absent — **NOT implemented; pending scope decision** (spec §3.6-sized)

## Delivered (merge commits 4672940, 91dd8fd, d21389d)

- **Toolbar (ac8c9a3):** polygon/star/image buttons + g/s/k shortcuts; image = picker → SHA-256 assetId → doc.setAsset + byte cache → RECTANGLE with IMAGE fill at natural size (IMAGE is a paint, not a node type). Client-side only; server upload remains open.
- **Auto-layout (645c6ba):** direction/wrap, gap, linked+per-side padding, 9-dot align grid, space-between, per-child Hug/Fill/Fixed (renders only under auto-layout parent). BASELINE align not surfaced (not 3×3-representable).
- **Align/flip (92e11db):** core align.ts (alignNodes/distributeNodes/flipNode, rotation-aware, parent-local mapping, single transact per op) + inspector AlignSection. Flip is honest: schema has no scaleX/mirror, so VECTOR mirrors path coords; others get rotation-reflection orientation flip.

## Verification

- Merged main: core 66 passed, editor 151 passed, tsc clean both packages.
- Live UI confirmed in Chrome post-rebuild (toolbar buttons, align row incl. disabled distribute at n=1, full auto-layout panel).
- **Gotcha reconfirmed:** :5173 is `vite preview` (serves dist) — source changes invisible until `pnpm build` in apps/editor. Also: editor vitest must run FROM apps/editor or happy-dom env is dropped ('document is not defined').

## Gates

- [x] security-gate (quick pass: no new deps/endpoints/eval; image path is client-side hash+cache only; AssetRef carries no PII)
- [x] post-task-review (merged suite green, typecheck clean, live visual verification; line-level deep review available via /code-review if desired)
- [x] wiki close (this record)
