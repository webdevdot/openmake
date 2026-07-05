import { api } from './client.js';
import type { AuthResponse, FileMeta, Org, Project, User } from './types.js';

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
  create: (projectId: string, name: string) =>
    api.post<{ file: FileMeta }>(`/projects/${projectId}/files`, { name }).then((r) => r.file),
  get: (fileId: string) => api.get<{ file: FileMeta }>(`/files/${fileId}`).then((r) => r.file),
};
