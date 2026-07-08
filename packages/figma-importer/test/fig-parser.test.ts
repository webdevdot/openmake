import { describe, expect, it } from 'vitest';
import { deflateRawSync, deflateSync as zlibDeflateSync, zstdCompressSync } from 'node:zlib';
import { zipSync } from 'fflate';
import { compileSchema, encodeBinarySchema, parseSchema } from 'kiwi-schema';
import { DocumentDataSchema, type SceneNode } from '@openmake/shared';
import { MAX_DECOMPRESSED_BYTES, parseFigFile } from '../src/index.js';
import { MAX_NODE_CHANGES } from '../src/fig/mapper.js';

// ---------------------------------------------------------------------------
// Synthetic .fig builder. The mini Kiwi schema textually mirrors the field
// names Figma's internal schema uses (Message.nodeChanges, NodeChange.guid,
// parentIndex, size, transform, fillPaints, …) so the mapper exercises the
// exact same decoded shapes it would see on a real file.
// ---------------------------------------------------------------------------

const SCHEMA_TEXT = `
enum NodeType {
  NONE = 0;
  DOCUMENT = 1;
  CANVAS = 2;
  FRAME = 3;
  GROUP = 4;
  RECTANGLE = 5;
  ROUNDED_RECTANGLE = 6;
  ELLIPSE = 7;
  LINE = 8;
  REGULAR_POLYGON = 9;
  STAR = 10;
  TEXT = 11;
  VECTOR = 12;
  BOOLEAN_OPERATION = 13;
  COMPONENT = 14;
  COMPONENT_SET = 15;
  INSTANCE = 16;
  SLICE = 17;
}

enum BlendMode {
  PASS_THROUGH = 0;
  NORMAL = 1;
  MULTIPLY = 2;
  SCREEN = 3;
}

enum PaintType {
  SOLID = 0;
  GRADIENT_LINEAR = 1;
  GRADIENT_RADIAL = 2;
  IMAGE = 3;
}

enum StrokeAlign {
  CENTER = 0;
  INSIDE = 1;
  OUTSIDE = 2;
}

enum TextAlignHorizontal {
  LEFT = 0;
  CENTER = 1;
  RIGHT = 2;
  JUSTIFIED = 3;
}

enum NumberUnits {
  RAW = 0;
  PIXELS = 1;
  PERCENT = 2;
}

enum StackMode {
  NONE = 0;
  HORIZONTAL = 1;
  VERTICAL = 2;
}

enum StackAlign {
  MIN = 0;
  CENTER = 1;
  MAX = 2;
  BASELINE = 3;
  SPACE_BETWEEN = 4;
}

enum EffectType {
  INNER_SHADOW = 0;
  DROP_SHADOW = 1;
  FOREGROUND_BLUR = 2;
  BACKGROUND_BLUR = 3;
}

struct GUID {
  uint sessionID;
  uint localID;
}

struct Vector {
  float x;
  float y;
}

struct Matrix {
  float m00;
  float m01;
  float m02;
  float m10;
  float m11;
  float m12;
}

struct Color {
  float r;
  float g;
  float b;
  float a;
}

message ParentIndex {
  GUID guid = 1;
  string position = 2;
}

message Paint {
  PaintType type = 1;
  Color color = 2;
  float opacity = 3;
  bool visible = 4;
}

message NumberWithUnits {
  float value = 1;
  NumberUnits units = 2;
}

message FontName {
  string family = 1;
  string style = 2;
}

message TextData {
  string characters = 1;
}

message Effect {
  EffectType type = 1;
  Color color = 2;
  Vector offset = 3;
  float radius = 4;
  float spread = 5;
  bool visible = 6;
}

message NodeChange {
  GUID guid = 1;
  ParentIndex parentIndex = 2;
  NodeType type = 3;
  string name = 4;
  bool visible = 5;
  bool locked = 6;
  float opacity = 7;
  BlendMode blendMode = 8;
  Vector size = 9;
  Matrix transform = 10;
  Paint[] fillPaints = 11;
  Paint[] strokePaints = 12;
  float strokeWeight = 13;
  StrokeAlign strokeAlign = 14;
  float[] dashPattern = 15;
  float cornerRadius = 16;
  float rectangleTopLeftCornerRadius = 17;
  float rectangleTopRightCornerRadius = 18;
  float rectangleBottomLeftCornerRadius = 19;
  float rectangleBottomRightCornerRadius = 20;
  uint count = 21;
  float starInnerScale = 22;
  TextData textData = 23;
  FontName fontName = 24;
  float fontSize = 25;
  TextAlignHorizontal textAlignHorizontal = 26;
  NumberWithUnits letterSpacing = 27;
  NumberWithUnits lineHeight = 28;
  StackMode stackMode = 29;
  float stackSpacing = 30;
  float stackHorizontalPadding = 31;
  float stackVerticalPadding = 32;
  float stackPaddingRight = 33;
  float stackPaddingBottom = 34;
  StackAlign stackPrimaryAlignItems = 35;
  StackAlign stackCounterAlignItems = 36;
  Effect[] effects = 37;
  Color backgroundColor = 38;
  bool internalOnly = 39;
}

message Message {
  NodeChange[] nodeChanges = 1;
}
`;

