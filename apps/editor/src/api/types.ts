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

export interface Skill {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  provider: string;
  model: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
}

export interface WorkflowRunResult {
  conversationId: string;
  steps: Array<{ agentId: string; output: string }>;
  final: string;
}
