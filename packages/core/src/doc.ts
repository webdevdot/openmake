import * as Y from 'yjs';
import {
  CONTAINER_TYPES,
  DOCUMENT_SCHEMA_VERSION,
  DocumentDataSchema,
  SceneNodeSchema,
  StyleSchema,
  VariableSchema,
  createId,
  type AssetRef,
  type DocumentData,
  type NodeType,
  type SceneNode,
  type Style,
  type Variable,
} from '@openmake/shared';
import { applyMatrix, getWorldBounds, getWorldMatrix, invert } from './geometry.js';

/** Origin tag for local transactions — the only origin tracked by undo. */
export const LOCAL_ORIGIN = 'openmake:local';

const DEFAULT_NAMES: Record<NodeType, string> = {
  DOCUMENT: 'Document',
  PAGE: 'Page',
  FRAME: 'Frame',
  GROUP: 'Group',
  RECTANGLE: 'Rectangle',
  ELLIPSE: 'Ellipse',
  POLYGON: 'Polygon',
  STAR: 'Star',
  LINE: 'Line',
  VECTOR: 'Vector',
  TEXT: 'Text',
  COMPONENT: 'Component',
  COMPONENT_SET: 'Component set',
  INSTANCE: 'Instance',
};

export type CreateNodeInput = {
  type: NodeType;
  parentId: string;
  index?: number;
} & Record<string, unknown>;

type YNode = Y.Map<unknown>;

/**
 * Headless document engine. The Y.Doc IS the document: every mutation is a
 * Yjs transaction, so real-time sync, offline merge, and undo/redo come from
 * the CRDT rather than a parallel model.
 */
export class OpenDoc {
  readonly ydoc: Y.Doc;
  private readonly nodes: Y.Map<YNode>;
  private readonly meta: Y.Map<unknown>;
  private readonly variablesMap: Y.Map<Variable>;
  private readonly stylesMap: Y.Map<Style>;
  private readonly assetsMap: Y.Map<AssetRef>;
  private readonly undoManager: Y.UndoManager;
  private readonly snapshotCache = new Map<string, SceneNode>();
  private readonly listeners = new Set<(changed: ReadonlySet<string>) => void>();
  private _version = 0;

  private constructor(ydoc: Y.Doc) {
    this.ydoc = ydoc;
    this.nodes = ydoc.getMap('nodes');
    this.meta = ydoc.getMap('meta');
    this.variablesMap = ydoc.getMap('variables');
    this.stylesMap = ydoc.getMap('styles');
    this.assetsMap = ydoc.getMap('assets');
    this.undoManager = new Y.UndoManager(
      [this.nodes, this.variablesMap, this.stylesMap, this.assetsMap],
      { trackedOrigins: new Set([LOCAL_ORIGIN]) },
    );

    this.nodes.observeDeep((events) => {
      const changed = new Set<string>();
      for (const ev of events) {
        if (ev.target === this.nodes) {
          for (const key of (ev as Y.YMapEvent<YNode>).keysChanged) {
            changed.add(key);
            this.snapshotCache.delete(key);
          }
        } else {
          const id = ev.path[0];
          if (typeof id === 'string') {
            changed.add(id);
            this.snapshotCache.delete(id);
          }
        }
      }
      this._version++;
      for (const listener of this.listeners) listener(changed);
    });

    for (const map of [this.variablesMap, this.stylesMap, this.assetsMap, this.meta]) {
      map.observe((ev) => {
        this._version++;
        const changed = new Set<string>(ev.keysChanged);
        for (const listener of this.listeners) listener(changed);
      });
    }
  }

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  static create(opts: { id?: string; name?: string } = {}): OpenDoc {
    const doc = new OpenDoc(new Y.Doc());
    doc.transact(() => {
      const rootId = createId('node');
      doc.meta.set('schemaVersion', DOCUMENT_SCHEMA_VERSION);
      doc.meta.set('id', opts.id ?? createId('doc'));
      doc.meta.set('name', opts.name ?? 'Untitled');
      doc.meta.set('rootId', rootId);
      doc.meta.set('variableModes', [{ id: 'default', name: 'Default' }]);
      doc.insertNodeRaw(
        SceneNodeSchema.parse({ id: rootId, type: 'DOCUMENT', name: DEFAULT_NAMES.DOCUMENT }),
        null,
      );
      doc.insertNodeRaw(
        SceneNodeSchema.parse({ id: createId('node'), type: 'PAGE', name: 'Page 1' }),
        rootId,
      );
    });
    doc.undoManager.clear(); // initial structure is not undoable
    return doc;
  }

  /** Wrap an existing Y.Doc (e.g. one that will be hydrated by a sync provider). */
  static fromYDoc(ydoc: Y.Doc): OpenDoc {
    return new OpenDoc(ydoc);
  }

