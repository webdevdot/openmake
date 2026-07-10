import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { initLayout } from '@openmake/layout';
import { useCollab } from '../hooks/useCollab.js';
import { useDocVersion } from '../hooks/document.js';
import { useAutoLayout } from '../hooks/useAutoLayout.js';
import { useAwareness } from '../hooks/useAwareness.js';
import { useUrlSync } from '../hooks/useUrlSync.js';
import { useSelectionStore } from '../store/selection.js';
import { useToolStore } from '../store/tool.js';
import { useCommentsStore } from '../store/comments.js';
import { useCameraStore } from '../store/camera.js';
import { useImageStore } from '../store/images.js';
import { clampZoom, screenToWorld, zoomByFactor } from '../canvas/camera.js';
import { resolveShortcut } from '../lib/shortcuts.js';
import { duplicateOffset } from '../lib/duplicate.js';
import { exportNodePNG, exportNodeSVG } from '../lib/nodeExport.js';
import { loadEditorFonts } from '../canvas/fonts.js';
import { TopBar } from '../components/toolbar/TopBar.js';
import { BottomToolbar } from '../components/toolbar/BottomToolbar.js';
import { CommentsPanel } from '../components/canvas/CommentsPanel.js';
import { LeftPanel } from '../components/panels/LeftPanel.js';
import { Inspector } from '../components/inspector/Inspector.js';
import { Canvas } from '../components/canvas/Canvas.js';
import { PresentOverlay } from '../components/canvas/PresentOverlay.js';
import { TimelinePanel } from '../components/timeline/TimelinePanel.js';

