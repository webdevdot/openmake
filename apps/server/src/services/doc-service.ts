import type { Database } from '@openmake/database';
import { OpenDoc } from '@openmake/core';
import * as Y from 'yjs';

/**
 * Finds the latest snapshot for a file. `DocRepo.latestSnapshot` only orders
 * by `upToSeq`, which is ambiguous when multiple snapshots share the same
 * `upToSeq` (e.g. repeated full-state compactions of a doc with no discrete
 * updates in between) — so we break ties by `createdAt` here.
 */
async function findLatestSnapshot(db: Database, fileId: string) {
  return db.prisma.docSnapshot.findFirst({
    where: { fileId },
    orderBy: [{ upToSeq: 'desc' }, { createdAt: 'desc' }],
  });
}

/** Hydrates the merged Yjs state for a file: latest snapshot + updates since. */
export async function loadMergedYDoc(db: Database, fileId: string): Promise<Y.Doc> {
  const snapshot = await findLatestSnapshot(db, fileId);
  const updates = await db.docs.listUpdatesSince(fileId, snapshot?.upToSeq ?? 0);

  const ydoc = new Y.Doc();
  Y.transact(ydoc, () => {
    if (snapshot) Y.applyUpdate(ydoc, snapshot.state);
    for (const update of updates) Y.applyUpdate(ydoc, update.update);
  });
  return ydoc;
}

/** Hydrates a file's document as an OpenDoc (wraps loadMergedYDoc). */
export async function loadOpenDoc(db: Database, fileId: string): Promise<OpenDoc> {
  const ydoc = await loadMergedYDoc(db, fileId);
  return OpenDoc.fromYDoc(ydoc);
}

/**
 * Persists the full current state of a Y.Doc as a compacted snapshot,
 * replacing any raw updates at or below the current max sequence.
 */
export async function persistFullState(db: Database, fileId: string, ydoc: Y.Doc): Promise<void> {
  const state = Y.encodeStateAsUpdate(ydoc);
  const updates = await db.docs.listUpdatesSince(fileId, 0);
  const maxSeq = updates.length > 0 ? Math.max(...updates.map((u) => u.seq)) : 0;
  await db.docs.compact(fileId, maxSeq, state);
}
