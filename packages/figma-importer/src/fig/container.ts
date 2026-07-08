import { Inflate, Unzlib, unzipSync } from 'fflate';
import { Decompress as ZstdDecompress } from 'fzstd';

// ---------------------------------------------------------------------------
// .fig container handling: optional ZIP wrapper, 8-byte magic, uint32 LE
// version, then length-prefixed compressed chunks (chunk 1 = Kiwi schema,
// chunk 2 = data message). Everything here is browser-safe and never throws
// past its public API — errors come back as typed results.
// ---------------------------------------------------------------------------

/**
 * DoS guard: total decompressed bytes across all chunks (and the unzipped
 * payload) may not exceed this. This code runs in browsers on untrusted
 * files, so a tiny zip/zstd bomb must not be able to OOM the tab.
 */
export const MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024; // 256 MiB

export type ContainerErrorCode =
  | 'not-a-fig-file'
  | 'unsupported-fig-kind'
  | 'truncated-fig-file'
  | 'file-too-large'
  | 'decompress-failed';

export interface FigContainer {
  /** Little-endian uint32 following the magic; Figma's internal format version. */
  version: number;
  /** Decompressed Kiwi binary schema (chunk 1). */
  schemaBytes: Uint8Array;
  /** Decompressed Kiwi-encoded root Message (chunk 2). */
  dataBytes: Uint8Array;
}

export type ContainerResult =
  { ok: true; container: FigContainer } | { ok: false; code: ContainerErrorCode; message: string };

const DESIGN_MAGIC = 'fig-kiwi';
/** Known non-design magics: FigJam boards and Figma Slides decks. */
const OTHER_FIG_MAGICS = new Set(['fig-jam.', 'fig-deck']);

class BudgetExceededError extends Error {
  constructor() {
    super(`decompressed output exceeds the ${MAX_DECOMPRESSED_BYTES}-byte cap`);
    this.name = 'BudgetExceededError';
  }
}

interface Budget {
  used: number;
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Collects streamed decompression output while charging a shared budget,
 * throwing BudgetExceededError as soon as the cap is crossed (so a
 * decompression bomb aborts mid-stream instead of allocating everything).
 */
function makeCollector(budget: Budget): {
  ondata: (data: Uint8Array) => void;
  concat: () => Uint8Array;
} {
  const parts: Uint8Array[] = [];
  let total = 0;
  return {
    ondata(data: Uint8Array): void {
      budget.used += data.length;
      if (budget.used > MAX_DECOMPRESSED_BYTES) throw new BudgetExceededError();
      total += data.length;
      parts.push(data);
    },
    concat(): Uint8Array {
      const out = new Uint8Array(total);
      let offset = 0;
      for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
      }
      return out;
    },
  };
}

function isZstd(chunk: Uint8Array): boolean {
  return (
    chunk.length >= 4 &&
    chunk[0] === 0x28 &&
    chunk[1] === 0xb5 &&
    chunk[2] === 0x2f &&
    chunk[3] === 0xfd
  );
}

/**
 * fzstd pre-allocates its output window from the frame header BEFORE any
 * ondata callback runs, so a ~100-byte crafted header declaring a huge
 * window/content size forces a multi-GiB allocation the streaming budget
 * never sees. Read the declared window size (or single-segment content size)
 * from the header so oversized frames can be rejected up front. Returns 0
 * ("no claim") when the header is too short to read — fzstd will then fail
 * with its own truncation error inside the existing try/catch.
 */
function zstdDeclaredSize(chunk: Uint8Array): number {
  const desc = chunk[4];
  if (desc === undefined) return 0;
  const singleSegment = (desc & 0x20) !== 0;
  if (!singleSegment) {
    const wd = chunk[5];
    if (wd === undefined) return 0;
    const windowBase = 1 << (10 + (wd >> 3));
    return windowBase + (windowBase / 8) * (wd & 7);
  }
  // Single-segment frames have no window descriptor: the window is the frame
  // content size, stored after the dictionary-ID field. FCS field width is
  // 1/2/4/8 bytes for descriptor flag 0/1/2/3 (2-byte values are offset 256).
  const didBytes = [0, 1, 2, 4][desc & 3] as number;
  const fcsFlag = desc >> 6;
  const fcsBytes = fcsFlag === 0 ? 1 : fcsFlag === 1 ? 2 : fcsFlag === 2 ? 4 : 8;
  const offset = 5 + didBytes;
  if (chunk.length < offset + fcsBytes) return 0;
  let size = 0;
  for (let i = fcsBytes - 1; i >= 0; i -= 1) size = size * 256 + (chunk[offset + i] as number);
  return fcsBytes === 2 ? size + 256 : size;
}

/**
 * fflate's Inflate/Unzlib decompress everything a single `push` provides in
 * one `inflt` call and emit it as ONE `ondata`, so pushing a whole compressed
 * chunk at once would materialize a decompression bomb in full before the
 * budget check ever runs. Feeding fixed-size slices keeps each per-push
 * allocation bounded (64 KiB of DEFLATE input inflates to at most ~66 MiB)
 * and lets the shared budget abort mid-stream. Pushes that arrive after the
 * DEFLATE stream's final block (e.g. zlib's trailing Adler bytes) are safe:
 * inflt returns immediately once the stream is finished.
 */
const INFLATE_SLICE_BYTES = 64 * 1024;

/**
 * Decompress a chunk by sniffing its header: zstd magic → fzstd, zlib header
 * (0x78) → unzlib, anything else → raw DEFLATE. Older .fig files use deflate
 * for both chunks; newer ones use zstd for the data chunk.
 */
