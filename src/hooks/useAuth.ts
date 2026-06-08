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
  accountModalMode: 'create' | 'signin';
  /** When set, the account modal shows scenario context and, on success, redirects
   *  back to `/?se={scenarioId}` so the player resumes into the scenario they tried
   *  to play (the account gate for Scenario Challenges). Null for a generic sign-in. */
  scenarioWall: { scenarioId: string; name: string; emoji: string } | null;
  showStatsModal: boolean;
  showClaimModal: boolean;
  showPrivacyModal: boolean;
  showDeleteModal: boolean;
  showCelebrationModal: boolean;
  celebrationData: { achievementCount: number; gamesLinked: number } | null;
  showStrategyLibraryModal: boolean;

  // Actions
  setPlayer: (player: Player | null) => void;
  signOut: () => void;
  openAccountModal: (mode?: 'create' | 'signin') => void;
  openScenarioAccountWall: (ctx: { scenarioId: string; name: string; emoji: string }) => void;
  closeAccountModal: () => void;
  openStatsModal: () => void;
  closeStatsModal: () => void;
  openClaimModal: () => void;
  closeClaimModal: () => void;
  openPrivacyModal: () => void;
  closePrivacyModal: () => void;
  showTermsModal: boolean;
  openTermsModal: () => void;
  closeTermsModal: () => void;
  openDeleteModal: () => void;
  closeDeleteModal: () => void;
  incrementNudgeDismissals: () => void;
  openCelebrationModal: (data: { achievementCount: number; gamesLinked: number }) => void;
  closeCelebrationModal: () => void;
  openStrategyLibraryModal: () => void;
  closeStrategyLibraryModal: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      player: null,
      signupNudgeDismissals: 0,
      showAccountModal: false,
      accountModalMode: 'create',
      scenarioWall: null,
      showStatsModal: false,
      showClaimModal: false,
      showPrivacyModal: false,
      showDeleteModal: false,
      showCelebrationModal: false,
      celebrationData: null,
      showStrategyLibraryModal: false,

      setPlayer: (player) => set({ player }),
      signOut: () => set({ player: null }),
      openAccountModal: (mode = 'create') => {
        clearPendingScenario(); // a generic sign-in must not resume a stale scenario
        set({ showAccountModal: true, accountModalMode: mode, scenarioWall: null });
      },
      openScenarioAccountWall: (ctx) => {
        // Persist the pending scenario so we can resume into it after the full-page
        // OAuth/magic-link redirect — independent of whether the redirect URL carries
        // ?se= (which depends on the Supabase allow-list). The redirect itself uses the
        // bare origin (always allow-listed), same as the footer sign-in.
        try { localStorage.setItem(PENDING_SCENARIO_KEY, ctx.scenarioId); } catch { /* private mode */ }
        set({ showAccountModal: true, accountModalMode: 'create', scenarioWall: ctx });
      },
      closeAccountModal: () => {
        clearPendingScenario(); // cancelled the wall → drop the pending scenario
        set({ showAccountModal: false, scenarioWall: null });
      },
      openStatsModal: () => set({ showStatsModal: true }),
      closeStatsModal: () => set({ showStatsModal: false }),
      openClaimModal: () => set({ showClaimModal: true }),
      closeClaimModal: () => set({ showClaimModal: false }),
      openPrivacyModal: () => set({ showPrivacyModal: true }),
      closePrivacyModal: () => set({ showPrivacyModal: false }),
      showTermsModal: false,
      openTermsModal: () => set({ showTermsModal: true }),
      closeTermsModal: () => set({ showTermsModal: false }),
      openDeleteModal: () => set({ showDeleteModal: true }),
      closeDeleteModal: () => set({ showDeleteModal: false }),
      openCelebrationModal: (data) => set({ showCelebrationModal: true, celebrationData: data }),
      closeCelebrationModal: () => set({ showCelebrationModal: false, celebrationData: null }),
      openStrategyLibraryModal: () => set({ showStrategyLibraryModal: true }),
      closeStrategyLibraryModal: () => set({ showStrategyLibraryModal: false }),
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

/** localStorage key for the scenario a player signed in to play (resume-after-auth). */
export const PENDING_SCENARIO_KEY = 'holdco-pending-scenario';
export function getPendingScenario(): string | null {
  try { return localStorage.getItem(PENDING_SCENARIO_KEY); } catch { return null; }
}
export function clearPendingScenario(): void {
  try { localStorage.removeItem(PENDING_SCENARIO_KEY); } catch { /* no-op */ }
}
