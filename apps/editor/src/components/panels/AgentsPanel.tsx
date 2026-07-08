import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import type { OpenDoc } from '@openmake/core';
import { aiApi, filesApi, projectDetailApi } from '../../api/endpoints.js';
import type { Agent, Skill, Workflow, WorkflowRunResult } from '../../api/types.js';
import { ApiError } from '../../api/client.js';
import { useSelectionStore } from '../../store/selection.js';

export interface AgentsPanelProps {
  doc: OpenDoc;
  fileId: string;
}

type LoadState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

function errMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

/** Resolve the org that owns this file: file -> project -> orgId. */
function useOrgId(fileId: string): LoadState<string> {
  const [state, setState] = useState<LoadState<string>>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const file = await filesApi.get(fileId);
        const project = await projectDetailApi.get(file.projectId);
        if (!cancelled) setState({ status: 'ready', data: project.orgId });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: errMessage(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId]);
  return state;
}

interface SectionProps {
  title: string;
  count?: number;
  children: React.ReactNode;
  testId: string;
  defaultOpen?: boolean;
}

function Section({ title, count, children, testId, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-app" data-testid={testId}>
      <button
        type="button"
        data-testid={`${testId}-toggle`}
        aria-expanded={open}
        className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-xs font-medium text-secondary-app bg-hover-app"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown size={14} strokeWidth={1.75} className="shrink-0" />
        ) : (
          <ChevronRight size={14} strokeWidth={1.75} className="shrink-0" />
        )}
        <span className="flex-1">{title}</span>
        {count !== undefined && <span className="text-secondary-app">{count}</span>}
      </button>
      {open && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
}

function ListStatus({ label, kind }: { label: string; kind: 'loading' | 'empty' | 'error' }) {
  return (
    <div
      className="px-1 py-1 text-xs text-secondary-app"
      data-testid={`list-${kind}`}
    >
      {label}
    </div>
  );
}