const parsedSchema = parseSchema(SCHEMA_TEXT);
const binarySchema = encodeBinarySchema(parsedSchema);
const codec = compileSchema(parsedSchema) as {
  encodeMessage(message: unknown): Uint8Array;
};

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function lengthPrefixed(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length, true);
  out.set(bytes, 4);
  return out;
}

type Compression = 'zstd' | 'deflate' | 'zlib';

function compress(bytes: Uint8Array, method: Compression): Uint8Array {
  if (method === 'zstd') return new Uint8Array(zstdCompressSync(bytes));
  if (method === 'zlib') return new Uint8Array(zlibDeflateSync(bytes));
  return new Uint8Array(deflateRawSync(bytes));
}

interface BuildOptions {
  magic?: string;
  version?: number;
  schemaCompression?: Compression;
  dataCompression?: Compression;
  wrapZip?: boolean;
}

function buildFig(nodeChanges: unknown[], opts: BuildOptions = {}): Uint8Array {
  const dataBytes = codec.encodeMessage({ nodeChanges });
  const header = new Uint8Array(12);
  header.set(new TextEncoder().encode(opts.magic ?? 'fig-kiwi'), 0);
  new DataView(header.buffer).setUint32(8, opts.version ?? 101, true);
  const payload = concatBytes(
    header,
    lengthPrefixed(compress(binarySchema, opts.schemaCompression ?? 'deflate')),
    lengthPrefixed(compress(dataBytes, opts.dataCompression ?? 'zstd')),
  );
  return opts.wrapZip ? zipSync({ 'canvas.fig': payload }) : payload;
}

// ---------------------------------------------------------------------------
// Fixture node changes
// ---------------------------------------------------------------------------

const guid = (sessionID: number, localID: number) => ({ sessionID, localID });
const parent = (sessionID: number, localID: number, position: string) => ({
  guid: guid(sessionID, localID),
  position,
});
const translate = (x: number, y: number) => ({ m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y });

/** DOCUMENT → CANVAS → FRAME → [RECTANGLE, TEXT] (child order set by position, not array order). */
function happyPathChanges(): unknown[] {
  return [
    { guid: guid(0, 0), type: 'DOCUMENT', name: 'Document' },
    {
      guid: guid(0, 1),
      parentIndex: parent(0, 0, '!'),
      type: 'CANVAS',
      name: 'Page 1',
      backgroundColor: { r: 0.25, g: 0.5, b: 0.75, a: 1 },
    },
    {
      guid: guid(1, 2),
      parentIndex: parent(0, 1, '!'),
      type: 'FRAME',
      name: 'Hero',
      size: { x: 400, y: 300 },
      transform: translate(10, 20),
    },
    // Fractional positions: '"!' sorts after '!5', so the TEXT (listed first
    // in the flat array) must come second among the frame's children.
    {
      guid: guid(1, 4),
      parentIndex: parent(1, 2, '"!'),
      type: 'TEXT',
      name: 'Title',
      size: { x: 200, y: 30 },
      transform: translate(30, 30),
      textData: { characters: 'Hello .fig' },
      fontName: { family: 'Futura Custom', style: 'Bold' },
      fontSize: 16,
      textAlignHorizontal: 'CENTER',
      letterSpacing: { value: 2, units: 'PIXELS' },
      lineHeight: { value: 24, units: 'PIXELS' },
    },
    {
      guid: guid(1, 3),
      parentIndex: parent(1, 2, '!5'),
      type: 'RECTANGLE',
      name: 'Background',
      size: { x: 100, y: 50 },
      transform: translate(20, 20),
      fillPaints: [
        {
          type: 'SOLID',
          color: { r: 0.2, g: 0.4, b: 0.9, a: 0.5 },
          opacity: 0.7,
          visible: true,
        },
      ],
    },
  ];
}

