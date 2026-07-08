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
 * Build the variableId → hex map threaded into `buildRenderScene`. For every
 * COLOR variable, resolve its value for the collection's active mode (falling
 * back to the collection default). Non-color variables are skipped — v1 binds
 * only solid color fills.
 */
export function buildVariableColors(
  doc: OpenDoc,
  activeModeByCollection: Record<string, string> = useVariablesStore.getState()
    .activeModeByCollection,
): VariableColors {
  const colors: VariableColors = {};
  for (const variable of Object.values(doc.getVariables())) {
    if (variable.type !== 'COLOR') continue;
    const modeId = activeModeIdFor(doc, variable.collectionId, activeModeByCollection);
    const value = doc.resolveVariableValue(variable.id, modeId);
    if (typeof value === 'string') colors[variable.id] = value;
  }
  return colors;
}
