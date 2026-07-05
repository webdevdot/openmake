#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { OpenDoc } from '@openmake/core';
import { DocumentDataSchema } from '@openmake/shared';
import { InMemoryDocumentStore, InMemoryIntelligenceStore } from './memory-stores.js';
import { createOpenmakeMcpServer } from './server.js';

/**
 * Stand-alone stdio launcher: serves the openmake MCP server backed by
 * in-memory stores, optionally seeded from an `.omk.json` document on disk.
 *
 * Usage: node ./stdio.js [--file <path.omk.json>]
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fileFlagIndex = args.indexOf('--file');
  const filePath = fileFlagIndex >= 0 ? args[fileFlagIndex + 1] : undefined;

  const documents = new InMemoryDocumentStore();
  const intelligence = new InMemoryIntelligenceStore();

  if (filePath) {
    const raw = await readFile(filePath, 'utf-8');
    const data = DocumentDataSchema.parse(JSON.parse(raw));
    const doc = OpenDoc.fromJSON(data);
    documents.seed(data.id, { name: data.name, doc });
  } else {
    documents.seed('default');
  }

  const server = createOpenmakeMcpServer({ documents, intelligence });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error('openmake MCP stdio server failed to start:', error);
  process.exit(1);
});
