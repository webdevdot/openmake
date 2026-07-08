import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { filesApi, orgsApi, projectsApi } from '../api/endpoints.js';
import { DashboardPage } from './DashboardPage.js';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  parseFigFile: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@openmake/figma-importer', () => ({
  parseFigFile: mocks.parseFigFile,
}));

// The auth store also imports from endpoints.js, so the factory must cover
// authApi too — not just the APIs DashboardPage uses directly.
vi.mock('../api/endpoints.js', () => ({
  authApi: { register: vi.fn(), login: vi.fn(), me: vi.fn() },
  orgsApi: { list: vi.fn() },
  projectsApi: { list: vi.fn(), create: vi.fn() },
  filesApi: { list: vi.fn(), create: vi.fn(), get: vi.fn(), import: vi.fn() },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function mockDashboard({ withProject }: { withProject: boolean }) {
  vi.mocked(orgsApi.list).mockResolvedValue([{ id: 'org1', name: 'Acme' }]);
  vi.mocked(projectsApi.list).mockResolvedValue(
    withProject ? [{ id: 'proj1', orgId: 'org1', name: 'Website' }] : [],
  );
  vi.mocked(filesApi.list).mockResolvedValue([]);
}

function okReport(
  overrides: Partial<{ imported: number; skipped: number; issues: unknown[] }> = {},
) {
  return {
    document: { children: [] },
    report: {
      imported: overrides.imported ?? 5,
      skipped: overrides.skipped ?? 0,
      issues: overrides.issues ?? [],
      fontsMissing: [],
    },
  };
}

function pickFigFile(name = 'design.fig'): File {
  const file = new File([new Uint8Array([1, 2, 3])], name);
  const input = screen.getByTestId('import-fig-input') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

describe('DashboardPage new file', () => {
  it('does not create a file when the name prompt is cancelled', async () => {
    mockDashboard({ withProject: true });
    // happy-dom does not implement window.prompt — stub it in. null = Cancel.
    const promptSpy = vi.fn().mockReturnValue(null);
    vi.stubGlobal('prompt', promptSpy);
    render(<DashboardPage />);

    await waitFor(() =>
      expect((screen.getByTestId('create-file-button') as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByTestId('create-file-button'));

    await waitFor(() => expect(promptSpy).toHaveBeenCalledTimes(1));
    expect(filesApi.create).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('falls back to Untitled when the prompt returns a blank name', async () => {
    mockDashboard({ withProject: true });
    vi.stubGlobal('prompt', vi.fn().mockReturnValue('   '));
    vi.mocked(filesApi.create).mockResolvedValue({
      id: 'file1',
      projectId: 'proj1',
      name: 'Untitled',
      updatedAt: '2026-07-06T00:00:00.000Z',
    });
    render(<DashboardPage />);

    await waitFor(() =>
      expect((screen.getByTestId('create-file-button') as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByTestId('create-file-button'));

    await waitFor(() => expect(filesApi.create).toHaveBeenCalledWith('proj1', 'Untitled'));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/file/file1'));
  });
});

describe('DashboardPage .fig import', () => {
  it('disables the import button when there is no active project', async () => {
    mockDashboard({ withProject: false });
    render(<DashboardPage />);

    await waitFor(() => expect(projectsApi.list).toHaveBeenCalled());

    const button = screen.getByTestId('import-fig-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('parses the picked file, creates the file via the import endpoint, and navigates', async () => {
    mockDashboard({ withProject: true });
    mocks.parseFigFile.mockReturnValue(okReport());
    vi.mocked(filesApi.import).mockResolvedValue({
      id: 'file9',
      projectId: 'proj1',
      name: 'design',
      updatedAt: '2026-07-06T00:00:00.000Z',
    });
    render(<DashboardPage />);

    await waitFor(() =>
      expect((screen.getByTestId('import-fig-button') as HTMLButtonElement).disabled).toBe(false),
    );
    pickFigFile('design.fig');

    await waitFor(() => expect(mocks.parseFigFile).toHaveBeenCalledTimes(1));
    const bytes = mocks.parseFigFile.mock.calls[0]?.[0] as Uint8Array;
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes)).toEqual([1, 2, 3]);

    await waitFor(() =>
      expect(filesApi.import).toHaveBeenCalledWith('proj1', {
        name: 'design',
        document: { children: [] },
      }),
    );
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/file/file9'));

    // Input is reset so the same file can be re-picked.
    expect((screen.getByTestId('import-fig-input') as HTMLInputElement).value).toBe('');
  });

  it('alerts and skips the API call when parsing fails (error issues, nothing imported)', async () => {
    mockDashboard({ withProject: true });
    // happy-dom does not implement window.alert — stub it in.
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    mocks.parseFigFile.mockReturnValue(
      okReport({
        imported: 0,
        issues: [{ severity: 'error', code: 'not-a-fig-file', message: 'Not a .fig file' }],
      }),
    );
    render(<DashboardPage />);

    await waitFor(() =>
      expect((screen.getByTestId('import-fig-button') as HTMLButtonElement).disabled).toBe(false),
    );
    pickFigFile();

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(String(alertSpy.mock.calls[0]?.[0])).toContain('Not a .fig file');
    expect(filesApi.import).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('asks for confirmation on warnings and aborts when the user cancels', async () => {
    mockDashboard({ withProject: true });
    // happy-dom does not implement window.confirm — stub it in.
    const confirmSpy = vi.fn().mockReturnValue(false);
    vi.stubGlobal('confirm', confirmSpy);
    mocks.parseFigFile.mockReturnValue(
      okReport({
        imported: 4,
        skipped: 2,
        issues: [{ severity: 'warning', code: 'unsupported-node-type', message: 'STICKY skipped' }],
      }),
    );
    render(<DashboardPage />);

    await waitFor(() =>
      expect((screen.getByTestId('import-fig-button') as HTMLButtonElement).disabled).toBe(false),
    );
    pickFigFile();

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1));
    expect(String(confirmSpy.mock.calls[0]?.[0])).toContain('Imported 4 layers, skipped 2');
    expect(filesApi.import).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
