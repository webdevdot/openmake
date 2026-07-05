import { readFile } from 'node:fs/promises';
import { OpenDoc } from '@openmake/core';
import type { CliIo } from '../io.js';

export async function exportJsonCommand(args: string[], io: CliIo): Promise<number> {
  const file = args[0];
  if (!file) {
    io.stderr('Usage: openmake export-json <file.omk.json>\n');
    return 1;
  }

  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    io.stderr(`Could not read "${file}": ${(err as Error).message}\n`);
    return 1;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    io.stderr(`Invalid JSON in "${file}": ${(err as Error).message}\n`);
    return 1;
  }

  let doc: OpenDoc;
  try {
    doc = OpenDoc.fromJSON(json as never);
  } catch (err) {
    io.stderr(`Invalid openmake document in "${file}": ${(err as Error).message}\n`);
    return 1;
  }

  const data = doc.toJSON();
  const pageCount = doc.getPages().length;
  const nodeCount = Object.keys(data.nodes).length;

  io.stdout(`Document: ${data.name}\n`);
  io.stdout(`Pages: ${pageCount}\n`);
  io.stdout(`Nodes: ${nodeCount}\n`);
  return 0;
}