  static fromJSON(data: DocumentData): OpenDoc {
    const validated = DocumentDataSchema.parse(data);
    const doc = new OpenDoc(new Y.Doc());
    const parentOf = new Map<string, string>();
    for (const [id, node] of Object.entries(validated.nodes)) {
      const children = (node as { children?: string[] }).children ?? [];
      for (const childId of children) parentOf.set(childId, id);
    }
    doc.transact(() => {
      doc.meta.set('schemaVersion', validated.schemaVersion);
      doc.meta.set('id', validated.id);
      doc.meta.set('name', validated.name);
      doc.meta.set('rootId', validated.rootId);
      doc.meta.set('variableModes', validated.variableModes);
      for (const [id, node] of Object.entries(validated.nodes)) {
        doc.nodes.set(id, doc.nodeToYMap(node, parentOf.get(id) ?? null));
      }
      for (const [id, v] of Object.entries(validated.variables)) doc.variablesMap.set(id, v);
      for (const [id, s] of Object.entries(validated.styles)) doc.stylesMap.set(id, s);
      for (const [id, a] of Object.entries(validated.assets)) doc.assetsMap.set(id, a);
    });
    doc.undoManager.clear();
    return doc;
  }

  toJSON(): DocumentData {
    const nodes: Record<string, SceneNode> = {};
    for (const id of this.nodes.keys()) {
      const node = this.getNode(id);
      if (node) nodes[id] = node;
    }
    return DocumentDataSchema.parse({
      schemaVersion: this.meta.get('schemaVersion'),
      id: this.id,
      name: this.name,
      rootId: this.rootId,
      nodes,
      variables: Object.fromEntries(this.variablesMap.entries()),
      variableModes: this.meta.get('variableModes') ?? [],
      styles: Object.fromEntries(this.stylesMap.entries()),
      assets: Object.fromEntries(this.assetsMap.entries()),
    });
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  get id(): string {
    return this.meta.get('id') as string;
  }

  get name(): string {
    return this.meta.get('name') as string;
  }

  get rootId(): string {
    return this.meta.get('rootId') as string;
  }

  get version(): number {
    return this._version;
  }

  getNode(id: string): SceneNode | undefined {
    const cached = this.snapshotCache.get(id);
    if (cached) return cached;
    const yNode = this.nodes.get(id);
    if (!yNode) return undefined;
    const snapshot = this.yMapToNode(yNode);
    this.snapshotCache.set(id, snapshot);
    return snapshot;
  }

  getParentId(id: string): string | undefined {
    return this.nodes.get(id)?.get('parentId') as string | undefined;
  }

  getChildrenIds(id: string): string[] {
    const children = this.nodes.get(id)?.get('children');
    return children instanceof Y.Array ? (children.toArray() as string[]) : [];
  }

  getPages(): string[] {
    return this.getChildrenIds(this.rootId);
  }

  // -------------------------------------------------------------------------
  // Mutations (all run inside LOCAL_ORIGIN transactions)
  // -------------------------------------------------------------------------

  transact<T>(fn: () => T): T {
    return this.ydoc.transact(fn, LOCAL_ORIGIN);
  }

  createNode(input: CreateNodeInput): string {
    const { type, parentId, index, ...props } = input;
    const parent = this.nodes.get(parentId);
    if (!parent) throw new Error(`Parent node "${parentId}" does not exist`);
    const parentType = parent.get('type') as NodeType;
    if (!CONTAINER_TYPES.has(parentType)) {
      throw new Error(`Parent node "${parentId}" (${parentType}) is not a container`);
    }
    const id = createId('node');
    const node = SceneNodeSchema.parse({
      id,
      name: (props.name as string | undefined) ?? DEFAULT_NAMES[type],
      ...props,
      type,
    });
    this.transact(() => this.insertNodeRaw(node, parentId, index));
    return id;
  }

  updateNode(id: string, props: Record<string, unknown>): void {
    const yNode = this.nodes.get(id);
    if (!yNode) throw new Error(`Node "${id}" does not exist`);
    const current = this.yMapToNode(yNode);
    const merged = SceneNodeSchema.parse({ ...current, ...props });
    this.transact(() => {
      for (const key of Object.keys(props)) {
        if (key === 'id' || key === 'children' || key === 'parentId') continue;
        yNode.set(key, (merged as unknown as Record<string, unknown>)[key]);
      }
    });
  }

  deleteNode(id: string): void {
    if (!this.nodes.has(id)) throw new Error(`Node "${id}" does not exist`);
    if (id === this.rootId) throw new Error('Cannot delete the document root');
    const subtree: string[] = [];
    const collect = (nodeId: string) => {
      subtree.push(nodeId);
      for (const childId of this.getChildrenIds(nodeId)) collect(childId);
    };
    collect(id);
    this.transact(() => {
      this.detachFromParent(id);
      for (const nodeId of subtree) this.nodes.delete(nodeId);
    });
  }

  moveNode(id: string, newParentId: string, index?: number): void {
    const yNode = this.nodes.get(id);
    if (!yNode) throw new Error(`Node "${id}" does not exist`);
    const target = this.nodes.get(newParentId);
    if (!target) throw new Error(`Target parent "${newParentId}" does not exist`);
    const targetType = target.get('type') as NodeType;
    if (!CONTAINER_TYPES.has(targetType)) {
      throw new Error(`Target parent "${newParentId}" (${targetType}) is not a container`);
    }
    for (
      let ancestor: string | undefined = newParentId;
      ancestor;
      ancestor = this.getParentId(ancestor)
    ) {
      if (ancestor === id) throw new Error('Cannot move a node into its own subtree (cycle)');
    }
    this.transact(() => {
      this.detachFromParent(id);
      const children = target.get('children') as Y.Array<string>;
      const clamped = index === undefined ? children.length : Math.min(index, children.length);
      children.insert(clamped, [id]);
      yNode.set('parentId', newParentId);
    });
  }

  // -------------------------------------------------------------------------
  // Grouping
  // -------------------------------------------------------------------------

  /**
   * Wrap the given nodes in a new GROUP, preserving each node's on-screen
   * position and the selection's z-order. All ids must share the same parent.
   * Returns the new group's id. Runs as a single transaction (one undo step).
   */
  groupNodes(ids: string[]): string {
    const [first] = ids;
    if (first === undefined) throw new Error('Cannot group an empty selection');

    // Validate existence and a shared parent (grouping across parents is undefined).
    const parentId = this.getParentId(first);
    if (!parentId) throw new Error(`Node "${first}" has no parent and cannot be grouped`);
    for (const id of ids) {
      if (!this.nodes.has(id)) throw new Error(`Node "${id}" does not exist`);
      if (this.getParentId(id) !== parentId) {
        throw new Error('All nodes must share the same parent to be grouped');
      }
    }

    // Sort by document order (z-order); selectedIds arrives in selection order.
    const siblingOrder = this.getChildrenIds(parentId);
    const ordered = [...new Set(ids)].sort(
      (a, b) => siblingOrder.indexOf(a) - siblingOrder.indexOf(b),
    );

    // Group frame = union of the members' world-space bounding boxes.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of ordered) {
      const b = getWorldBounds(this, id);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }

    // World -> local for the group's parent, so the group sits at the union origin
    // regardless of the parent's own transform.
    const parentWorld = getWorldMatrix(this, parentId);
    const parentInv = invert(parentWorld);
    const groupLocal = applyMatrix(parentInv, { x: minX, y: minY });

    // Insert the group at the index of the topmost (last) member so stacking is kept.
    const insertIndex = Math.max(...ordered.map((id) => siblingOrder.indexOf(id))) + 1;

    const groupId = createId('node');
    const group = SceneNodeSchema.parse({
      id: groupId,
      name: DEFAULT_NAMES.GROUP,
      type: 'GROUP',
      x: groupLocal.x,
      y: groupLocal.y,
      width: maxX - minX,
      height: maxY - minY,
    });

    this.transact(() => {
      this.insertNodeRaw(group, parentId, insertIndex);
      const groupInv = invert(getWorldMatrix(this, groupId));
      for (const id of ordered) {
        // Capture the child's current world origin BEFORE detaching.
        const childWorld = getWorldMatrix(this, id);
        const worldOrigin = applyMatrix(childWorld, { x: 0, y: 0 });
        const local = applyMatrix(groupInv, worldOrigin);
        this.detachFromParent(id);
        this.insertNodeRaw(this.getNode(id)!, groupId);
        const yNode = this.nodes.get(id)!;
        yNode.set('parentId', groupId);
        yNode.set('x', local.x);
        yNode.set('y', local.y);
      }
    });
    return groupId;
  }

