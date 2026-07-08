# .fig file format & import strategy

> Distilled from the deep-research report "Building a Figma Clone the Low-Code Way"
> (`/Users/hardik/Downloads/compass_artifact_wf-55306b6f-acf4-45ac-bef5-18934eb8ade6_text_markdown.md`, ingested 2026-07-06).

## Container format (downloaded "Save local copy…" file)

- Outer container is **ZIP** (`PK` magic); payload entry is `canvas.fig`.
  Older exports may be the raw payload with no ZIP wrapper — detect by magic.
- Payload starts with an **8-byte ASCII magic**: `fig-kiwi` (design),
  `fig-jam.` (FigJam), `fig-deck` (Slides) — followed by little-endian u32
  version (~70+ as of the report).
- Two chunks, each length-prefixed, with **different compression**:
  - Chunk 1 — Kiwi **schema**, zlib/deflate compressed.
  - Chunk 2 — **data message**, Zstandard (magic `28 B5 2F FD`); older files
    used deflate for both → sniff magic, fall back to inflate.
- Decode chunk 1 with a Kiwi codec (`kiwi-schema`, MIT, evanw), then use the
  decoded schema to decode chunk 2. Result: flat `nodeChanges` array +
  `blobs` (vector networks, images). **The tree must be rebuilt** from
  parent references — nodeChanges is not hierarchical.

## Parser landscape (verified by the report)

| Library               | License     | Notes                                                         |
| --------------------- | ----------- | ------------------------------------------------------------- |
| `kiwi-schema` (evanw) | MIT         | Generic Kiwi codec — our chosen foundation                    |
| `fzstd`               | MIT         | Zstd decompress only (fine — we only decode)                  |
| `fflate`              | MIT         | Unzip + inflate (chosen over report's `pako`, same footprint) |
| `@open-pencil/core`   | MIT         | Higher-level tree, but "not ready for production" — rejected  |
| `@grida/refig`        | Apache-2.0  | Renders .fig → images, not a JSON tree                        |
| `fig2sketch` (Sketch) | MIT, Python | Reference implementation / fallback path                      |

## Hard constraints

- **Unstable by design.** Evan Wallace: the format "is not intended to be
  stable"; only the HTTP API and plugin API are. Any Figma release may break
  parsing → the importer must degrade gracefully to a partial-import report,
  never crash the editor or server.
- **Legal/ToS gray zone.** Figma ToS prohibits reverse engineering (EU
  interoperability carve-out exists). Ship labeled **experimental/unofficial**;
  never redistribute Figma's schema or proprietary assets. Get legal advice
  before public launch.
- **Coverage gaps expected:** embedded images (blobs), font resolution,
  components/variants, prototyping, auto-layout fidelity.

## openmake decisions (2026-07-06)

- Parser lives in `packages/figma-importer` next to the existing REST-JSON
  importer, sharing `ImportResult`/`ImportIssue` so both paths report
  partial-import issues uniformly.
- Upload endpoint is isolated in `apps/server` (auth + tenant-scoped, size
  caps, zip-bomb guard) so format breakage never takes down editing.
- Test fixtures are **synthetic** (built in-test with `kiwi-schema` encode +
  Node `zlib.zstdCompressSync`/`deflateSync`) — no real Figma files committed.

## As built (2026-07-07)

- `parseFigFile(bytes): ImportResult` in `packages/figma-importer/src/fig/`
  (container.ts / kiwi.ts / mapper.ts) — never throws; issues carry kebab-case
  codes; single-DOCUMENT root (deliberate divergence from the REST importer's
  double-DOCUMENT quirk).
- Parsing happens **client-side** in the dashboard (dynamic import keeps the
  codecs out of the initial bundle); server endpoint
  `POST /projects/:id/files/import` accepts validated DocumentData JSON only.
- DoS hardening (all regression-tested): 256 MiB streaming decompression
  budget with 64 KiB deflate slices, zstd frame-header declared-size rejection
  (fzstd pre-allocates its window before any output callback), pre-decode
  Kiwi bounds scan capping nodeChanges at 100k with an op budget against
  zero-byte-per-entry amplification, server-side node/entry caps.
- Known limits: gradients/images/vector-networks/booleans dropped with issues
  (compatibilityMatrix is the honesty table); INSTANCE → FRAME placeholder;
  kiwi-schema codegen needs CSP 'unsafe-eval' (degrades to a typed error
  under strict CSP); no real-.fig smoke test yet — synthetic fixtures only.

Related: [[architecture]], [[decisions]], [[api-contracts]], task record
`docs/keys/tasks/2026-07-06-fig-import-and-ui3-chrome.md`.
