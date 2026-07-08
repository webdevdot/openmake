import { beforeAll, describe, expect, it } from 'vitest';
import { computeLayout, initLayout } from '../src/index.js';
import { fixtureReader } from './fixture-reader.js';

beforeAll(async () => {
  await initLayout();
});

describe('computeLayout', () => {
  it('returns an empty map for a frame without autoLayout', () => {
    const reader = fixtureReader([
      { id: 'frame', type: 'FRAME', width: 100, height: 100, children: ['a'] },
      { id: 'a', type: 'RECTANGLE', width: 10, height: 10 },
    ]);
    const patches = computeLayout(reader, 'frame');
    expect(patches.size).toBe(0);
  });

  it('lays out a row with gap and padding', () => {
    const reader = fixtureReader([
      {
        id: 'frame',
        type: 'FRAME',
        width: 200,
        height: 50,
        children: ['a', 'b', 'c'],
        autoLayout: {
          mode: 'HORIZONTAL',
          gap: 10,
          paddingTop: 5,
          paddingRight: 5,
          paddingBottom: 5,
          paddingLeft: 5,
        },
      },
      { id: 'a', type: 'RECTANGLE', width: 20, height: 20 },
      { id: 'b', type: 'RECTANGLE', width: 20, height: 20 },
      { id: 'c', type: 'RECTANGLE', width: 20, height: 20 },
    ]);
    const patches = computeLayout(reader, 'frame');
    expect(patches.get('a')).toMatchObject({ x: 5, y: 5 });
    expect(patches.get('b')).toMatchObject({ x: 35, y: 5 }); // 5 + 20 + 10
    expect(patches.get('c')).toMatchObject({ x: 65, y: 5 }); // 35 + 20 + 10
  });

  it('lays out a column direction', () => {
    const reader = fixtureReader([
      {
        id: 'frame',
        type: 'FRAME',
        width: 50,
        height: 200,
        children: ['a', 'b'],
        autoLayout: { mode: 'VERTICAL', gap: 10 },
      },
      { id: 'a', type: 'RECTANGLE', width: 20, height: 20, x: 999, y: 999 },
      { id: 'b', type: 'RECTANGLE', width: 20, height: 20, x: 999, y: 999 },
    ]);
    const patches = computeLayout(reader, 'frame');
    expect(patches.get('a')).toMatchObject({ x: 0, y: 0 });
    expect(patches.get('b')).toMatchObject({ x: 0, y: 30 }); // 0 + 20 + 10
  });

  it('sizes a HUG frame to its content on both axes', () => {
    const reader = fixtureReader([
      {
        id: 'frame',
        type: 'FRAME',
        width: 999,
        height: 999,
        layoutSizingHorizontal: 'HUG',
        layoutSizingVertical: 'HUG',
        children: ['a', 'b'],
        autoLayout: {
          mode: 'HORIZONTAL',
          gap: 10,
          paddingLeft: 5,
          paddingRight: 5,
          paddingTop: 5,
          paddingBottom: 5,
        },
      },
      { id: 'a', type: 'RECTANGLE', width: 20, height: 30 },
      { id: 'b', type: 'RECTANGLE', width: 20, height: 40 },
    ]);
    const patches = computeLayout(reader, 'frame');
    // width: 5 + 20 + 10 + 20 + 5 = 60; height: 5 + max(30,40) + 5 = 50
    expect(patches.get('frame')).toMatchObject({ width: 60, height: 50 });
  });

  it('stretches a FILL child to remaining space on the main axis', () => {
    const reader = fixtureReader([
      {
        id: 'frame',
        type: 'FRAME',
        width: 200,
        height: 50,
        children: ['a', 'b'],
        autoLayout: { mode: 'HORIZONTAL', gap: 0 },
      },
      { id: 'a', type: 'RECTANGLE', width: 50, height: 20 },
      { id: 'b', type: 'RECTANGLE', width: 20, height: 20, layoutSizingHorizontal: 'FILL' },
    ]);
    const patches = computeLayout(reader, 'frame');
    expect(patches.get('b')).toMatchObject({ x: 50, width: 150 });
  });

  it('distributes children with SPACE_BETWEEN', () => {
    const reader = fixtureReader([
      {
        id: 'frame',
        type: 'FRAME',
        width: 200,
        height: 50,
        children: ['a', 'b'],
        autoLayout: { mode: 'HORIZONTAL', justifyContent: 'SPACE_BETWEEN' },
      },
      { id: 'a', type: 'RECTANGLE', width: 20, height: 20, x: 999 },
      { id: 'b', type: 'RECTANGLE', width: 20, height: 20, x: 999 },
    ]);
    const patches = computeLayout(reader, 'frame');
    expect(patches.get('a')).toMatchObject({ x: 0 });
    expect(patches.get('b')).toMatchObject({ x: 180 });
  });

  it('centers children on the cross axis with alignItems CENTER', () => {
    const reader = fixtureReader([
      {
        id: 'frame',
        type: 'FRAME',
        width: 100,
        height: 100,
        children: ['a'],
        autoLayout: { mode: 'HORIZONTAL', alignItems: 'CENTER' },
      },
      { id: 'a', type: 'RECTANGLE', width: 20, height: 20 },
    ]);
    const patches = computeLayout(reader, 'frame');
    expect(patches.get('a')).toMatchObject({ y: 40 }); // (100 - 20) / 2
  });

  it('bubbles up nested HUG sizes (HUG inside HUG)', () => {
    const reader = fixtureReader([
      {
        id: 'outer',
        type: 'FRAME',
        width: 999,
        height: 999,
        layoutSizingHorizontal: 'HUG',
        layoutSizingVertical: 'HUG',
        children: ['inner'],
        autoLayout: {
          mode: 'HORIZONTAL',
          paddingLeft: 10,
          paddingRight: 10,
          paddingTop: 10,
          paddingBottom: 10,
        },
      },
      {
        id: 'inner',
        type: 'FRAME',
        width: 999,
        height: 999,
        layoutSizingHorizontal: 'HUG',
        layoutSizingVertical: 'HUG',
        children: ['leaf'],
        autoLayout: {
          mode: 'VERTICAL',
          paddingLeft: 5,
          paddingRight: 5,
          paddingTop: 5,
          paddingBottom: 5,
        },
      },
      { id: 'leaf', type: 'RECTANGLE', width: 30, height: 15 },
    ]);
    const patches = computeLayout(reader, 'outer');
    // inner: 5 + 30 + 5 = 40 wide, 5 + 15 + 5 = 25 tall
    expect(patches.get('inner')).toMatchObject({ width: 40, height: 25 });
    // outer: 10 + 40 + 10 = 60 wide, 10 + 25 + 10 = 45 tall
    expect(patches.get('outer')).toMatchObject({ width: 60, height: 45 });
  });

  it('wraps children onto a second row', () => {
    const reader = fixtureReader([
      {
        id: 'frame',
        type: 'FRAME',
        width: 50,
        height: 100,
        children: ['a', 'b'],
        autoLayout: { mode: 'HORIZONTAL', wrap: true, gap: 0 },
      },
      { id: 'a', type: 'RECTANGLE', width: 30, height: 20, x: 999, y: 999 },
      { id: 'b', type: 'RECTANGLE', width: 30, height: 20, x: 999, y: 999 },
    ]);
    const patches = computeLayout(reader, 'frame');
    expect(patches.get('a')).toMatchObject({ x: 0, y: 0 });
    expect(patches.get('b')).toMatchObject({ x: 0, y: 20 }); // wrapped to next line
  });

  it('skips invisible children', () => {
    const reader = fixtureReader([
      {
        id: 'frame',
        type: 'FRAME',
        width: 200,
        height: 50,
        children: ['a', 'b', 'c'],
        autoLayout: { mode: 'HORIZONTAL', gap: 10 },
      },
      { id: 'a', type: 'RECTANGLE', width: 20, height: 20 },
      { id: 'b', type: 'RECTANGLE', width: 20, height: 20, visible: false },
      { id: 'c', type: 'RECTANGLE', width: 20, height: 20 },
    ]);
    const patches = computeLayout(reader, 'frame');
    expect(patches.get('c')).toMatchObject({ x: 30 }); // 0 + 20 + 10, skipping b
    expect(patches.has('b')).toBe(false);
  });

  it('uses an injected measureText for a HUG text node', () => {
    const reader = fixtureReader([
      {
        id: 'frame',
        type: 'FRAME',
        width: 999,
        height: 999,
        layoutSizingHorizontal: 'HUG',
        layoutSizingVertical: 'HUG',
        children: ['label'],
        autoLayout: { mode: 'HORIZONTAL' },
      },
      { id: 'label', type: 'TEXT', characters: 'Hi', width: 999, height: 999 },
    ]);
    const patches = computeLayout(reader, 'frame', {
      measureText: () => ({ width: 123, height: 45 }),
    });
    expect(patches.get('frame')).toMatchObject({ width: 123, height: 45 });
  });
});
