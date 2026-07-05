import type { Database } from '@openmake/database';
import type { OpenDoc } from '@openmake/core';
import type { DocumentStore } from '@openmake/mcp';
import { loadOpenDoc, persistFullState } from '../services/doc-service.js';

/** DocumentStore scoped to a single org's files, for MCP. */
export class PgDocumentStore implements DocumentStore {
  constructor(
    private readonly db: Database,
    private readonly orgId: string,
  ) {}

  async listFiles(): Promise<Array<{ id: string; name: string; projectId?: string }>> {
    const files = await this.db.prisma.file.findMany({
      where: { project: { orgId: this.orgId }, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    return files.map((file) => ({ id: file.id, name: file.name, projectId: file.projectId }));
  }

  /** Rejects any file id that is not owned by this store's org (cross-tenant IDOR guard). */
  private async assertOwned(fileId: string): Promise<void> {
    const file = await this.db.prisma.file.findFirst({
      where: { id: fileId, deletedAt: null, project: { orgId: this.orgId } },
      select: { id: true },
    });
    if (!file) throw new Error(`File "${fileId}" not found`);
  }

  async loadDocument(fileId: string): Promise<OpenDoc> {
    await this.assertOwned(fileId);
    return loadOpenDoc(this.db, fileId);
  }

  async saveDocument(fileId: string, doc: OpenDoc): Promise<void> {
    await this.assertOwned(fileId);
    await persistFullState(this.db, fileId, doc.ydoc);
  }
}

/** Wraps a PgDocumentStore so `saveDocument` always throws — for read-only API keys. */
export class ReadOnlyDocumentStore implements DocumentStore {
  constructor(private readonly inner: DocumentStore) {}

  listFiles(): Promise<Array<{ id: string; name: string; projectId?: string }>> {
    return this.inner.listFiles();
  }

  loadDocument(fileId: string): Promise<OpenDoc> {
    return this.inner.loadDocument(fileId);
  }

  async saveDocument(_fileId: string, _doc: OpenDoc): Promise<void> {
    throw new Error('read-only API key');
  }
}
