import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { OpenDoc } from '@openmake/core';
import { getWorldBounds } from '@openmake/core';
import { worldToScreen, type Camera } from '../../canvas/camera.js';

export interface TextEditorOverlayProps {
  doc: OpenDoc;
  nodeId: string;
  cameraRef: RefObject<Camera>;
  onCommit: () => void;
}

/** Floating textarea positioned over a TEXT node; commits characters on blur/Escape. */
export function TextEditorOverlay({ doc, nodeId, cameraRef, onCommit }: TextEditorOverlayProps) {
  const node = doc.getNode(nodeId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(node && node.type === 'TEXT' ? node.characters : '');

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  if (!node || node.type !== 'TEXT' || !cameraRef.current) return null;

  const bounds = getWorldBounds(doc, nodeId);
  const topLeft = worldToScreen(cameraRef.current, { x: bounds.x, y: bounds.y });

  const commit = () => {
    doc.updateNode(nodeId, { characters: value });
    doc.commitUndoGroup();
    onCommit();
  };

  return (
    <textarea
      ref={textareaRef}
      data-testid="text-editor-overlay"
      className="absolute resize-none overflow-hidden border-2 bg-transparent outline-none"
      style={{
        left: topLeft.x,
        top: topLeft.y,
        width: Math.max(bounds.width, 40),
        minHeight: bounds.height,
        borderColor: 'var(--color-accent)',
        fontFamily: 'Inter',
        fontSize: node.textStyle.fontSize,
        color: 'var(--text-primary)',
      }}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.currentTarget.blur();
        }
      }}
    />
  );
}
