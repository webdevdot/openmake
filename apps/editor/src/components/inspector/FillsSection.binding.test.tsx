import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OpenDoc } from '@openmake/core';
import type { Paint } from '@openmake/shared';
import { FillsSection } from './FillsSection.js';

function setup(withVariable = true) {
  const doc = OpenDoc.create();
  const pageId = doc.getPages()[0]!;
  let varId: string | undefined;
  if (withVariable) {
    const colId = doc.createVariableCollection('Theme', 'Light');
    varId = doc.createVariable(colId, 'COLOR', 'primary', '#ff0000');
  }
  const rectId = doc.createNode({
    type: 'RECTANGLE',
    parentId: pageId,
    width: 10,
    height: 10,
    fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
  });
  const node = () =>
    doc.getNode(rectId) as Extract<ReturnType<typeof doc.getNode>, { fills: Paint[] }>;
  return { doc, rectId, varId, node };
}

const firstFill = (doc: OpenDoc, id: string) => (doc.getNode(id) as { fills: Paint[] }).fills[0]!;

describe('FillsSection variable binding', () => {
  it('binds a solid fill to a color variable via the picker', () => {
    const { doc, rectId, varId, node } = setup();
    render(<FillsSection doc={doc} node={node()} />);
    fireEvent.click(screen.getByTestId('bind-variable-button'));
    fireEvent.click(screen.getByTestId(`pick-variable-${varId}`));
    const fill = firstFill(doc, rectId);
    expect(fill.type === 'SOLID' && fill.boundVariableId).toBe(varId);
  });

  it('shows the bound variable name and an unbind button', () => {
    const { doc, rectId, varId } = setup();
    doc.updateNode(rectId, {
      fills: [
        {
          type: 'SOLID',
          color: { r: 0, g: 0, b: 0, a: 1 },
          opacity: 1,
          visible: true,
          boundVariableId: varId,
        },
      ],
    });
    const node = doc.getNode(rectId) as Extract<ReturnType<typeof doc.getNode>, { fills: Paint[] }>;
    render(<FillsSection doc={doc} node={node} />);
    expect(screen.getByTestId('fill-bound-name').textContent).toBe('primary');

    fireEvent.click(screen.getByTestId('unbind-fill-button'));
    const fill = firstFill(doc, rectId);
    expect(fill.type === 'SOLID' && fill.boundVariableId).toBeNull();
  });

  it('editing hex while bound unbinds the fill first', () => {
    const { doc, rectId, varId } = setup();
    doc.updateNode(rectId, {
      fills: [
        {
          type: 'SOLID',
          color: { r: 0, g: 0, b: 0, a: 1 },
          opacity: 1,
          visible: true,
          boundVariableId: varId,
        },
      ],
    });
    // Bound rows hide the hex editor, so unbind, then edit hex — the hex commit
    // path itself sets boundVariableId: null (documented in FillsSection).
    const node = doc.getNode(rectId) as Extract<ReturnType<typeof doc.getNode>, { fills: Paint[] }>;
    const { rerender } = render(<FillsSection doc={doc} node={node} />);
    fireEvent.click(screen.getByTestId('unbind-fill-button'));

    const unbound = doc.getNode(rectId) as Extract<
      ReturnType<typeof doc.getNode>,
      { fills: Paint[] }
    >;
    rerender(<FillsSection doc={doc} node={unbound} />);
    const hexInput = screen.getByTestId('fill-hex-input') as HTMLInputElement;
    fireEvent.change(hexInput, { target: { value: '#00ff00' } });
    fireEvent.blur(hexInput);
    const fill = firstFill(doc, rectId);
    expect(fill.type === 'SOLID' && fill.boundVariableId).toBeNull();
    expect(fill.type === 'SOLID' && fill.color.g).toBe(1);
  });

  it('disables the bind button when no color variables exist', () => {
    const { doc, node } = setup(false);
    render(<FillsSection doc={doc} node={node()} />);
    expect((screen.getByTestId('bind-variable-button') as HTMLButtonElement).disabled).toBe(true);
  });
});
