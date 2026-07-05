import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from '../src/index.js';
import type { CliIo } from '../src/io.js';

function captureIo(): CliIo & { out: string; err: string } {
  const io = {
    out: '',
    err: '',
    stdout(text: string) {
      io.out += text;
    },
    stderr(text: string) {
      io.err += text;
    },
  };
  return io;
}

describe('openmake CLI', () => {
  let dir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'openmake-cli-'));
    process.chdir(dir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  });

  it('--help prints usage and exits 0', async () => {
    const io = captureIo();
    const code = await run(['--help'], io);
    expect(code).toBe(0);
    expect(io.out).toContain('Usage:');
  });

  it('unknown command exits 1 with usage on stderr', async () => {
    const io = captureIo();
    const code = await run(['bogus'], io);
    expect(code).toBe(1);
    expect(io.err).toContain('Unknown command');
  });

  it('new followed by export-json roundtrips', async () => {
    const io = captureIo();
    const createCode = await run(['new', 'demo'], io);
    expect(createCode).toBe(0);

    const file = path.join(dir, 'demo.omk.json');
    const raw = await readFile(file, 'utf8');
    const json = JSON.parse(raw);
    expect(json.name).toBe('demo');

    const io2 = captureIo();
    const exportCode = await run(['export-json', file], io2);
    expect(exportCode).toBe(0);
    expect(io2.out).toContain('Document: demo');
    expect(io2.out).toMatch(/Pages: 1/);
    expect(io2.out).toMatch(/Nodes: \d+/);
  });

  it('export-json exits 1 on invalid JSON', async () => {
    const file = path.join(dir, 'bad.omk.json');
    await import('node:fs/promises').then((fs) => fs.writeFile(file, '{ not json', 'utf8'));
    const io = captureIo();
    const code = await run(['export-json', file], io);
    expect(code).toBe(1);
    expect(io.err).toMatch(/invalid json/i);
  });

  it('codegen writes a .tsx file containing "export function"', async () => {
    await run(['new', 'demo'], captureIo());
    const file = path.join(dir, 'demo.omk.json');
    const raw = await readFile(file, 'utf8');
    const json = JSON.parse(raw) as { rootId: string; nodes: Record<string, { type: string; children?: string[] }> };
    const pageId = json.nodes[json.rootId]?.children?.[0];
    const frameId = pageId ? json.nodes[pageId]?.children?.[0] : undefined;
    expect(frameId).toBeTruthy();

    const outDir = path.join(dir, 'out');
    const io = captureIo();
    const code = await run(['codegen', file, frameId!, '--framework', 'REACT', '--out', outDir], io);
    expect(code).toBe(0);

    const files = await import('node:fs/promises').then((fs) => fs.readdir(outDir));
    const tsxFile = files.find((f) => f.endsWith('.tsx'));
    expect(tsxFile).toBeTruthy();
    const content = await readFile(path.join(outDir, tsxFile!), 'utf8');
    expect(content).toContain('export function');
  });
});
