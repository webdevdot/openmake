# Vector editing tools (pen tool, boolean ops, polygon/star)

- **Flow:** FEATURE
- **Started:** 2026-07-06
- **Status:** in-progress

## Goal

Bring openmake's editor closer to Figma parity in its core drawing toolkit.
Scope agreed with user via brainstorm (2026-07-06):

- **Priority:** vector editing (pen tool, editable paths, boolean operations,
  polygon/star shapes) over components/styles or pure visual polish.
- **Size:** one focused feature end-to-end (not a multi-feature sprint).

## Why this scope

`packages/shared` already defines `POLYGON`, `STAR`, and `VECTOR` node types
and `packages/renderer` already draws all three (`geometry.ts`,
`renderer.ts`). But nothing in the editor creates them, hit-tests them
correctly, or lets a user edit a VECTOR node's path — and there are no
boolean operations (union/subtract/intersect/exclude) anywhere in the stack.
This is the highest-leverage gap versus "Figma, all editor features."

## Architecture plan (cloudkey:architect, 2026-07-06)

Decisions confirmed with user:

- Boolean ops live in `packages/renderer/src/boolean-ops.ts` (uses
  `Path.MakeFromOp`/`PathOp`, already in canvaskit-wasm 0.41.1). `packages/core`
  stays CanvasKit-free — editor calls the renderer's async boolean-op fn.
- Boolean op result is a flattened `VECTOR` node (no live/parametric boolean
  group node type). Matches original scope.

Build order (each slice independently shippable + tested):

1. **Shared vertex math + hit-testing fix.** Move `regularPolygonPoints`/
   `starPoints` point-generation (pure math, no CanvasKit calls) from
   `packages/renderer/src/geometry.ts` into `packages/core` so both hit-testing
   and rendering use the same formula. Extend `hitsOwnGeometry` in
   `packages/core/src/geometry.ts` with point-in-polygon tests for
   POLYGON/STAR (VECTOR precise hit-test deferred until the path anchor model
   in step 3 exists — bbox fallback stays for VECTOR until then).
2. **Polygon & star tools.** Add `polygon`/`star` to `ToolId`
   (`apps/editor/src/store/tool.ts`), `TOOL_TO_NODE_TYPE`
   (`useCreateShapeGesture.ts`) — same drag-to-create as rectangle. Toolbar
   buttons. Inspector: pointCount (polygon+star) and innerRadius (star) fields,
   likely a new `PolygonSection.tsx`/extending `GeometrySection.tsx`.
3. **Pen tool + path data model.** New `packages/core/src/vector-path.ts`:
   `{anchors: {point, handleIn?, handleOut?}[], closed: boolean}` model with
   serialize/parse to SVG path string (shared syntax contract between core and
   renderer). New `usePenToolGesture.ts` hook (click=anchor, drag=handles,
   click-first-point or Enter/double-click=close), modeled on
   `useCreateShapeGesture.ts`'s `{onPointerDown, onPointerMove, onPointerUp}`.
   Overlay component for anchor/handle rendering, modeled on
   `OverlayLayer.tsx`'s `startResizeDrag` imperative drag pattern.
4. **Path editing on existing VECTOR nodes.** Double-click enters edit mode;
   drag anchor/handle updates `path` string via the step-3 serializer, one
   `doc.updateNode` per move + `commitUndoGroup()` on release (matches
   `handles.ts` pattern exactly).
5. **Boolean operations.** `packages/renderer/src/boolean-ops.ts`: async fn
   taking 2+ SceneNodes + op type (`UNION`/`SUBTRACT`/`INTERSECT`/`EXCLUDE`),
   returns an SVG path string via `Path.MakeFromOp`. Editor wires a toolbar
   action (visible when 2+ shape nodes selected) that calls this, then
   `doc.createNode({type:'VECTOR', path: result, ...})` + deletes source nodes
   in one transaction.

Test split: pure math (vertex generation, path serialize/parse, point-in-polygon
hit test, pen tool state machine) → plain unit tests, no CanvasKit. Boolean ops
and path rendering → existing CanvasKit-backed renderer test harness
(offscreen surface, per `renderer.test.ts` conventions).

Open product calls made pragmatically (not worth re-blocking on): boolean-op
operand order = selection order (first selected = base for
subtract/exclude, matches Figma's "bottom object" convention when read
top-to-bottom in z-order); toolbar gets plain always-visible buttons for
polygon/star/pen (repo's toolbar has no flyout menu today, consistent with
existing rectangle/ellipse/line buttons).

## Gates

- [ ] security-gate
- [ ] post-task-review
- [ ] wiki update (architecture.md + decisions.md if new ADR-worthy calls made)