  /**
   * Dissolve a GROUP, reparenting its children back into the group's parent at
   * the group's position (preserving each child's on-screen position and the
   * z-order), then deleting the now-empty group. Returns the freed child ids.
   * Runs as a single transaction (one undo step).
   */
  ungroupNodes(groupId: string): string[] {
    const yGroup = this.nodes.get(groupId);
    if (!yGroup) throw new Error(`Node "${groupId}" does not exist`);
    const parentId = this.getParentId(groupId);
    if (!parentId) throw new Error(`Node "${groupId}" has no parent and cannot be ungrouped`);

    const childIds = this.getChildrenIds(groupId);
    const siblingOrder = this.getChildrenIds(parentId);
    const groupIndex = siblingOrder.indexOf(groupId);
    const parentInv = invert(getWorldMatrix(this, parentId));

    this.transact(() => {
      // Splice children into the parent at the group's slot, keeping their order.
      childIds.forEach((id, offset) => {
        const childWorld = getWorldMatrix(this, id);
        const worldOrigin = applyMatrix(childWorld, { x: 0, y: 0 });
        const local = applyMatrix(parentInv, worldOrigin);
        this.detachFromParent(id);
        this.insertNodeRaw(this.getNode(id)!, parentId, groupIndex + offset);
        const yNode = this.nodes.get(id)!;
        yNode.set('parentId', parentId);
        yNode.set('x', local.x);
        yNode.set('y', local.y);
      });
      // The group is now empty; remove it.
      this.detachFromParent(groupId);
      this.nodes.delete(groupId);
    });
    return childIds;
  }

