import { create } from 'zustand';

/** Right-panel mode tab (Figma UI3 pattern): Design vs Prototype view. */
export type PanelMode = 'design' | 'prototype';

interface PanelModeState {
  mode: PanelMode;
  setMode: (mode: PanelMode) => void;
}

export const usePanelModeStore = create<PanelModeState>((set) => ({
  mode: 'design',
  setMode: (mode) => set({ mode }),
}));
