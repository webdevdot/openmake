import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { orgsApi, projectsApi, filesApi } from '../api/endpoints.js';
import type { FileMeta, Org, Project } from '../api/types.js';
import { useAuthStore } from '../store/auth.js';
import { slugify } from '../lib/slug.js';
import { FileCard } from '../components/dashboard/FileCard.js';

/** Left-nav virtual views that aren't a single project. */
type View = { kind: 'project'; projectId: string } | { kind: 'recents' } | { kind: 'trash' };

type SortMode = 'updated' | 'name';
type LayoutMode = 'grid' | 'list';

const RECENTS_CAP = 20;
const LAYOUT_STORAGE_KEY = 'openmake.dashboard.layout';

function readLayout(): LayoutMode {
  try {
    return localStorage.getItem(LAYOUT_STORAGE_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function sortFiles(files: FileMeta[], mode: SortMode): FileMeta[] {
  const copy = [...files];
  if (mode === 'name') {
    copy.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    copy.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  return copy;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [view, setView] = useState<View>({ kind: 'recents' });
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('updated');
  const [layout, setLayout] = useState<LayoutMode>(readLayout);
  const [importing, setImporting] = useState(false);
  const [orgsError, setOrgsError] = useState<string | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const figInputRef = useRef<HTMLInputElement | null>(null);

  const activeProjectId = view.kind === 'project' ? view.projectId : null;

  useEffect(() => {
    setOrgsError(null);
    void orgsApi
      .list()
      .then((data) => {
        setOrgs(data);
        if (data[0]) setActiveOrgId(data[0].id);
      })
      .catch((err) => {
        setOrgsError(err instanceof Error ? err.message : 'Failed to load organizations');
      });
  }, []);

  useEffect(() => {
    if (!activeOrgId) return;
    setProjectsError(null);
    void projectsApi
      .list(activeOrgId)
      .then((data) => {
        setProjects(data);
        // Land on Recents so the org's most recent work is visible immediately.
        setView({ kind: 'recents' });
      })
      .catch((err) => {
        setProjectsError(err instanceof Error ? err.message : 'Failed to load projects');
      });
  }, [activeOrgId]);

  // Load the file list for the active view. Recents/Trash aggregate across all
  // of the org's projects (no cross-project endpoint exists, so we fetch each
  // project's list in parallel and merge client-side — fine at this scale).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingFiles(true);
      setFilesError(null);
      try {
        if (view.kind === 'project') {
          const list = await filesApi.list(view.projectId);
          if (!cancelled) setFiles(list);
        } else if (view.kind === 'recents') {
          const lists = await Promise.all(projects.map((p) => filesApi.list(p.id)));
          const merged = sortFiles(lists.flat(), 'updated').slice(0, RECENTS_CAP);
          if (!cancelled) setFiles(merged);
        } else {
          const lists = await Promise.all(projects.map((p) => filesApi.listDeleted(p.id)));
          if (!cancelled) setFiles(sortFiles(lists.flat(), 'updated'));
        }
      } catch (err) {
        if (!cancelled) {
          setFiles([]);
          setFilesError(err instanceof Error ? err.message : 'Failed to load files');
        }
      } finally {
        if (!cancelled) setLoadingFiles(false);
      }
    }
    // Recents/Trash need the project list first.
    if (view.kind !== 'project' && projects.length === 0) {
      setFiles([]);
      setLoadingFiles(false);
      return;
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [view, projects]);

  const setLayoutMode = (mode: LayoutMode) => {
    setLayout(mode);
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, mode);
    } catch {
      // localStorage may be unavailable (private mode); the preference just won't persist.
    }
  };

  const visibleFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? files.filter((f) => f.name.toLowerCase().includes(q)) : files;
    // Recents already comes pre-sorted by recency and capped; keep that order.
    return view.kind === 'recents' ? filtered : sortFiles(filtered, sortMode);
  }, [files, search, sortMode, view.kind]);

  const createProject = async () => {
    if (!activeOrgId) return;
    const name = window.prompt('Project name');
    if (!name) return;
    try {
      const project = await projectsApi.create(activeOrgId, name);
      setProjects((prev) => [...prev, project]);
      setView({ kind: 'project', projectId: project.id });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to create project');
    }
  };

  const createFile = async () => {
    if (!activeProjectId) return;
    const name = window.prompt('File name');
    // Cancel must not create a file — only an empty (or whitespace) name
    // falls back to 'Untitled'.
    if (name === null) return;
    const file = await filesApi.create(activeProjectId, name.trim() || 'Untitled');
    navigate(`/file/${file.id}/${slugify(file.name)}`);
  };

  const trashFile = async (fileId: string) => {
    await filesApi.delete(fileId);
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const restoreFile = async (fileId: string) => {
    await filesApi.restore(fileId);
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const importFig = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const picked = input.files?.[0];
    if (!picked || !activeProjectId || importing) {
      input.value = '';
      return;
    }
    setImporting(true);
    try {
      const bytes = new Uint8Array(await picked.arrayBuffer());
      // Dynamic import keeps the .fig parser (and its codecs) out of the
      // dashboard's initial bundle — it only loads when someone imports.
      const { parseFigFile } = await import('@openmake/figma-importer');
      const { document: importedDocument, report } = parseFigFile(bytes);

      const hasError = report.issues.some((issue) => issue.severity === 'error');
      if (hasError && report.imported === 0) {
        const firstError = report.issues.find((issue) => issue.severity === 'error');
        window.alert(`Import failed: ${firstError?.message ?? 'could not read the .fig file'}`);
        return;
      }
      // Info-severity issues (e.g. the routine 'fig-version' note) shouldn't
      // interrupt the flow — only warn/error issues warrant a confirm.
      const problems = report.issues.filter((issue) => issue.severity !== 'info');
      if (problems.length > 0) {
        const ok = window.confirm(
          `Imported ${report.imported} layers, skipped ${report.skipped}. ${problems.length} warning(s) — continue?`,
        );
        if (!ok) return;
      }

      const name = picked.name.replace(/\.fig$/i, '').trim() || 'Imported file';
      const file = await filesApi.import(activeProjectId, { name, document: importedDocument });
      navigate(`/file/${file.id}/${slugify(file.name)}`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Import failed');
    } finally {
      input.value = '';
      setImporting(false);
    }
  };

  const heading =
    view.kind === 'recents'
      ? 'Recents'
      : view.kind === 'trash'
        ? 'Trash'
        : (projects.find((p) => p.id === view.projectId)?.name ?? 'Files');

  const navItemClass = (active: boolean) =>
    `w-full rounded px-2 py-1 text-left text-xs bg-hover-app${active ? '' : ''}`;

  return (
    <div className="flex h-full flex-col bg-canvas-app">
      <header className="flex h-toolbar shrink-0 items-center justify-between border-b bg-toolbar px-4 border-app">
        <span className="text-sm font-medium">openmake</span>
        <button
          type="button"
          data-testid="logout-button"
          className="text-xs text-secondary-app"
          onClick={logout}
        >
          Sign out
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside
          className="w-panel-left shrink-0 overflow-y-auto border-r p-3 border-app"
          data-testid="org-project-nav"
        >
          <div className="mb-4">
            <label
              htmlFor="org-select"
              className="mb-1 block text-xs font-medium text-secondary-app"
            >
              Organization
            </label>
            <select
              id="org-select"
              data-testid="org-select"
              className="w-full rounded border bg-transparent px-2 py-1 text-xs border-app"
              value={activeOrgId ?? ''}
              onChange={(e) => setActiveOrgId(e.target.value)}
            >
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            {orgsError && (
              <p data-testid="orgs-error" className="mt-1 text-xs text-red-500">
                {orgsError}
              </p>
            )}
          </div>

          <ul className="mb-4">
            <li>
              <button
                type="button"
                data-testid="nav-recents"
                className={navItemClass(view.kind === 'recents')}
                style={view.kind === 'recents' ? { backgroundColor: 'var(--bg-active)' } : undefined}
                onClick={() => setView({ kind: 'recents' })}
              >
                Recents
              </button>
            </li>
            <li>
              <button
                type="button"
                data-testid="nav-trash"
                className={navItemClass(view.kind === 'trash')}
                style={view.kind === 'trash' ? { backgroundColor: 'var(--bg-active)' } : undefined}
                onClick={() => setView({ kind: 'trash' })}
              >
                Trash
              </button>
            </li>
          </ul>

          <div className="mb-1 flex items-center justify-between text-xs font-medium text-secondary-app">
            <span>Projects</span>
            <button
              type="button"
              data-testid="create-project-button"
              className="rounded px-1 bg-hover-app"
              onClick={createProject}
            >
              +
            </button>
          </div>
          {projectsError && (
            <p data-testid="projects-error" className="mb-2 text-xs text-red-500">
              {projectsError}
            </p>
          )}
          <ul>
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  data-testid={`project-${p.id}`}
                  className="w-full rounded px-2 py-1 text-left text-xs bg-hover-app"
                  style={p.id === activeProjectId ? { backgroundColor: 'var(--bg-active)' } : undefined}
                  onClick={() => setView({ kind: 'project', projectId: p.id })}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">{heading}</h2>
            <div className="flex items-center gap-2">
              <input
                type="search"
                data-testid="file-search"
                placeholder="Search files"
                className="rounded border bg-transparent px-2 py-1 text-xs border-app"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {view.kind !== 'recents' && (
                <select
                  data-testid="sort-select"
                  className="rounded border bg-transparent px-2 py-1 text-xs border-app"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                >
                  <option value="updated">Last updated</option>
                  <option value="name">Name A-Z</option>
                </select>
              )}
              <div className="flex overflow-hidden rounded border border-app">
                <button
                  type="button"
                  data-testid="layout-grid"
                  aria-pressed={layout === 'grid'}
                  className="px-2 py-1 text-xs bg-hover-app"
                  style={layout === 'grid' ? { backgroundColor: 'var(--bg-active)' } : undefined}
                  onClick={() => setLayoutMode('grid')}
                >
                  Grid
                </button>
                <button
                  type="button"
                  data-testid="layout-list"
                  aria-pressed={layout === 'list'}
                  className="px-2 py-1 text-xs bg-hover-app"
                  style={layout === 'list' ? { backgroundColor: 'var(--bg-active)' } : undefined}
                  onClick={() => setLayoutMode('list')}
                >
                  List
                </button>
              </div>
              {/* Import + New file target the active project; they stay visible
                  but disabled in the Recents/Trash views (no project selected). */}
              <input
                ref={figInputRef}
                type="file"
                accept=".fig"
                data-testid="import-fig-input"
                className="hidden"
                onChange={importFig}
              />
              <button
                type="button"
                data-testid="import-fig-button"
                title="Beta — unofficial Figma .fig import"
                className="rounded border px-2 py-1 text-xs font-medium border-app bg-hover-app"
                onClick={() => figInputRef.current?.click()}
                disabled={!activeProjectId || importing}
              >
                {importing ? 'Importing…' : 'Import .fig'}
              </button>
              <button
                type="button"
                data-testid="create-file-button"
                className="rounded px-2 py-1 text-xs font-medium text-white"
                style={{ backgroundColor: 'var(--color-accent-cta, var(--color-accent))' }}
                onClick={createFile}
                disabled={!activeProjectId}
              >
                New file
              </button>
            </div>
          </div>

          {!loadingFiles && filesError ? (
            <p data-testid="files-error" className="text-xs text-red-500">
              {filesError}
            </p>
          ) : !loadingFiles && visibleFiles.length === 0 ? (
            <p data-testid="files-empty" className="text-xs text-secondary-app">
              {search.trim()
                ? 'No files match your search.'
                : view.kind === 'trash'
                  ? 'Trash is empty.'
                  : 'No files yet.'}
            </p>
          ) : (
            <div
              data-testid="files-container"
              className={
                layout === 'grid' ? 'grid grid-cols-4 gap-3' : 'flex flex-col gap-2'
              }
            >
              {visibleFiles.map((file) => (
                <FileCard
                  key={file.id}
                  file={file}
                  layout={layout}
                  trashed={view.kind === 'trash'}
                  onOpen={() => navigate(`/file/${file.id}/${slugify(file.name)}`)}
                  onTrash={view.kind !== 'trash' ? () => void trashFile(file.id) : undefined}
                  onRestore={view.kind === 'trash' ? () => void restoreFile(file.id) : undefined}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
