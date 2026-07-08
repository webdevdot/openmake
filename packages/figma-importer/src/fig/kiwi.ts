import { ByteBuffer, compileSchema, decodeBinarySchema } from 'kiwi-schema';
import type { Definition, Field, Schema } from 'kiwi-schema';
import { MAX_NODE_CHANGES } from './mapper.js';

// ---------------------------------------------------------------------------
// Kiwi decode: every .fig file ships its own binary Kiwi schema (chunk 1),
// which we compile and then use to decode the data chunk's root `Message`.
// The shapes below are best-effort typings of Figma's undocumented internal
// format — every field is optional and the mapper treats them defensively.
// ---------------------------------------------------------------------------

export interface FigGuid {
  sessionID?: number;
  localID?: number;
}

export interface FigParentIndex {
  guid?: FigGuid;
  /** Fractional-index string; lexicographic order = sibling order. */
  position?: string;
}

export interface FigVec {
  x?: number;
  y?: number;
}

export interface FigMatrix {
  m00?: number;
  m01?: number;
  m02?: number;
  m10?: number;
  m11?: number;
  m12?: number;
}

export interface FigColor {
  r?: number;
  g?: number;
  b?: number;
  a?: number;
}

export interface FigPaint {
  type?: string;
  color?: FigColor;
  opacity?: number;
  visible?: boolean;
}

export interface FigNumberWithUnits {
  value?: number;
  units?: string;
}

export interface FigEffect {
  type?: string;
  color?: FigColor;
  offset?: FigVec;
  radius?: number;
  spread?: number;
  visible?: boolean;
}

export interface FigFontName {
  family?: string;
  style?: string;
}

export interface FigTextData {
  characters?: string;
}

export interface FigNodeChange {
  guid?: FigGuid;
  parentIndex?: FigParentIndex;
  type?: string;
  name?: string;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  blendMode?: string;
  size?: FigVec;
  transform?: FigMatrix;
  fillPaints?: FigPaint[];
  strokePaints?: FigPaint[];
  strokeWeight?: number;
  strokeAlign?: string;
  dashPattern?: number[];
  cornerRadius?: number;
  rectangleTopLeftCornerRadius?: number;
  rectangleTopRightCornerRadius?: number;
  rectangleBottomLeftCornerRadius?: number;
  rectangleBottomRightCornerRadius?: number;
  count?: number;
  starInnerScale?: number;
  textData?: FigTextData;
  fontName?: FigFontName;
  fontSize?: number;
  textAlignHorizontal?: string;
  letterSpacing?: number | FigNumberWithUnits;
  lineHeight?: number | FigNumberWithUnits;
  stackMode?: string;
  stackSpacing?: number;
  itemSpacing?: number;
  stackHorizontalPadding?: number;
  stackVerticalPadding?: number;
  stackPaddingRight?: number;
  stackPaddingBottom?: number;
  stackPrimaryAlignItems?: string;
  stackCounterAlignItems?: string;
  effects?: FigEffect[];
  backgroundColor?: FigColor;
  internalOnly?: boolean;
}

export interface FigMessage {
  nodeChanges?: FigNodeChange[];
  blobs?: unknown[];
}

export type KiwiErrorCode =
  'fig-schema-invalid' | 'fig-schema-missing-message' | 'fig-decode-failed' | 'too-many-nodes';

export type KiwiResult =
  { ok: true; message: FigMessage } | { ok: false; code: KiwiErrorCode; message: string };

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// Pre-decode bounds scan.
//
// Kiwi's generated decoder runs `Array(length)` and then allocates one object
// per array entry BEFORE the mapper's MAX_NODE_CHANGES check can run, so a
// hostile data chunk declaring millions of (1-byte) empty NodeChanges would
// OOM the tab during decode. This pass walks the data chunk using the SAME
// ByteBuffer reads the generated decoder performs — byte-for-byte, so it
// accepts/rejects exactly the same inputs — but allocates nothing per entry,
// and rejects oversized `Message.nodeChanges` before decode may allocate.
// ---------------------------------------------------------------------------

