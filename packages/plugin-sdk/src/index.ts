import { z } from 'zod';
import type { NodeType, SceneNode } from '@openmake/shared';

// ---------------------------------------------------------------------------
// Plugin manifest
// ---------------------------------------------------------------------------

export const PLUGIN_PERMISSIONS = ['document:read', 'document:write', 'network', 'ui'] as const;
export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

export const PluginManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  main: z.string().min(1),
  permissions: z.array(z.enum(PLUGIN_PERMISSIONS)),
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

// ---------------------------------------------------------------------------
// Plugin API surface (mirrors Figma's plugin API shape)
// ---------------------------------------------------------------------------

export interface ShowUiOptions {
  width?: number;
  height?: number;
  title?: string;
}

/** Mirrors `@openmake/core`'s `CreateNodeInput` without taking a dependency on it. */
export type CreateNodeInput = {
  type: NodeType;
  parentId: string;
  index?: number;
} & Record<string, unknown>;

export interface PluginDocumentApi {
  getNode(id: string): SceneNode | null;
  getSelection(): string[];
  createNode(input: CreateNodeInput): string;
  updateNode(id: string, props: Record<string, unknown>): void;
  deleteNode(id: string): void;
}

export interface PluginUiApi {
  show(html: string, opts?: ShowUiOptions): void;
  postMessage(msg: unknown): void;
  onMessage(cb: (msg: unknown) => void): void;
}

export type PluginEvent = 'selectionchange' | 'documentchange';

export interface OpenmakePluginAPI {
  document: PluginDocumentApi;
  ui: PluginUiApi;
  on(event: PluginEvent, cb: () => void): void;
  notify(message: string): void;
  closePlugin(): void;
}

/** Entry-point helper: `export default definePlugin((api) => { ... })`. */
export function definePlugin(fn: (api: OpenmakePluginAPI) => void): (api: OpenmakePluginAPI) => void {
  return fn;
}
