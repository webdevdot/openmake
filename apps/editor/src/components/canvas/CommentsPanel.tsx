import { MessageCircle } from 'lucide-react';
import { useCommentsStore } from '../../store/comments.js';

/**
 * Lightweight floating list of comment threads, shown while the comment tool is
 * active. Chosen over a Left-rail section to keep the change self-contained (the
 * rail is doc/layer-oriented); this reads the same comments store the overlay
 * does. Clicking a thread opens its pin popover.
 */
export function CommentsPanel() {
  const threads = useCommentsStore((s) => s.threads);
  const showResolved = useCommentsStore((s) => s.showResolved);
  const setShowResolved = useCommentsStore((s) => s.setShowResolved);
  const openThread = useCommentsStore((s) => s.openThread);
  const activeThreadId = useCommentsStore((s) => s.activeThreadId);

  const visible = threads.filter((t) => showResolved || t.resolvedAt == null);

  return (
    <div
      data-testid="comments-panel"
      className="absolute right-4 top-4 z-10 flex max-h-[70%] w-60 flex-col rounded-xl bg-floating-app text-xs text-zinc-100 shadow-lg"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="flex items-center gap-1.5 font-medium">
          <MessageCircle size={14} strokeWidth={2} />
          Comments
        </span>
        <label className="flex items-center gap-1 text-[11px] text-zinc-400">
          <input
            type="checkbox"
            data-testid="comments-show-resolved"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          Resolved
        </label>
      </div>
      <ul className="flex-1 overflow-y-auto py-1">
        {visible.length === 0 && (
          <li className="px-3 py-2 text-zinc-500">No comments yet. Click the canvas to add one.</li>
        )}
        {visible.map((t) => {
          const resolved = t.resolvedAt != null;
          const replyCount = t.replies?.length ?? 0;
          return (
            <li key={t.id}>
              <button
                type="button"
                data-testid={`comment-list-item-${t.id}`}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left hover:bg-white/5"
                style={
                  t.id === activeThreadId
                    ? { backgroundColor: 'var(--color-accent-muted)' }
                    : undefined
                }
                onClick={() => openThread(t.id)}
              >
                <span
                  className="line-clamp-2 break-words"
                  style={resolved ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}
                >
                  {t.body}
                </span>
                {replyCount > 0 && (
                  <span className="text-[11px] text-zinc-500">
                    {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
