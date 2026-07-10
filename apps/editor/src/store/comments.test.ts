import { beforeEach, describe, expect, it, vi } from 'vitest';

const list = vi.fn();
const create = vi.fn();
const setResolvedApi = vi.fn();
const del = vi.fn();

vi.mock('../api/endpoints.js', () => ({
  commentsApi: {
    list: (...args: unknown[]) => list(...args),
    create: (...args: unknown[]) => create(...args),
    setResolved: (...args: unknown[]) => setResolvedApi(...args),
    delete: (...args: unknown[]) => del(...args),
  },
}));

import { useCommentsStore } from './comments.js';
import type { Comment } from '../api/types.js';

function makeComment(over: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    fileId: 'f1',
    nodeId: null,
    authorId: 'u1',
    body: 'body',
    anchorX: 10,
    anchorY: 20,
    resolvedAt: null,
    parentId: null,
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...over,
  };
}

describe('comments store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCommentsStore.getState().reset();
    useCommentsStore.setState({ showResolved: false });
  });

  it('load() fetches threads for the file and normalizes replies to arrays', async () => {
    list.mockResolvedValueOnce([makeComment({ id: 'a', replies: undefined })]);
    await useCommentsStore.getState().load('f1');
    const s = useCommentsStore.getState();
    expect(list).toHaveBeenCalledWith('f1');
    expect(s.fileId).toBe('f1');
    expect(s.threads[0]!.replies).toEqual([]);
    expect(s.loading).toBe(false);
  });

  it('startDraft + createThread POSTs the draft anchor and appends the new thread', async () => {
    useCommentsStore.setState({ fileId: 'f1' });
    useCommentsStore.getState().startDraft({ x: 55, y: 66 });
    create.mockResolvedValueOnce(makeComment({ id: 'new', anchorX: 55, anchorY: 66 }));

    await useCommentsStore.getState().createThread('  a fresh pin  ');

    expect(create).toHaveBeenCalledWith('f1', {
      body: 'a fresh pin',
      anchorX: 55,
      anchorY: 66,
    });
    const s = useCommentsStore.getState();
    expect(s.threads.map((t) => t.id)).toContain('new');
    expect(s.draftPin).toBeNull();
    expect(s.activeThreadId).toBe('new');
  });

  it('createThread is a no-op with no draft pin or empty body', async () => {
    useCommentsStore.setState({ fileId: 'f1', draftPin: null });
    await useCommentsStore.getState().createThread('hi');
    expect(create).not.toHaveBeenCalled();

    useCommentsStore.getState().startDraft({ x: 1, y: 2 });
    await useCommentsStore.getState().createThread('   ');
    expect(create).not.toHaveBeenCalled();
  });

  it('reply() nests the created reply under its parent thread', async () => {
    useCommentsStore.setState({ fileId: 'f1', threads: [makeComment({ id: 'p', replies: [] })] });
    create.mockResolvedValueOnce(
      makeComment({ id: 'r', parentId: 'p', anchorX: null, anchorY: null }),
    );

    await useCommentsStore.getState().reply('p', 'a reply');

    expect(create).toHaveBeenCalledWith('f1', { body: 'a reply', parentId: 'p' });
    const parent = useCommentsStore.getState().threads.find((t) => t.id === 'p')!;
    expect(parent.replies!.map((r) => r.id)).toEqual(['r']);
  });

  it('setResolved() updates resolvedAt in place from the server response', async () => {
    useCommentsStore.setState({ fileId: 'f1', threads: [makeComment({ id: 'p' })] });
    setResolvedApi.mockResolvedValueOnce(
      makeComment({ id: 'p', resolvedAt: '2026-07-10T02:00:00.000Z' }),
    );

    await useCommentsStore.getState().setResolved('p', true);

    expect(setResolvedApi).toHaveBeenCalledWith('f1', 'p', true);
    expect(useCommentsStore.getState().threads[0]!.resolvedAt).not.toBeNull();
  });

  it('remove() drops a top-level thread and clears the active id', async () => {
    useCommentsStore.setState({
      fileId: 'f1',
      threads: [makeComment({ id: 'p' })],
      activeThreadId: 'p',
    });
    del.mockResolvedValueOnce(undefined);

    await useCommentsStore.getState().remove('p');

    expect(del).toHaveBeenCalledWith('f1', 'p');
    expect(useCommentsStore.getState().threads).toHaveLength(0);
    expect(useCommentsStore.getState().activeThreadId).toBeNull();
  });

  it('remove() drops a nested reply without removing its parent', async () => {
    useCommentsStore.setState({
      fileId: 'f1',
      threads: [makeComment({ id: 'p', replies: [makeComment({ id: 'r', parentId: 'p' })] })],
    });
    del.mockResolvedValueOnce(undefined);

    await useCommentsStore.getState().remove('r');

    const parent = useCommentsStore.getState().threads.find((t) => t.id === 'p')!;
    expect(parent).toBeDefined();
    expect(parent.replies).toEqual([]);
  });
});
