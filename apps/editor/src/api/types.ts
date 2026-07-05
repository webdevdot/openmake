export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface Org {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  orgId: string;
  name: string;
}

export interface FileMeta {
  id: string;
  projectId: string;
  name: string;
  updatedAt: string;
}
