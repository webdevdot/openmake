import type { OpenDoc } from '@openmake/core';
import { useDocVersion } from '../../hooks/document.js';
import { useSelectionStore } from '../../store/selection.js';
import { AlignSection } from './AlignSection.js';
import { GeometrySection } from './GeometrySection.js';
import { FillsSection } from './FillsSection.js';
import { StrokesSection } from './StrokesSection.js';
import { EffectsSection } from './EffectsSection.js';
import { AutoLayoutSection } from './AutoLayoutSection.js';
import { TextSection } from './TextSection.js';
import { ComponentSection } from './ComponentSection.js';
import { InteractionSection } from './InteractionSection.js';
import { ExportSection } from './ExportSection.js';
import { PageInspector } from './PageInspector.js';

export interface InspectorProps {
  doc: OpenDoc;
  pageId: string;
  onExportPNG: (nodeId: string, scale: 1 | 2) => void;
  onExportSVG: (nodeId: string) => void;
}

export function Inspector({ doc, pageId, onExportPNG, onExportSVG }: InspectorProps) {
  useDocVersion(doc);
  const selection = useSelectionStore((s) => s.selectedIds);

  if (selection.length === 0) {
    const page = doc.getNode(pageId);
    if (page?.type === 'PAGE') return <PageInspector doc={doc} page={page} />;
    return (
      <div
        className="w-panel-right shrink-0 border-l p-3 text-xs text-secondary-app border-app"
        data-testid="inspector-empty"
      >
        Select a layer to inspect its properties.
      </div>
    );
  }

  const node = doc.getNode(selection[0]!);
  if (!node) return null;

  const hasFills = 'fills' in node;
  const hasStrokes = 'strokes' in node;
  const hasEffects = 'effects' in node;
  const hasAutoLayout =
    node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE';
  const canHaveInteraction = node.type !== 'DOCUMENT' && node.type !== 'PAGE';

  return (
    <div
      className="flex w-panel-right shrink-0 flex-col overflow-y-auto border-l bg-panel border-app"
      data-testid="inspector"
    >
      <AlignSection doc={doc} selectedIds={selection} />
      {node.type !== 'DOCUMENT' && node.type !== 'PAGE' && (
        <GeometrySection doc={doc} node={node} />
      )}
      {node.type === 'TEXT' && <TextSection doc={doc} node={node} />}
      {hasAutoLayout && <AutoLayoutSection doc={doc} node={node as never} />}
      {hasFills && <FillsSection doc={doc} node={node as never} />}
      {hasStrokes && <StrokesSection doc={doc} node={node as never} />}
      {hasEffects && <EffectsSection doc={doc} node={node as never} />}
      {(node.type === 'FRAME' || node.type === 'INSTANCE') && (
        <ComponentSection doc={doc} node={node} />
      )}
      {canHaveInteraction && <InteractionSection doc={doc} node={node} pageId={pageId} />}
      <ExportSection
        onExportPNG={(scale) => onExportPNG(node.id, scale)}
        onExportSVG={() => onExportSVG(node.id)}
      />
    </div>
  );
}
