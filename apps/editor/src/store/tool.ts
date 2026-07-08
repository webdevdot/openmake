import { create } from 'zustand';

export type ToolId =
  | 'select'
  | 'frame'
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'polygon'
  | 'star'
  | 'image'
  | 'pen'
  | 'text'
  | 'hand';

interface ToolState {
  tool: ToolId;
  setTool: (tool: ToolId) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  tool: 'select',
  setTool: (tool) => set({ tool }),
}));
