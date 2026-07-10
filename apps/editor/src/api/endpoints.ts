import { api } from './client.js';
import type {
  Agent,
  AuthResponse,
  Comment,
  CreateCommentInput,
  FileMeta,
  Org,
  Project,
  Skill,
  User,
  Workflow,
  WorkflowRunResult,
} from './types.js';

// The server wraps resource responses in envelopes ({ orgs }, { file }, …);
// auth register/login are flat. Unwrap here so the rest of the app sees bare values.

export const authApi = {
  register: (input: { email: string; password: string; name: string }) =>
    api.post<AuthResponse>('/auth/register', input),
  login: (input: { email: string; password: string }) =>
    api.post<AuthResponse>('/auth/login', input),
  me: () => api.get<{ user: User }>('/auth/me').then((r) => r.user),
};

export const orgsApi = {
  list: () => api.get<{ orgs: Org[] }>('/orgs').then((r) => r.orgs),
};

export const projectsApi = {
  list: (orgId: string) =>
    api.get<{ projects: Project[] }>(`/orgs/${orgId}/projects`).then((r) => r.projects),
  create: (orgId: string, name: string) =>
    api.post<{ project: Project }>(`/orgs/${orgId}/projects`, { name }).then((r) => r.project),
};

export const filesApi = {
  list: (projectId: string) =>
    api.get<{ files: FileMeta[] }>(`/projects/${projectId}/files`).then((r) => r.files),
  listDeleted: (projectId: string) =>
    api.get<{ files: FileMeta[] }>(`/projects/${projectId}/files?deleted=1`).then((r) => r.files),
  create: (projectId: string, name: string) =>
    api.post<{ file: FileMeta }>(`/projects/${projectId}/files`, { name }).then((r) => r.file),
  import: (projectId: string, body: { name: string; document: unknown }) =>
    api.post<{ file: FileMeta }>(`/projects/${projectId}/files/import`, body).then((r) => r.file),
  get: (fileId: string) => api.get<{ file: FileMeta }>(`/files/${fileId}`).then((r) => r.file),
  delete: (fileId: string) => api.delete<void>(`/files/${fileId}`),
  restore: (fileId: string) =>
    api.post<{ file: FileMeta }>(`/files/${fileId}/restore`).then((r) => r.file),
  snapshot: (fileId: string) => api.getBinary(`/files/${fileId}/snapshot`),
};

// The editor only knows the fileId; the AI endpoints are org-scoped. Resolve the
// org by walking file -> project -> orgId through the existing enveloped routes.
export const projectDetailApi = {
  get: (projectId: string) =>
    api.get<{ project: Project }>(`/projects/${projectId}`).then((r) => r.project),
};

export const commentsApi = {
  list: (fileId: string) =>
    api.get<{ comments: Comment[] }>(`/files/${fileId}/comments`).then((r) => r.comments),
  create: (fileId: string, input: CreateCommentInput) =>
    api.post<{ comment: Comment }>(`/files/${fileId}/comments`, input).then((r) => r.comment),
  setResolved: (fileId: string, commentId: string, resolved: boolean) =>
    api
      .patch<{ comment: Comment }>(`/files/${fileId}/comments/${commentId}`, { resolved })
      .then((r) => r.comment),
  delete: (fileId: string, commentId: string) =>
    api.delete<void>(`/files/${fileId}/comments/${commentId}`),
};

export const aiApi = {
  skills: (orgId: string) =>
    api.get<{ skills: Skill[] }>(`/orgs/${orgId}/skills`).then((r) => r.skills),
  agents: (orgId: string) =>
    api.get<{ agents: Agent[] }>(`/orgs/${orgId}/agents`).then((r) => r.agents),
  workflows: (orgId: string) =>
    api.get<{ workflows: Workflow[] }>(`/orgs/${orgId}/workflows`).then((r) => r.workflows),
  runWorkflow: (
    workflowId: string,
    body: { fileId: string; nodeId: string; request: string; framework?: string },
  ) => api.post<WorkflowRunResult>(`/ai/workflows/${workflowId}/run`, body),
};
