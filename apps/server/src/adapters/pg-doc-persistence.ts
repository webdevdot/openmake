import type { Database } from '@openmake/database';
import type { DocPersistence } from '@openmake/collab/server';

/**
 * DocPersistence backed by `DocRepo`, for use by a single `DocSyncHub`
 * singleton shared across all `/sync/:fileId` connections.
 */
export class PgDocPersistence implements DocPersistence {
  /** Tracks the highest seq appended per fileId, so saveSnapshot can compact without a re-query. */
  private readonly lastSeq = new Map<string, number>();

  constructor(private readonly db: Database) {}

  /**
   * `DocRepo.latestSnapshot` only orders by `upToSeq`, which is ambiguous
   * when multiple snapshots share the same `upToSeq` (repeated full-state
   * compactions of a doc with no discrete updates in between) — break ties
   * by `createdAt` here.
   */
  private findLatestSnapshot(docId: string) {
    return this.db.prisma.docSnapshot.findFirst({
      where: { fileId: docId },
      orderBy: [{ upToSeq: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async load(docId: string): Promise<{ snapshot?: Uint8Array; updates: Uint8Array[] }> {
    const snapshot = await this.findLatestSnapshot(docId);
    const updates = await this.db.docs.listUpdatesSince(docId, snapshot?.upToSeq ?? 0);
    if (updates.length > 0) {
      const maxSeq = Math.max(...updates.map((u) => u.seq));
      this.lastSeq.set(docId, maxSeq);
    } else if (snapshot) {
      this.lastSeq.set(docId, snapshot.upToSeq);
    }
    return {
      snapshot: snapshot?.state,
      updates: updates.map((u) => u.update),
    };
  }

  async appendUpdate(docId: string, update: Uint8Array): Promise<void> {
    const created = await this.db.docs.appendUpdate(docId, update);
    this.lastSeq.set(docId, created.seq);
  }

  async saveSnapshot(docId: string, state: Uint8Array, _updateCount: number): Promise<void> {
    const upToSeq = this.lastSeq.get(docId) ?? 0;
    await this.db.docs.compact(docId, upToSeq, state);
  }
}
