import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub the thumbnail hook so cards don't touch the renderer/network.
vi.mock('../hooks/useFileThumbnail.js', () => ({
  useFileThumbnail: () => ({ status: 'ready', url: 'blob:x' }),
}));

const orgsList = vi.fn();
const projectsList = vi.fn();
const filesList = vi.fn();
const filesListDeleted = vi.fn();
const filesRestore = vi.fn();
const filesDelete = vi.fn();

vi.mock('../api/endpoints.js', () => ({
  orgsApi: { list: () => orgsList() },
  projectsApi: { list: (orgId: string) => projectsList(orgId) },
  filesApi: {
    list: (projectId: string) => filesList(projectId),
    listDeleted: (projectId: string) => filesListDeleted(projectId),
    restore: (id: string) => filesRestore(id),
    delete: (id: string) => filesDelete(id),
  },
}));

vi.mock('../store/auth.js', () => ({
  useAuthStore: (sel: (s: { logout: () => void }) => unknown) => sel({ logout: vi.fn() }),
}));

import { DashboardPage } from './DashboardPage.js';

const org = { id: 'org-1', name: 'Acme' };
const projA = { id: 'proj-a', orgId: 'org-1', name: 'Project A' };
const projB = { id: 'proj-b', orgId: 'org-1', name: 'Project B' };

const fileA1 = { id: 'a1', projectId: 'proj-a', name: 'Zebra', updatedAt: '2024-03-01T00:00:00Z' };
const fileA2 = { id: 'a2', projectId: 'proj-a', name: 'Apple', updatedAt: '2024-01-01T00:00:00Z' };
const fileB1 = { id: 'b1', projectId: 'proj-b', name: 'Mango', updatedAt: '2024-02-01T00:00:00Z' };

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  orgsList.mockResolvedValue([org]);
  projectsList.mockResolvedValue([projA, projB]);
  filesList.mockImplementation((projectId: string) =>
    Promise.resolve(projectId === 'proj-a' ? [fileA1, fileA2] : [fileB1]),
  );
  filesListDeleted.mockResolvedValue([]);
  filesRestore.mockResolvedValue({ ...fileA1 });
  filesDelete.mockResolvedValue(undefined);
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('DashboardPage', () => {
  it('opens on Recents, merging files across all projects sorted by updatedAt desc, capped', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('file-a1')).toBeTruthy());

    const container = screen.getByTestId('files-container');
    const names = within(container)
      .getAllByText(/Zebra|Apple|Mango/)
      .map((el) => el.textContent);
    // Sorted by updatedAt desc: Zebra (Mar) > Mango (Feb) > Apple (Jan).
    expect(names).toEqual(['Zebra', 'Mango', 'Apple']);
  });

  it('filters the file list by search query (client-side)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('file-a1')).toBeTruthy());

    await userEvent.type(screen.getByTestId('file-search'), 'man');

    await waitFor(() => {
      expect(screen.queryByTestId('file-a1')).toBeNull();
      expect(screen.getByTestId('file-b1')).toBeTruthy();
    });
  });

  it('lists trashed files across projects and restores one', async () => {
    filesListDeleted.mockImplementation((projectId: string) =>
      Promise.resolve(projectId === 'proj-a' ? [{ ...fileA2 }] : []),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('nav-trash')).toBeTruthy());

    await userEvent.click(screen.getByTestId('nav-trash'));

    await waitFor(() => expect(screen.getByTestId('file-a2')).toBeTruthy());
    expect(filesListDeleted).toHaveBeenCalledWith('proj-a');
    expect(filesListDeleted).toHaveBeenCalledWith('proj-b');

    await userEvent.click(screen.getByTestId('restore-file-a2'));

    await waitFor(() => {
      expect(filesRestore).toHaveBeenCalledWith('a2');
      expect(screen.queryByTestId('file-a2')).toBeNull();
    });
  });

  it('exposes an accessible name for the organization select', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('org-select')).toBeTruthy());

    expect(screen.getByRole('combobox', { name: 'Organization' })).toBeTruthy();
  });

  it('shows a distinct error message when loading organizations fails', async () => {
    orgsList.mockRejectedValueOnce(new Error('network down'));
    renderPage();

    await waitFor(() => expect(screen.getByTestId('orgs-error')).toBeTruthy());
    expect(screen.getByTestId('orgs-error').textContent).toBe('network down');
  });

  it('shows a distinct error message when loading projects fails', async () => {
    projectsList.mockRejectedValueOnce(new Error('projects down'));
    renderPage();

    await waitFor(() => expect(screen.getByTestId('projects-error')).toBeTruthy());
    expect(screen.getByTestId('projects-error').textContent).toBe('projects down');
  });

  it('shows a distinct error message when loading files fails, not the empty state', async () => {
    filesList.mockRejectedValue(new Error('files down'));
    renderPage();

    await waitFor(() => expect(screen.getByTestId('files-error')).toBeTruthy());
    expect(screen.getByTestId('files-error').textContent).toBe('files down');
    expect(screen.queryByTestId('files-empty')).toBeNull();
  });

  it('sorts a project view by name A-Z and remembers the grid/list layout', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('project-proj-a')).toBeTruthy());

    await userEvent.click(screen.getByTestId('project-proj-a'));
    await waitFor(() => expect(screen.getByTestId('file-a1')).toBeTruthy());

    // Default (updated desc): Zebra (Mar) then Apple (Jan).
    let names = within(screen.getByTestId('files-container'))
      .getAllByText(/Zebra|Apple/)
      .map((el) => el.textContent);
    expect(names).toEqual(['Zebra', 'Apple']);

    // Name A-Z flips them: Apple before Zebra.
    await userEvent.selectOptions(screen.getByTestId('sort-select'), 'name');
    names = within(screen.getByTestId('files-container'))
      .getAllByText(/Zebra|Apple/)
      .map((el) => el.textContent);
    expect(names).toEqual(['Apple', 'Zebra']);

    // Layout preference persists to localStorage.
    await userEvent.click(screen.getByTestId('layout-list'));
    expect(localStorage.getItem('openmake.dashboard.layout')).toBe('list');
  });
});
