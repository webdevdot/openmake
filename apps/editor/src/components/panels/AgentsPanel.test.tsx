import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { AgentsPanel } from './AgentsPanel.js';
import { useSelectionStore } from '../../store/selection.js';
import { aiApi, filesApi, projectDetailApi } from '../../api/endpoints.js';

// The panel resolves its org through file -> project, then fetches AI resources.
// Mock the whole endpoints surface so tests drive exact responses.
vi.mock('../../api/endpoints.js', () => ({
  filesApi: { get: vi.fn() },
  projectDetailApi: { get: vi.fn() },
  aiApi: {
    skills: vi.fn(),
    agents: vi.fn(),
    workflows: vi.fn(),
    runWorkflow: vi.fn(),
  },
}));

const mocked = {
  filesGet: vi.mocked(filesApi.get),
  projectGet: vi.mocked(projectDetailApi.get),
  skills: vi.mocked(aiApi.skills),
  agents: vi.mocked(aiApi.agents),
  workflows: vi.mocked(aiApi.workflows),
  runWorkflow: vi.mocked(aiApi.runWorkflow),
};

const FILE_ID = 'file-1';
const ORG_ID = 'org-1';

function resolveOrgOk() {
  mocked.filesGet.mockResolvedValue({
    id: FILE_ID,
    projectId: 'proj-1',
    name: 'File',
    updatedAt: '',
  });
  mocked.projectGet.mockResolvedValue({ id: 'proj-1', orgId: ORG_ID, name: 'Proj' });
}

/** Build a doc with a COMPONENT node and return its id. */
function docWithComponent(): { doc: OpenDoc; compId: string } {
  const doc = OpenDoc.create();
  const pageId = doc.getPages()[0]!;
  const compId = doc.createNode({
    type: 'FRAME',
    parentId: pageId,
    name: 'Button',
    x: 0,
    y: 0,
    width: 40,
    height: 40,
  });
  doc.createComponentFromNode(compId);
  doc.commitUndoGroup();
  return { doc, compId };
}

beforeEach(() => {
  resolveOrgOk();
  mocked.skills.mockResolvedValue([
    { id: 's1', name: 'Summarize', description: 'Sum it', builtIn: true },
    { id: 's2', name: 'Custom', description: 'Custom skill', builtIn: false },
  ]);
  mocked.agents.mockResolvedValue([{ id: 'a1', name: 'Coder', description: 'Writes code', provider: 'OPENAI', model: 'gpt' }]);
  mocked.workflows.mockResolvedValue([{ id: 'w1', name: 'Generate', description: 'Make code' }]);
  mocked.runWorkflow.mockResolvedValue({
    conversationId: 'c1',
    steps: [{ agentId: 'a1', output: 'result text' }],
    final: 'result text',
  });
});

afterEach(() => {
  useSelectionStore.setState({ selectedIds: [] });
  vi.clearAllMocks();
});

describe('AgentsPanel', () => {
  it('renders skills, agents, and workflows from the api, with a built-in badge', async () => {
    const { doc } = docWithComponent();
    render(<AgentsPanel doc={doc} fileId={FILE_ID} />);

    expect(await screen.findByTestId('skill-s1')).toBeTruthy();
    expect(screen.getByTestId('skill-builtin-s1')).toBeTruthy();
    // Non-built-in skill has no badge.
    expect(screen.queryByTestId('skill-builtin-s2')).toBeNull();
    expect(screen.getByTestId('agent-a1')).toBeTruthy();
    expect(screen.getByTestId('workflow-w1')).toBeTruthy();
  });

  it('renders an error state when a list request fails', async () => {
    mocked.skills.mockRejectedValueOnce(new Error('boom'));
    const { doc } = docWithComponent();
    render(<AgentsPanel doc={doc} fileId={FILE_ID} />);

    await screen.findByTestId('workflow-w1');
    const errors = await screen.findAllByTestId('list-error');
    expect(errors.some((e) => e.textContent === 'boom')).toBe(true);
  });

  it('disables the run affordance with a hint when selection is not a component', async () => {
    const { doc } = docWithComponent();
    // Nothing selected.
    render(<AgentsPanel doc={doc} fileId={FILE_ID} />);

    await screen.findByTestId('workflow-w1');
    expect((screen.getByTestId('workflow-run-w1') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('workflow-hint-w1')).toBeTruthy();
  });

  it('runs a workflow with the correct body when a component is selected', async () => {
    const { doc, compId } = docWithComponent();
    useSelectionStore.setState({ selectedIds: [compId] });
    render(<AgentsPanel doc={doc} fileId={FILE_ID} />);

    await screen.findByTestId('workflow-w1');
    // No hint when a component is selected.
    expect(screen.queryByTestId('workflow-hint-w1')).toBeNull();

    fireEvent.change(screen.getByTestId('workflow-prompt-w1'), {
      target: { value: 'build me a button' },
    });
    fireEvent.click(screen.getByTestId('workflow-run-w1'));

    await waitFor(() => expect(mocked.runWorkflow).toHaveBeenCalledTimes(1));
    expect(mocked.runWorkflow).toHaveBeenCalledWith('w1', {
      fileId: FILE_ID,
      nodeId: compId,
      request: 'build me a button',
    });
    expect(await screen.findByTestId('run-result')).toBeTruthy();
    expect(screen.getByTestId('run-result').textContent).toContain('result text');
  });

  it('shows an inline error when the run fails', async () => {
    mocked.runWorkflow.mockRejectedValueOnce(new Error('run failed'));
    const { doc, compId } = docWithComponent();
    useSelectionStore.setState({ selectedIds: [compId] });
    render(<AgentsPanel doc={doc} fileId={FILE_ID} />);

    await screen.findByTestId('workflow-w1');
    fireEvent.change(screen.getByTestId('workflow-prompt-w1'), { target: { value: 'go' } });
    fireEvent.click(screen.getByTestId('workflow-run-w1'));

    expect(await screen.findByTestId('workflow-error-w1')).toBeTruthy();
    expect(screen.getByTestId('workflow-error-w1').textContent).toBe('run failed');
  });
});
