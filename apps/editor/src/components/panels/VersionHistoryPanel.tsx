import { useCallback, useEffect, useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import { versionsApi } from '../../api/endpoints.js';
import type { AutoCheckpoint, DocVersion } from '../../api/types.js';
import { ApiError } from '../../api/client.js';

export interface VersionHistoryPanelProps {
  fileId: string;
}

interface ListData {
  versions: DocVersion[];
  autoCheckpoints: AutoCheckpoint[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: ListData };

function errMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** One version row with a two-step (click → confirm) restore affordance. */
function VersionRow({
  version,
  onRestore,
  disabled,
}: {
  version: DocVersion;
  onRestore: (id: string) => Promise<void>;
  disabled: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const restore = async () => {
    setBusy(true);
    try {
      await onRestore(version.id);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <li className="mb-1 rounded border p-1.5 border-app" data-testid={`version-${version.id}`}>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-app" title={version.name}>
            {version.name}
          </div>
          <div className="text-[11px] text-secondary-app">
            {version.author.name} · {formatTime(version.createdAt)}
          </div>
        </div>
        {!confirming ? (
          <button
            type="button"
            data-testid={`version-restore-${version.id}`}
            className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] bg-hover-app disabled:opacity-50"
            disabled={disabled || busy}
            title="Restore this version"
            onClick={() => setConfirming(true)}
          >
            <RotateCcw size={12} strokeWidth={1.75} />
            Restore
          </button>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              data-testid={`version-restore-confirm-${version.id}`}
              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white bg-blue-600 disabled:opacity-50"
              disabled={busy}
              onClick={() => void restore()}
            >
              {busy ? 'Restoring…' : 'Confirm'}
            </button>
            <button
              type="button"
              data-testid={`version-restore-cancel-${version.id}`}
              className="rounded px-1.5 py-0.5 text-[11px] bg-hover-app disabled:opacity-50"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export function VersionHistoryPanel({ fileId }: VersionHistoryPanelProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const data = await versionsApi.list(fileId);
      setState({ status: 'ready', data });
    } catch (err) {
      setState({ status: 'error', message: errMessage(err) });
    }
  }, [fileId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const saveVersion = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await versionsApi.create(fileId, trimmed);
      setName('');
      setNotice(`Saved version "${trimmed}"`);
      await reload();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const restore = async (versionId: string) => {
    setError(null);
    setNotice(null);
    try {
      const restored = await versionsApi.restore(fileId, versionId);
      setNotice(`Restored "${restored.name}" as a new edit`);
    } catch (err) {
      setError(errMessage(err));
    }
  };

  return (
    <div data-testid="version-history-panel" className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex items-center gap-1 border-b px-2 py-1.5 border-app">
        <History size={14} strokeWidth={1.75} className="text-secondary-app" />
        <span className="text-xs font-medium text-app">Version history</span>
      </div>

      <div className="border-b p-2 border-app">
        <div className="flex items-center gap-1">
          <input
            type="text"
            data-testid="version-name-input"
            className="w-full rounded border bg-transparent px-1 py-0.5 text-xs outline-none border-app disabled:opacity-50"
            placeholder="Name this version…"
            value={name}
            disabled={saving}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveVersion();
            }}
          />
          <button
            type="button"
            data-testid="version-save"
            className="shrink-0 rounded px-2 py-0.5 text-xs bg-hover-app disabled:opacity-50"
            disabled={saving || name.trim().length === 0}
            onClick={() => void saveVersion()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {notice && (
          <div className="mt-1 text-[11px] text-secondary-app" data-testid="version-notice">
            {notice}
          </div>
        )}
        {error && (
          <div className="mt-1 text-[11px] text-red-500" data-testid="version-error">
            {error}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {state.status === 'loading' && (
          <div className="px-1 py-1 text-xs text-secondary-app" data-testid="version-list-loading">
            Loading versions…
          </div>
        )}
        {state.status === 'error' && (
          <div className="px-1 py-1 text-xs text-red-500" data-testid="version-list-error">
            {state.message}
          </div>
        )}
        {state.status === 'ready' && (
          <>
            {state.data.versions.length === 0 ? (
              <div className="px-1 py-1 text-xs text-secondary-app" data-testid="version-empty">
                No saved versions yet. Name one above to checkpoint the current state.
              </div>
            ) : (
              <ul data-testid="version-list">
                {state.data.versions.map((v) => (
                  <VersionRow key={v.id} version={v} onRestore={restore} disabled={false} />
                ))}
              </ul>
            )}

            {state.data.autoCheckpoints.length > 0 && (
              <div className="mt-3" data-testid="auto-checkpoints">
                <div className="mb-1 px-1 text-[11px] font-medium uppercase text-secondary-app">
                  Auto checkpoints
                </div>
                <ul>
                  {state.data.autoCheckpoints.map((c) => (
                    <li
                      key={c.id}
                      data-testid={`auto-checkpoint-${c.id}`}
                      className="px-1 py-0.5 text-[11px] text-secondary-app"
                    >
                      seq {c.upToSeq} · {formatTime(c.createdAt)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
