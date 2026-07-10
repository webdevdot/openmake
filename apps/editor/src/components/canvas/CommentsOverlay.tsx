import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Check, MessageCircle, Trash2 } from 'lucide-react';
import { worldToScreen, type Camera } from '../../canvas/camera.js';
import type { Comment } from '../../api/types.js';
import { useCommentsStore } from '../../store/comments.js';
import { useAuthStore } from '../../store/auth.js';

export interface CommentsOverlayProps {
  cameraRef: RefObject<Camera>;
}

/**
 * DOM overlay above the canvas that renders comment pins, a thread popover, and
 * the new-pin composer. Mirrors OverlayLayer's approach: absolutely positioned
 * children whose screen positions are derived from world coords via
 * `worldToScreen`, re-rendered every animation frame so pins track pan/zoom
 * (which bypass React state). This is a sibling of OverlayLayer rather than
 * living inside it, so comment (server) state stays cleanly separated from the
 * doc-driven selection/snap overlay.
 */
export function CommentsOverlay({ cameraRef }: CommentsOverlayProps) {
  const threads = useCommentsStore((s) => s.threads);
  const showResolved = useCommentsStore((s) => s.showResolved);
  const activeThreadId = useCommentsStore((s) => s.activeThreadId);
  const draftPin = useCommentsStore((s) => s.draftPin);
  const openThread = useCommentsStore((s) => s.openThread);

  const [, forceTick] = useState(0);
  useEffect(() => {
    let raf: number;
    const tick = () => {
      forceTick((n) => (n + 1) % 1_000_000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const camera = cameraRef.current;
  if (!camera) return null;

  // Only threads with a free-point anchor render as pins.
  const pinned = threads.filter((t) => t.anchorX != null && t.anchorY != null);
  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  return (
    <div className="pointer-events-none absolute inset-0" data-testid="comments-overlay">
      {pinned.map((thread) => {
        const resolved = thread.resolvedAt != null;
        if (resolved && !showResolved) return null;
        const screen = worldToScreen(camera, { x: thread.anchorX!, y: thread.anchorY! });
        const isActive = thread.id === activeThreadId;
        return (
          <button
            key={thread.id}
            type="button"
            data-testid={`comment-pin-${thread.id}`}
            aria-label={resolved ? 'Resolved comment' : 'Comment'}
            aria-pressed={isActive}
            className="pointer-events-auto absolute flex h-6 w-6 items-center justify-center rounded-full rounded-bl-none border border-white/40 shadow-md"
            style={{
              left: screen.x,
              top: screen.y - 24,
              backgroundColor: resolved
                ? 'var(--color-floating-app, #3a3a3a)'
                : 'var(--color-accent)',
              opacity: resolved ? 0.6 : 1,
            }}
            onClick={(e) => {
              e.stopPropagation();
              openThread(isActive ? null : thread.id);
            }}
          >
            <MessageCircle size={13} strokeWidth={2} className="text-white" />
          </button>
        );
      })}

      {activeThread && activeThread.anchorX != null && activeThread.anchorY != null && (
        <ThreadPopover
          thread={activeThread}
          screen={worldToScreen(camera, { x: activeThread.anchorX, y: activeThread.anchorY })}
        />
      )}

      {draftPin && (
        <DraftComposer screen={worldToScreen(camera, { x: draftPin.x, y: draftPin.y })} />
      )}
    </div>
  );
}

function ThreadPopover({ thread, screen }: { thread: Comment; screen: { x: number; y: number } }) {
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const reply = useCommentsStore((s) => s.reply);
  const setResolved = useCommentsStore((s) => s.setResolved);
  const remove = useCommentsStore((s) => s.remove);
  const openThread = useCommentsStore((s) => s.openThread);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const resolved = thread.resolvedAt != null;
  const replies = thread.replies ?? [];

  const submitReply = async () => {
    if (!replyText.trim() || busy) return;
    setBusy(true);
    try {
      await reply(thread.id, replyText);
      setReplyText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="comment-popover"
      className="pointer-events-auto absolute z-10 w-64 rounded-lg bg-floating-app p-2 text-xs text-zinc-100 shadow-xl"
      style={{ left: screen.x + 8, top: screen.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium">Comment</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="comment-resolve"
            aria-label={resolved ? 'Mark unresolved' : 'Mark resolved'}
            aria-pressed={resolved}
            title={resolved ? 'Mark unresolved' : 'Resolve'}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-white/10"
            style={resolved ? { color: 'var(--color-accent)' } : undefined}
            onClick={() => void setResolved(thread.id, !resolved)}
          >
            <Check size={14} strokeWidth={2.5} />
          </button>
          {thread.authorId === currentUserId && (
            <button
              type="button"
              data-testid={`comment-delete-${thread.id}`}
              aria-label="Delete comment"
              title="Delete"
              className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-white/10 hover:text-red-400"
              onClick={() => void remove(thread.id)}
            >
              <Trash2 size={13} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      <p data-testid="comment-body" className="whitespace-pre-wrap break-words text-zinc-200">
        {thread.body}
      </p>

      {replies.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-white/10 pt-2">
          {replies.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-1">
              <span className="whitespace-pre-wrap break-words text-zinc-300">{r.body}</span>
              {r.authorId === currentUserId && (
                <button
                  type="button"
                  data-testid={`comment-delete-${r.id}`}
                  aria-label="Delete reply"
                  className="text-zinc-500 hover:text-red-400"
                  onClick={() => void remove(r.id)}
                >
                  <Trash2 size={11} strokeWidth={2} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-col gap-1">
        <textarea
          data-testid="comment-reply-input"
          aria-label="Reply"
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Reply…"
          rows={2}
          className="w-full resize-none rounded bg-black/30 p-1 text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <div className="flex justify-end gap-1">
          <button
            type="button"
            className="rounded px-2 py-1 text-zinc-400 hover:bg-white/10"
            onClick={() => openThread(null)}
          >
            Close
          </button>
          <button
            type="button"
            data-testid="comment-reply-submit"
            disabled={!replyText.trim() || busy}
            className="rounded px-2 py-1 font-medium text-white disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-accent)' }}
            onClick={() => void submitReply()}
          >
            Reply
          </button>
        </div>
      </div>
    </div>
  );
}

function DraftComposer({ screen }: { screen: { x: number; y: number } }) {
  const createThread = useCommentsStore((s) => s.createThread);
  const cancelDraft = useCommentsStore((s) => s.cancelDraft);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await createThread(text);
      setText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        data-testid="comment-draft-pin"
        className="pointer-events-none absolute flex h-6 w-6 items-center justify-center rounded-full rounded-bl-none border border-white/40 shadow-md"
        style={{ left: screen.x, top: screen.y - 24, backgroundColor: 'var(--color-accent)' }}
      >
        <MessageCircle size={13} strokeWidth={2} className="text-white" />
      </div>
      <div
        data-testid="comment-composer"
        className="pointer-events-auto absolute z-10 w-64 rounded-lg bg-floating-app p-2 text-xs text-zinc-100 shadow-xl"
        style={{ left: screen.x + 8, top: screen.y }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <textarea
          ref={inputRef}
          data-testid="comment-body-input"
          aria-label="New comment"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
          className="w-full resize-none rounded bg-black/30 p-1 text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <div className="mt-1 flex justify-end gap-1">
          <button
            type="button"
            className="rounded px-2 py-1 text-zinc-400 hover:bg-white/10"
            onClick={() => cancelDraft()}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="comment-submit"
            disabled={!text.trim() || busy}
            className="rounded px-2 py-1 font-medium text-white disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-accent)' }}
            onClick={() => void submit()}
          >
            Comment
          </button>
        </div>
      </div>
    </>
  );
}