function decompressChunk(chunk: Uint8Array, budget: Budget): Uint8Array {
  const collector = makeCollector(budget);
  if (isZstd(chunk)) {
    if (zstdDeclaredSize(chunk) > MAX_DECOMPRESSED_BYTES) throw new BudgetExceededError();
    const stream = new ZstdDecompress((data) => collector.ondata(data));
    stream.push(chunk, true);
    return collector.concat();
  }
  const stream = chunk[0] === 0x78 ? new Unzlib(collector.ondata) : new Inflate(collector.ondata);
  // do-while so a zero-length chunk still gets one final push (and fails with
  // the same "unexpected EOF" error a single whole-chunk push produced).
  let offset = 0;
  do {
    const end = Math.min(offset + INFLATE_SLICE_BYTES, chunk.length);
    stream.push(chunk.subarray(offset, end), end >= chunk.length);
    offset = end;
  } while (offset < chunk.length);
  return collector.concat();
}

type UnwrapResult =
  { ok: true; payload: Uint8Array } | { ok: false; code: ContainerErrorCode; message: string };

/** If the bytes are a ZIP ('PK'), extract the canvas.fig (or first *.fig) entry. */
function unwrapZip(bytes: Uint8Array, budget: Budget): UnwrapResult {
  if (bytes.length < 2 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return { ok: true, payload: bytes };
  }
  let oversized = false;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter(file) {
        if (!file.name.toLowerCase().endsWith('.fig')) return false;
        if (file.originalSize > MAX_DECOMPRESSED_BYTES) {
          oversized = true;
          return false;
        }
        return true;
      },
    });
  } catch (err) {
    return {
      ok: false,
      code: 'not-a-fig-file',
      message: `Input looks like a ZIP archive but could not be read: ${errorText(err)}`,
    };
  }
  if (oversized) {
    return {
      ok: false,
      code: 'file-too-large',
      message: `A .fig entry in the ZIP archive exceeds the ${MAX_DECOMPRESSED_BYTES}-byte decompression cap.`,
    };
  }
  const names = Object.keys(entries);
  const chosen = names.includes('canvas.fig') ? 'canvas.fig' : names[0];
  const payload = chosen === undefined ? undefined : entries[chosen];
  if (payload === undefined) {
    return {
      ok: false,
      code: 'not-a-fig-file',
      message: 'ZIP archive contains no .fig entry.',
    };
  }
  budget.used += payload.length;
  if (budget.used > MAX_DECOMPRESSED_BYTES) {
    return {
      ok: false,
      code: 'file-too-large',
      message: `Unzipped payload exceeds the ${MAX_DECOMPRESSED_BYTES}-byte decompression cap.`,
    };
  }
  return { ok: true, payload };
}

/**
 * Parse the outer .fig container down to the decompressed schema + data
 * chunks. Returns a typed error instead of throwing on any malformed input.
 */
export function parseFigContainer(bytes: Uint8Array): ContainerResult {
  const budget: Budget = { used: 0 };

  const unwrapped = unwrapZip(bytes, budget);
  if (!unwrapped.ok) return unwrapped;
  const payload = unwrapped.payload;

  if (payload.length < 8) {
    return {
      ok: false,
      code: 'not-a-fig-file',
      message: `Input is only ${payload.length} bytes — too short to contain a .fig header.`,
    };
  }

  let magic = '';
  for (let i = 0; i < 8; i++) magic += String.fromCharCode(payload[i] ?? 0);
  if (magic !== DESIGN_MAGIC) {
    if (OTHER_FIG_MAGICS.has(magic)) {
      return {
        ok: false,
        code: 'unsupported-fig-kind',
        message: `File magic "${magic}" is a FigJam/Slides document; only Figma design files ("fig-kiwi") are supported.`,
      };
    }
    return {
      ok: false,
      code: 'not-a-fig-file',
      message: 'Input does not start with the "fig-kiwi" magic; this is not a Figma design file.',
    };
  }

  if (payload.length < 12) {
    return {
      ok: false,
      code: 'truncated-fig-file',
      message: 'File ends before the 4-byte version field.',
    };
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const version = view.getUint32(8, true);

  // Walk the length-prefixed chunks; we only need the first two (schema, data).
  const rawChunks: Uint8Array[] = [];
  let offset = 12;
  while (offset + 4 <= payload.length && rawChunks.length < 2) {
    const size = view.getUint32(offset, true);
    offset += 4;
    if (offset + size > payload.length) {
      return {
        ok: false,
        code: 'truncated-fig-file',
        message: `Chunk ${rawChunks.length + 1} claims ${size} bytes but only ${payload.length - offset} remain.`,
      };
    }
    rawChunks.push(payload.subarray(offset, offset + size));
    offset += size;
  }
  const rawSchema = rawChunks[0];
  const rawData = rawChunks[1];
  if (rawSchema === undefined || rawData === undefined) {
    return {
      ok: false,
      code: 'truncated-fig-file',
      message: `Expected a schema chunk and a data chunk; found ${rawChunks.length}.`,
    };
  }

  let schemaBytes: Uint8Array;
  let dataBytes: Uint8Array;
  try {
    schemaBytes = decompressChunk(rawSchema, budget);
    dataBytes = decompressChunk(rawData, budget);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return { ok: false, code: 'file-too-large', message: err.message };
    }
    return {
      ok: false,
      code: 'decompress-failed',
      message: `Failed to decompress a .fig chunk: ${errorText(err)}`,
    };
  }

  return { ok: true, container: { version, schemaBytes, dataBytes } };
}
