import { formatMoney } from '../../engine/types';

interface AccountSignupCTAProps {
  isLoggedIn: boolean;
  canMakeLeaderboard: boolean;
  potentialRank: number;
  founderEquityValue: number;
  isBankruptcy: boolean;
  isFirstGame: boolean;
  score: { grade: string };
  onSignUp: () => void;
  onDismiss: () => void;
  isDismissed: boolean;
}

function isGoodGrade(grade: string): boolean {
  return grade === 'S' || grade === 'A' || grade === 'B';
}

export function AccountSignupCTA({
  isLoggedIn,
  canMakeLeaderboard,
  potentialRank,
  founderEquityValue,
  isBankruptcy,
  isFirstGame,
  score,
  onSignUp,
  onDismiss,
  isDismissed,
}: AccountSignupCTAProps) {
  if (isDismissed) return null;

  // Signed-in variant: compact profile card
  if (isLoggedIn) {
    return (
      <div className="card mb-6">
        <p className="text-xs font-bold tracking-widest text-text-muted mb-3">YOUR PROFILE</p>
        <p className="text-sm text-text-secondary">Achievements: Coming soon</p>
        <button
          onClick={() => console.log('[AccountSignupCTA] View Full Profile clicked')}
          className="text-sm text-accent hover:text-accent-secondary mt-3 inline-flex items-center min-h-[44px]"
        >
          View Full Profile &rarr;
        </button>
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
        Create an account to track your progress. Your next run starts with lessons from this one.
      </p>
    );
  } else if (isFirstGame) {
    header = 'Create Your Player Profile';
    body = (
      <ul className="text-sm text-text-secondary space-y-2">
        <li className="flex items-start gap-2">
          <span className="text-accent mt-0.5">&#x2022;</span>
          <span>Achievement tracking (unlock new sectors and recipes)</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-accent mt-0.5">&#x2022;</span>
          <span>Your name on the leaderboard permanently</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-accent mt-0.5">&#x2022;</span>
          <span>Game history and stats across sessions</span>
        </li>
      </ul>
    );
  } else if (canMakeLeaderboard) {
    header = `You made the leaderboard at #${potentialRank}`;
    body = (
      <p className="text-sm text-text-secondary">
        Create an account to put your name on it. Right now it just says &ldquo;Anonymous.&rdquo;
      </p>
    );
  } else if (isGoodGrade(score.grade)) {
    const fevDisplay = formatMoney(founderEquityValue);
    header = `Your ${fevDisplay} holdco deserves a home`;
    body = (
      <p className="text-sm text-text-secondary">
        Create a free account to save your stats, claim leaderboard rank #{potentialRank}, and start tracking achievements.
      </p>
    );
  } else {
    // Default — same as first game
    header = 'Create Your Player Profile';
    body = (
      <ul className="text-sm text-text-secondary space-y-2">
        <li className="flex items-start gap-2">
          <span className="text-accent mt-0.5">&#x2022;</span>
          <span>Achievement tracking (unlock new sectors and recipes)</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-accent mt-0.5">&#x2022;</span>
          <span>Your name on the leaderboard permanently</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-accent mt-0.5">&#x2022;</span>
          <span>Game history and stats across sessions</span>
        </li>
      </ul>
    );
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
