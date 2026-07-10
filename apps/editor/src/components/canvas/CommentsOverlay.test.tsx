import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
const setResolvedApi = vi.fn();
const del = vi.fn();
const listApi = vi.fn();

vi.mock('../../api/endpoints.js', () => ({
  commentsApi: {
    list: (...a: unknown[]) => listApi(...a),
    create: (...a: unknown[]) => create(...a),
    setResolved: (...a: unknown[]) => setResolvedApi(...a),
    delete: (...a: unknown[]) => del(...a),
  },
}));

import { CommentsOverlay } from './CommentsOverlay.js';
import { useCommentsStore } from '../../store/comments.js';
import { DEFAULT_CAMERA } from '../../canvas/camera.js';
import type { Comment } from '../../api/types.js';

function makeComment(over: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    fileId: 'f1',
    nodeId: null,
    authorId: 'u1',
    body: 'a pinned comment',
    anchorX: 100,
    anchorY: 50,
    resolvedAt: null,
    parentId: null,
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    replies: [],
    ...over,
  };
}

const cameraRef = { current: DEFAULT_CAMERA };

describe('CommentsOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCommentsStore.getState().reset();
    useCommentsStore.setState({ fileId: 'f1', showResolved: false });
  });

  it('renders a pin for each anchored thread at its world→screen position', () => {
    useCommentsStore.setState({ threads: [makeComment()] });
    render(<CommentsOverlay cameraRef={cameraRef} />);
    const pin = screen.getByTestId('comment-pin-c1');
    // DEFAULT_CAMERA (0,0,zoom 1): screen == world; pin sits 24px above the point.
    expect(pin.style.left).toBe('100px');
    expect(pin.style.top).toBe('26px');
  });

  it('hides resolved pins unless showResolved is on', () => {
    useCommentsStore.setState({
      threads: [makeComment({ id: 'r', resolvedAt: '2026-07-10T01:00:00.000Z' })],
    });
    const { rerender } = render(<CommentsOverlay cameraRef={cameraRef} />);
    expect(screen.queryByTestId('comment-pin-r')).toBeNull();

    useCommentsStore.setState({ showResolved: true });
    rerender(<CommentsOverlay cameraRef={cameraRef} />);
    expect(screen.getByTestId('comment-pin-r')).toBeTruthy();
  });

  it('opens a thread popover on pin click and can resolve it', async () => {
    useCommentsStore.setState({ threads: [makeComment()] });
    setResolvedApi.mockResolvedValueOnce(makeComment({ resolvedAt: '2026-07-10T02:00:00.000Z' }));
    render(<CommentsOverlay cameraRef={cameraRef} />);

    fireEvent.click(screen.getByTestId('comment-pin-c1'));
    expect(screen.getByTestId('comment-body').textContent).toBe('a pinned comment');

    fireEvent.click(screen.getByTestId('comment-resolve'));
    await waitFor(() => expect(setResolvedApi).toHaveBeenCalledWith('f1', 'c1', true));
  });

  it('creates a thread from the draft composer, POSTing the pin anchor', async () => {
    useCommentsStore.getState().startDraft({ x: 100, y: 50 });
    create.mockResolvedValueOnce(makeComment({ id: 'new', anchorX: 100, anchorY: 50 }));
    render(<CommentsOverlay cameraRef={cameraRef} />);

    expect(screen.getByTestId('comment-draft-pin')).toBeTruthy();
    fireEvent.change(screen.getByTestId('comment-body-input'), { target: { value: 'new note' } });
    fireEvent.click(screen.getByTestId('comment-submit'));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith('f1', { body: 'new note', anchorX: 100, anchorY: 50 }),
    );
  });
});
