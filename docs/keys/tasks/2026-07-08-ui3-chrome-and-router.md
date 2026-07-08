# Figma UI3 chrome parity + URL/router deep-link parity

- **Flow:** FEATURE ×2 (ultracode workflow `wf_ea593171-299`, 2 Opus 4.8 agents in isolated worktrees; deltas identified by Fable 5 from live Chrome side-by-side vs Figma)
- **Date:** 2026-07-08
- **Status:** merged to main, verified live (incl. cold deep-link)

## Delivered

### Chrome parity (task #8, feat/figma-ui3-chrome-parity)
- D1: Design|Prototype tabs + ZoomMenu relocated from TopBar into a RightPanelHeader atop the Inspector (all states); tab state in ephemeral store/panelMode.ts. TopBar slimmed.
- D2: BottomToolbar restructured to Figma slots: select/frame/[shape group with last-used memory + chevron flyout: rect/ellipse/line/polygon/star/image]/pen/text/hand | divider | comment. Flyout closes on outside-click/Escape; shortcuts unchanged and reflect into the slot.
- D3: floating 'Page 1' canvas chip removed (long-standing UI3 gap from the 2026-07-07 sweep).
- Known limit: Prototype tab is view-state only (no prototype inspector body yet — matches prior placeholder behavior).

### Router parity (task #9, worktree branch -2)
- /file/:fileId/:slug? with kebab-case slug canonicalized via replace:true after doc ready (no remount); dashboard links include slug.
- ?node-id=: cold-load select + zoom-to-fit (fitBounds + getWorldBounds, ~10%/side margin); selection→URL sync debounced 300ms, replace:true, first-id on multi-select, cleared on empty.
- ?page=: activates on load (invalid → first page), mirrored on switch; syncedPageRef prevents initial spam. All writes replace:true → clean history.
- Single useUrlSync hook owns all param logic, gated on doc readiness (useDocVersion + getPages().length); viewport measured lazily via callback (headless-testable).

## Verification

- Union on main: editor 213 passed / 0 failed; tsc clean; production build ✓ (230ms).
- Live: right-panel header + grouped toolbar + no chip confirmed on reload; selecting node added ?page=&node-id= to URL (debounced); **cold navigation to the full deep link** selected the node, zoomed to 775% fit, and canonicalized the slug → /file/<id>/jkj?page=…&node-id=….
- Note: a pre-merge page in the tab can look like R1 failing (no slug) — the running SPA predates the code; hard-reload before judging. (Generalizes the stale-dist gotcha to stale SPA sessions.)

## Gates

- [x] security-gate (no new endpoints/deps; node-id/page params validated against doc content, invalid ids no-op/fallback; no data in URLs beyond opaque ids)
- [x] post-task-review (union suite green, build green, live + cold-load behavioral verification)
- [x] wiki close (this record)
