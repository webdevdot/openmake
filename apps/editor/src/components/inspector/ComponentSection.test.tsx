import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { ComponentSection } from './ComponentSection.js';
import { useSelectionStore } from '../../store/selection.js';

afterEach(() => {
  useSelectionStore.setState({ selectedIds: [] });
});

function component(doc: OpenDoc, parentId: string, name: string, x = 0, y = 0): string {
  const id = doc.createNode({ type: 'FRAME', parentId, name, x, y, width: 40, height: 40 });
  doc.createComponentFromNode(id);
  return id;
}

describe('ComponentSection — COMPONENT', () => {
  it('Create instance places an INSTANCE offset from the source and selects it', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const compId = component(doc, pageId, 'Button', 10, 20);
    const createSpy = vi.spyOn(doc, 'createInstance');

    render(<ComponentSection doc={doc} node={doc.getNode(compId)!} />);
    fireEvent.click(screen.getByTestId('create-instance-button'));

    expect(createSpy).toHaveBeenCalledWith(compId, pageId, { x: 50, y: 60 });
    const instId = createSpy.mock.results[0]!.value as string;
    const inst = doc.getNode(instId)!;
    expect(inst.type).toBe('INSTANCE');
    expect(useSelectionStore.getState().selectedIds).toEqual([instId]);
  });
});

describe('ComponentSection — INSTANCE inside a COMPONENT_SET', () => {
  function setup() {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const a = component(doc, pageId, 'State=default', 0, 0);
    const b = component(doc, pageId, 'State=hover', 60, 0);
    const setId = doc.combineAsVariants([a, b]);
    doc.commitUndoGroup();
    const instId = doc.createInstance(a, pageId, { x: 200, y: 200 });
    doc.commitUndoGroup();
    return { doc, a, b, setId, instId };
  }

  it('shows the set name and a dropdown per variant property', () => {
    const { doc, setId, instId } = setup();
    render(<ComponentSection doc={doc} node={doc.getNode(instId)!} />);

    expect(screen.getByTestId('instance-source-name').textContent).toBe(doc.getNode(setId)!.name);
    const select = screen.getByTestId('variant-select-State') as HTMLSelectElement;
    expect(select.value).toBe('default');
    expect([...select.options].map((o) => o.value)).toEqual(['default', 'hover']);
  });

  it('changing a variant dropdown swaps the instance componentId to the matching variant', () => {
    const { doc, b, instId } = setup();
    render(<ComponentSection doc={doc} node={doc.getNode(instId)!} />);

    fireEvent.change(screen.getByTestId('variant-select-State'), { target: { value: 'hover' } });

    const inst = doc.getNode(instId)!;
    expect(inst.type === 'INSTANCE' && inst.componentId).toBe(b);
  });
});
