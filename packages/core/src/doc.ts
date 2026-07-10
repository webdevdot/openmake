import * as Y from 'yjs';
import {
  CONTAINER_TYPES,
  DOCUMENT_SCHEMA_VERSION,
  DocumentDataSchema,
  SceneNodeSchema,
  StyleSchema,
  VariableCollectionSchema,
  VariableSchema,
  createId,
  isVariableAlias,
  type AssetRef,
  type DocumentData,
  type NodeType,
  type SceneNode,
  type Style,
  type Variable,
  type VariableCollection,
  type VariableType,
  type VariableValue,
} from '@openmake/shared';
import { applyMatrix, getWorldBounds, getWorldMatrix, invert } from './geometry.js';
import { parseVariantName } from './variants.js';

/** Origin tag for local transactions — the only origin tracked by undo. */
export const LOCAL_ORIGIN = 'openmake:local';

/** Neutral seed value for a new variable of the given type. */
function defaultVariableValue(type: VariableType): string | number | boolean {
  switch (type) {
    case 'COLOR':
      return '#000000';
    case 'FLOAT':
      return 0;
    case 'STRING':
      return '';
    case 'BOOLEAN':
      return false;
  }
}

/**
 * Free-function form of {@link OpenDoc.resolveVariableValue}. The second
 * argument is either a single `modeId` (legacy same-collection call shape) or a
 * `modesByCollection` map (`collectionId → modeId`) used to resolve alias chains
 * across collections in their respective active modes. Returns the resolved
 * scalar (aliases followed), or `undefined` when unresolved (missing variable,
 * dangling alias target, or a cycle).
 */
