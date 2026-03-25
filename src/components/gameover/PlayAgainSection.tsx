import type { Business, IntegratedPlatform, GameDuration } from '../../engine/types';

interface PlayAgainSectionProps {
  onPlayAgain: () => void;
  onQuickRematch?: () => void;
  onShowFeedback: () => void;
  businesses: Business[];
  exitedBusinesses: Business[];
  integratedPlatforms: IntegratedPlatform[];
  cash: number;
  totalInvestedCapital: number;
  duration: GameDuration;
  isFundManagerMode: boolean;
}

function getTryThisNextNudge(props: {
  businesses: Business[];
  exitedBusinesses: Business[];
  integratedPlatforms: IntegratedPlatform[];
  cash: number;
  totalInvestedCapital: number;
  duration: GameDuration;
  isFundManagerMode: boolean;
}): string | null {
  const { businesses, exitedBusinesses, integratedPlatforms, cash, totalInvestedCapital, duration, isFundManagerMode } = props;

  if (isFundManagerMode) return null;

  const activeBusinesses = businesses.filter(b => b.status === 'active');
  const allAcquired = activeBusinesses.length + exitedBusinesses.length;
  const hadTurnaround = businesses.some(b => (b as any).qualityImprovedTiers > 0) || exitedBusinesses.some(b => (b as any).qualityImprovedTiers > 0);

  // Never forged a platform and had enough businesses to potentially do so
  if (integratedPlatforms.length === 0 && allAcquired >= 3) {
    return 'You never forged a platform. Try acquiring 3+ businesses in the same sector next time — platform bonuses compound.';
  }

  // Hoarded cash — ended with >40% of invested capital sitting in cash
  if (totalInvestedCapital > 0 && cash > totalInvestedCapital * 0.4 && allAcquired <= 3) {
    return 'You ended with a lot of cash on the sideline. Try deploying more aggressively — capital sitting idle earns nothing.';
  }

  // Never tried turnarounds
  if (!hadTurnaround && allAcquired >= 2) {
    return 'You never ran a turnaround program. Distressed deals are cheaper — try buying a struggling business and turning it around.';
  }

  // Played full game — suggest quick play
  if (duration === 'standard') {
    return 'Try Quick Play to test a different strategy in ~15 minutes. Faster reps, faster learning.';
  }

  // Only bought 1-2 businesses total
  if (allAcquired <= 2) {
    return 'You played it conservative with just a few acquisitions. Try a serial acquirer strategy next time — buy more, diversify faster.';
  }

  // Never sold a business
  if (exitedBusinesses.filter(b => b.status === 'sold').length === 0 && allAcquired >= 4) {
    return 'You never sold a business. Sometimes selling an underperformer to redeploy capital is the best move.';
  }

  return null;
}

export function PlayAgainSection({
  onPlayAgain,
  onQuickRematch,
  onShowFeedback,
  businesses,
  exitedBusinesses,
  integratedPlatforms,
  cash,
  totalInvestedCapital,
  duration,
  isFundManagerMode,
}: PlayAgainSectionProps) {
  const nudge = getTryThisNextNudge({
    businesses, exitedBusinesses, integratedPlatforms,
    cash, totalInvestedCapital, duration, isFundManagerMode,
  });

  return (
    <div className="mb-6">
      {nudge && (
        <div className="bg-accent/10 border border-accent/20 rounded-lg p-4 mb-4">
          <p className="text-xs text-text-muted uppercase tracking-wide font-medium mb-1">Try this next</p>
          <p className="text-sm text-text-secondary">{nudge}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onPlayAgain}
          className="btn-primary text-lg py-3 flex-1 font-medium"
        >
          Play Again
        </button>
        {onQuickRematch && (
          <button
            onClick={onQuickRematch}
            className="bg-white/5 hover:bg-white/10 border border-white/10 text-text-secondary hover:text-text-primary rounded-lg text-sm py-3 px-4 transition-colors whitespace-nowrap"
          >
            Quick Rematch
          </button>
        )}
      </div>
      {onQuickRematch && (
        <p className="text-xs text-text-muted mt-2 text-center">Quick Rematch: same settings, new deals</p>
      )}

      {/* Links */}
      <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
        <a
          href="https://holdcoguide.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-accent hover:text-accent-secondary min-h-[44px] inline-flex items-center"
        >
          Get The Holdco Guide &rarr;
        </a>
        <button
          onClick={onShowFeedback}
          className="text-sm text-text-muted hover:text-text-secondary transition-colors min-h-[44px] inline-flex items-center"
        >
          Send Feedback
        </button>
      </div>
    </div>
  );
}
