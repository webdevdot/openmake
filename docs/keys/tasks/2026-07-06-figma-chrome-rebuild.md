# Rebuild editor chrome to match real Figma layout

- **Flow:** FEATURE
- **Started:** 2026-07-06
- **Status:** done — completed under 2026-07-06-fig-import-and-ui3-chrome.md
  (TopBar/BottomToolbar wired into EditorPage, old Toolbar deleted, gates
  passed there; see that record's Outcome section)
- **Supersedes-priority-of:** 2026-07-06-vector-editing-tools.md (paused, not abandoned — resume after this)

## Goal

User shared a screenshot of the real Figma editor (Polaris UI Kit file) and
asked to match its layout closely. Scope agreed via brainstorm:

- **Fidelity:** full layout rebuild, not just toolbar or icon polish.
- **Icons:** lucide-react (new dependency in apps/editor).

## Reference (from screenshot)

- **Top bar:** file icon, "Polaris UI Kit - Comm…" title, Drafts/Free badges,
  Design/Prototype tabs (top-right cluster), zoom %, avatar, Share button.
- **Left icon rail** (leftmost, ~56px, icon-only, vertical): File, Agents,
  Assets, Tools, Variables — each with icon + tiny label underneath.
- **Left panel** (next to rail): Pages list with search, then a flat list of
  page-like items (Actions, Feedback), then Layers tree for the active page.
- **Canvas:** page label chip top-left ("☐ Cover"), gray canvas background.
- **Right panel:** Page background color swatch + opacity, Styles section
  (Text styles: Heading/TextLg/TextMd/TextSm/TextXs), Export section (+ icon).
- **Floating bottom toolbar:** pill-shaped, centered, dark, icon buttons:
  select (cursor), frame, shape (rectangle, has dropdown chevron), pen
  (vector), text (T), comment (speech bubble), more/library (shapes icon),
  then a separated cluster: audio/actions icons, dev-mode toggle, code icon,
  help (?).

## Current openmake chrome (before this task)

- `EditorPage.tsx`: flex-col with Toolbar (full-width top bar) then
  flex-row of LeftPanel / Canvas / Inspector.
- `Toolbar.tsx`: single horizontal bar, text-label buttons (not icons),
  combines tool selection + undo/redo + zoom + collab status + export +
  present + share all in one row.
- `LeftPanel.tsx`: just PagesList + LayersTree, no icon rail.
- `Inspector.tsx`: per-node-type sections, no page-level background/styles
  view when nothing is selected (shows "Select a layer" placeholder instead).
- No icon library in apps/editor's package.json.

## Plan

1. Add `lucide-react` to `apps/editor`.
2. New `IconRail.tsx` (left vertical icon rail: File/Agents/Assets/Tools/
   Variables) — File is the only one with real behavior today (opens
   LeftPanel content); others can be inert/disabled placeholders per scope
   (this is a visual chrome match, not a request to build Agents/Assets/
   Variables features).
3. Split top `Toolbar.tsx` into a slim top bar (title, Design/Prototype tabs,
   zoom, share, present) — move tool selection OUT into a new floating
   `BottomToolbar.tsx` (pill-shaped, centered, icon buttons via lucide-react,
   fixed/absolute positioned over the canvas).
4. Right panel: when selection is empty, show page-level Background +
   Styles (reuse/extend existing StyleSchema-backed styles list) instead of
   the current plain placeholder text.
5. Restyle to dark toolbar/rail chrome matching screenshot's near-black
   panels vs. existing lighter theme — check styles.css tokens first.

## Gates

- [ ] security-gate
- [ ] post-task-review
- [ ] wiki update
