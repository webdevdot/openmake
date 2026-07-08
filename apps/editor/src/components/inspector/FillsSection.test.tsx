import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { FillsSection } from './FillsSection.js';

describe('FillsSection', () => {
  it('committing a hex input updates the fill color via updateNode', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const rectId = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    });
    const node = doc.getNode(rectId) as Extract<
      ReturnType<typeof doc.getNode>,
      { fills: unknown[] }
    >;
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<FillsSection doc={doc} node={node} />);

    const hexInput = screen.getByTestId('fill-hex-input') as HTMLInputElement;
    fireEvent.change(hexInput, { target: { value: '#ff0000' } });
    fireEvent.blur(hexInput);

    expect(updateSpy).toHaveBeenCalledWith(
      rectId,
      expect.objectContaining({
        fills: [expect.objectContaining({ color: expect.objectContaining({ r: 1, g: 0, b: 0 }) })],
      }),
    );
  });

  it('add fill button appends a new solid fill', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const rectId = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fills: [],
    });
    const node = doc.getNode(rectId) as Extract<
      ReturnType<typeof doc.getNode>,
      { fills: unknown[] }
    >;
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<FillsSection doc={doc} node={node} />);
    fireEvent.click(screen.getByTestId('add-fill-button'));

    expect(updateSpy).toHaveBeenCalledWith(rectId, {
      fills: [expect.objectContaining({ type: 'SOLID' })],
    });
  });
});
