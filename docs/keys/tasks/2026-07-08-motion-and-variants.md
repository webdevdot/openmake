# Motion core v1 + component variants & instance UI v1

- **Flow:** FEATURE ×2 (ultracode workflow `wf_e414d7ed-7c4`, 2 Opus 4.8 agents in isolated worktrees; plan + pinned design by Fable 5)
- **Date:** 2026-07-08
- **Status:** merged to main (merges of 6424684 motion, 149b00c variants), verified

## Origin

figma.com/motion read in Chrome (scroll-through; text extractor misses scroll-reveal sections — screenshots caught all). Shipped Figma Motion set: timeline animation on canvas, stackable presets (Fade/Rotate/Scale/Resize), per-property control, collaborative editing, animation→code export. 3D transforms + custom styles are "coming soon" at Figma → excluded from parity. openmake had zero animation (ADR-10 deferral).

## Delivered

### Motion core (task #5)
- Schema: Keyframe/AnimTrack/NodeAnimation zod on the shared base node → definition lives in Y.Doc (collab + undo free).
- Core `animation.ts`: pure `sampleAnimation` (clamped, per-segment easing), relative presets (fadeIn/Out, rotate, scaleIn/Out, resize), `stackAnimation` (track union, addition wins, duration=max). 18 exact tests.
- **Playback never writes to the doc**: transient zustand override map (image-byte-cache pattern) → `buildRenderScene` gained optional per-node `overrides` param; RenderLoop rAF drives the clock; stops at end and clears overrides (returns to authored pose).
- MotionSection in inspector: preset add/stack, duration, easing, Play/Stop, Remove.

### Variants v1 (task #4)
- Schema already sufficient (COMPONENT/COMPONENT_SET/INSTANCE + variantProperties pre-existed) — NO shared changes.
- Core `variants.ts`: parseVariantName ('Prop=Value' Figma convention, fallback 'Variant=<name>'), variantMatrixOf, findVariant, variantPropsOf + `OpenDoc.combineAsVariants` (≥2 same-parent COMPONENTs → COMPONENT_SET, world-position/z-order preserving, single undo). 17 tests.
- Editor: Create instance (+40px, auto-selected); INSTANCE inspector shows source + per-property variant dropdowns (set-scoped swap via findVariant); VariantsSection combine action; LayersTree purple treatment (filled diamond component / hollow diamond instance).
- Honest limits: overrides = only what resolveInstance already supports; no generic instance swap; deep per-child animated overrides inside instances out of v1.

## Verification (merged union on main)

- core 115 / renderer 23 / editor 163 passed, 0 failed; 4 typechecks clean.
- Live E2E in Chrome after dist rebuild: added Fade-in (1 track, ms field), set 2000ms, **Play → mid-fade captured on canvas → auto-stop at end → authored pose restored**; Create component → purple layers; Create instance → "Instance of Frame" + offset node + both purple icon styles. Test mutations undone; file restored (7 original layers).
- Reconfirmed gotchas: :5173 = `vite preview` (rebuild after merge); editor vitest from apps/editor only; **undo shortcut needs canvas focus** (cmd+z from inspector focus is silently dropped — first cleanup attempt failed this way).

## Follow-ups (filed)

- #6 timeline panel UI (blocked by #5 — now unblocked)
- #7 animation → code export via codegen (now unblocked)
- Image server upload; generic instance swap; per-child instance overrides.

## Gates

- [x] security-gate (no new deps/endpoints; animation values are numeric zod-validated doc data; playback is ephemeral local state)
- [x] post-task-review (union suites green, typechecks clean, live behavioral verification incl. mid-animation capture)
- [x] wiki close (this record)
