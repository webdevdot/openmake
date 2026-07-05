import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { SocketLike } from '@openmake/collab/server';
import { verifyAccessToken } from '../services/auth-service.js';
import { resolveOrgIdFromFile } from '../plugins/auth.js';

const ParamsSchema = z.object({ fileId: z.string().min(1) });
const QuerySchema = z.object({ token: z.string().optional() });

const POLICY_VIOLATION_CODE = 4001;

interface RawWebSocket {
  send(data: Uint8Array | Buffer): void;
  close(code?: number, reason?: string): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
  readyState: number;
}

function toUint8Array(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (Buffer.isBuffer(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (Array.isArray(data)) {
    const buffers = data.filter((chunk): chunk is Buffer => Buffer.isBuffer(chunk));
    if (buffers.length === data.length) return new Uint8Array(Buffer.concat(buffers));
    return null;
  }
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return null;
}

function wrapSocket(ws: RawWebSocket): SocketLike {
  return {
    send(data: Uint8Array) {
      ws.send(Buffer.from(data));
    },
    close() {
      ws.close();
    },
    on(event: 'message' | 'close' | 'error', cb: (data?: unknown) => void) {
      if (event === 'message') {
        ws.on('message', (...args: unknown[]) => {
          const data = toUint8Array(args[0]);
          cb(data ?? undefined);
        });
      } else {
        ws.on(event, () => cb());
      }
    },
  };
}

export async function syncRoutes(app: FastifyInstance): Promise<void> {
  app.get('/sync/:fileId', { websocket: true }, async (connection, request) => {
    const socket = connection as unknown as RawWebSocket;

    const paramsResult = ParamsSchema.safeParse(request.params);
    const queryResult = QuerySchema.safeParse(request.query);

    if (!paramsResult.success || !queryResult.success) {
      socket.close(POLICY_VIOLATION_CODE, 'invalid request');
      return;
    }

    const { fileId } = paramsResult.data;
    const { token } = queryResult.data;

    if (!token) {
      socket.close(POLICY_VIOLATION_CODE, 'missing token');
      return;
    }

    let userId: string;
    try {
      const payload = verifyAccessToken(app.config, token);
      userId = payload.sub;
    } catch {
      socket.close(POLICY_VIOLATION_CODE, 'invalid token');
      return;
    }

    const orgId = await resolveOrgIdFromFile(app, fileId);
    if (!orgId) {
      socket.close(POLICY_VIOLATION_CODE, 'not found');
      return;
    }

    const canView = await app.db.orgs.hasAtLeastRole(orgId, userId, 'VIEWER');
    if (!canView) {
      socket.close(POLICY_VIOLATION_CODE, 'forbidden');
      return;
    }
    // VIEWERs get a live read-only connection (updates + awareness, no writes);
    // only EDITOR+ may mutate the document over the socket — matching REST.
    const canEdit = await app.db.orgs.hasAtLeastRole(orgId, userId, 'EDITOR');

    await app.docSyncHub.handleConnection(wrapSocket(socket), fileId, { readOnly: !canEdit });
  });
}
