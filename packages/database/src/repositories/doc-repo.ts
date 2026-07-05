import type { DocSnapshot, DocUpdate, PrismaClient } from '../../generated/client/index.js';

export class DocRepo {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Appends a Yjs update, assigning it the next sequence number for the file.
   * Concurrent callers each get a distinct, monotonically increasing seq —
   * the seq is computed and the row inserted inside one serializable-ish
   * transaction retry loop to survive unique-constraint races.
   */
  async appendUpdate(fileId: string, update: Uint8Array): Promise<DocUpdate> {
    const buf = Buffer.from(update);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const last = await tx.docUpdate.findFirst({
            where: { fileId },
            orderBy: { seq: 'desc' },
            select: { seq: true },
          });
          const nextSeq = (last?.seq ?? 0) + 1;
          return tx.docUpdate.create({
            data: { fileId, seq: nextSeq, update: buf },
          });
        });
      } catch (err) {
        const isUniqueConflict =
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code?: string }).code === 'P2002';
        if (!isUniqueConflict || attempt === 4) throw err;
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
