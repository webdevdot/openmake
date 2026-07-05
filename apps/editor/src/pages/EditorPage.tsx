import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { initLayout } from '@openmake/layout';
import { createCanvasKitRenderer, buildRenderScene, exportSVG } from '@openmake/renderer';
import { useCollab } from '../hooks/useCollab.js';
import { useAutoLayout } from '../hooks/useAutoLayout.js';
import { useAwareness } from '../hooks/useAwareness.js';
import { useSelectionStore } from '../store/selection.js';
import { useToolStore } from '../store/tool.js';
import { resolveShortcut } from '../lib/shortcuts.js';
import { duplicateOffset } from '../lib/duplicate.js';
import { downloadBytes, downloadText } from '../lib/export.js';
import { loadEditorFonts } from '../canvas/fonts.js';
import { Toolbar } from '../components/toolbar/Toolbar.js';
import { LeftPanel } from '../components/panels/LeftPanel.js';
import { Inspector } from '../components/inspector/Inspector.js';
import { Canvas } from '../components/canvas/Canvas.js';
import { PresentOverlay } from '../components/canvas/PresentOverlay.js';

export function EditorPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const session = useCollab(fileId ?? 'unknown');
  const [layoutReady, setLayoutReady] = useState(false);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [presenting, setPresenting] = useState<string | null>(null);

  useEffect(() => {
    void initLayout().then(() => setLayoutReady(true));
    void loadEditorFonts();
  }, []);

  useEffect(() => {
    if (session && !activePageId) {
      setActivePageId(session.doc.getPages()[0] ?? null);
    }
  }, [session, activePageId]);

  useAutoLayout(session?.doc as never, session && layoutReady ? activePageId : null);
  const { onPointerMoveWorld } = useAwareness(session?.client ?? null);

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
            const { id: _ignored, children: _c, ...rest } = node as unknown as Record<string, unknown>;
            void _ignored;
            void _c;
            const newId = doc.createNode({ ...rest, type: node.type, parentId, x: offset.x, y: offset.y } as never);
            newIds.push(newId);
          }
          doc.commitUndoGroup();
          if (newIds.length > 0) useSelectionStore.getState().set(newIds);
          break;
        }
        case 'deselect':
          useSelectionStore.getState().clear();
          break;
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
    const renderer = await createCanvasKitRenderer({ surface: 'offscreen' });
    const scene = buildRenderScene(session.doc, activePageId);
    const bytes = await renderer.exportPNG(scene, { nodeId, scale });
    downloadBytes(bytes, `${session.doc.getNode(nodeId)?.name ?? 'export'}.png`, 'image/png');
    renderer.dispose();
  };

  const handleExportSVG = (nodeId: string) => {
    if (!session || !activePageId) return;
    const scene = buildRenderScene(session.doc, activePageId);
    const svg = exportSVG(scene, { nodeId });
    downloadText(svg, `${session.doc.getNode(nodeId)?.name ?? 'export'}.svg`, 'image/svg+xml');
  };

  const canvasEl = useMemo(() => {
    if (!session || !activePageId) return null;
    return <Canvas doc={session.doc} pageId={activePageId} onCursorMoveWorld={onPointerMoveWorld} />;
  }, [session, activePageId, onPointerMoveWorld]);

  if (!session || !activePageId) {
    return <div className="flex h-full items-center justify-center text-xs text-secondary-app">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col bg-canvas-app">
      <Toolbar
        doc={session.doc}
        status={session.status}
        onExportPNG={() => {
          const [id] = useSelectionStore.getState().selectedIds;
          if (id) void handleExportPNG(id, 1);
        }}
        onExportSVG={() => {
          const [id] = useSelectionStore.getState().selectedIds;
          if (id) handleExportSVG(id);
        }}
        onPresent={() => {
          const pageFrameIds = session.doc.getChildrenIds(activePageId).filter((id) => session.doc.getNode(id)?.type === 'FRAME');
          if (pageFrameIds[0]) setPresenting(pageFrameIds[0]);
        }}
      />
      <div className="flex flex-1 overflow-hidden">
        <LeftPanel doc={session.doc} activePageId={activePageId} onSelectPage={setActivePageId} />
        {canvasEl}
        <Inspector doc={session.doc} pageId={activePageId} onExportPNG={handleExportPNG} onExportSVG={handleExportSVG} />
      </div>
      {presenting && (
        <PresentOverlay doc={session.doc} pageId={activePageId} startFrameId={presenting} onExit={() => setPresenting(null)} />
      )}
    </div>
  );
}