function nodesOfType(
  document: { nodes: Record<string, SceneNode> },
  type: SceneNode['type'],
): SceneNode[] {
  return Object.values(document.nodes).filter((n) => n.type === type);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseFigFile', () => {
  it('imports DOCUMENT → CANVAS → FRAME → RECTANGLE + TEXT with parent-relative coords and position-ordered children', () => {
    const result = parseFigFile(buildFig(happyPathChanges()));

    const doc = result.document;
    const root = doc.nodes[doc.rootId];
    expect(root?.type).toBe('DOCUMENT');
    expect(root?.name).toBe('Document');

    // Single synthetic DOCUMENT root (no double-DOCUMENT like the REST importer).
    expect(nodesOfType(doc, 'DOCUMENT')).toHaveLength(1);

    const rootChildren = (root as { children: string[] }).children;
    expect(rootChildren).toHaveLength(1);
    const page = doc.nodes[rootChildren[0] ?? ''];
    expect(page?.type).toBe('PAGE');
    const pageBg = (page as { backgroundColor: { r: number; g: number } }).backgroundColor;
    expect(pageBg.r).toBeCloseTo(0.25, 5);
    expect(pageBg.g).toBeCloseTo(0.5, 5);

    const pageChildren = (page as { children: string[] }).children;
    expect(pageChildren).toHaveLength(1);
    const frame = doc.nodes[pageChildren[0] ?? ''];
    expect(frame?.type).toBe('FRAME');
    expect(frame?.x).toBe(10);
    expect(frame?.y).toBe(20);
    expect(frame?.width).toBe(400);
    expect(frame?.height).toBe(300);

    // Children ordered by lexicographic parentIndex.position, not flat-array order.
    const frameChildren = (frame as { children: string[] }).children;
    expect(frameChildren).toHaveLength(2);
    const first = doc.nodes[frameChildren[0] ?? ''];
    const second = doc.nodes[frameChildren[1] ?? ''];
    expect(first?.type).toBe('RECTANGLE');
    expect(second?.type).toBe('TEXT');

    // Coordinates in .fig transforms are already parent-relative.
    expect(first?.x).toBe(20);
    expect(first?.y).toBe(20);

    const text = second as {
      characters: string;
      textStyle: {
        fontFamily: string;
        fontSize: number;
        fontWeight: number;
        fontStyle: string;
        lineHeight: number | 'AUTO';
        letterSpacing: number;
        textAlign: string;
      };
    };
    expect(text.characters).toBe('Hello .fig');
    expect(text.textStyle.fontFamily).toBe('Futura Custom');
    expect(text.textStyle.fontSize).toBe(16);
    // fontName.style 'Bold' maps to numeric weight, non-italic.
    expect(text.textStyle.fontWeight).toBe(700);
    expect(text.textStyle.fontStyle).toBe('NORMAL');
    // lineHeight in px is normalized to a multiplier of fontSize (24 / 16).
    expect(text.textStyle.lineHeight).toBeCloseTo(1.5, 5);
    expect(text.textStyle.letterSpacing).toBeCloseTo(2, 5);
    expect(text.textStyle.textAlign).toBe('CENTER');

    expect(result.report.fontsMissing).toContain('Futura Custom');
    expect(result.report.imported).toBe(5);
    expect(result.report.skipped).toBe(0);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'info', code: 'fig-version' }),
    );
  });

  it("maps fontName.style 'SemiBold Italic' to fontWeight 600 + fontStyle ITALIC", () => {
    const changes = happyPathChanges();
    const textChange = changes.find((c) => (c as { type?: string }).type === 'TEXT') as {
      fontName: { family: string; style: string };
    };
    textChange.fontName.style = 'SemiBold Italic';

    const result = parseFigFile(buildFig(changes));
    const text = nodesOfType(result.document, 'TEXT')[0] as
      { textStyle: { fontWeight: number; fontStyle: string } } | undefined;
    expect(text?.textStyle.fontWeight).toBe(600);
    expect(text?.textStyle.fontStyle).toBe('ITALIC');
  });

  it('preserves BOTH paint opacity and color alpha on solid fills', () => {
    const result = parseFigFile(buildFig(happyPathChanges()));
    const rect = nodesOfType(result.document, 'RECTANGLE')[0] as
      { fills: Array<{ type: string; opacity: number; color: { a: number } }> } | undefined;
    expect(rect?.fills).toHaveLength(1);
    expect(rect?.fills[0]?.type).toBe('SOLID');
    expect(rect?.fills[0]?.opacity).toBeCloseTo(0.7, 5);
    expect(rect?.fills[0]?.color.a).toBeCloseTo(0.5, 5);
  });

  it('produces output that validates against DocumentDataSchema', () => {
    const result = parseFigFile(buildFig(happyPathChanges()));
    expect(() => DocumentDataSchema.parse(result.document)).not.toThrow();
  });

  it('parses a ZIP-wrapped .fig (canvas.fig entry)', () => {
    const result = parseFigFile(buildFig(happyPathChanges(), { wrapZip: true }));
    expect(result.report.imported).toBe(5);
    expect(nodesOfType(result.document, 'FRAME')).toHaveLength(1);
  });

  it('parses a legacy file with raw-deflate data chunk and a zlib schema chunk', () => {
    const result = parseFigFile(
      buildFig(happyPathChanges(), { schemaCompression: 'zlib', dataCompression: 'deflate' }),
    );
    expect(result.report.imported).toBe(5);
    expect(nodesOfType(result.document, 'TEXT')).toHaveLength(1);
  });

  it('never throws on garbage, truncated, or empty input and reports error issues', () => {
    const garbage = parseFigFile(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(garbage.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'not-a-fig-file' }),
    );
    expect(() => DocumentDataSchema.parse(garbage.document)).not.toThrow();

    const empty = parseFigFile(new Uint8Array(0));
    expect(empty.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'not-a-fig-file' }),
    );

    // Valid magic + version but a chunk header that claims more bytes than exist.
    const truncated = new Uint8Array(20);
    truncated.set(new TextEncoder().encode('fig-kiwi'), 0);
    new DataView(truncated.buffer).setUint32(8, 101, true);
    new DataView(truncated.buffer).setUint32(12, 9999, true);
    const truncatedResult = parseFigFile(truncated);
    expect(truncatedResult.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'truncated-fig-file' }),
    );
    expect(truncatedResult.report.imported).toBe(0);

    // Also: a full happy-path file cut off mid-stream must not throw.
    const whole = buildFig(happyPathChanges());
    const cut = parseFigFile(whole.subarray(0, Math.floor(whole.length / 2)));
    expect(cut.report.issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('reports unsupported-fig-kind for FigJam / Slides magics', () => {
    const jam = parseFigFile(buildFig(happyPathChanges(), { magic: 'fig-jam.' }));
    expect(jam.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'unsupported-fig-kind' }),
    );
    const deck = parseFigFile(buildFig(happyPathChanges(), { magic: 'fig-deck' }));
    expect(deck.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'unsupported-fig-kind' }),
    );
    expect(deck.report.imported).toBe(0);
  });

  it('reports decompress-failed when a chunk is valid framing but corrupt bytes', () => {
    const header = new Uint8Array(12);
    header.set(new TextEncoder().encode('fig-kiwi'), 0);
    new DataView(header.buffer).setUint32(8, 101, true);
    const junk = new Uint8Array([0xff, 0xee, 0xdd, 0xcc, 0xbb]);
    const bytes = concatBytes(header, lengthPrefixed(junk), lengthPrefixed(junk));
    const result = parseFigFile(bytes);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'decompress-failed' }),
    );
  });

  it('skips unsupported node types with a warning and counts them', () => {
    const changes = [
      ...happyPathChanges(),
      { guid: guid(2, 1), parentIndex: parent(0, 1, '~'), type: 'SLICE', name: 'Slice 1' },
    ];
    const result = parseFigFile(buildFig(changes));
    expect(result.report.skipped).toBe(1);
    expect(result.report.imported).toBe(5);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'unsupported-node-type',
        nodePath: expect.stringContaining('Slice 1') as unknown as string,
      }),
    );
  });

  it('attaches orphan nodes under the first page with a warning', () => {
    const changes = [
      ...happyPathChanges(),
      {
        guid: guid(9, 9),
        parentIndex: parent(77, 77, '!'), // parent guid never defined
        type: 'RECTANGLE',
        name: 'Lost Rect',
        size: { x: 10, y: 10 },
        transform: translate(1, 2),
      },
    ];
    const result = parseFigFile(buildFig(changes));
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'orphan-node' }),
    );
    const page = nodesOfType(result.document, 'PAGE')[0] as { children: string[] } | undefined;
    const orphan = Object.values(result.document.nodes).find((n) => n.name === 'Lost Rect');
    expect(orphan).toBeDefined();
    expect(page?.children).toContain(orphan?.id);
    expect(() => DocumentDataSchema.parse(result.document)).not.toThrow();
  });

  it('converts INSTANCE to a childless FRAME placeholder with a warning', () => {
    const changes = [
      ...happyPathChanges(),
      {
        guid: guid(3, 1),
        parentIndex: parent(0, 1, '#'),
        type: 'INSTANCE',
        name: 'Button Instance',
        size: { x: 120, y: 40 },
        transform: translate(5, 6),
      },
      // A child inside the instance must NOT be imported (and not become an orphan).
      {
        guid: guid(3, 2),
        parentIndex: parent(3, 1, '!'),
        type: 'RECTANGLE',
        name: 'Inside Instance',
      },
    ];
    const result = parseFigFile(buildFig(changes));
    const placeholder = Object.values(result.document.nodes).find(
      (n) => n.name === 'Button Instance',
    );
    expect(placeholder?.type).toBe('FRAME');
    expect(placeholder?.width).toBe(120);
    expect((placeholder as { children: string[] }).children).toHaveLength(0);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'instance-not-resolved' }),
    );
    expect(nodesOfType(result.document, 'INSTANCE')).toHaveLength(0);
    expect(
      Object.values(result.document.nodes).find((n) => n.name === 'Inside Instance'),
    ).toBeUndefined();
    expect(result.report.issues.filter((i) => i.code === 'orphan-node')).toHaveLength(0);
  });

  it('drops group styles, approximates per-corner radii, and normalizes unknown blend modes', () => {
    const changes = [
      { guid: guid(0, 0), type: 'DOCUMENT', name: 'Doc' },
      { guid: guid(0, 1), parentIndex: parent(0, 0, '!'), type: 'CANVAS', name: 'Page 1' },
      {
        guid: guid(1, 1),
        parentIndex: parent(0, 1, '!'),
        type: 'GROUP',
        name: 'Styled Group',
        fillPaints: [
          { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true },
        ],
      },
      {
        guid: guid(1, 2),
        parentIndex: parent(1, 1, '!'),
        type: 'ROUNDED_RECTANGLE',
        name: 'Round Rect',
        size: { x: 50, y: 50 },
        blendMode: 'PASS_THROUGH',
        rectangleTopLeftCornerRadius: 1,
        rectangleTopRightCornerRadius: 2,
        rectangleBottomLeftCornerRadius: 3,
        rectangleBottomRightCornerRadius: 8,
      },
    ];
    const result = parseFigFile(buildFig(changes));

    const group = nodesOfType(result.document, 'GROUP')[0];
    expect(group).toBeDefined();
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'group-styles-dropped' }),
    );

    const rect = nodesOfType(result.document, 'RECTANGLE')[0] as
      { cornerRadius: number; blendMode: string } | undefined;
    expect(rect?.cornerRadius).toBe(8);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'corner-radii-approximated' }),
    );
    expect(rect?.blendMode).toBe('NORMAL');
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'info', code: 'blend-mode-not-imported' }),
    );
  });

  it('maps gradients and images to dropped paints with warnings', () => {
    const changes = [
      { guid: guid(0, 0), type: 'DOCUMENT', name: 'Doc' },
      { guid: guid(0, 1), parentIndex: parent(0, 0, '!'), type: 'CANVAS', name: 'Page 1' },
      {
        guid: guid(1, 1),
        parentIndex: parent(0, 1, '!'),
        type: 'RECTANGLE',
        name: 'Painted',
        fillPaints: [
          { type: 'GRADIENT_LINEAR', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true },
          { type: 'IMAGE', opacity: 1, visible: true },
        ],
      },
    ];
    const result = parseFigFile(buildFig(changes));
    const rect = nodesOfType(result.document, 'RECTANGLE')[0] as { fills: unknown[] } | undefined;
    expect(rect?.fills).toHaveLength(0);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'gradient-not-imported' }),
    );
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'image-not-imported' }),
    );
  });

  it('maps shapes, vectors, booleans, components, auto-layout, and strokes', () => {
    const changes = [
      { guid: guid(0, 0), type: 'DOCUMENT', name: 'Doc' },
      { guid: guid(0, 1), parentIndex: parent(0, 0, '!'), type: 'CANVAS', name: 'Page 1' },
      {
        guid: guid(1, 1),
        parentIndex: parent(0, 1, '1'),
        type: 'FRAME',
        name: 'Stack',
        stackMode: 'VERTICAL',
        stackSpacing: 8,
        stackHorizontalPadding: 12,
        stackVerticalPadding: 16,
        stackPrimaryAlignItems: 'SPACE_BETWEEN',
        stackCounterAlignItems: 'CENTER',
      },
      {
        guid: guid(1, 2),
        parentIndex: parent(0, 1, '2'),
        type: 'REGULAR_POLYGON',
        name: 'Poly',
        count: 6,
      },
      {
        guid: guid(1, 3),
        parentIndex: parent(0, 1, '3'),
        type: 'STAR',
        name: 'Star',
        count: 7,
        starInnerScale: 0.5,
      },
      {
        guid: guid(1, 4),
        parentIndex: parent(0, 1, '4'),
        type: 'VECTOR',
        name: 'Vec',
        size: { x: 33, y: 44 },
      },
      {
        guid: guid(1, 5),
        parentIndex: parent(0, 1, '5'),
        type: 'BOOLEAN_OPERATION',
        name: 'Bool',
        size: { x: 10, y: 10 },
      },
      {
        guid: guid(1, 6),
        parentIndex: parent(0, 1, '6'),
        type: 'COMPONENT',
        name: 'Comp',
      },
      {
        guid: guid(1, 7),
        parentIndex: parent(0, 1, '7'),
        type: 'ELLIPSE',
        name: 'Stroked Ellipse',
        strokePaints: [
          { type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 0.5, visible: true },
        ],
        strokeWeight: 3,
        strokeAlign: 'OUTSIDE',
        dashPattern: [4, 2],
      },
      {
        guid: guid(1, 8),
        parentIndex: parent(0, 1, '8'),
        type: 'LINE',
        name: 'A Line',
      },
    ];
    const result = parseFigFile(buildFig(changes));
    const doc = result.document;

    const frame = nodesOfType(doc, 'FRAME')[0] as
      | {
          autoLayout?: {
            mode: string;
            gap: number;
            paddingLeft: number;
            paddingBottom: number;
            alignItems: string;
            justifyContent: string;
          };
        }
      | undefined;
    expect(frame?.autoLayout?.mode).toBe('VERTICAL');
    expect(frame?.autoLayout?.gap).toBe(8);
    expect(frame?.autoLayout?.paddingLeft).toBe(12);
    expect(frame?.autoLayout?.paddingBottom).toBe(16);
    expect(frame?.autoLayout?.alignItems).toBe('CENTER');
    expect(frame?.autoLayout?.justifyContent).toBe('SPACE_BETWEEN');

    const poly = nodesOfType(doc, 'POLYGON')[0] as { pointCount: number } | undefined;
    expect(poly?.pointCount).toBe(6);

    const star = nodesOfType(doc, 'STAR')[0] as
      { pointCount: number; innerRadius: number } | undefined;
    expect(star?.pointCount).toBe(7);
    expect(star?.innerRadius).toBeCloseTo(0.5, 5);

    const vectors = nodesOfType(doc, 'VECTOR') as Array<{
      name: string;
      path: string;
      width: number;
    }>;
    expect(vectors).toHaveLength(2);
    const vec = vectors.find((v) => v.name === 'Vec');
    expect(vec?.path).toBe('');
    expect(vec?.width).toBe(33);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'vector-network-not-imported' }),
    );
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'boolean-flattening-not-supported' }),
    );

    expect(nodesOfType(doc, 'COMPONENT')).toHaveLength(1);
    expect(nodesOfType(doc, 'LINE')).toHaveLength(1);

    const ellipse = nodesOfType(doc, 'ELLIPSE')[0] as
      | {
          strokes: Array<{
            weight: number;
            align: string;
            dashPattern?: number[];
            paint: { type: string; opacity: number };
          }>;
        }
      | undefined;
    expect(ellipse?.strokes).toHaveLength(1);
    expect(ellipse?.strokes[0]?.weight).toBe(3);
    expect(ellipse?.strokes[0]?.align).toBe('OUTSIDE');
    expect(ellipse?.strokes[0]?.dashPattern).toEqual([4, 2]);
    expect(ellipse?.strokes[0]?.paint.opacity).toBeCloseTo(0.5, 5);

    expect(() => DocumentDataSchema.parse(doc)).not.toThrow();
  });

  it('skips internal-only canvases with an info issue', () => {
    const changes = [
      { guid: guid(0, 0), type: 'DOCUMENT', name: 'Doc' },
      {
        guid: guid(0, 1),
        parentIndex: parent(0, 0, '!'),
        type: 'CANVAS',
        name: 'Internal Only Canvas',
        internalOnly: true,
      },
      { guid: guid(0, 2), parentIndex: parent(0, 0, '"'), type: 'CANVAS', name: 'Page 1' },
    ];
    const result = parseFigFile(buildFig(changes));
    expect(nodesOfType(result.document, 'PAGE')).toHaveLength(1);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'info', code: 'internal-canvas-skipped' }),
    );
  });

  it('aborts with too-many-nodes instead of attempting a huge tree', () => {
    const changes: unknown[] = [{ guid: guid(0, 0), type: 'DOCUMENT', name: 'Doc' }];
    for (let i = 1; i <= MAX_NODE_CHANGES; i++) {
      changes.push({ guid: guid(1, i), type: 'RECTANGLE', name: `r${i}` });
    }
    const result = parseFigFile(buildFig(changes));
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'too-many-nodes' }),
    );
    expect(result.report.imported).toBe(0);
    expect(Object.keys(result.document.nodes)).toHaveLength(1); // synthetic root only
  });

  it('records the payload version in an info issue', () => {
    const result = parseFigFile(buildFig(happyPathChanges(), { version: 42 }));
    const info = result.report.issues.find((i) => i.code === 'fig-version');
    expect(info?.message).toContain('42');
  });
});

