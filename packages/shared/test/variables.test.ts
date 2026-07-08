import { describe, expect, it } from 'vitest';
import {
  DocumentDataSchema,
  SolidPaintSchema,
  VariableCollectionSchema,
  VariableSchema,
} from '../src/document.js';

describe('Variable schemas', () => {
  it('parses a well-formed variable', () => {
    const v = VariableSchema.parse({
      id: 'var_1',
      collectionId: 'col_1',
      name: 'primary',
      type: 'COLOR',
      valuesByMode: { light: '#ffffff', dark: '#000000' },
    });
    expect(v.type).toBe('COLOR');
    expect(v.valuesByMode.light).toBe('#ffffff');
  });

  it('accepts string | number | boolean mode values', () => {
    const v = VariableSchema.parse({
      id: 'v',
      collectionId: 'c',
      name: 'mixed',
      type: 'FLOAT',
      valuesByMode: { a: 4, b: 'x', c: true },
    });
    expect(v.valuesByMode.a).toBe(4);
    expect(v.valuesByMode.c).toBe(true);
  });

  it('rejects an invalid variable type', () => {
    expect(() =>
      VariableSchema.parse({
        id: 'v',
        collectionId: 'c',
        name: 'x',
        type: 'DATE',
        valuesByMode: {},
      }),
    ).toThrow();
  });

  it('requires a collection to have at least one mode', () => {
    expect(() =>
      VariableCollectionSchema.parse({
        id: 'c',
        name: 'Theme',
        modes: [],
        defaultModeId: 'm',
      }),
    ).toThrow();
    const ok = VariableCollectionSchema.parse({
      id: 'c',
      name: 'Theme',
      modes: [{ id: 'm', name: 'Light' }],
      defaultModeId: 'm',
    });
    expect(ok.modes).toHaveLength(1);
  });
});

describe('SolidPaint variable binding (v1: color fills only)', () => {
  it('accepts a boundVariableId on a solid paint', () => {
    const p = SolidPaintSchema.parse({
      type: 'SOLID',
      color: { r: 1, g: 0, b: 0, a: 1 },
      boundVariableId: 'var_1',
    });
    expect(p.boundVariableId).toBe('var_1');
  });

  it('leaves boundVariableId undefined when omitted', () => {
    const p = SolidPaintSchema.parse({
      type: 'SOLID',
      color: { r: 0, g: 0, b: 0, a: 1 },
    });
    expect(p.boundVariableId).toBeUndefined();
  });
});

describe('DocumentData variables', () => {
  it('defaults variables and variableCollections to empty maps', () => {
    const doc = DocumentDataSchema.parse({
      schemaVersion: 1,
      id: 'doc',
      name: 'x',
      rootId: 'root',
      nodes: { root: { id: 'root', type: 'DOCUMENT', name: 'Document', children: [] } },
    });
    expect(doc.variables).toEqual({});
    expect(doc.variableCollections).toEqual({});
  });
});
