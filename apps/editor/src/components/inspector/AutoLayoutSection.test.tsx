import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import type { AutoLayout, SceneNode } from '@openmake/shared';
import { AutoLayoutSection } from './AutoLayoutSection.js';

type AutoLayoutNode = Extract<SceneNode, { autoLayout?: AutoLayout }>;

function makeFrame(doc: OpenDoc, autoLayout?: Partial<AutoLayout>, parentId?: string): AutoLayoutNode {
  const pageId = doc.getPages()[0]!;
  const id = doc.createNode({
    type: 'FRAME',
    parentId: parentId ?? pageId,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  if (autoLayout) {
    doc.updateNode(id, {
      autoLayout: {
        mode: 'VERTICAL',
        gap: 8,
        paddingTop: 8,
        paddingRight: 8,
        paddingBottom: 8,
        paddingLeft: 8,
        alignItems: 'MIN',
        justifyContent: 'MIN',
        wrap: false,
        ...autoLayout,
      },
    });
  }
  return doc.getNode(id) as AutoLayoutNode;
}

describe('AutoLayoutSection', () => {
  it('enabling auto layout writes a default AutoLayout via updateNode', () => {
    const doc = OpenDoc.create();
    const node = makeFrame(doc);
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<AutoLayoutSection doc={doc} node={node} />);
    fireEvent.click(screen.getByTestId('auto-layout-toggle'));

    expect(updateSpy).toHaveBeenCalledWith(
      node.id,
      expect.objectContaining({ autoLayout: expect.objectContaining({ mode: 'VERTICAL' }) }),
    );
  });

  it('switching direction to horizontal commits mode HORIZONTAL', () => {
    const doc = OpenDoc.create();
    const node = makeFrame(doc, {});
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<AutoLayoutSection doc={doc} node={node} />);
    fireEvent.click(screen.getByTestId('auto-layout-direction-horizontal'));

    expect(updateSpy).toHaveBeenCalledWith(
      node.id,
      expect.objectContaining({ autoLayout: expect.objectContaining({ mode: 'HORIZONTAL' }) }),
    );
  });

  it('toggling wrap commits wrap: true', () => {
    const doc = OpenDoc.create();
    const node = makeFrame(doc, { wrap: false });
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<AutoLayoutSection doc={doc} node={node} />);
    fireEvent.click(screen.getByTestId('auto-layout-wrap-toggle'));

    expect(updateSpy).toHaveBeenCalledWith(
      node.id,
      expect.objectContaining({ autoLayout: expect.objectContaining({ wrap: true }) }),
    );
  });

  it('committing the gap input updates gap via updateNode', () => {
    const doc = OpenDoc.create();
    const node = makeFrame(doc, { gap: 8 });
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<AutoLayoutSection doc={doc} node={node} />);
    const input = screen.getByTestId('auto-layout-gap-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '24' } });
    fireEvent.blur(input);

    expect(updateSpy).toHaveBeenCalledWith(
      node.id,
      expect.objectContaining({ autoLayout: expect.objectContaining({ gap: 24 }) }),
    );
  });

  it('linked padding writes all four sides at once', () => {
    const doc = OpenDoc.create();
    const node = makeFrame(doc, {});
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<AutoLayoutSection doc={doc} node={node} />);
    const input = screen.getByTestId('auto-layout-padding-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.blur(input);

    expect(updateSpy).toHaveBeenCalledWith(
      node.id,
      expect.objectContaining({
        autoLayout: expect.objectContaining({
          paddingTop: 12,
          paddingRight: 12,
          paddingBottom: 12,
          paddingLeft: 12,
        }),
      }),
    );
  });

  it('unlinking padding exposes per-side inputs that write a single side', () => {
    const doc = OpenDoc.create();
    const node = makeFrame(doc, {});
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<AutoLayoutSection doc={doc} node={node} />);
    fireEvent.click(screen.getByTestId('auto-layout-padding-link-toggle'));

    const left = screen.getByTestId('auto-layout-padding-left') as HTMLInputElement;
    fireEvent.change(left, { target: { value: '20' } });
    fireEvent.blur(left);

    expect(updateSpy).toHaveBeenCalledWith(
      node.id,
      expect.objectContaining({ autoLayout: expect.objectContaining({ paddingLeft: 20 }) }),
    );
    // Other sides remain untouched by a single-side edit.
    const lastCall = updateSpy.mock.calls.at(-1)![1] as { autoLayout: AutoLayout };
    expect(lastCall.autoLayout.paddingTop).toBe(8);
  });

  it('align grid maps a cell to primary/counter axis for VERTICAL mode', () => {
    const doc = OpenDoc.create();
    const node = makeFrame(doc, { mode: 'VERTICAL' });
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<AutoLayoutSection doc={doc} node={node} />);
    // Bottom-right cell (row MAX, col MAX): in VERTICAL mode primary axis is the
    // row (justify), counter axis is the column (align).
    fireEvent.click(screen.getByTestId('align-cell-MAX-MAX'));

    expect(updateSpy).toHaveBeenCalledWith(
      node.id,
      expect.objectContaining({
        autoLayout: expect.objectContaining({ justifyContent: 'MAX', alignItems: 'MAX' }),
      }),
    );
  });

  it('align grid maps a cell to primary/counter axis for HORIZONTAL mode', () => {
    const doc = OpenDoc.create();
    const node = makeFrame(doc, { mode: 'HORIZONTAL' });
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<AutoLayoutSection doc={doc} node={node} />);
    // Bottom-left cell (row MAX, col MIN): in HORIZONTAL mode primary axis is the
    // column (justify=MIN), counter axis is the row (align=MAX).
    fireEvent.click(screen.getByTestId('align-cell-MAX-MIN'));

    expect(updateSpy).toHaveBeenCalledWith(
      node.id,
      expect.objectContaining({
        autoLayout: expect.objectContaining({ justifyContent: 'MIN', alignItems: 'MAX' }),
      }),
    );
  });

  it('space-between toggle sets justifyContent SPACE_BETWEEN', () => {
    const doc = OpenDoc.create();
    const node = makeFrame(doc, { justifyContent: 'MIN' });
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<AutoLayoutSection doc={doc} node={node} />);
    fireEvent.click(screen.getByTestId('auto-layout-space-between'));

    expect(updateSpy).toHaveBeenCalledWith(
      node.id,
      expect.objectContaining({
        autoLayout: expect.objectContaining({ justifyContent: 'SPACE_BETWEEN' }),
      }),
    );
  });

  it('does not render child-sizing controls when parent has no auto layout', () => {
    const doc = OpenDoc.create();
    const node = makeFrame(doc, {});
    render(<AutoLayoutSection doc={doc} node={node} />);
    expect(screen.queryByTestId('child-sizing')).toBeNull();
  });

  it('renders child-sizing controls when the parent is an auto-layout frame and writes layoutSizing', () => {
    const doc = OpenDoc.create();
    const parent = makeFrame(doc, {});
    const child = makeFrame(doc, undefined, parent.id);
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<AutoLayoutSection doc={doc} node={child} />);
    fireEvent.click(screen.getByTestId('sizing-horizontal-FILL'));

    expect(updateSpy).toHaveBeenCalledWith(child.id, { layoutSizingHorizontal: 'FILL' });

    fireEvent.click(screen.getByTestId('sizing-vertical-HUG'));
    expect(updateSpy).toHaveBeenCalledWith(child.id, { layoutSizingVertical: 'HUG' });
  });
});
