import type {
  DocSnapshot,
  DocUpdate,
  DocVersion,
  PrismaClient,
} from '../../generated/client/client.js';

export interface CreateVersionInput {
  fileId: string;
  name: string;
  seq: number;
  authorId: string;
}

/** A named version enriched with its author's public identity, for listings. */
export type DocVersionWithAuthor = DocVersion & {
  author: { id: string; name: string };
};

export class DocRepo {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Appends a Yjs update, assigning it the next sequence number for the file.
   * Concurrent callers each get a distinct, monotonically increasing seq.
   * The read-then-insert runs inside a Serializable transaction so Postgres
   * itself detects conflicting concurrent appends and aborts one side,
   * which we retry with backoff until it lands.
   */
  async appendUpdate(fileId: string, update: Uint8Array): Promise<DocUpdate> {
    const buf = Buffer.from(update);
    const maxAttempts = 20;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const last = await tx.docUpdate.findFirst({
              where: { fileId },
              orderBy: { seq: 'desc' },
              select: { seq: true },
            });
            const nextSeq = (last?.seq ?? 0) + 1;
            return tx.docUpdate.create({
              data: { fileId, seq: nextSeq, update: buf },
            });
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (err) {
        const code = (err as { code?: string } | null)?.code;
        // P2002: unique constraint race; P2034: serialization/deadlock conflict.
        const isRetryable = code === 'P2002' || code === 'P2034';
        if (!isRetryable || attempt === maxAttempts - 1) throw err;
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 10 * (attempt + 1)));
      }
    }
    throw new Error('appendUpdate: exhausted retries');
  }

  /** Lists updates for a file strictly after the given sequence, in order. */
  listUpdatesSince(fileId: string, seq: number): Promise<DocUpdate[]> {
    return this.prisma.docUpdate.findMany({
      where: { fileId, seq: { gt: seq } },
      orderBy: { seq: 'asc' },
    });
  }

  saveSnapshot(fileId: string, upToSeq: number, state: Uint8Array): Promise<DocSnapshot> {
    return this.prisma.docSnapshot.create({
      data: { fileId, upToSeq, state: Buffer.from(state) },
    });
  }

  latestSnapshot(fileId: string): Promise<DocSnapshot | null> {
    return this.prisma.docSnapshot.findFirst({
      where: { fileId },
      orderBy: { upToSeq: 'desc' },
    });
  }

  /**
   * The highest sequence currently represented for a file: the max of the
   * latest raw update's seq and the latest snapshot's `upToSeq` (compaction
   * deletes updates but records their high-water mark on the snapshot). Returns
   * 0 for a file with no updates and no snapshots.
   */
  async maxSeq(fileId: string): Promise<number> {
    const [lastUpdate, latestSnapshot] = await Promise.all([
      this.prisma.docUpdate.findFirst({
        where: { fileId },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      }),
      this.prisma.docSnapshot.findFirst({
        where: { fileId },
        orderBy: [{ upToSeq: 'desc' }, { createdAt: 'desc' }],
        select: { upToSeq: true },
      }),
    ]);
    return Math.max(lastUpdate?.seq ?? 0, latestSnapshot?.upToSeq ?? 0);
  }

  /** The latest snapshot whose `upToSeq` is at or below `seq` (reconstruction base). */
  snapshotAtOrBefore(fileId: string, seq: number): Promise<DocSnapshot | null> {
    return this.prisma.docSnapshot.findFirst({
      where: { fileId, upToSeq: { lte: seq } },
      orderBy: [{ upToSeq: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** Updates in the half-open range `(afterSeq, throughSeq]`, in order. */
  listUpdatesInRange(fileId: string, afterSeq: number, throughSeq: number): Promise<DocUpdate[]> {
    return this.prisma.docUpdate.findMany({
      where: { fileId, seq: { gt: afterSeq, lte: throughSeq } },
      orderBy: { seq: 'asc' },
    });
  }

  /** Recent auto-compaction snapshots for a file, newest first. */
  listSnapshots(fileId: string, take = 20): Promise<DocSnapshot[]> {
    return this.prisma.docSnapshot.findMany({
      where: { fileId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  // ---------------------------------------------------------------------------
  // Named versions (labels pointing at a log seq; store no document state)
  // ---------------------------------------------------------------------------

  createVersion(input: CreateVersionInput): Promise<DocVersion> {
    return this.prisma.docVersion.create({ data: input });
  }

  /** Named versions for a file, newest first, with author identity. */
  listVersions(fileId: string): Promise<DocVersionWithAuthor[]> {
    return this.prisma.docVersion.findMany({
      where: { fileId },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { id: true, name: true } } },
    });
  }

  findVersionById(id: string): Promise<DocVersion | null> {
    return this.prisma.docVersion.findUnique({ where: { id } });
  }

  /**
   * Writes a new snapshot covering updates up to `upToSeq`, then deletes
   * updates at or below that sequence — all in one transaction so readers
   * never observe a state with neither the snapshot nor the raw updates.
   */
  async compact(fileId: string, upToSeq: number, state: Uint8Array): Promise<DocSnapshot> {
    return this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.docSnapshot.create({
        data: { fileId, upToSeq, state: Buffer.from(state) },
      });
      await tx.docUpdate.deleteMany({
        where: { fileId, seq: { lte: upToSeq } },
      });
      return snapshot;
    });
  }
}
