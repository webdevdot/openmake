import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { orgsApi, projectsApi, filesApi } from '../api/endpoints.js';
import type { FileMeta, Org, Project } from '../api/types.js';
import { useAuthStore } from '../store/auth.js';

export function DashboardPage() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [files, setFiles] = useState<FileMeta[]>([]);

  useEffect(() => {
    void orgsApi.list().then((data) => {
      setOrgs(data);
      if (data[0]) setActiveOrgId(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!activeOrgId) return;
    void projectsApi.list(activeOrgId).then((data) => {
      setProjects(data);
      setActiveProjectId(data[0]?.id ?? null);
    });
  }, [activeOrgId]);

  useEffect(() => {
    if (!activeProjectId) {
      setFiles([]);
      return;
    }
    void filesApi.list(activeProjectId).then(setFiles);
  }, [activeProjectId]);

  const createProject = async () => {
    if (!activeOrgId) return;
    const name = window.prompt('Project name');
    if (!name) return;
    const project = await projectsApi.create(activeOrgId, name);
    setProjects((prev) => [...prev, project]);
    setActiveProjectId(project.id);
  };

  const createFile = async () => {
    if (!activeProjectId) return;
    const name = window.prompt('File name') ?? 'Untitled';
    const file = await filesApi.create(activeProjectId, name);
    navigate(`/file/${file.id}`);
  };

  return (
    <div className="flex h-full flex-col bg-canvas-app">
      <header className="flex h-toolbar shrink-0 items-center justify-between border-b bg-toolbar px-4 border-app">
        <span className="text-sm font-medium">openmake</span>
        <button type="button" data-testid="logout-button" className="text-xs text-secondary-app" onClick={logout}>
          Sign out
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-panel-left shrink-0 border-r p-3 border-app" data-testid="org-project-nav">
          <div className="mb-4">
            <div className="mb-1 text-xs font-medium text-secondary-app">Organization</div>
            <select
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
          </div>

          <div className="mb-1 flex items-center justify-between text-xs font-medium text-secondary-app">
            <span>Projects</span>
            <button type="button" data-testid="create-project-button" className="rounded px-1 bg-hover-app" onClick={createProject}>
              +
            </button>
          </div>
          <ul>
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  data-testid={`project-${p.id}`}
                  className="w-full rounded px-2 py-1 text-left text-xs bg-hover-app"
                  style={p.id === activeProjectId ? { backgroundColor: 'var(--bg-active)' } : undefined}
                  onClick={() => setActiveProjectId(p.id)}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">Files</h2>
            <button
              type="button"
              data-testid="create-file-button"
              className="rounded px-2 py-1 text-xs font-medium text-white"
              style={{ backgroundColor: 'var(--color-accent)' }}
              onClick={createFile}
              disabled={!activeProjectId}
            >
              New file
            </button>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {files.map((file) => (
              <button
                key={file.id}
                type="button"
                data-testid={`file-${file.id}`}
                className="rounded border p-3 text-left text-xs bg-hover-app border-app"
                onClick={() => navigate(`/file/${file.id}`)}
              >
                <div className="mb-2 h-20 rounded bg-active-app" />
                <div className="truncate font-medium">{file.name}</div>
                <div className="text-secondary-app">{new Date(file.updatedAt).toLocaleDateString()}</div>
              </button>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