/** Recursion guard: real Figma schemas nest well under 10 levels deep. */
const MAX_SCAN_DEPTH = 64;

type ScanErrorCode = 'too-many-nodes' | 'fig-decode-failed';

class ScanAbort extends Error {
  readonly code: ScanErrorCode;
  constructor(code: ScanErrorCode, message: string) {
    super(message);
    this.name = 'ScanAbort';
    this.code = code;
  }
}

type ScanResult = { ok: true } | { ok: false; code: ScanErrorCode; message: string };

const PRIMITIVE_SKIPPERS: Record<string, (bb: ByteBuffer) => unknown> = {
  bool: (bb) => bb.readByte(),
  byte: (bb) => bb.readByte(),
  int: (bb) => bb.readVarInt(),
  uint: (bb) => bb.readVarUint(),
  float: (bb) => bb.readVarFloat(),
  string: (bb) => bb.readString(),
  int64: (bb) => bb.readVarInt64(),
  uint64: (bb) => bb.readVarUint64(),
};

function scanMessageBounds(schema: Schema, dataBytes: Uint8Array): ScanResult {
  const defsByName = new Map<string, Definition>();
  for (const def of schema.definitions) defsByName.set(def.name, def);
  const root = defsByName.get('Message');
  // No usable root: the decodeMessage presence check reports this case.
  if (root === undefined || root.kind === 'ENUM') return { ok: true };

  const fieldMaps = new Map<Definition, Map<number, Field>>();
  function fieldMap(def: Definition): Map<number, Field> {
    let map = fieldMaps.get(def);
    if (map === undefined) {
      map = new Map();
      for (const field of def.fields) map.set(field.value, field);
      fieldMaps.set(def, map);
    }
    return map;
  }

  const bb = new ByteBuffer(dataBytes);
  // CPU guard for the scan itself: every legitimately encoded value consumes
  // at least one input byte, so a linear budget suffices. Only degenerate
  // schemas (e.g. huge arrays of zero-field structs, whose entries consume no
  // input at all) can exceed it — exactly the amplification we must refuse.
  let opsLeft = dataBytes.length * 4 + 4096;
  function charge(): void {
    opsLeft--;
    if (opsLeft < 0) {
      throw new ScanAbort(
        'fig-decode-failed',
        'The .fig data chunk declares more values than its byte size could legitimately encode.',
      );
    }
  }

  function skipValue(typeName: string | null, depth: number): void {
    charge();
    if (depth > MAX_SCAN_DEPTH) {
      throw new ScanAbort(
        'fig-decode-failed',
        `The .fig data chunk nests values deeper than ${MAX_SCAN_DEPTH} levels.`,
      );
    }
    const primitive = typeName === null ? undefined : PRIMITIVE_SKIPPERS[typeName];
    if (primitive !== undefined) {
      primitive(bb);
      return;
    }
    const def = typeName === null ? undefined : defsByName.get(typeName);
    if (def === undefined) {
      // compileSchema rejects unknown field types, so this is unreachable in
      // practice; mirror the decoder's failure mode anyway.
      throw new ScanAbort(
        'fig-decode-failed',
        `The .fig data references an unknown type "${typeName ?? '<none>'}".`,
      );
    }
    if (def.kind === 'ENUM') {
      bb.readVarUint();
      return;
    }
    if (def.kind === 'STRUCT') {
      for (const field of def.fields) skipFieldValue(def, field, depth + 1);
      return;
    }
    // MESSAGE: (field id, value) pairs until the 0 terminator.
    const byValue = fieldMap(def);
    while (true) {
      charge();
      const id = bb.readVarUint();
      if (id === 0) return;
      const field = byValue.get(id);
      if (field === undefined) {
        // Same input the generated decoder rejects ("Attempted to parse
        // invalid message"), reported with the same error code.
        throw new ScanAbort(
          'fig-decode-failed',
          `Message type "${def.name}" has no field with id ${id}.`,
        );
      }
      skipFieldValue(def, field, depth + 1);
    }
  }

  function skipFieldValue(def: Definition, field: Field, depth: number): void {
    if (!field.isArray) {
      skipValue(field.type, depth);
      return;
    }
    if (field.type === 'byte') {
      charge();
      bb.readByteArray(); // length is bounds-checked before allocation
      return;
    }
    const length = bb.readVarUint();
    if (def === root && field.name === 'nodeChanges' && length > MAX_NODE_CHANGES) {
      throw new ScanAbort(
        'too-many-nodes',
        `File declares ${length} node changes; the importer caps at ${MAX_NODE_CHANGES}. Nothing was imported.`,
      );
    }
    for (let i = 0; i < length; i++) skipValue(field.type, depth);
  }

  try {
    skipValue(root.name, 0);
    return { ok: true };
  } catch (err) {
    if (err instanceof ScanAbort) return { ok: false, code: err.code, message: err.message };
    // ByteBuffer bounds errors: the generated decoder would throw the same
    // way on the same byte, so report it as a decode failure.
    return {
      ok: false,
      code: 'fig-decode-failed',
      message: `Could not decode the .fig data chunk: ${errorText(err)}`,
    };
  }
}