export function EditorPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const session = useCollab(fileId ?? 'unknown');
  const [layoutReady, setLayoutReady] = useState(false);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [presenting, setPresenting] = useState<string | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  const tool = useToolStore((s) => s.tool);

  useEffect(() => {
    void initLayout().then(() => setLayoutReady(true));
    void loadEditorFonts();
  }, []);

  // Comments are server data (not in the Y.Doc): fetch on file open, clear on
  // unmount / file switch. Optimistic mutations keep the local store in sync.
  useEffect(() => {
    if (!fileId) return;
    void useCommentsStore.getState().load(fileId);
    return () => useCommentsStore.getState().reset();
  }, [fileId]);

  // Re-evaluated on every doc change: when opening an existing file the pages
  // only exist after the first sync message lands, not when the session mounts.
  const docVersion = useDocVersion(session?.doc);
  useEffect(() => {
    if (session && !activePageId) {
      setActivePageId(session.doc.getPages()[0] ?? null);
    }
  }, [session, activePageId, docVersion]);

  useAutoLayout(session?.doc, session && layoutReady ? activePageId : null);
  const { onPointerMoveWorld } = useAwareness(session?.client ?? null);

  // URL <-> editor-state sync (slug canonicalization, ?node-id deep link,
  // ?page). Owns all search-param read/write; gated on the doc having content.
  useUrlSync({
    session,
    activePageId,
    setActivePageId,
    getViewport: () => ({
      width: canvasWrapRef.current?.clientWidth ?? window.innerWidth,
      height: canvasWrapRef.current?.clientHeight ?? window.innerHeight,
    }),
  });

  // Timeline dock: visible only when a single node is selected AND it has an
  // animation. `docVersion` re-reads keep the node snapshot (and thus its
  // animation) fresh; `selectedIds` re-renders on selection changes.
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const timelineNode =
    session && selectedIds.length === 1 ? (session.doc.getNode(selectedIds[0]!) ?? null) : null;
  const timelineTarget = timelineNode?.animation ? timelineNode : null;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const action = resolveShortcut(e);
      if (!action || !session) return;
      const { doc } = session;
      const selection = useSelectionStore.getState().selectedIds;

      switch (action.type) {
        case 'tool':
          useToolStore.getState().setTool(action.tool);
          break;
        case 'undo':
          e.preventDefault();
          doc.undo();
          break;
        case 'redo':
          e.preventDefault();
          doc.redo();
          break;
        case 'delete':
          for (const id of selection) doc.deleteNode(id);
          doc.commitUndoGroup();
          useSelectionStore.getState().clear();
          break;
        case 'duplicate': {
          e.preventDefault();
          const newIds: string[] = [];
          for (const id of selection) {
            const node = doc.getNode(id);
            if (!node) continue;
            const parentId = doc.getParentId(id);
            if (!parentId) continue;
            const offset = duplicateOffset(node);
            const {
              id: _ignored,
              children: _c,
              ...rest
            } = node as unknown as Record<string, unknown>;
            void _ignored;
            void _c;
            const newId = doc.createNode({
              ...rest,
              type: node.type,
              parentId,
              x: offset.x,
              y: offset.y,
            } as never);
            newIds.push(newId);
          }
          doc.commitUndoGroup();
          if (newIds.length > 0) useSelectionStore.getState().set(newIds);
          break;
        }
        case 'deselect':
          useSelectionStore.getState().clear();
          break;
        case 'zoom-in':
        case 'zoom-out': {
          // Anchor at the canvas viewport center so the view zooms in place.
          const wrap = canvasWrapRef.current;
          const anchor = { x: (wrap?.clientWidth ?? 0) / 2, y: (wrap?.clientHeight ?? 0) / 2 };
          const cameraStore = useCameraStore.getState();
          cameraStore.setCamera(
            zoomByFactor(cameraStore.camera, anchor, action.type === 'zoom-in' ? 1.25 : 0.8),
          );
          break;
        }
        case 'zoom-reset': {
          // Matches ZoomMenu's reset: zoom back to 100%, keep the pan.
          const cameraStore = useCameraStore.getState();
          cameraStore.setCamera({ ...cameraStore.camera, zoom: clampZoom(1) });
          break;
        }
        case 'nudge':
          for (const id of selection) {
            const node = doc.getNode(id);
            if (!node) continue;
            doc.updateNode(id, { x: node.x + action.dx, y: node.y + action.dy });
          }
          doc.commitUndoGroup();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [session]);

  const handleExportPNG = async (nodeId: string, scale: 1 | 2) => {
    if (!session || !activePageId) return;
    await exportNodePNG(session.doc, activePageId, nodeId, scale);
  };

  const handleExportSVG = (nodeId: string) => {
    if (!session || !activePageId) return;
    exportNodeSVG(session.doc, activePageId, nodeId);
  };

  // World-space center of the current viewport — where the Assets panel drops
  // new instances so they land in view regardless of pan/zoom.
  const getViewportCenter = () => {
    const wrap = canvasWrapRef.current;
    const width = wrap?.clientWidth ?? window.innerWidth;
    const height = wrap?.clientHeight ?? window.innerHeight;
    return screenToWorld(useCameraStore.getState().camera, { x: width / 2, y: height / 2 });
  };

  const canvasEl = useMemo(() => {
    if (!session || !activePageId) return null;
    return (
      <Canvas
        doc={session.doc}
        pageId={activePageId}
        fileId={fileId ?? ''}
        onCursorMoveWorld={onPointerMoveWorld}
      />
    );
  }, [session, activePageId, fileId, onPointerMoveWorld]);

  if (!session || !activePageId) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-secondary-app">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-canvas-app">
      <TopBar
        doc={session.doc}
        status={session.status}
        onExportPNG={() => {
          const [id] = useSelectionStore.getState().selectedIds;
          if (id) void handleExportPNG(id, 1);
          else window.alert('Select a layer to export');
        }}
        onExportSVG={() => {
          const [id] = useSelectionStore.getState().selectedIds;
          if (id) handleExportSVG(id);
          else window.alert('Select a layer to export');
        }}
        onPresent={() => {
          const pageFrameIds = session.doc
            .getChildrenIds(activePageId)
            .filter((id) => session.doc.getNode(id)?.type === 'FRAME');
          if (pageFrameIds[0]) setPresenting(pageFrameIds[0]);
          else window.alert('Add a frame to present');
        }}
      />
      <div className="flex flex-1 overflow-hidden">
        <LeftPanel
          doc={session.doc}
          fileId={fileId ?? ''}
          activePageId={activePageId}
          onSelectPage={setActivePageId}
          getViewportCenter={getViewportCenter}
          onExportPNG={handleExportPNG}
          onExportSVG={handleExportSVG}
        />
        {/* Canvas column: the canvas area (with its floating pill toolbar)
            stacked above the full-width timeline dock. The relative wrapper
            keeps the BottomToolbar pill centered over the canvas only, and
            Canvas's own flex-1 root stretches to fill it. */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div ref={canvasWrapRef} className="relative flex flex-1 overflow-hidden">
            {canvasEl}
            <BottomToolbar />
            {tool === 'comment' && <CommentsPanel />}
          </div>
          {timelineTarget && <TimelinePanel doc={session.doc} node={timelineTarget} />}
        </div>
        <Inspector
          doc={session.doc}
          pageId={activePageId}
          onExportPNG={handleExportPNG}
          onExportSVG={handleExportSVG}
        />
      </div>
      {presenting && (
        <PresentOverlay
          doc={session.doc}
          pageId={activePageId}
          startFrameId={presenting}
          onExit={() => setPresenting(null)}
          images={useImageStore.getState().images}
        />
      )}
    </div>
  );
}