// ---------------------------------------------------------------------------
// Hostile inputs: decompression bombs and kiwi allocation bombs. These are
// regression tests for DoS guards — each crafted file previously either
// materialized its full decompressed output in one allocation (fflate emits
// a single ondata per whole-chunk push) or let kiwi allocate one object per
// declared nodeChange before MAX_NODE_CHANGES was ever checked.
// ---------------------------------------------------------------------------

describe('parseFigFile DoS guards', () => {
  function figHeader(): Uint8Array {
    const header = new Uint8Array(12);
    header.set(new TextEncoder().encode('fig-kiwi'), 0);
    new DataView(header.buffer).setUint32(8, 101, true);
    return header;
  }

  /** Kiwi varuint encoding: little-endian 7-bit groups with continuation bit. */
  function varuint(value: number): number[] {
    const out: number[] = [];
    let v = value;
    while (v > 127) {
      out.push((v % 128) | 128);
      v = Math.floor(v / 128);
    }
    out.push(v);
    return out;
  }

  it('aborts a raw-DEFLATE decompression bomb at the byte budget', () => {
    // ~1.1 MiB compressed data chunk that inflates to 256 MiB of zeros. The
    // attacker picks the compression method, so the deflate path must abort
    // mid-stream just like the zstd path does.
    const bomb = new Uint8Array(
      deflateRawSync(new Uint8Array(MAX_DECOMPRESSED_BYTES), { level: 1 }),
    );
    const bytes = concatBytes(
      figHeader(),
      lengthPrefixed(compress(binarySchema, 'deflate')),
      lengthPrefixed(bomb),
    );
    const result = parseFigFile(bytes);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'file-too-large' }),
    );
    expect(result.report.imported).toBe(0);
  });

  it('aborts a zlib decompression bomb at the byte budget', () => {
    const bomb = new Uint8Array(
      zlibDeflateSync(new Uint8Array(MAX_DECOMPRESSED_BYTES + 1), { level: 1 }),
    );
    const bytes = concatBytes(
      figHeader(),
      lengthPrefixed(bomb),
      lengthPrefixed(compress(new Uint8Array([0]), 'deflate')),
    );
    const result = parseFigFile(bytes);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'file-too-large' }),
    );
    expect(result.report.imported).toBe(0);
  });

  it('rejects a data chunk declaring a huge nodeChanges count before kiwi decodes it', () => {
    // Field id 1 (nodeChanges) followed by a declared array length of 2^28.
    // The bounds scan must reject this as too-many-nodes BEFORE the generated
    // kiwi decoder gets a chance to allocate; the old post-decode check would
    // have surfaced fig-decode-failed here instead (after attempting decode).
    const data = new Uint8Array([...varuint(1), ...varuint(268_435_456)]);
    const bytes = concatBytes(
      figHeader(),
      lengthPrefixed(compress(binarySchema, 'deflate')),
      lengthPrefixed(compress(data, 'deflate')),
    );
    const result = parseFigFile(bytes);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'too-many-nodes' }),
    );
    expect(result.report.imported).toBe(0);
    expect(Object.keys(result.document.nodes)).toHaveLength(1); // synthetic root only
  });

  it('rejects a zstd frame declaring a huge window before fzstd allocates it', () => {
    // fzstd pre-allocates its output window from the frame header BEFORE any
    // ondata callback runs, so the streaming budget alone cannot stop this:
    // a 6-byte "frame" with window-descriptor exponent 19 declares a 512 MiB
    // window. The parser must reject the declared size up front.
    const hugeWindowFrame = new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 0x00, 19 << 3]);
    const bytes = concatBytes(
      figHeader(),
      lengthPrefixed(compress(binarySchema, 'deflate')),
      lengthPrefixed(hugeWindowFrame),
    );
    const result = parseFigFile(bytes);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'file-too-large' }),
    );
    expect(result.report.imported).toBe(0);
  });

  it('rejects zero-byte-per-entry amplification instead of scanning forever', () => {
    // Hostile schema: array entries of a zero-field struct consume no input
    // bytes, so a tiny chunk can declare 4 billion entries. The scan's op
    // budget must reject this quickly with a decode failure.
    const hostileSchema = encodeBinarySchema(
      parseSchema('struct Empty {}\nmessage Message { Empty[] xs = 1; }'),
    );
    const data = new Uint8Array([...varuint(1), ...varuint(4_000_000_000)]);
    const bytes = concatBytes(
      figHeader(),
      lengthPrefixed(compress(hostileSchema, 'deflate')),
      lengthPrefixed(compress(data, 'deflate')),
    );
    const result = parseFigFile(bytes);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'fig-decode-failed' }),
    );
    expect(result.report.imported).toBe(0);
  });
});
