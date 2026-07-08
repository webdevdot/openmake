import type { FileMeta } from '../../api/types.js';
import { useFileThumbnail } from '../../hooks/useFileThumbnail.js';

interface FileCardProps {
  file: FileMeta;
  layout: 'grid' | 'list';
  /** True in the Trash view: shows a Restore action instead of Trash. */
  trashed: boolean;
  onOpen: () => void;
  onTrash?: () => void;
  onRestore?: () => void;
}

/**
 * A single file entry on the dashboard. Renders a client-side thumbnail of the
 * file's first page (via {@link useFileThumbnail}), with a shimmer placeholder
 * while pending and a graceful blank fallback on error.
 */
export function FileCard({ file, layout, trashed, onOpen, onTrash, onRestore }: FileCardProps) {
  const thumb = useFileThumbnail(file.id, file.updatedAt);

  const thumbnail = (
    <div
      data-testid={`file-thumb-${file.id}`}
      data-status={thumb.status}
      className={[
        layout === 'grid'
          ? 'mb-2 h-20 overflow-hidden rounded bg-active-app'
          : 'h-10 w-14 shrink-0 overflow-hidden rounded bg-active-app',
        // Shimmer while the thumbnail is being generated.
        thumb.status === 'pending' ? 'animate-pulse' : '',
      ].join(' ')}
    >
      {thumb.status === 'ready' && thumb.url ? (
        <img
          src={thumb.url}
          alt=""
          className="h-full w-full object-contain"
          draggable={false}
        />
      ) : null}
    </div>
  );

  if (layout === 'list') {
    return (
      <div
        data-testid={`file-${file.id}`}
        className="flex items-center gap-3 rounded border p-2 text-xs bg-hover-app border-app"
      >
        <button type="button" className="flex flex-1 items-center gap-3 text-left" onClick={onOpen}>
          {thumbnail}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{file.name}</div>
            <div className="text-secondary-app">
              {new Date(file.updatedAt).toLocaleDateString()}
            </div>
          </div>
        </button>
        <FileActions
          fileId={file.id}
          trashed={trashed}
          onTrash={onTrash}
          onRestore={onRestore}
        />
      </div>
    );
  }

  return (
    <div
      data-testid={`file-${file.id}`}
      className="flex flex-col rounded border p-3 text-left text-xs bg-hover-app border-app"
    >
      <button type="button" className="text-left" onClick={onOpen}>
        {thumbnail}
        <div className="truncate font-medium">{file.name}</div>
        <div className="text-secondary-app">{new Date(file.updatedAt).toLocaleDateString()}</div>
      </button>
      <div className="mt-2 flex justify-end">
        <FileActions
          fileId={file.id}
          trashed={trashed}
          onTrash={onTrash}
          onRestore={onRestore}
        />
      </div>
    </div>
  );
}

function FileActions({
  fileId,
  trashed,
  onTrash,
  onRestore,
}: {
  fileId: string;
  trashed: boolean;
  onTrash?: () => void;
  onRestore?: () => void;
}) {
  if (trashed) {
    return (
      <button
        type="button"
        data-testid={`restore-file-${fileId}`}
        className="rounded border px-2 py-0.5 text-xs border-app bg-hover-app"
        onClick={onRestore}
      >
        Restore
      </button>
    );
  }
  if (!onTrash) return null;
  return (
    <button
      type="button"
      data-testid={`trash-file-${fileId}`}
      className="rounded border px-2 py-0.5 text-xs border-app bg-hover-app"
      onClick={onTrash}
    >
      Trash
    </button>
  );
}
