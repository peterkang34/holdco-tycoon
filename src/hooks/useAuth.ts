import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Player {
  id: string;
  email?: string;
  initials: string;
  isAnonymous: boolean;
  createdAt: string;
}

interface AuthState {
  // Persisted
  player: Player | null;
  signupNudgeDismissals: number;

  // Transient (modal toggles)
  showAccountModal: boolean;
  showStatsModal: boolean;
  showClaimModal: boolean;

  // Actions
  setPlayer: (player: Player | null) => void;
  signOut: () => void;
  openAccountModal: () => void;
  closeAccountModal: () => void;
  openStatsModal: () => void;
  closeStatsModal: () => void;
  openClaimModal: () => void;
  closeClaimModal: () => void;
  incrementNudgeDismissals: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      player: null,
      signupNudgeDismissals: 0,
      showAccountModal: false,
      showStatsModal: false,
      showClaimModal: false,

      setPlayer: (player) => set({ player }),
      signOut: () => set({ player: null }),
      openAccountModal: () => set({ showAccountModal: true }),
      closeAccountModal: () => set({ showAccountModal: false }),
      openStatsModal: () => set({ showStatsModal: true }),
      closeStatsModal: () => set({ showStatsModal: false }),
      openClaimModal: () => set({ showClaimModal: true }),
      closeClaimModal: () => set({ showClaimModal: false }),
      incrementNudgeDismissals: () =>
        set((state) => ({
          signupNudgeDismissals: Math.min(state.signupNudgeDismissals + 1, 3),
        })),
    }),
    {
      name: 'holdco-tycoon-auth',
      partialize: (state) => ({
        player: state.player,
        signupNudgeDismissals: state.signupNudgeDismissals,
      }),
    },
  ),
);

/** Derived helper — true when player has a real (non-anonymous) account */
export function useIsLoggedIn(): boolean {
  return useAuthStore((s) => s.player !== null && !s.player.isAnonymous);
}
