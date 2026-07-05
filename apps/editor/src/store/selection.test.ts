import { beforeEach, describe, expect, it } from 'vitest';
import { useSelectionStore } from './selection.js';

describe('selection store', () => {
  beforeEach(() => {
    useSelectionStore.setState({ selectedIds: [] });
  });

  it('set replaces the selection and dedupes', () => {
    useSelectionStore.getState().set(['a', 'b', 'a']);
    expect(useSelectionStore.getState().selectedIds).toEqual(['a', 'b']);
  });

  it('add appends a new id without duplicating', () => {
    useSelectionStore.getState().set(['a']);
    useSelectionStore.getState().add('b');
    useSelectionStore.getState().add('a');
    expect(useSelectionStore.getState().selectedIds).toEqual(['a', 'b']);
  });

  it('toggle adds an unselected id and removes a selected one', () => {
    useSelectionStore.getState().set(['a']);
    useSelectionStore.getState().toggle('b');
    expect(useSelectionStore.getState().selectedIds).toEqual(['a', 'b']);
    useSelectionStore.getState().toggle('a');
    expect(useSelectionStore.getState().selectedIds).toEqual(['b']);
  });

  it('clear empties the selection', () => {
    useSelectionStore.getState().set(['a', 'b']);
    useSelectionStore.getState().clear();
    expect(useSelectionStore.getState().selectedIds).toEqual([]);
  });
});
