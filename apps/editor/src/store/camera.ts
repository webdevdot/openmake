import { create } from 'zustand';
import { DEFAULT_CAMERA, type Camera } from '../canvas/camera.js';

interface CameraState {
  camera: Camera;
  /** Mirrors the live camera ref at gesture END only — for zoom % display etc. */
  setCamera: (camera: Camera) => void;
}

export const useCameraStore = create<CameraState>((set) => ({
  camera: DEFAULT_CAMERA,
  setCamera: (camera) => set({ camera }),
}));
