# Research: Google Antigravity CLI (`agy`)

- **Date:** 2026-07-10
- **Method:** web search + WebFetch (product/docs pages are JS SPAs — used GitHub repo + community cheat sheet + tutorial for concrete detail)
- **Why:** user asked whether/how `agy` could help build the openmake figma clone.

## What it is

Google's official terminal coding agent, invoked as **`agy`** — a single compiled binary (no Node/Python runtime) that reads a codebase, makes permissioned edits, and runs commands from the terminal. Structurally it is a near-twin of the Claude Code environment openmake is being built in. **Successor to Gemini CLI** (replacement announced 2026-05-19; Gemini CLI retired 2026-06-18). Ships **eight models behind one command**: Gemini 3.x family, Claude Sonnet 4.6, Claude Opus 4.6, GPT-OSS 120B.

## Install & launch

```bash
# macOS/Linux
curl -fsSL https://antigravity.google/cli/install.sh | bash
agy                 # interactive session
agy "prompt"        # session seeded with context
agy -p "prompt"     # headless one-shot (CI/scripts; ~5-min default timeout)
```

Auth via system keyring / Google Sign-In (prints an auth URL over SSH).

## Command surface (summary — categories, not the full ~105-command list)

- **Session:** `agy`, `agy "…"`, `agy -p "…"` (non-interactive); persistent history; export session to the Antigravity 2.0 GUI.
- **Models/modes:** `--model gemini-3-pro` / `/model`; `--mode standard|accept-edits|plan`, Shift+Tab to cycle.
- **Workspace:** `--project`, `--new-project`, `/add-dir`.
- **Permissions:** `/permissions` presets ("request-review" default → "always-proceed"); `--dangerously-skip-permissions`.
- **Extensibility:** `/mcp` (MCP server manager), `/skills`, `agy plugin install/list/enable/disable`, `/config` (alias `/settings`).

## Assessment for openmake

`agy` is a **general coding agent, not a design/Figma tool** — there is no "add agy as a feature of openmake." Two real relationships:

1. **Alternative builder.** Could develop openmake instead of / alongside Claude Code (it bundles Claude + Gemini in one binary). Trade-off: switching mid-project loses accumulated session context/memory; benefit: model choice in one CLI. **No compelling reason to switch mid-effort.**
2. **`agy` as an MCP client of openmake (the interesting one).** openmake already ships its own **MCP server (19 design tools)**. `agy`'s `/mcp` manager could connect to it and generate/inspect designs through it — exactly how the Figma MCP is driven here. This is the only genuine intersection: **openmake as a design backend consumable by any agent CLI**, which validates the AI-first / MCP-exposed architecture already built — not new work.

**Recommendation:** no adoption of `agy` for building openmake right now. Keep idea #2 as architectural validation.

## Sources

- https://github.com/google-antigravity/antigravity-cli
- https://antigravity.google/product/antigravity-cli
- https://toolsbase.dev/en/reference/antigravity-cli-commands
- https://medium.com/google-cloud/antigravity-cli-tutorial-series-12b46cfe3bf2