  // -------------------------------------------------------------------------
  // Undo / redo
  // -------------------------------------------------------------------------

  undo(): void {
    this.undoManager.undo();
  }

  redo(): void {
    this.undoManager.redo();
  }

  canUndo(): boolean {
    return this.undoManager.canUndo();
  }

  canRedo(): boolean {
    return this.undoManager.canRedo();
  }

  /** Close the current undo capture group; the next change starts a new one. */
  commitUndoGroup(): void {
    this.undoManager.stopCapturing();
  }

  // -------------------------------------------------------------------------
  // Subscription (useSyncExternalStore-compatible)
  // -------------------------------------------------------------------------

  subscribe(listener: (changed: ReadonlySet<string>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // -------------------------------------------------------------------------
  // Components
  // -------------------------------------------------------------------------

  createComponentFromNode(id: string): string {
    const node = this.getNode(id);
    if (!node) throw new Error(`Node "${id}" does not exist`);
    if (node.type !== 'FRAME') throw new Error('Only frames can become components');
    this.transact(() => {
      const yNode = this.nodes.get(id)!;
      yNode.set('type', 'COMPONENT');
      yNode.set('description', '');
    });
    return id;
  }

  createInstance(
    componentId: string,
    parentId: string,
    position: { x: number; y: number },
  ): string {
    const component = this.getNode(componentId);
    if (component?.type !== 'COMPONENT') {
      throw new Error(`Node "${componentId}" is not a component`);
    }
    return this.createNode({
      type: 'INSTANCE',
      parentId,
      componentId,
      name: component.name,
      x: position.x,
      y: position.y,
      width: component.width,
      height: component.height,
    });
  }

  // -------------------------------------------------------------------------
  // Variables / styles / assets
  // -------------------------------------------------------------------------

  setVariable(variable: Variable): void {
    const parsed = VariableSchema.parse(variable);
    this.transact(() => this.variablesMap.set(parsed.id, parsed));
  }

  deleteVariable(id: string): void {
    this.transact(() => this.variablesMap.delete(id));
  }

  getVariables(): Record<string, Variable> {
    return Object.fromEntries(this.variablesMap.entries());
  }

  setStyle(style: Style): void {
    const parsed = StyleSchema.parse(style);
    this.transact(() => this.stylesMap.set(parsed.id, parsed));
  }

  getStyles(): Record<string, Style> {
    return Object.fromEntries(this.stylesMap.entries());
  }

  setAsset(id: string, ref: AssetRef): void {
    this.transact(() => this.assetsMap.set(id, ref));
  }

  getAssets(): Record<string, AssetRef> {
    return Object.fromEntries(this.assetsMap.entries());
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private insertNodeRaw(node: SceneNode, parentId: string | null, index?: number): void {
    this.nodes.set(node.id, this.nodeToYMap(node, parentId));
    if (parentId) {
      const parent = this.nodes.get(parentId)!;
      const children = parent.get('children') as Y.Array<string>;
      const clamped = index === undefined ? children.length : Math.min(index, children.length);
      children.insert(clamped, [node.id]);
    }
  }

  private detachFromParent(id: string): void {
    const parentId = this.getParentId(id);
    if (!parentId) return;
    const parent = this.nodes.get(parentId);
    const children = parent?.get('children') as Y.Array<string> | undefined;
    if (!children) return;
    const idx = children.toArray().indexOf(id);
    if (idx >= 0) children.delete(idx, 1);
  }

  private nodeToYMap(node: SceneNode, parentId: string | null): YNode {
    const yNode = new Y.Map<unknown>();
    for (const [key, value] of Object.entries(node)) {
      if (key === 'children') {
        yNode.set('children', Y.Array.from(value as string[]));
      } else {
        yNode.set(key, value);
      }
    }
    if (parentId) yNode.set('parentId', parentId);
    return yNode;
  }

  private yMapToNode(yNode: YNode): SceneNode {
    const raw: Record<string, unknown> = {};
    for (const [key, value] of yNode.entries()) {
      if (key === 'parentId') continue;
      raw[key] = value instanceof Y.Array ? value.toArray() : value;
    }
    return raw as unknown as SceneNode;
  }
}
