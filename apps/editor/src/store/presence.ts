import { create } from 'zustand';

export interface RemoteAwarenessState {
  userId: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number };
  selection?: string[];
}

interface PresenceState {
  /** Keyed by userId (not Yjs clientId, which can churn across reconnects). */
  remoteStates: Record<string, RemoteAwarenessState>;
  setStates: (states: Record<string, RemoteAwarenessState>) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  remoteStates: {},
  setStates: (remoteStates) => set({ remoteStates }),
}));
