import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VersionHistoryPanel } from './VersionHistoryPanel.js';
import { versionsApi } from '../../api/endpoints.js';

vi.mock('../../api/endpoints.js', () => ({
  versionsApi: {
    list: vi.fn(),
    create: vi.fn(),
    restore: vi.fn(),
  },
}));

const mocked = {
  list: vi.mocked(versionsApi.list),
  create: vi.mocked(versionsApi.create),
  restore: vi.mocked(versionsApi.restore),
};

const FILE_ID = 'file-1';

function version(id: string, name: string, seq: number) {
  return {
    id,
    name,
    seq,
    createdAt: '2026-07-10T10:00:00.000Z',
    author: { id: 'u1', name: 'Ada' },
  };
}

beforeEach(() => {
  mocked.list.mockResolvedValue({
    versions: [version('v2', 'Second', 2), version('v1', 'First', 1)],
    autoCheckpoints: [{ id: 's1', upToSeq: 2, createdAt: '2026-07-10T09:00:00.000Z' }],
  });
  mocked.create.mockResolvedValue({ id: 'v3', name: 'Fresh', seq: 3, createdAt: '' });
  mocked.restore.mockResolvedValue({ id: 'v1', name: 'First', seq: 1, createdAt: '' });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('VersionHistoryPanel', () => {
  it('renders versions newest-first with author + an auto checkpoint', async () => {
    render(<VersionHistoryPanel fileId={FILE_ID} />);

    expect(await screen.findByTestId('version-v2')).toBeTruthy();
    expect(screen.getByTestId('version-v1')).toBeTruthy();
    expect(screen.getByTestId('version-v2').textContent).toContain('Second');
    expect(screen.getByTestId('version-v2').textContent).toContain('Ada');
    expect(screen.getByTestId('auto-checkpoint-s1')).toBeTruthy();
  });

  it('saves a version then reloads the list', async () => {
    render(<VersionHistoryPanel fileId={FILE_ID} />);
    await screen.findByTestId('version-v2');
    expect(mocked.list).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByTestId('version-name-input'), {
      target: { value: 'Milestone' },
    });
    fireEvent.click(screen.getByTestId('version-save'));

    await waitFor(() => expect(mocked.create).toHaveBeenCalledWith(FILE_ID, 'Milestone'));
    // Reloads the list after a successful save.
    await waitFor(() => expect(mocked.list).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('version-notice')).toBeTruthy();
  });

  it('restores only after an explicit confirm', async () => {
    render(<VersionHistoryPanel fileId={FILE_ID} />);
    await screen.findByTestId('version-v1');

    // First click reveals the confirm affordance; no API call yet.
    fireEvent.click(screen.getByTestId('version-restore-v1'));
    expect(mocked.restore).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('version-restore-confirm-v1'));
    await waitFor(() => expect(mocked.restore).toHaveBeenCalledWith(FILE_ID, 'v1'));
    expect(await screen.findByTestId('version-notice')).toBeTruthy();
  });
});