/** A collapsible/expandable snippet of the workflow's returned text. */
function RunResult({ result }: { result: WorkflowRunResult }) {
  const [expanded, setExpanded] = useState(false);
  const text = result.final || result.steps.map((s) => s.output).join('\n\n') || '(empty response)';
  const isLong = text.length > 240;
  const shown = expanded || !isLong ? text : `${text.slice(0, 240)}…`;
  return (
    <div className="mt-1 rounded border p-1.5 border-app" data-testid="run-result">
      <pre className="whitespace-pre-wrap break-words text-[11px] leading-snug text-app">{shown}</pre>
      {isLong && (
        <button
          type="button"
          data-testid="run-result-expand"
          className="mt-1 text-[11px] text-secondary-app underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

interface WorkflowRowState {
  request: string;
  running: boolean;
  result: WorkflowRunResult | null;
  error: string | null;
}

const EMPTY_ROW: WorkflowRowState = { request: '', running: false, result: null, error: null };

function WorkflowRow({
  workflow,
  fileId,
  componentNodeId,
}: {
  workflow: Workflow;
  fileId: string;
  componentNodeId: string | null;
}) {
  const [state, setState] = useState<WorkflowRowState>(EMPTY_ROW);
  const canRun = componentNodeId !== null && state.request.trim().length > 0 && !state.running;

  const run = async () => {
    if (componentNodeId === null || state.request.trim().length === 0 || state.running) return;
    setState((s) => ({ ...s, running: true, error: null, result: null }));
    try {
      const result = await aiApi.runWorkflow(workflow.id, {
        fileId,
        nodeId: componentNodeId,
        request: state.request.trim(),
      });
      setState((s) => ({ ...s, running: false, result }));
    } catch (err) {
      setState((s) => ({ ...s, running: false, error: errMessage(err) }));
    }
  };

  return (
    <li className="mb-2 rounded border p-1.5 border-app" data-testid={`workflow-${workflow.id}`}>
      <div className="text-xs font-medium text-app">{workflow.name}</div>
      {workflow.description && (
        <div className="text-[11px] text-secondary-app">{workflow.description}</div>
      )}
      <div className="mt-1 flex items-center gap-1">
        <input
          type="text"
          data-testid={`workflow-prompt-${workflow.id}`}
          className="w-full rounded border bg-transparent px-1 py-0.5 text-xs outline-none border-app disabled:opacity-50"
          placeholder={componentNodeId === null ? 'Select a component to run' : 'Describe the request…'}
          value={state.request}
          disabled={componentNodeId === null || state.running}
          onChange={(e) => setState((s) => ({ ...s, request: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void run();
          }}
        />
        <button
          type="button"
          data-testid={`workflow-run-${workflow.id}`}
          className="shrink-0 rounded px-2 py-0.5 text-xs bg-hover-app disabled:opacity-50"
          disabled={!canRun}
          title={componentNodeId === null ? 'Select a component to run' : 'Run workflow'}
          onClick={() => void run()}
        >
          {state.running ? 'Running…' : 'Run'}
        </button>
      </div>
      {componentNodeId === null && (
        <div className="mt-0.5 text-[11px] text-secondary-app" data-testid={`workflow-hint-${workflow.id}`}>
          Select a component to run
        </div>
      )}
      {state.error && (
        <div className="mt-1 text-[11px] text-red-500" data-testid={`workflow-error-${workflow.id}`}>
          {state.error}
        </div>
      )}
      {state.result && <RunResult result={state.result} />}
    </li>
  );
}

export function AgentsPanel({ doc, fileId }: AgentsPanelProps) {
  const orgState = useOrgId(fileId);
  const selectedIds = useSelectionStore((s) => s.selectedIds);

  // The run affordance is enabled only when exactly one COMPONENT node is selected.
  const componentNodeId =
    selectedIds.length === 1 && doc.getNode(selectedIds[0]!)?.type === 'COMPONENT'
      ? selectedIds[0]!
      : null;

  const [skills, setSkills] = useState<LoadState<Skill[]>>({ status: 'loading' });
  const [agents, setAgents] = useState<LoadState<Agent[]>>({ status: 'loading' });
  const [workflows, setWorkflows] = useState<LoadState<Workflow[]>>({ status: 'loading' });

  useEffect(() => {
    if (orgState.status !== 'ready') return;
    const orgId = orgState.data;
    let cancelled = false;

    setSkills({ status: 'loading' });
    setAgents({ status: 'loading' });
    setWorkflows({ status: 'loading' });

    void aiApi
      .skills(orgId)
      .then((data) => {
        if (!cancelled) setSkills({ status: 'ready', data });
      })
      .catch((err) => {
        if (!cancelled) setSkills({ status: 'error', message: errMessage(err) });
      });
    void aiApi
      .agents(orgId)
      .then((data) => {
        if (!cancelled) setAgents({ status: 'ready', data });
      })
      .catch((err) => {
        if (!cancelled) setAgents({ status: 'error', message: errMessage(err) });
      });
    void aiApi
      .workflows(orgId)
      .then((data) => {
        if (!cancelled) setWorkflows({ status: 'ready', data });
      })
      .catch((err) => {
        if (!cancelled) setWorkflows({ status: 'error', message: errMessage(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [orgState]);

  if (orgState.status === 'error') {
    return (
      <div className="p-2 text-xs text-red-500" data-testid="agents-panel-error">
        {orgState.message}
      </div>
    );
  }

  return (
    <div data-testid="agents-panel" className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex items-center gap-1 border-b px-2 py-1.5 border-app">
        <Sparkles size={14} strokeWidth={1.75} className="text-secondary-app" />
        <span className="text-xs font-medium text-app">Agents</span>
      </div>

      <Section title="Skills" testId="skills-section" count={skills.status === 'ready' ? skills.data.length : undefined}>
        {skills.status === 'loading' && <ListStatus kind="loading" label="Loading skills…" />}
        {skills.status === 'error' && <ListStatus kind="error" label={skills.message} />}
        {skills.status === 'ready' &&
          (skills.data.length === 0 ? (
            <ListStatus kind="empty" label="No skills" />
          ) : (
            <ul>
              {skills.data.map((skill) => (
                <li key={skill.id} className="py-0.5" data-testid={`skill-${skill.id}`}>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-app">{skill.name}</span>
                    {skill.builtIn && (
                      <span
                        className="rounded px-1 text-[9px] uppercase text-secondary-app bg-hover-app"
                        data-testid={`skill-builtin-${skill.id}`}
                      >
                        Built-in
                      </span>
                    )}
                  </div>
                  {skill.description && (
                    <div className="text-[11px] text-secondary-app">{skill.description}</div>
                  )}
                </li>
              ))}
            </ul>
          ))}
      </Section>

      <Section title="Agents" testId="agents-section" count={agents.status === 'ready' ? agents.data.length : undefined}>
        {agents.status === 'loading' && <ListStatus kind="loading" label="Loading agents…" />}
        {agents.status === 'error' && <ListStatus kind="error" label={agents.message} />}
        {agents.status === 'ready' &&
          (agents.data.length === 0 ? (
            <ListStatus kind="empty" label="No agents" />
          ) : (
            <ul>
              {agents.data.map((agent) => (
                <li key={agent.id} className="py-0.5" data-testid={`agent-${agent.id}`}>
                  <div className="text-xs font-medium text-app">{agent.name}</div>
                  {agent.description && (
                    <div className="text-[11px] text-secondary-app">{agent.description}</div>
                  )}
                </li>
              ))}
            </ul>
          ))}
      </Section>

      <Section
        title="Workflows"
        testId="workflows-section"
        count={workflows.status === 'ready' ? workflows.data.length : undefined}
      >
        {workflows.status === 'loading' && <ListStatus kind="loading" label="Loading workflows…" />}
        {workflows.status === 'error' && <ListStatus kind="error" label={workflows.message} />}
        {workflows.status === 'ready' &&
          (workflows.data.length === 0 ? (
            <ListStatus kind="empty" label="No workflows" />
          ) : (
            <ul>
              {workflows.data.map((workflow) => (
                <WorkflowRow
                  key={workflow.id}
                  workflow={workflow}
                  fileId={fileId}
                  componentNodeId={componentNodeId}
                />
              ))}
            </ul>
          ))}
      </Section>
    </div>
  );
}
