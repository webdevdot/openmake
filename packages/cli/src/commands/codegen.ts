import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { OpenDoc } from '@openmake/core';
import { getGenerator, type GeneratedFile } from '@openmake/codegen';
import type { CodegenFramework } from '@openmake/shared';
import { CODEGEN_FRAMEWORKS } from '@openmake/shared';
import { buildDesignContext } from '../context-builder.js';
import type { CliIo } from '../io.js';

interface ParsedArgs {
  file?: string;
  nodeId?: string;
  framework?: string;
  out?: string;
}

function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const parsed: ParsedArgs = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--framework') {
      parsed.framework = args[++i];
    } else if (arg === '--out') {
      parsed.out = args[++i];
    } else {
      positional.push(arg!);
    }
  }
  parsed.file = positional[0];
  parsed.nodeId = positional[1];
  return parsed;
}

export async function codegenCommand(args: string[], io: CliIo): Promise<number> {
  const { file, nodeId, framework, out } = parseArgs(args);

  if (!file || !nodeId || !framework || !out) {
    io.stderr('Usage: openmake codegen <file.omk.json> <nodeId> --framework REACT --out <dir>\n');
    return 1;
  }

  if (!CODEGEN_FRAMEWORKS.includes(framework as CodegenFramework)) {
    io.stderr(`Unknown framework "${framework}". Valid values: ${CODEGEN_FRAMEWORKS.join(', ')}\n`);
    return 1;
  }

  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    io.stderr(`Could not read "${file}": ${(err as Error).message}\n`);
    return 1;
  }

  let doc: OpenDoc;
  try {
    doc = OpenDoc.fromJSON(JSON.parse(raw));
  } catch (err) {
    io.stderr(`Invalid openmake document in "${file}": ${(err as Error).message}\n`);
    return 1;
  }

  let files: GeneratedFile[];
  try {
    const ctx = buildDesignContext(doc, nodeId);
    const generator = getGenerator(framework as CodegenFramework);
    files = generator.generate(ctx);
  } catch (err) {
    io.stderr(`Codegen failed: ${(err as Error).message}\n`);
    return 1;
  }

  await mkdir(out, { recursive: true });
  for (const f of files) {
    const target = path.join(out, f.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, f.content, 'utf8');
    io.stdout(`Wrote ${target}\n`);
  }
  return 0;
}
