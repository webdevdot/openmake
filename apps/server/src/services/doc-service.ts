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

/**
 * Raised when a named version's `seq` can no longer be reconstructed from the
 * retained snapshots + log (its updates were compacted away and no snapshot
 * captures that exact point). We refuse rather than restore WRONG content.
 * In practice this never fires for versions created by {@link captureVersion},
 * which write a correctly-labelled snapshot at the captured seq.
 */
export class VersionUnavailableError extends Error {
  constructor(message = 'This version can no longer be reconstructed from history') {
    super(message);
    this.name = 'VersionUnavailableError';
  }
}

/**
 * Hydrates the exact Yjs state a file had as of `targetSeq`: the latest
 * snapshot at or before `targetSeq`, plus every update in
 * `(snapshot.upToSeq, targetSeq]`.
 *
 * Reconstruction is exact ONLY if all those updates are still retained. Since
 * seqs are contiguous and compaction only deletes a prefix, a short count means
 * a later compaction deleted updates this version needs — we throw
 * {@link VersionUnavailableError} instead of returning a wrong state.
 */
export async function loadMergedYDocAtSeq(
  db: Database,
  fileId: string,
  targetSeq: number,
): Promise<Y.Doc> {
  const snapshot = await db.docs.snapshotAtOrBefore(fileId, targetSeq);
  const baseSeq = snapshot?.upToSeq ?? 0;
  const updates = await db.docs.listUpdatesInRange(fileId, baseSeq, targetSeq);

  if (updates.length < targetSeq - baseSeq) {
    throw new VersionUnavailableError();
  }

  const ydoc = new Y.Doc();
  Y.transact(ydoc, () => {
    if (snapshot) Y.applyUpdate(ydoc, snapshot.state);
    for (const update of updates) Y.applyUpdate(ydoc, update.update);
  });
  return ydoc;
}

/**
 * Captures the current document state as a named checkpoint from ONE consistent
 * DB read, so the recorded state and its `seq` label always agree.
 *
 * It writes a correctly-labelled DocSnapshot at the captured seq (WITHOUT
 * deleting any updates — `saveSnapshot`, not `compact`) and then the DocVersion
 * label row. The extra snapshot is what makes the checkpoint durable: because
 * compaction never deletes snapshots, the version stays reconstructable forever,
 * even after the live log is compacted past it.
 */
export async function captureVersion(
  db: Database,
  fileId: string,
  name: string,
  authorId: string,
): Promise<{ id: string; name: string; seq: number; createdAt: Date }> {
  const snapshot = await findLatestSnapshot(db, fileId);
  const updates = await db.docs.listUpdatesSince(fileId, snapshot?.upToSeq ?? 0);
  const seq =
    updates.length > 0 ? Math.max(...updates.map((u) => u.seq)) : (snapshot?.upToSeq ?? 0);

  const ydoc = new Y.Doc();
  Y.transact(ydoc, () => {
    if (snapshot) Y.applyUpdate(ydoc, snapshot.state);
    for (const update of updates) Y.applyUpdate(ydoc, update.update);
  });
  const state = Y.encodeStateAsUpdate(ydoc);

  // Correctly-labelled checkpoint snapshot (additive; deletes nothing).
  await db.docs.saveSnapshot(fileId, seq, state);
  const version = await db.docs.createVersion({ fileId, name, seq, authorId });
  return { id: version.id, name: version.name, seq: version.seq, createdAt: version.createdAt };
}