export function resolveVariableValue(
  doc: OpenDoc,
  variableId: string,
  modeOrModes?: string | Record<string, string>,
): string | number | boolean | undefined {
  return doc.resolveVariableValue(variableId, modeOrModes);
}

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
  private readonly variableCollectionsMap: Y.Map<VariableCollection>;
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
    this.variableCollectionsMap = ydoc.getMap('variableCollections');
    this.stylesMap = ydoc.getMap('styles');
    this.assetsMap = ydoc.getMap('assets');
    this.undoManager = new Y.UndoManager(
      [
        this.nodes,
        this.variablesMap,
        this.variableCollectionsMap,
        this.stylesMap,
        this.assetsMap,
      ],
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

    for (const map of [
      this.variablesMap,
      this.variableCollectionsMap,
      this.stylesMap,
      this.assetsMap,
      this.meta,
    ]) {
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
      for (const [id, node] of Object.entries(validated.nodes)) {
        doc.nodes.set(id, doc.nodeToYMap(node, parentOf.get(id) ?? null));
      }
      for (const [id, v] of Object.entries(validated.variables)) doc.variablesMap.set(id, v);
      for (const [id, c] of Object.entries(validated.variableCollections)) {
        doc.variableCollectionsMap.set(id, c);
      }
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
      variableCollections: Object.fromEntries(this.variableCollectionsMap.entries()),
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

  /**
   * Combine >= 2 COMPONENT nodes into a new COMPONENT_SET. Each component keeps
   * its on-screen position (converted into the set's local frame) and z-order,
   * and gets `variantProperties` parsed from its name (Figma's
   * `Prop=Value` convention; names that don't parse fall back to
   * `Variant=<name>`). The set is placed at the union bounding box of its
   * members, in the members' shared parent. All ids must share one parent.
   * Returns the new set's id. Runs as a single transaction (one undo step).
   */
  combineAsVariants(componentIds: string[]): string {
    const ids = [...new Set(componentIds)];
    if (ids.length < 2) {
      throw new Error('Combine as variants needs at least two components');
    }

    const first = ids[0]!;
    const parentId = this.getParentId(first);
    if (!parentId) {
      throw new Error(`Component "${first}" has no parent and cannot be combined`);
    }
    for (const id of ids) {
      const node = this.getNode(id);
      if (!node) throw new Error(`Node "${id}" does not exist`);
      if (node.type !== 'COMPONENT') {
        throw new Error(`Node "${id}" (${node.type}) is not a component`);
      }
      if (this.getParentId(id) !== parentId) {
        throw new Error('All components must share the same parent to be combined');
      }
    }

    // Order members by document z-order (selection order is arbitrary).
    const siblingOrder = this.getChildrenIds(parentId);
    const ordered = ids.sort((a, b) => siblingOrder.indexOf(a) - siblingOrder.indexOf(b));

    // Set frame = union of members' world-space bounding boxes.
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

    // World -> parent-local, so the set sits at the union origin.
    const parentInv = invert(getWorldMatrix(this, parentId));
    const setLocal = applyMatrix(parentInv, { x: minX, y: minY });

    // Insert the set at the topmost member's slot to keep stacking.
    const insertIndex = Math.max(...ordered.map((id) => siblingOrder.indexOf(id))) + 1;

    const setId = createId('node');
    const set = SceneNodeSchema.parse({
      id: setId,
      name: DEFAULT_NAMES.COMPONENT_SET,
      type: 'COMPONENT_SET',
      x: setLocal.x,
      y: setLocal.y,
      width: maxX - minX,
      height: maxY - minY,
    });

    this.transact(() => {
      this.insertNodeRaw(set, parentId, insertIndex);
      const setInv = invert(getWorldMatrix(this, setId));
      for (const id of ordered) {
        // Capture the component's world origin BEFORE reparenting.
        const worldOrigin = applyMatrix(getWorldMatrix(this, id), { x: 0, y: 0 });
        const local = applyMatrix(setInv, worldOrigin);
        const { props } = parseVariantName(this.getNode(id)!.name);
        this.detachFromParent(id);
        this.insertNodeRaw(this.getNode(id)!, setId);
        const yNode = this.nodes.get(id)!;
        yNode.set('parentId', setId);
        yNode.set('x', local.x);
        yNode.set('y', local.y);
        yNode.set('variantProperties', props);
      }
    });
    return setId;
  }

  // -------------------------------------------------------------------------
  // Variables / styles / assets
  // -------------------------------------------------------------------------

  // --- Variable collections -------------------------------------------------

  /** Create a collection with a single default mode. Returns the new id. */
  createVariableCollection(name = 'Collection', modeName = 'Mode 1'): string {
    const id = createId('varcol');
    const modeId = createId('mode');
    const collection = VariableCollectionSchema.parse({
      id,
      name,
      modes: [{ id: modeId, name: modeName }],
      defaultModeId: modeId,
    });
    this.transact(() => this.variableCollectionsMap.set(id, collection));
    return id;
  }

  renameCollection(id: string, name: string): void {
    const current = this.variableCollectionsMap.get(id);
    if (!current) throw new Error(`Variable collection "${id}" does not exist`);
    this.transact(() =>
      this.variableCollectionsMap.set(id, VariableCollectionSchema.parse({ ...current, name })),
    );
  }

  /** Append a mode to a collection. Returns the new mode's id. */
  addMode(collectionId: string, name = 'Mode'): string {
    const current = this.variableCollectionsMap.get(collectionId);
    if (!current) throw new Error(`Variable collection "${collectionId}" does not exist`);
    const modeId = createId('mode');
    const next = VariableCollectionSchema.parse({
      ...current,
      modes: [...current.modes, { id: modeId, name }],
    });
    this.transact(() => this.variableCollectionsMap.set(collectionId, next));
    return modeId;
  }

  renameMode(collectionId: string, modeId: string, name: string): void {
    const current = this.variableCollectionsMap.get(collectionId);
    if (!current) throw new Error(`Variable collection "${collectionId}" does not exist`);
    const next = VariableCollectionSchema.parse({
      ...current,
      modes: current.modes.map((m) => (m.id === modeId ? { ...m, name } : m)),
    });
    this.transact(() => this.variableCollectionsMap.set(collectionId, next));
  }

  /**
   * Remove a mode from a collection. Guards the last mode (a collection must
   * keep >= 1 mode). Drops the mode's value from every variable in the
   * collection; if the removed mode was the default, the first remaining mode
   * becomes the new default.
   */
  removeMode(collectionId: string, modeId: string): void {
    const current = this.variableCollectionsMap.get(collectionId);
    if (!current) throw new Error(`Variable collection "${collectionId}" does not exist`);
    if (current.modes.length <= 1) {
      throw new Error('Cannot remove the last mode of a collection');
    }
    const modes = current.modes.filter((m) => m.id !== modeId);
    if (modes.length === current.modes.length) return; // no such mode
    const defaultModeId = current.defaultModeId === modeId ? modes[0]!.id : current.defaultModeId;
    const next = VariableCollectionSchema.parse({ ...current, modes, defaultModeId });
    this.transact(() => {
      this.variableCollectionsMap.set(collectionId, next);
      for (const [vid, v] of this.variablesMap.entries()) {
        if (v.collectionId !== collectionId || !(modeId in v.valuesByMode)) continue;
        const valuesByMode = { ...v.valuesByMode };
        delete valuesByMode[modeId];
        this.variablesMap.set(vid, { ...v, valuesByMode });
      }
    });
  }

  /** Delete a collection and cascade-delete every variable that belongs to it. */
  deleteCollection(collectionId: string): void {
    this.transact(() => {
      this.variableCollectionsMap.delete(collectionId);
      for (const [vid, v] of this.variablesMap.entries()) {
        if (v.collectionId === collectionId) this.variablesMap.delete(vid);
      }
    });
  }

  getVariableCollections(): Record<string, VariableCollection> {
    return Object.fromEntries(this.variableCollectionsMap.entries());
  }

  // --- Variables ------------------------------------------------------------

  /**
   * Create a variable in a collection. Seeds every collection mode with
   * `initialValue` (defaulted by type). Returns the new variable id.
   */
  createVariable(
    collectionId: string,
    type: VariableType,
    name = 'Variable',
    initialValue?: string | number | boolean,
  ): string {
    const collection = this.variableCollectionsMap.get(collectionId);
    if (!collection) throw new Error(`Variable collection "${collectionId}" does not exist`);
    const seed = initialValue ?? defaultVariableValue(type);
    const valuesByMode: Record<string, string | number | boolean> = {};
    for (const mode of collection.modes) valuesByMode[mode.id] = seed;
    const id = createId('var');
    const variable = VariableSchema.parse({ id, collectionId, name, type, valuesByMode });
    this.transact(() => this.variablesMap.set(id, variable));
    return id;
  }

  /** Patch a variable's name and/or per-mode values (scalars or aliases). */
  updateVariable(
    id: string,
    patch: { name?: string; valuesByMode?: Record<string, VariableValue> },
  ): void {
    const current = this.variablesMap.get(id);
    if (!current) throw new Error(`Variable "${id}" does not exist`);
    const next = VariableSchema.parse({
      ...current,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.valuesByMode !== undefined
        ? { valuesByMode: { ...current.valuesByMode, ...patch.valuesByMode } }
        : {}),
    });
    this.transact(() => this.variablesMap.set(id, next));
  }

  /**
   * Delete a variable. v1: existing paint bindings (SolidPaint.boundVariableId)
   * are NOT rewritten — a dangling id simply resolves to `undefined` and the
   * bound fill falls back to its stored color, so no node mutation is needed.
   */
  deleteVariable(id: string): void {
    this.transact(() => this.variablesMap.delete(id));
  }

  getVariables(): Record<string, Variable> {
    return Object.fromEntries(this.variablesMap.entries());
  }

  /**
   * Resolve a variable's value, following alias chains.
   *
   * The second argument selects the mode to read for each variable visited:
   *   - a single `modeId` string — legacy same-collection call shape: used for
   *     the requested variable's own collection (aliases into other collections
   *     then fall back to those collections' default modes).
   *   - a `modesByCollection` map (`collectionId → modeId`) — each variable in
   *     the chain is read in its collection's selected mode from the map, else
   *     that collection's `defaultModeId`. This is what the editor threads so
   *     aliases resolve against the active modes of *every* collection.
   *
   * If the selected mode has no value the collection default is used. When the
   * resolved value is an alias, the target is resolved in the SAME context.
   * Returns `undefined` for a missing variable/collection, a dangling alias
   * target, or a cycle (guarded by a visited set).
   */
  resolveVariableValue(
    variableId: string,
    modeOrModes?: string | Record<string, string>,
  ): string | number | boolean | undefined {
    const isMap = typeof modeOrModes === 'object' && modeOrModes !== null;
    const modesByCollection = isMap ? (modeOrModes as Record<string, string>) : undefined;
    const explicitModeId = typeof modeOrModes === 'string' ? modeOrModes : undefined;

    const visited = new Set<string>();
    let current: string = variableId;
    let useExplicit = explicitModeId !== undefined;
    // Bound iterations by the number of variables to also guard non-self cycles
    // defensively; the visited set is the primary guard.
    for (;;) {
      if (visited.has(current)) return undefined;
      visited.add(current);

      const variable = this.variablesMap.get(current);
      if (!variable) return undefined;
      const collection = this.variableCollectionsMap.get(variable.collectionId);
      if (!collection) return undefined;

      // Pick the mode to read for this variable.
      let modeId: string;
      if (useExplicit && explicitModeId !== undefined && explicitModeId in variable.valuesByMode) {
        modeId = explicitModeId;
      } else {
        const fromMap = modesByCollection?.[variable.collectionId];
        modeId =
          fromMap !== undefined && fromMap in variable.valuesByMode
            ? fromMap
            : collection.defaultModeId;
      }
      // The explicit modeId only applies to the first variable in the chain.
      useExplicit = false;

      const value: VariableValue | undefined = variable.valuesByMode[modeId];
      if (value === undefined) return undefined;
      if (isVariableAlias(value)) {
        current = value.alias;
        continue;
      }
      return value;
    }
  }

  /**
   * Set a per-mode value of `variableId` to an alias pointing at
   * `targetVariableId`. Rejects self-alias and any alias that would create a
   * resolution cycle (see {@link OpenDoc.wouldCreateAliasCycle}). Clear an alias
   * by writing a scalar via {@link OpenDoc.updateVariable}.
   */
  setVariableAlias(variableId: string, modeId: string, targetVariableId: string): void {
    const current = this.variablesMap.get(variableId);
    if (!current) throw new Error(`Variable "${variableId}" does not exist`);
    if (!this.variablesMap.get(targetVariableId)) {
      throw new Error(`Variable "${targetVariableId}" does not exist`);
    }
    if (this.wouldCreateAliasCycle(variableId, modeId, targetVariableId)) {
      throw new Error('Alias would create a cycle');
    }
    const next = VariableSchema.parse({
      ...current,
      valuesByMode: { ...current.valuesByMode, [modeId]: { alias: targetVariableId } },
    });
    this.transact(() => this.variablesMap.set(variableId, next));
  }

  /**
   * Would aliasing `variableId`'s `modeId` value to `targetVariableId` create a
   * resolution cycle? True for a direct self-alias, or when following the
   * target's alias chain (in `modeId` then collection defaults) leads back to
   * `variableId`. Cheap graph walk with a visited set — used by the UI to filter
   * alias-picker candidates.
   */
  wouldCreateAliasCycle(variableId: string, modeId: string, targetVariableId: string): boolean {
    if (targetVariableId === variableId) return true;
    const visited = new Set<string>([variableId]);
    let current: string | undefined = targetVariableId;
    while (current !== undefined) {
      if (visited.has(current)) return true;
      visited.add(current);
      const variable = this.variablesMap.get(current);
      if (!variable) return false; // dangling target: no cycle
      const collection = this.variableCollectionsMap.get(variable.collectionId);
      const readMode =
        modeId in variable.valuesByMode ? modeId : collection?.defaultModeId ?? modeId;
      const value: VariableValue | undefined = variable.valuesByMode[readMode];
      current = value !== undefined && isVariableAlias(value) ? value.alias : undefined;
    }
    return false;
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

/** Builds a YNode (Y.Map) from a plain SceneNode, mirroring OpenDoc's internal layout. */
function nodeToYMap(node: SceneNode, parentId: string | null): Y.Map<unknown> {
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

/** Deletes keys absent from `next`, then sets every key of `next` (wholesale replace). */
function replaceYMap<T>(map: Y.Map<T>, next: Record<string, T>): void {
  for (const key of Array.from(map.keys())) {
    if (!(key in next)) map.delete(key);
  }
  for (const [key, value] of Object.entries(next)) {
    map.set(key, value);
  }
}

/**
 * Rewrites a Yjs document's CONTENTS so they equal `data`, in place, as a
 * coarse structural replace: nodes/variables/styles/etc. absent from `data`
 * are removed and every entry present in `data` is (re)set wholesale.
 *
 * This is the mechanism behind non-destructive version restore. The CALLER must
 * invoke it inside a `Y.transact(...)` so the whole rewrite lands as a single
 * Yjs update — that update is then appended to the append-only log and broadcast
 * to peers exactly like any other edit, so restore is itself an ordinary,
 * undoable, convergent CRDT change (it never resets or truncates history).
 *
 * It is a content REPLACE, not a semantic 3-way merge: each changed node's map
 * is replaced wholesale rather than diffed field-by-field. That is the correct
 * meaning of "restore this document to how it looked at version N".
 */
export function replaceDocContent(ydoc: Y.Doc, data: DocumentData): void {
  const validated = DocumentDataSchema.parse(data);

  const nodes = ydoc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
  const meta = ydoc.getMap('meta');
  const variablesMap = ydoc.getMap('variables') as Y.Map<Variable>;
  const variableCollectionsMap = ydoc.getMap(
    'variableCollections',
  ) as Y.Map<VariableCollection>;
  const stylesMap = ydoc.getMap('styles') as Y.Map<Style>;
  const assetsMap = ydoc.getMap('assets') as Y.Map<AssetRef>;

  const parentOf = new Map<string, string>();
  for (const [id, node] of Object.entries(validated.nodes)) {
    const children = (node as { children?: string[] }).children ?? [];
    for (const childId of children) parentOf.set(childId, id);
  }

  meta.set('schemaVersion', validated.schemaVersion);
  meta.set('id', validated.id);
  meta.set('name', validated.name);
  meta.set('rootId', validated.rootId);

  for (const key of Array.from(nodes.keys())) {
    if (!(key in validated.nodes)) nodes.delete(key);
  }
  for (const [id, node] of Object.entries(validated.nodes)) {
    nodes.set(id, nodeToYMap(node, parentOf.get(id) ?? null));
  }

  replaceYMap(variablesMap, validated.variables);
  replaceYMap(variableCollectionsMap, validated.variableCollections);
  replaceYMap(stylesMap, validated.styles);
  replaceYMap(assetsMap, validated.assets);
}
