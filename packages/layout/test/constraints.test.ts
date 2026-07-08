import { describe, expect, it } from 'vitest';
import { SceneNodeSchema } from '@openmake/shared';
import { applyConstraints } from '../src/index.js';

function child(
  constraints: { horizontal: string; vertical: string },
  geom: Partial<{ x: number; y: number; width: number; height: number }> = {},
) {
  return SceneNodeSchema.parse({
    id: 'c',
    name: 'child',
    type: 'RECTANGLE',
    x: 10,
    y: 10,
    width: 20,
    height: 20,
    constraints,
    ...geom,
  });
}

describe('applyConstraints', () => {
  const oldParent = { width: 100, height: 100 };
  const newParent = { width: 200, height: 150 };

  it('MIN keeps offset from left/top fixed on both axes', () => {
    const node = child({ horizontal: 'MIN', vertical: 'MIN' });
    const patch = applyConstraints(node, oldParent, newParent);
    expect(patch).toMatchObject({ x: 10, y: 10 });
    expect(patch.width).toBeUndefined();
    expect(patch.height).toBeUndefined();
  });

  it('MAX keeps offset from right/bottom fixed', () => {
    // old: right offset = 100 - (10+20) = 70; bottom offset = 100 - (10+20) = 70
    const node = child({ horizontal: 'MAX', vertical: 'MAX' });
    const patch = applyConstraints(node, oldParent, newParent);
    // new x = 200 - 70 - 20 = 110; new y = 150 - 70 - 20 = 60
    expect(patch).toMatchObject({ x: 110, y: 60 });
  });

  it('CENTER keeps the child center offset from the parent center fixed', () => {
    // old center offset x: (10+10) - 50 = -30; y: (10+10) - 50 = -30
    const node = child({ horizontal: 'CENTER', vertical: 'CENTER' });
    const patch = applyConstraints(node, oldParent, newParent);
    // new x = 200/2 + (-30) - 10 = 100 - 30 - 10 = 60
    // new y = 150/2 + (-30) - 10 = 75 - 30 - 10 = 35
    expect(patch.x).toBeCloseTo(60, 5);
    expect(patch.y).toBeCloseTo(35, 5);
  });

  it('STRETCH pins both edges and resizes with the parent', () => {
    // old far offset x: 100 - 30 = 70; new width = 200 - 10 - 70 = 120
    // old far offset y: 100 - 30 = 70; new height = 150 - 10 - 70 = 70
    const node = child({ horizontal: 'STRETCH', vertical: 'STRETCH' });
    const patch = applyConstraints(node, oldParent, newParent);
    expect(patch).toMatchObject({ x: 10, y: 10, width: 120, height: 70 });
  });

  it('SCALE scales position and size proportionally', () => {
    const node = child({ horizontal: 'SCALE', vertical: 'SCALE' });
    const patch = applyConstraints(node, oldParent, newParent);
    // x scale: 200/100 = 2; y scale: 150/100 = 1.5
    expect(patch).toMatchObject({ x: 20, y: 15, width: 40, height: 30 });
  });

  it('handles mixed constraints per axis', () => {
    const node = child({ horizontal: 'MIN', vertical: 'MAX' });
    const patch = applyConstraints(node, oldParent, newParent);
    expect(patch.x).toBe(10);
    expect(patch.width).toBeUndefined();
    expect(patch.y).toBe(60);
  });
});
