import type { OpenDoc } from '@openmake/core';
import type { TextNode } from '@openmake/shared';

export interface TextSectionProps {
  doc: OpenDoc;
  node: TextNode;
}

export function TextSection({ doc, node }: TextSectionProps) {
  const update = (patch: Partial<TextNode['textStyle']>) => {
    doc.updateNode(node.id, { textStyle: { ...node.textStyle, ...patch } });
    doc.commitUndoGroup();
  };

  return (
    <div className="flex flex-col gap-2 border-b p-2 border-app" data-testid="text-section">
      <span className="text-xs font-medium text-secondary-app">Text</span>

      <div className="flex gap-1">
        <input
          type="number"
          min={1}
          data-testid="text-font-size-input"
          className="w-16 rounded border bg-transparent px-1 py-0.5 text-xs border-app"
          value={node.textStyle.fontSize}
          onChange={(e) => update({ fontSize: Math.max(1, Number(e.target.value)) })}
        />
        <select
          data-testid="text-font-weight-select"
          className="flex-1 rounded border bg-transparent px-1 py-0.5 text-xs border-app"
          value={node.textStyle.fontWeight}
          onChange={(e) => update({ fontWeight: Number(e.target.value) })}
        >
          <option value={400}>Regular</option>
          <option value={700}>Bold</option>
        </select>
      </div>

      <div className="flex gap-1" data-testid="text-align-group">
        {(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFY'] as const).map((align) => (
          <button
            key={align}
            type="button"
            data-testid={`text-align-${align.toLowerCase()}`}
            className="flex-1 rounded border py-0.5 text-xs bg-hover-app border-app"
            style={node.textStyle.textAlign === align ? { backgroundColor: 'var(--bg-active)' } : undefined}
            onClick={() => update({ textAlign: align })}
          >
            {align[0]}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-1 text-xs">
        <span className="w-16 text-secondary-app">Line height</span>
        <input
          type="text"
          data-testid="text-line-height-input"
          className="w-full rounded border bg-transparent px-1 py-0.5 border-app"
          value={node.textStyle.lineHeight === 'AUTO' ? 'AUTO' : node.textStyle.lineHeight}
          onChange={(e) => {
            const raw = e.target.value;
            update({ lineHeight: raw === 'AUTO' ? 'AUTO' : Number(raw) || 'AUTO' });
          }}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-secondary-app">Content</span>
        <textarea
          data-testid="text-content-input"
          className="w-full resize-none rounded border bg-transparent px-1 py-0.5 border-app"
          rows={3}
          value={node.characters}
          onChange={(e) => doc.updateNode(node.id, { characters: e.target.value })}
          onBlur={() => doc.commitUndoGroup()}
        />
      </label>
    </div>
  );
}
