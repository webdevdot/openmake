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

export interface DocVersion {
  id: string;
  name: string;
  seq: number;
  createdAt: string;
  author: { id: string; name: string };
}

export interface AutoCheckpoint {
  id: string;
  upToSeq: number;
  createdAt: string;
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

export interface Comment {
  id: string;
  fileId: string;
  nodeId: string | null;
  authorId: string;
  body: string;
  /** World-space canvas pin coordinates for free-point comments (null for node/general). */
  anchorX: number | null;
  anchorY: number | null;
  resolvedAt: string | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present on top-level threads returned by the list endpoint. */
  replies?: Comment[];
}

export interface CreateCommentInput {
  body: string;
  nodeId?: string;
  anchorX?: number;
  anchorY?: number;
  parentId?: string;
}
