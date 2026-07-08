import { create } from 'zustand';
import type { OpenDoc } from '@openmake/core';
import type { VariableColors } from '@openmake/renderer';

/**
 * Editor-local view state for Variables v1: the currently-active mode per
 * collection. The document stores only each collection's `defaultModeId`; which
 * mode is being *previewed* on canvas is UI state, so it lives here (not in the
 * CRDT) and is not collaborative — two clients can preview different modes of
 * the same doc.
 */
interface VariablesViewState {
  /** collectionId → active modeId. Absent → the collection's default mode. */
  activeModeByCollection: Record<string, string>;
  setActiveMode: (collectionId: string, modeId: string) => void;
}

export const useVariablesStore = create<VariablesViewState>((set) => ({
  activeModeByCollection: {},
  setActiveMode: (collectionId, modeId) =>
    set((s) => ({
      activeModeByCollection: { ...s.activeModeByCollection, [collectionId]: modeId },
    })),
}));

/** The active modeId for a collection, defaulting to its stored default mode. */
export function activeModeIdFor(
  doc: OpenDoc,
  collectionId: string,
  activeModeByCollection: Record<string, string>,
): string | undefined {
  const collection = doc.getVariableCollections()[collectionId];
  if (!collection) return undefined;
  const active = activeModeByCollection[collectionId];
  return active && collection.modes.some((m) => m.id === active)
    ? active
    : collection.defaultModeId;
}

/**
 * The concrete `collectionId → modeId` map for the current view: every
 * collection's active mode (falling back to its stored default). Threaded into
 * the resolver so alias chains resolve against the active mode of *each*
 * collection they cross, not just the source variable's own.
 */
export function modesByCollectionFor(
  doc: OpenDoc,
  activeModeByCollection: Record<string, string>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const collectionId of Object.keys(doc.getVariableCollections())) {
    const modeId = activeModeIdFor(doc, collectionId, activeModeByCollection);
    if (modeId !== undefined) map[collectionId] = modeId;
  }
  return map;
}

/**
 * Build the variableId → hex map threaded into `buildRenderScene`. For every
 * COLOR variable, resolve its value in the active-mode context (following alias
 * chains across collections in their respective active modes). Non-color
 * variables are skipped — v1 binds only solid color fills.
 */
export function buildVariableColors(
  doc: OpenDoc,
  activeModeByCollection: Record<string, string> = useVariablesStore.getState()
    .activeModeByCollection,
): VariableColors {
  const colors: VariableColors = {};
  const modesByCollection = modesByCollectionFor(doc, activeModeByCollection);
  for (const variable of Object.values(doc.getVariables())) {
    if (variable.type !== 'COLOR') continue;
    const value = doc.resolveVariableValue(variable.id, modesByCollection);
    if (typeof value === 'string') colors[variable.id] = value;
  }
  return colors;
}
