import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { AlignSection } from './AlignSection.js';

function makeDoc() {
  const doc = OpenDoc.create();
  const pageId = doc.getPages()[0]!;
  const rect = (x: number, y: number) =>
    doc.createNode({ type: 'RECTANGLE', parentId: pageId, x, y, width: 10, height: 10 });
  return { doc, rect };
}

describe('AlignSection', () => {
  it('renders all six align buttons and both distribute + flip buttons', () => {
    const { doc, rect } = makeDoc();
    const a = rect(0, 0);

    render(<AlignSection doc={doc} selectedIds={[a]} />);

    for (const edge of ['left', 'centerX', 'right', 'top', 'centerY', 'bottom']) {
      expect(screen.getByTestId(`align-${edge}`)).toBeTruthy();
    }
    expect(screen.getByTestId('distribute-x')).toBeTruthy();
    expect(screen.getByTestId('distribute-y')).toBeTruthy();
    expect(screen.getByTestId('flip-x')).toBeTruthy();
    expect(screen.getByTestId('flip-y')).toBeTruthy();
  });

  it('disables distribute buttons with fewer than 3 nodes', () => {
    const { doc, rect } = makeDoc();
    const a = rect(0, 0);
    const b = rect(50, 0);

    render(<AlignSection doc={doc} selectedIds={[a, b]} />);

    expect((screen.getByTestId('distribute-x') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('distribute-y') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables distribute buttons with 3 or more nodes', () => {
    const { doc, rect } = makeDoc();
    const ids = [rect(0, 0), rect(50, 0), rect(100, 0)];

    render(<AlignSection doc={doc} selectedIds={ids} />);

    expect((screen.getByTestId('distribute-x') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('distribute-y') as HTMLButtonElement).disabled).toBe(false);
  });

  it('clicking align-left updates each node to the union left edge via updateNode', () => {
    const { doc, rect } = makeDoc();
    const a = rect(30, 0);
    const b = rect(80, 0);
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<AlignSection doc={doc} selectedIds={[a, b]} />);
    fireEvent.click(screen.getByTestId('align-left'));

    // Union left edge is x=30; `b` moves to x=30, and updateNode carries it.
    expect(updateSpy).toHaveBeenCalledWith(b, expect.objectContaining({ x: 30 }));
    expect(doc.getNode(a)!.x).toBe(30);
    expect(doc.getNode(b)!.x).toBe(30);
  });

  it('clicking flip-x flips the primary node orientation', () => {
    const { doc } = makeDoc();
    const pageId = doc.getPages()[0]!;
    const r = doc.createNode({
      type: 'RECTANGLE',
      parentId: pageId,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      rotation: 25,
    });
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<AlignSection doc={doc} selectedIds={[r]} />);
    fireEvent.click(screen.getByTestId('flip-x'));

    expect(updateSpy).toHaveBeenCalledWith(r, { rotation: -25 });
  });

  it('does not fire distribute when disabled (fewer than 3 nodes)', () => {
    const { doc, rect } = makeDoc();
    const a = rect(0, 0);
    const b = rect(50, 0);
    const updateSpy = vi.spyOn(doc, 'updateNode');

    render(<AlignSection doc={doc} selectedIds={[a, b]} />);
    fireEvent.click(screen.getByTestId('distribute-x'));

    expect(updateSpy).not.toHaveBeenCalled();
  });
});
