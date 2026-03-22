import { create } from 'zustand';
import { useGameStore } from './useGame';
import { useToastStore } from './useToast';

/**
 * Lightweight undo system — snapshots Zustand game state before actions.
 * The toast "Undo" button restores the snapshot.
 *
 * Usage:
 *   const snapshot = takeSnapshot();
 *   doAction();
 *   showUndoToast('Sold Acme Corp', snapshot);
 */

type GameSnapshot = Record<string, unknown>;

interface UndoState {
  /** Last snapshot (null if no undo available) */
  snapshot: GameSnapshot | null;
  /** Clear the stored snapshot */
  clear: () => void;
}

export const useUndoStore = create<UndoState>((set) => ({
  snapshot: null,
  clear: () => set({ snapshot: null }),
}));

/** Keys to exclude from snapshot — non-serializable or should not be restored */
const EXCLUDE_KEYS = new Set<string>([
  // Functions (actions) — Zustand store has them on the same object
  // We snapshot only by picking state keys from initialState shape
]);

/** Capture a snapshot of the current game state (data only, no functions) */
export function takeSnapshot(): GameSnapshot {
  const state = useGameStore.getState();
  const snap: GameSnapshot = {};
  for (const [key, value] of Object.entries(state)) {
    // Skip functions — we only want serializable state
    if (typeof value === 'function') continue;
    if (EXCLUDE_KEYS.has(key)) continue;
    // Deep clone to prevent mutation
    snap[key] = JSON.parse(JSON.stringify(value));
  }
  useUndoStore.setState({ snapshot: snap });
  return snap;
}

/** Restore a previously captured snapshot */
export function restoreSnapshot(snapshot: GameSnapshot): void {
  useGameStore.setState(snapshot);
  useUndoStore.setState({ snapshot: null });
}

/** Show a toast with an Undo action that restores the given snapshot */
export function showUndoToast(
  message: string,
  snapshot: GameSnapshot,
  detail?: string,
  type: 'success' | 'info' | 'warning' | 'danger' = 'success',
): void {
  useToastStore.getState().addToast({
    message,
    detail,
    type,
    action: {
      label: 'Undo',
      onClick: () => restoreSnapshot(snapshot),
    },
  });
}
