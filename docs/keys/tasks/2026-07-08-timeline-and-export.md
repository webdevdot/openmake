# Motion timeline panel + animation → code export

- **Flow:** FEATURE ×2 (ultracode workflow `wf_30e2f417-059`, 2 Opus 4.8 agents in isolated worktrees; pinned design by Fable 5)
- **Date:** 2026-07-08
- **Status:** merged to main, verified live

## Delivered

### Timeline panel (task #6, branch feat/motion-timeline-panel)
- `timeline/timeline-math.ts` (pure time↔px, retime clamping, ruler ticks; exact tests) + `TimelinePanel.tsx`: ruler w/ tick labels, per-track lanes with keyframe diamonds, playhead, current-time readout, Play/Pause via the shared animation store.
- Renders only when the single selected node has animation; docks full-width above BottomToolbar (new canvas flex column in EditorPage).
- Scrub publishes paused `sampleAnimation` poses through the SAME transient override store as playback (store gained scrub/clearScrub + reactive time) — never writes the doc; clearScrub on deselect/unmount.
- Keyframe retime: horizontal drag, clamped to [0,duration] + neighbor order, doc write only on pointer-up (single undo step). No add/delete/value-edit in timeline (presets/inspector own those).

### Code export (task #7, worktree branch -2)
- `packages/codegen/src/animation.ts`: `cssKeyframesFor` (@keyframes + class, `animation: ... 1 none` — fill none matches editor return-to-pose) and `waapiSnippetFor`.
- Stops = sorted union of keyframe times; values via core `sampleAnimation` (no re-derived interpolation). x/y/rotation combine into one transform per stop; translate emitted RELATIVE to 0% pose (doc coords are absolute — export moves, doesn't teleport). Easing passes through verbatim (asserted).
- Integrated into HTML_CSS generator (animated nodes get @keyframes + class); REACT/HTML_TAILWIND untouched (honesty over force-fit). MotionSection gained Copy CSS (clipboard, guarded).
- Known default: shorthand easing taken from first track's first keyframe (per-segment easing already baked into sampled stops).

## Verification

- Union on main after `pnpm install` (new codegen→core workspace dep needed linking — merge initially failed typecheck until installed): codegen 23, editor 182, core 115 passed; typechecks clean; dist rebuilt.
- Live: Add Fade-in → timeline docked with opacity lane + diamonds; ruler click → header 0.15s/0.30s, playhead moved, canvas half-faded (ephemeral scrub). Copy CSS button present. Test animation removed after.
- New gotcha: **workspace-dep additions from agent worktrees need `pnpm install` after merge** (node_modules links don't travel with the merge).
- Reconfirmed: first click after preview-page load can be dropped (canvaskit init) — retry once; filed as papercut.

## Gates

- [x] security-gate (pure emitters, no new endpoints; clipboard write is user-initiated; codegen dep is internal workspace pkg)
- [x] post-task-review (union suites green, live behavioral verification of scrub + panel + button)
- [x] wiki close (this record)
