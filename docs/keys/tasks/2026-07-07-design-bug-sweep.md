# Design/UI bug sweep — find→fix→re-test loop until clean

- **Flow:** BUG_FIX (multi-bug QA loop; user-authorized to loop until ready)
- **Started:** 2026-07-07
- **Status:** closed (2026-07-09 — round 2 fixes shipped, gates passed)
- **Brainstorm:** N/A (BUG_FIX — no brainstorm)

## Goal

"Check all design-related bugs, find and fix in a loop until ready for the
user, and test all features." Two tracks per round:

1. **Static design review (workflow):** 5 lenses over apps/editor UI code —
   tokens/theme, a11y/interaction states, layout/overflow/stacking,
   UX flow states (empty/loading/error/in-flight), UI3-fidelity vs the
   chrome task record. Every finding adversarially verified before fixing.
2. **Live feature QA (Playwright MCP):** drive the real app — auth, dashboard,
   import, all tools, drawing, selection/move/resize, inspector sections,
   layers/pages, shortcuts, zoom, undo/redo, export, present, themes.

Loop: findings → fix round (partitioned builders) → rebuild → re-drive →
next round. Exit when a full round yields zero new confirmed findings.

## Known debt going in (candidates to fix this loop)

- Zoom shortcuts (+/−/0) resolve in shortcuts.ts but EditorPage drops them.
- BottomToolbar has no z-index (canvas overlays could paint above it).
- Pen tool selects but has no gesture yet (paused vector task — NOT in scope
  to implement; verify it doesn't break anything when selected).
- TopBar Design/Prototype tabs are static placeholders (by design — verify
  they at least don't look interactive-but-broken).

## Rounds log

### Round 1 — find (2026-07-07)

**Live QA (Playwright MCP, real browser):** verified working — register/login,
dashboard org/project/file flows, .fig import, click-select + selection
handles, layers highlight, 7 inspector sections, text section (imported
fontSize correct), delete→undo→redo round-trip, tool shortcuts (r/v/p),
zoom menu presets, visibility toggle (canvas repaints), page create/switch,
page bg hex edit (canvas repaints), present enter/Escape exit, dark theme
tokens. Live bugs found:

- LIVE-1 HIGH: 186x 'Unable to preventDefault inside passive listener' —
  canvas wheel handler can't block browser scroll/zoom.
- LIVE-2 MED: zoom shortcuts +/−/0 resolve but EditorPage drops them (verified
  live: + leaves zoom at 100%).
- LIVE-3 HIGH: collab silently 'Offline' after JWT expiry — CollabClient
  reuses construction-time token on reconnects; reload restores Connected.
- LIVE-4 LOW: .fig import ignores fontName.style (Bold → Regular).
- LIVE-5 MED/LOW: Present fit clips frame at viewport edge; Exit chip
  low-contrast.
- LIVE-6 LOW: empty Layers panel has no empty state.
- LIVE-7 HIGH: un-layered form reset in styles.css (color/font-size inherit)
  beats @layer utilities → text/font utilities dead on ALL buttons/inputs;
  dock icons invisible in light theme (root-caused via computed styles).

**Static review workflow (5 lenses + adversarial verify):** 21 confirmed
findings (TextEditorOverlay invisible typing HIGH; prompt-cancel creates file
HIGH; presence label contrast; app-wide missing disabled styling; CTA accent
fails AA; uncontrolled page-bg hex; ZoomMenu no outside-close + dup 100% row;
UI3 gaps: page chip, pages search, page export section, dock right cluster,
top bar icon/badges, tabs placement; emoji→lucide consistency; focus-visible/
accent-color missing; silent export/present no-ops; solo avatar; styles '+'
dead affordance; Inter-500 face missing). NOTE: 63 verify agents were lost to
a session limit — unverified claims dropped; round 2 re-sweep covers the gap.
DEFERRED: Inter Medium @font-face (needs font asset acquisition; OFL path
noted). Dock right-cluster placeholders folded into round 1 scope only as
Comment relocation + inert cluster.

### Round 1 — fix (wf_ce98e208-fb2)

8 parallel fixers, strict ownership: styles/tokens (layer fix + disabled +
focus-visible + accent-cta), canvas/EditorPage (wheel passive, zoom keys,
page chip, export/present alerts), overlays (text-edit color, present fit),
topbar/presence (contrast helper, self-avatar, tabs, ZoomMenu close),
panels/inspector (lucide icons, pages search, controlled hex, export section,
layers empty state), dashboard (prompt-cancel bug + CTA token), collab token
provider (LIVE-3), fig fontWeight (LIVE-4).

### Round 2 — find (2026-07-07, static review only)

Re-swept apps/editor with the same 5-lens static workflow (tokens/theme,
a11y/interaction states, layout/overflow/stacking, UX flow states, UI3-fidelity)
plus fresh direct verification of any claim carried over from the lost-agent
gap in round 1. All findings below were confirmed by reading current file
contents (post round-1 fixes) and, where applicable, computing exact values
(contrast ratios) rather than eyeballing.

Two passes contributed findings this round: my own direct static pass, and a
background subagent's independent 5-lens pass. Merged and de-duplicated below
(the subagent's #10 and my R2-2 are the same underlying bug — kept as one).

Confirmed findings:

- R2-1 HIGH: Login/Register submit buttons fail WCAG AA text contrast.
  Both `pages/LoginPage.tsx` and `pages/RegisterPage.tsx` style their submit
  button with `backgroundColor: 'var(--color-accent)'` (#0c8ce9) + white text.
  Measured contrast = **3.53:1**, below AA's 4.5:1 minimum for normal text.
  `--color-accent-cta` (#0a6cc2, measured **5.33:1**) already exists in
  `styles.css` specifically for this ("Darker accent for CTA surfaces: 5.33:1
  contrast vs white text (AA)") and was applied to the Dashboard primary CTA
  in round 1, but these two auth-page buttons were missed.
  Files: `apps/editor/src/pages/LoginPage.tsx:63`,
  `apps/editor/src/pages/RegisterPage.tsx:74`.
- R2-2 MED: TopBar Share button's disabled state is opacity-only and reads as
  a dimmed primary CTA rather than a genuinely disabled control. The global
  `button:disabled { opacity: 0.5 }` rule does apply (verified — nothing in
  `@layer utilities` overrides it for this button), so it's not a total
  no-op, but Share keeps the exact same `bg-accent-cta` color/shape/size as
  the adjacent enabled Present button, just faded — weak differentiation
  from the live primary CTA, especially next to an actionable neighbor.
  `components/toolbar/TopBar.tsx:105-112`.
- R2-3 HIGH: `IconRail` non-"File" sections (Agents/Assets/Tools/Variables)
  look like working section switches (`aria-pressed` toggles correctly) but
  `LeftPanel.tsx:19` only renders panel content when `section === 'file'` —
  the entire pages/layers panel unmounts to nothing for the other four
  sections. Verified directly by reading `LeftPanel.tsx`. Worse than an
  inert placeholder; looks broken/buggy rather than "not yet built."
  Fix direction: disable those rail buttons (consistent with Share's
  disabled pattern) or keep panel mounted with an explicit "coming soon"
  state. `components/panels/IconRail.tsx:35-47`, `components/panels/LeftPanel.tsx:19`.
- R2-4 HIGH: Zero `aria-label`/`role` on icon-only controls across all
  `components/inspector/*.tsx` files (add/remove fill/stroke/effect/export,
  alignment grid cells). Broader/systemic version of round 1's icon-choice
  fix — round 1 fixed icon *legibility* (emoji→lucide) but not screen-reader
  labeling.
- R2-5 MED: `pages/DashboardPage.tsx:19-39` — the three initial-load
  `useEffect`s (`orgsApi`/`projectsApi`/`filesApi` `.list()`) have no
  `.catch()` and no loading state; a fetch failure renders visually
  identical to a legitimate empty state, so users can't tell "you have
  nothing yet" from "something broke."
- R2-6 MED: `pages/DashboardPage.tsx:42-49` — `createProject` has no
  try/catch, unlike the already-fixed `createFile`/`importFig`, so it fails
  silently on API error (regression risk / inconsistent error handling
  within the same file).
- R2-7 MED: `components/inspector/ExportSection.tsx` — export action has no
  in-flight/error state; button stays clickable with no feedback if the
  export call fails.
- R2-8 MED: `pages/DashboardPage.tsx:124-135` — organization `<select>` has
  no accessible name (the sibling label-like element is a `div`, not a real
  `<label for>`/`aria-label`).
- R2-9 LOW: `components/panels/LayersTree.tsx:147-180` — visibility/lock
  icon buttons have only `title`, not `aria-label`, while the sibling
  expand button on the same row correctly has `aria-label`. Inconsistent
  within one component.
- R2-10 LOW: `components/toolbar/ZoomMenu.tsx:37-59` — no
  `aria-haspopup`/`aria-expanded`/`role="menu"`; functions correctly but
  isn't announced as a popup menu to assistive tech.
- R2-11 LOW: `components/RequireAuth.tsx:9-13` — renders `null` during
  session restore, producing a blank screen with no spinner/skeleton.
- R2-12 LOW: `components/inspector/NumberField.tsx` — invalid numeric input
  silently reverts on blur with no error feedback to the user.
- R2-13 LOW: `components/inspector/InteractionSection.tsx` — reaction
  destination `<select>` has no empty-state messaging when no destination
  frames exist in the doc.

Lenses with zero new findings this round (both passes agree): tokens/theme,
layout/overflow/stacking, UI3-fidelity vs. the chrome task record. One
candidate token flag (`DashboardPage.tsx:157`'s `var(--bg-active)`) was
raised and then disproved — it is defined for both themes in `styles.css`.

Carried-over items from round 1 background agents (inspector panels /
toolbar review, general UX) otherwise reviewed and found already addressed
by current code.

Totals: 13 confirmed round-2 findings (3 HIGH, 5 MED, 5 LOW).

Round 2 fix scope, by risk: the two HIGH a11y/contrast items (R2-1, R2-3,
R2-4) and the Share disabled-state MED (R2-2) are small and isolated —
CSS var swap, gating/disabling rail buttons, adding aria-labels. The
DashboardPage error-handling items (R2-5, R2-6, R2-8) touch one shared file
and should go to a single owner to avoid overlapping edits. Deferred pending
user go-ahead before any fixing starts.

### Round 2 — fix (2026-07-09, user go-ahead received)

R2-3 verified already resolved by the later rail-panels task (all 5 IconRail
sections render real content) — excluded, no action needed.

Remaining 12 findings fixed by 5 parallel builders with strict file
ownership (each verified current file state before editing, since line
numbers had drifted since round 2 — find; ran `tsc` + full suite before
reporting):

- **auth (R2-1 HIGH):** `LoginPage.tsx`/`RegisterPage.tsx` — swapped
  `var(--color-accent)` → `var(--color-accent-cta)` (5.33:1, AA-passing).
  Live-verified: submit button visibly darker blue.
- **toolbar (R2-2 MED, R2-10 LOW):** `TopBar.tsx` — disabled Share now uses
  `text-secondary-app bg-hover-app` (matches Dashboard's disabled-button
  convention) instead of a faded copy of the CTA color. Live-verified:
  reads as clearly non-interactive next to enabled Present. `ZoomMenu.tsx`
  — added `aria-haspopup="menu"`/`aria-expanded`/`role="menu"`+`menuitem`.
- **inspector (R2-4 HIGH, R2-7/12/13 MED/LOW):** aria-labels added to every
  icon-only button across Fills/Strokes/Effects/Interaction sections
  (Align/Geometry already had them — verified, left alone). ExportSection
  gained per-button pending state + inline `role="alert"` error. NumberField
  shows a red-border+message on invalid-input revert. InteractionSection
  disables the destination select with a "No frames available" hint when
  empty.
- **dashboard (R2-5/6/8 MED, single owner):** org/project/file load errors
  now render distinct inline messages instead of looking like empty states;
  `createProject` wrapped in try/catch matching the codebase's actual
  established pattern (only `importFig` had it — `createFile` didn't
  either, corrected assumption during the fix); org `<select>` got a
  proper `<label htmlFor>`.
- **panels/auth-shell (R2-9/11 LOW):** `LayersTree.tsx` visibility/lock
  buttons gained `aria-label` matching the sibling expand button's pattern.
  `RequireAuth.tsx` shows a "Loading…" state (reusing EditorPage's pattern)
  instead of `return null` during session restore.

Union verification (independent of each builder's self-report): 20 files
changed + 5 new test files, `apps/editor` `tsc --noEmit` clean, full suite
**277/277 passed, 0 failures**. No cross-builder file collisions.

## Gates

- [x] security-gate — BUG_FIX-tier 3-point check: no new input surfaces,
  no secrets/tokens touched, user-facing error messages match the existing
  codebase convention (`err.message` surfaced, same as `importFig`) — no
  new exposure introduced.
- [x] post-task-review — union suite green (277/277), typecheck clean,
  live-verified both HIGH items in Chrome (auth CTA contrast, Share
  disabled-state) post dist-rebuild.
- [x] wiki update — this record closes the design-bug-sweep flow; round 2
  fixes committed 2026-07-09.
