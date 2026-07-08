import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { GeometrySection } from './GeometrySection.js';

describe('GeometrySection', () => {
  it('commits a numeric X change via updateNode on blur', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const rectId = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    const node = doc.getNode(rectId)!;
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<GeometrySection doc={doc} node={node} />);

    const input = screen.getByTestId('input-x') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '42' } });
    fireEvent.blur(input);

    expect(updateSpy).toHaveBeenCalledWith(rectId, { x: 42 });
  });

  it('reverts an invalid (non-numeric) input on blur without calling updateNode', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const rectId = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 5,
      y: 0,
      width: 10,
      height: 10,
    });
    const node = doc.getNode(rectId)!;
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<GeometrySection doc={doc} node={node} />);

    const input = screen.getByTestId('input-x') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);

    expect(updateSpy).not.toHaveBeenCalled();
    expect(input.value).toBe('5');
  });

  it('shows a visible error cue when an invalid input reverts on blur', () => {
    const doc = OpenDoc.create();
    const pageId = doc.getPages()[0]!;
    const rectId = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 5,
      y: 0,
      width: 10,
      height: 10,
    });
    const node = doc.getNode(rectId)!;

    render(<GeometrySection doc={doc} node={node} />);

    const input = screen.getByTestId('input-x') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByTestId('input-x-invalid')).toBeTruthy();

    // Editing again clears the error cue immediately.
    fireEvent.change(input, { target: { value: '9' } });
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByTestId('input-x-invalid')).toBeFalsy();
  });
});
