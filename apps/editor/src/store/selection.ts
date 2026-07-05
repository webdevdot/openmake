import { create } from 'zustand';

interface SelectionState {
  selectedIds: string[];
  set: (ids: string[]) => void;
  add: (id: string) => void;
  toggle: (id: string) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedIds: [],

  set: (ids) => set({ selectedIds: [...new Set(ids)] }),

  add: (id) => {
    if (get().selectedIds.includes(id)) return;
    set({ selectedIds: [...get().selectedIds, id] });
  },

  toggle: (id) => {
    const { selectedIds } = get();
    set({
      selectedIds: selectedIds.includes(id)
        ? selectedIds.filter((existing) => existing !== id)
        : [...selectedIds, id],
    });
  },

  clear: () => set({ selectedIds: [] }),
}));
