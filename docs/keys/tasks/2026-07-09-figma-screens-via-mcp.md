# Figma screens of the clone, authored via the official Figma MCP

- **Flow:** FEATURE (design artifact; ultracode workflow `wf_070d7662-42a`)
- **Date:** 2026-07-09
- **Status:** delivered + independently verified

## What

New Figma draft file **"openmake — UI screens"** — https://www.figma.com/design/PMloOsqedH896CVnQ83avE — with five 1440×900 frames of the clone's real UI: 01 Editor, 02 Dashboard, 03 Variables, 04 Timeline, 05 Present.

## How

- Figma MCP (`plugin:keys:figma`, mcp.figma.com) — was configured only for the /Users/hardik/Developer project scope; user enabled it for this session via the keys plugin. `whoami`: Hardik Dholariya (Webcloudkey), starter tier, View team seat → writes constrained to drafts.
- Orchestration: 5 parallel Sonnet spec-extractors read the actual components + Tailwind tokens (px widths, hex colors, lucide names, real sample content) → 1 serialized Opus author loaded the MCP's mandatory figma-generate-design/figma-use skills, created the file, generated frames sequentially, self-verified each via get_screenshot (02 Dashboard needed one corrective retry for header overlap).
- Independent check: opened the file in the user's Chrome, zoom-to-fit — all 5 frames present and correct.
- Honest limitation (stated by author): static mockups; lucide glyphs are placeholder squares, not vector icons.
- 6 agents, 0 errors, ~437k subagent tokens, ~8.8 min.

## Gates

- [x] security-gate (writes only to a NEW draft file; existing files untouched; no secrets; MCP OAuth is user-held)
- [x] post-task-review (per-frame verification by author + independent browser check)
- [x] wiki close (this record)
