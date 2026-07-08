# Variables table editor + aliasing / Dashboard parity

- **Flow:** FEATURE ×2 (ultracode workflow `wf_9d319bca-d3c`, 2 Opus 4.8 agents in isolated worktrees; designs pinned by Fable 5 from live Figma screenshots)
- **Date:** 2026-07-08
- **Status:** merged to main, both verified live

## Delivered

### Variables table + aliasing (task #13, feat/variables-table-aliasing)
- Schema: valuesByMode entries are now scalar OR `{ alias: variableId }` (strict single-key zod union) + isVariableAlias helper.
- Core: resolveVariableValue follows alias chains with visited-set cycle guard; 2nd param is `modeId | modesByCollection` union (legacy callers keep working); setVariableAlias (rejects self/cycle); wouldCreateAliasCycle exposed for the UI picker.
- Editor: buildVariableColors threads the full active-mode map; VariablesPanel replaced by a wide (720px) Figma-parity table — collections w/ counts, slash-prefix Groups (+All), Name + per-mode columns (add/rename/guarded-remove), typed value cells, alias chips w/ unlink, cycle-filtered alias picker, search, create-variable type row.
- Verified live: collection + COLOR variable row with swatch/hex/alias-link affordances; cascade delete restores empty state.

### Dashboard parity (task #14, feat/dashboard-parity)
- Server: GET /projects/:id/files?deleted=1 + POST /files/:id/restore (existing permission/audit patterns; tests). Soft-delete finally has list+recover (spec §9.3).
- Editor: useFileThumbnail — snapshot fetch → OpenDoc hydrate → offscreen CanvasKit render (~320px), object-URL cache keyed fileId+updatedAt, 3-concurrent FIFO cap, shimmer/fallback, URL revocation. FileCard grid/list; Recents (client-side cross-project merge, cap 20); Trash w/ Restore; name search; sort filter; grid/list toggle in localStorage.
- Verified live: real rendered thumbnail of the actual canvas on the file card; Recents/Trash nav; search; Grid|List; per-card Trash; Import/New disabled outside project views.
- Out of scope (stated): AI prompt bar, Starred (no model field), Drafts, theme.

## Verification

- Union: ALL 8 packages green — shared 10, core 131, renderer 28, codegen 23, ai 28, database 24, server 35, editor 252 (531 total); 8 typechecks clean; build ✓. (Server/database suites ran against live Postgres :5433.)
- Merges clean (no conflicts — near-disjoint footprints).
- Live checks done post dist-rebuild in Chrome; test mutations cleaned via the panel's own delete (cascade verified as a side effect).

## Notes

- Hydration-window clicks can land on stale UI and mutate (a collection got created during the first-click papercut window) — the papercut is now actively costing verification time; worth fixing (task candidate).
- Server on :8080 runs from source watch; new trash routes worked without manual restart.

## Gates

- [x] security-gate (new routes follow existing authz exactly — EDITOR+ writes, non-member 404, audited restore; thumbnails render client-side from an already-authed endpoint; no new key material)
- [x] post-task-review (531-test union green, live verification of both features, honest scope statements)
- [x] wiki close (this record)
