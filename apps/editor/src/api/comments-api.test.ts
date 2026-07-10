import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commentsApi } from './endpoints.js';
import { configureApiClient } from './client.js';
import type { Comment } from './types.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const sampleComment: Comment = {
  id: 'c1',
  fileId: 'f1',
  nodeId: null,
  authorId: 'u1',
  body: 'hello',
  anchorX: 12,
  anchorY: 34,
  resolvedAt: null,
  parentId: null,
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  replies: [],
};

describe('commentsApi', () => {
  beforeEach(() => {
    configureApiClient({
      getAccessToken: () => 'token',
      setAccessToken: () => {},
      onLogout: () => {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('list() unwraps the { comments } envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonResponse(200, { comments: [sampleComment] })),
    );
    const result = await commentsApi.list('f1');
    expect(result).toEqual([sampleComment]);
  });

  it('create() POSTs anchorX/anchorY in the body and unwraps { comment }', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(201, { comment: sampleComment }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await commentsApi.create('f1', { body: 'hi', anchorX: 12, anchorY: 34 });
    expect(result).toEqual(sampleComment);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/files/f1/comments');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ body: 'hi', anchorX: 12, anchorY: 34 });
  });

  it('setResolved() PATCHes { resolved } to the comment URL', async () => {
    const resolved = { ...sampleComment, resolvedAt: '2026-07-10T01:00:00.000Z' };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, { comment: resolved }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await commentsApi.setResolved('f1', 'c1', true);
    expect(result.resolvedAt).not.toBeNull();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/files/f1/comments/c1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ resolved: true });
  });

  it('delete() issues a DELETE to the comment URL', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(commentsApi.delete('f1', 'c1')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/files/f1/comments/c1');
    expect(init.method).toBe('DELETE');
  });
});
