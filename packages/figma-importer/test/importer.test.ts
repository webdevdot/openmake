import { describe, expect, it } from 'vitest';
import { DocumentDataSchema } from '@openmake/shared';
import { parseFigmaRestDocument } from '../src/importer.js';

const fixture = {
  name: 'My Figma File',
  document: {
    id: '0:0',
    name: 'Document',
    type: 'DOCUMENT',
    children: [
      {
        id: '0:1',
        name: 'Page 1',
        type: 'CANVAS',
        children: [
          {
            id: '1:1',
            name: 'Hero Frame',
            type: 'FRAME',
            absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
            fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
            children: [
              {
                id: '1:2',
                name: 'Background',
                type: 'RECTANGLE',
                absoluteBoundingBox: { x: 20, y: 20, width: 100, height: 50 },
                fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.4, b: 0.9, a: 1 } }],
              },
              {
                id: '1:3',
                name: 'Title',
                type: 'TEXT',
                absoluteBoundingBox: { x: 30, y: 30, width: 200, height: 30 },
                characters: 'Hello from Figma',
                style: { fontSize: 18, fontFamily: 'Inter', fontWeight: 600 },
              },
              {
                id: '1:4',
                name: 'Some Vector',
                type: 'VECTOR',
                absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
              },
            ],
          },
        ],
      },
    ],
  },
};

describe('parseFigmaRestDocument', () => {
  it('converts frame + rect + text nodes and reports the unsupported vector as skipped', () => {
    const result = parseFigmaRestDocument(fixture);

    expect(result.report.skipped).toBe(1);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ code: 'unsupported-node-type', severity: 'warning' }),
    );

    const types = Object.values(result.document.nodes).map((n) => n.type);
    expect(types).toContain('FRAME');
    expect(types).toContain('RECTANGLE');
    expect(types).toContain('TEXT');
    expect(types).toContain('PAGE');
    expect(types).not.toContain('VECTOR');

    const text = Object.values(result.document.nodes).find((n) => n.type === 'TEXT') as
      | { characters: string; textStyle: { fontSize: number } }
      | undefined;
    expect(text?.characters).toBe('Hello from Figma');
    expect(text?.textStyle.fontSize).toBe(18);

    const rect = Object.values(result.document.nodes).find((n) => n.type === 'RECTANGLE') as
      | { x: number; y: number }
      | undefined;
    // absoluteBoundingBox is relative to the parent frame's box (20,20 rel to 0,0 = 20,20).
    expect(rect?.x).toBe(20);
    expect(rect?.y).toBe(20);
  });

  it('produces output that validates against DocumentDataSchema', () => {
    const result = parseFigmaRestDocument(fixture);
    expect(() => DocumentDataSchema.parse(result.document)).not.toThrow();
  });

  it('never throws, even for malformed input', () => {
    expect(() => parseFigmaRestDocument(null)).not.toThrow();
    expect(() => parseFigmaRestDocument({})).not.toThrow();
    expect(() => parseFigmaRestDocument('not an object')).not.toThrow();
  });

  it('reports an error issue when the document field is missing', () => {
    const result = parseFigmaRestDocument({});
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ code: 'missing-document', severity: 'error' }),
    );
  });
});
