import { formatMoney } from '../../engine/types';

interface AccountSignupCTAProps {
  isLoggedIn: boolean;
  canMakeLeaderboard: boolean;
  potentialRank: number;
  founderEquityValue: number;
  isBankruptcy: boolean;
  isFirstGame: boolean;
  hasSavedToLeaderboard: boolean;
  score: { grade: string };
  onSignUp: () => void;
  onDismiss: () => void;
  isDismissed: boolean;
}

function isGoodGrade(grade: string): boolean {
  return grade === 'S' || grade === 'A' || grade === 'B';
}

const BENEFIT_LIST = (
  <ul className="text-sm text-text-secondary space-y-2">
    <li className="flex items-start gap-2">
      <span className="text-accent mt-0.5">&#x2022;</span>
      <span>Unlock achievements that open new sectors, deal types, and gameplay events</span>
    </li>
    <li className="flex items-start gap-2">
      <span className="text-accent mt-0.5">&#x2022;</span>
      <span>Your name on the leaderboard permanently</span>
    </li>
    <li className="flex items-start gap-2">
      <span className="text-accent mt-0.5">&#x2022;</span>
      <span>Game history, stats, and progress tracking across sessions</span>
    </li>
  </ul>
);

export function AccountSignupCTA({
  isLoggedIn,
  canMakeLeaderboard,
  potentialRank,
  founderEquityValue,
  isBankruptcy,
  isFirstGame,
  hasSavedToLeaderboard,
  score,
  onSignUp,
  onDismiss,
  isDismissed,
}: AccountSignupCTAProps) {
  if (isDismissed) return null;

  // If user just saved to leaderboard, the LeaderboardSaveInput already shows a signup nudge
  // Don't double up — skip the CTA
  if (hasSavedToLeaderboard && !isLoggedIn) return null;

  // Signed-in variant: compact profile card
  if (isLoggedIn) {
    return (
      <div className="card mb-6">
        <p className="text-xs font-bold tracking-widest text-text-muted mb-3">YOUR PROFILE</p>
        <p className="text-sm text-text-secondary">
          Achievements you earn unlock new sectors, deal types, and gameplay events. Full tracking is coming soon — you'll get credit for games you play now.
        </p>
      </div>
    );
  }

  // Anonymous variant: contextual signup card
  let header: string;
  let body: React.ReactNode;

  if (isBankruptcy) {
    header = 'Every great allocator has a few bad years';
    body = (
      <p className="text-sm text-text-secondary">
        Create an account to track your progress and start unlocking achievements. Achievements open new sectors, deal types, and gameplay events — your next run starts with more options.
      </p>
    );
  } else if (canMakeLeaderboard) {
    header = `You ranked #${potentialRank} on the leaderboard`;
    body = (
      <>
        <p className="text-sm text-text-secondary mb-3">
          Create a free account to save your rank, collect achievements, and unlock new gameplay.
        </p>
        {BENEFIT_LIST}
      </>
    );
  } else if (isGoodGrade(score.grade)) {
    const fevDisplay = formatMoney(founderEquityValue);
    header = `Your ${fevDisplay} holdco deserves a home`;
    body = (
      <>
        <p className="text-sm text-text-secondary mb-3">
          Create a free account to save your stats and start earning achievements that unlock new gameplay.
        </p>
        {BENEFIT_LIST}
      </>
    );
  } else if (isFirstGame) {
    header = 'Create Your Player Profile';
    body = BENEFIT_LIST;
  } else {
    header = 'Create Your Player Profile';
    body = BENEFIT_LIST;
  }

  return (
    <div className="mb-6 rounded-xl p-[1px] bg-gradient-to-r from-emerald-500 to-teal-500">
      <div className="card rounded-xl bg-surface">
        <h3 className="text-lg font-bold mb-3">{header}</h3>
        <div className="mb-4">{body}</div>

        <div className="flex gap-3">
          <button
            onClick={onSignUp}
            className="btn-primary flex-1 min-h-[44px] text-sm font-medium"
          >
            Sign Up (Free)
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 min-h-[44px] text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            Continue as Guest
          </button>
        </div>

        <p className="text-xs text-text-muted mt-3 text-center">
          Google or email. Takes 10 seconds.
        </p>
      </div>
    </div>
  );
}
