import { create } from 'zustand';
import { LayerState } from '@mockup/types';

interface HistoryStoreState {
  past: LayerState[];
  future: LayerState[];
  isTracking: boolean;

  // Actions
  pushSnapshot: (state: LayerState) => void;
  undo: (currentState: LayerState) => LayerState | null;
  redo: (currentState: LayerState) => LayerState | null;
  clearHistory: (initialState: LayerState) => void;
  setTracking: (enabled: boolean) => void;
}

export const useHistoryStore = create<HistoryStoreState>((set, get) => ({
  past: [],
  future: [],
  isTracking: true,

  pushSnapshot: (state) => {
    if (!get().isTracking) return;

    // Evita duplicatas consecutivas
    const past = get().past;
    const last = past[past.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(state)) {
      return;
    }

    set({
      past: [...past.slice(-30), JSON.parse(JSON.stringify(state))], // Mantém até 30 snapshots
      future: [],
    });
  },

  undo: (currentState) => {
    const { past, future } = get();
    if (past.length === 0) return null;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    set({
      past: newPast,
      future: [JSON.parse(JSON.stringify(currentState)), ...future],
    });

    return previous;
  },

  redo: (currentState) => {
    const { past, future } = get();
    if (future.length === 0) return null;

    const next = future[0];
    const newFuture = future.slice(1);

    set({
      past: [...past, JSON.parse(JSON.stringify(currentState))],
      future: newFuture,
    });

    return next;
  },

  clearHistory: (initialState) =>
    set({
      past: [JSON.parse(JSON.stringify(initialState))],
      future: [],
    }),

  setTracking: (isTracking) => set({ isTracking }),
}));
