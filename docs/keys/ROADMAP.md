# openmake — Product Roadmap (Now / Next / Later)

*Drafted 2026-07-09 via the product-manager flow; every factual claim below was verified against task records (git history), the wiki, and the original spec by a 3-reader fact-gathering pass — not recalled from memory.*

## Roadmap narrative

openmake's goal is **Figma-parity for a self-hosted, AI-first design platform**. Phases 1–3 of the spec's MVP roadmap (core editor, collaboration, design systems) are shipped and verified, plus Motion v1, UI3 chrome, deep-link routing, all five rail panels, variables with aliasing, and dashboard parity — 531 tests green across 8 packages at last union. The strategy for the next cycle is **consolidation before expansion**: close the gaps that silently lose user data or trust (image persistence, the input-dropping papercut, accessibility HIGHs already found and confirmed), then unlock the two features whose backends already exist but have no UI (comments, version history) — the cheapest remaining wins — before opening the genuinely new fronts (prototyping, dev-mode inspect, plugins).

## NOW (current cycle — capped at 4; capacity is one owner + agent orchestration, so the cap is deliberate)

| # | What | Why now | Success signal |
|---|---|---|---|
| 1 | **Image server upload (MinIO)** | The one place data is genuinely not stored: image bytes live only in browser memory; reload = pixel-less nodes, collaborators never see images. MinIO already provisioned, unused. | Place image → reload → renders; second browser sees it. |
| 2 | **First-click/hydration papercut fix** | Escalated from cosmetic to harmful: a hydration-window click silently created doc state during verification (recorded 2026-07-08). Every live check pays a retry tax. | 20 consecutive cold-load first-clicks register correctly; no stray mutations. |
| 3 | **Bug-sweep round-2 fixes** | 13 confirmed findings (3 HIGH incl. WCAG-AA contrast fails on Login/Register CTAs) have sat "deferred pending user go-ahead" since 2026-07-07. One HIGH (dead rail items) was since fixed; the rest are open. | R2 list re-verified item-by-item; gates checked in the record. |
| 4 | **Docs/wiki hygiene** | Fact-check found real drift: ADR-10 still lists Motion as deferred though it shipped; 2 task records have all gates unchecked; 1 paused task (vector/pen) never closed. Cheap, protects every future decision made from these docs. | ADRs match reality; no open-ended records. |

**Follow-through note (per roadmap discipline):** recent launches (variables aliasing, dashboard thumbnails, Figma-MCP screens) shipped without usage instrumentation — acceptable while the user base is the builder, revisit when there are external users.

## NEXT (planned, medium confidence — each has an entry criterion, not a date)

- **Comments UI** — *backend + REST already shipped and tested (2026-07-05); UI explicitly deferred in ADR-10.* Entry: after Now #2 (clean input handling matters for pin-placement clicks).
- **Version history UI** — *DocUpdate/DocSnapshot log + compaction already persists everything needed.* Entry: after docs hygiene confirms the persistence contract docs are current.
- **Pen tool / vector editing completion** — the 2026-07-06 task is paused-not-abandoned with plan written (anchors, bezier handles, boolean ops). Entry: owner decision that editor depth beats new surfaces this cycle.
- **Dev Mode slice 1: inspect panel + redlines** — codegen exists; the visual inspect surface doesn't. Entry: after comments UI (shares the selection/overlay plumbing).
- **Prototyping phase 4 (triggers/actions/navigate/overlays)** — biggest spec phase fully unbuilt; the Prototype tab is a live placeholder today. Entry: needs its own brainstorm/design pass (data model has no Interaction entities yet).
- **Figma-file icon fidelity** — swap the placeholder squares in the "openmake — UI screens" Figma file for real lucide vectors via `use_figma`. Small; batch with any Figma-MCP session.

## LATER (directional bets, explicitly low-commitment, no dates)

- Plugin runtime + registry (SDK types shipped; sandbox execution is the hard part)
- Guest links / sharing beyond org roles; seat types
- FigJam / Slides / Sites modules (whole-module bets; spec §1)
- Desktop (Tauri) and mobile targets
- Branching & merging; design-system analytics
- Prompt-to-app ("Make") on top of the existing Skills/Agents/Workflows engine
- Enterprise: SSO/SCIM, admin console, billing tiers, compliance (SOC 2/GDPR)

## Explicitly NOT doing (the anti-roadmap)

- **Enterprise tier work** (SSO, SCIM, billing, audit UI) — no external customers exist to justify it; revisit on first real org adoption. *(Assumption below.)*
- **Weave / 3D / generative image AI** — Figma itself ships 3D as "coming soon"; ADR-10 deferral stands.
- **Deep .fig import fidelity push** — format is undocumented and unstable by design, ToS gray zone; keep it labeled experimental, fix only breakage.
- **Native integrations (Slack/Jira/etc.)** — zero pull until there are collaborating users.

## Risks & dependencies

- **Single-owner capacity with agent orchestration** — Now is capped at 4 for this reason; wall-clock per feature-pair has run 6–18 min of agent time plus review, but review/merge attention is the true bottleneck (two real cross-agent integration breaks were caught only by union testing — 2026-07-08 records).
- **Verification tooling risk** — rtk has misreported test output (3 documented cases); union suites must run per-package with tee-log ground truth.
- **`.fig` importer** can break on any Figma release (undocumented format) — treat breakage as expected maintenance, not regression.
- **Stale-build/stale-session traps** (`vite preview` serving old dist; pre-merge SPA tabs) have repeatedly produced false "still broken" readings — rebuild-first rule is documented and must stay in the loop.
- **Dependency:** comments/version-history UIs depend on existing backend contracts staying stable through docs-hygiene pass.

## Known facts / Assumptions / Open questions

**Known facts** (all verified against records this session):
- Spec phases 1–3 + Motion + chrome/routing + rail panels + variables aliasing + dashboard parity shipped; last union: 531 tests green across 8 packages; `main` == `origin/main` at `5647e1f`.
- Comments and version-history **backends** exist with tests; their UIs do not.
- Image bytes are not persisted server-side; everything else user-visible lives in Postgres (doc snapshots/updates + 21-model metadata).
- 13 confirmed bug-sweep R2 findings (3 HIGH) remain unfixed; 3 task records were left open/unclosed; ADR-10 contradicts shipped Motion.
- 11 of 12 task records are currently deleted in the working tree (uncommitted); remote copies intact.

**Assumptions** (validate before acting on them):
- No external users/customers yet — justifies deprioritizing enterprise, instrumentation, and integrations.
- The owner's goal remains breadth-parity with Figma rather than depth in one module.
- Agent-orchestrated capacity continues (~2–3 features per cycle sustainable).

**Open questions:**
1. Were the 11 task-record deletions intentional (declutter) or accidental? Restore vs. commit-the-deletion changes docs-hygiene scope.
2. Round-2 bug-sweep fixes have been "pending user go-ahead" since 07-07 — is that go-ahead now given (they're slotted as Now #3)?
3. Who is the first external user persona (self-hosters? a design team?) — determines whether Next favors comments (collaboration) or pen/vector (single-player depth).
4. Deployment target for a first release (docker-compose self-host only, or a hosted demo?) — affects whether hardening/e2e-rate-limit issues enter Now.