/**
 * Decode the .fig data chunk using the file's own binary Kiwi schema.
 * Figma's root message type is named `Message`, so the compiled codec must
 * expose `decodeMessage`. Never throws — malformed schema/data come back as
 * typed errors.
 */
export function decodeFigMessage(schemaBytes: Uint8Array, dataBytes: Uint8Array): KiwiResult {
  let schema: Schema;
  let compiled: Record<string, unknown>;
  try {
    schema = decodeBinarySchema(schemaBytes);
    // Codegen safety invariant: compileSchema builds its decoder source with
    // `new Function`, and `schema.package` is concatenated into that source
    // as a BARE identifier (kiwi-schema does not quote it). decodeBinarySchema
    // always yields `package: null`, which is what keeps attacker bytes out of
    // the generated code — assert it so a future switch to a text-parsed
    // schema (whose package name IS attacker-controlled) cannot silently
    // reopen this as an eval injection.
    if (schema.package !== null) {
      throw new Error('refusing to compile a Kiwi schema with a package name');
    }
    compiled = compileSchema(schema) as Record<string, unknown>;
  } catch (err) {
    return {
      ok: false,
      code: 'fig-schema-invalid',
      message: `Could not decode the embedded Kiwi schema: ${errorText(err)}`,
    };
  }

  const decodeMessage = compiled['decodeMessage'];
  if (typeof decodeMessage !== 'function') {
    return {
      ok: false,
      code: 'fig-schema-missing-message',
      message: 'The embedded Kiwi schema has no root "Message" type.',
    };
  }

  // DoS guard: verify declared node counts BEFORE the generated decoder is
  // allowed to allocate an object per declared entry.
  const scanned = scanMessageBounds(schema, dataBytes);
  if (!scanned.ok) return scanned;

  try {
    // Invoke with the compiled codec as receiver: the generated decoder
    // references sibling helpers (e.g. its ByteBuffer) through `this`.
    const message = (decodeMessage as (this: unknown, bytes: Uint8Array) => unknown).call(
      compiled,
      dataBytes,
    );
    if (message === null || typeof message !== 'object') {
      return {
        ok: false,
        code: 'fig-decode-failed',
        message: 'Decoded .fig data is not an object.',
      };
    }
    return { ok: true, message: message as FigMessage };
  } catch (err) {
    return {
      ok: false,
      code: 'fig-decode-failed',
      message: `Could not decode the .fig data chunk: ${errorText(err)}`,
    };
  }
}
