import { api } from './client.js';
import type { AuthResponse, FileMeta, Org, Project, User } from './types.js';

export const authApi = {
  register: (input: { email: string; password: string; name: string }) =>
    api.post<AuthResponse>('/auth/register', input),
  login: (input: { email: string; password: string }) =>
    api.post<AuthResponse>('/auth/login', input),
  me: () => api.get<User>('/auth/me'),
};

export const orgsApi = {
  list: () => api.get<Org[]>('/orgs'),
};

export const projectsApi = {
  list: (orgId: string) => api.get<Project[]>(`/orgs/${orgId}/projects`),
  create: (orgId: string, name: string) => api.post<Project>(`/orgs/${orgId}/projects`, { name }),
};

export const filesApi = {
  list: (projectId: string) => api.get<FileMeta[]>(`/projects/${projectId}/files`),
  create: (projectId: string, name: string) =>
    api.post<FileMeta>(`/projects/${projectId}/files`, { name }),
  get: (fileId: string) => api.get<FileMeta>(`/files/${fileId}`),
};
