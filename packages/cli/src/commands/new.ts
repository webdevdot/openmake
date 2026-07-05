import { writeFile } from 'node:fs/promises';
import { OpenDoc } from '@openmake/core';
import type { CliIo } from '../io.js';

export async function newCommand(args: string[], io: CliIo): Promise<number> {
  const name = args[0];
  if (!name) {
    io.stderr('Usage: openmake new <name>\n');
    return 1;
  }

  const doc = OpenDoc.create({ name });
  const pageId = doc.getPages()[0]!;
  const frameId = doc.createNode({
    type: 'FRAME',
    parentId: pageId,
    name: 'Sample Frame',
    width: 320,
    height: 120,
    autoLayout: {
      mode: 'HORIZONTAL',
      gap: 16,
      paddingTop: 24,
      paddingRight: 24,
      paddingBottom: 24,
      paddingLeft: 24,
      alignItems: 'CENTER',
      justifyContent: 'MIN',
      wrap: false,
    },
  });
  doc.createNode({
    type: 'TEXT',
    parentId: frameId,
    name: 'Label',
    characters: 'Hello, openmake',
  });
  doc.createNode({
    type: 'RECTANGLE',
    parentId: frameId,
    name: 'Swatch',
    width: 24,
    height: 24,
  });

  const outFile = `${name}.omk.json`;
  await writeFile(outFile, JSON.stringify(doc.toJSON(), null, 2), 'utf8');
  io.stdout(`Created ${outFile}\n`);
  return 0;
}
