import type { ChallengeParams, PlayerResult } from '../../utils/challenge';
import { ChallengeScoreboard } from '../ui/ChallengeScoreboard';

interface ChallengeShareSectionProps {
  challengeData: ChallengeParams | null;
  currentChallengeParams: ChallengeParams;
  myResult: PlayerResult;
  onChallengeShare: () => void;
  onShareResult: () => void;
  onShareScoreboardLink: () => void;
  challengeCopied: boolean;
  scoreboardLinkCopied: boolean;
  scoreboardFailed: boolean;
  onScoreboardFailed: () => void;
  onShowComparison: () => void;
}

export function ChallengeShareSection({
  challengeData,
  currentChallengeParams,
  myResult,
  onChallengeShare,
  onShareResult,
  onShareScoreboardLink,
  challengeCopied,
  scoreboardLinkCopied,
  scoreboardFailed,
  onScoreboardFailed,
  onShowComparison,
}: ChallengeShareSectionProps) {
  // Challenge scoreboard + share buttons (for challenge games that haven't failed)
  if (challengeData && !scoreboardFailed) {
    return (
      <>
        <ChallengeScoreboard
          challengeParams={currentChallengeParams}
          myResult={myResult}
          onFallbackToManual={onScoreboardFailed}
        />
        <div className="card mb-6 border-accent/20">
          <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
            <span>🔗</span> Share
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onShareScoreboardLink}
              className="btn-primary flex-1 text-sm min-h-[44px]"
            >
              {scoreboardLinkCopied ? 'Copied!' : 'Copy Scoreboard Link'}
            </button>
            <button
              onClick={onChallengeShare}
              className="btn-secondary flex-1 text-sm min-h-[44px]"
            >
              {challengeCopied ? 'Copied!' : 'Invite More Players'}
            </button>
          </div>
          <p className="text-xs text-text-muted mt-2 text-center">
            Share the scoreboard so others can see results, or invite more players to compete
          </p>
        </div>
      </>
    );
  }

  // Challenge friends / share (for non-challenge games or failed scoreboard)
  return (
    <div className="card mb-6 border-yellow-500/20 bg-gradient-to-r from-yellow-500/5 to-orange-500/5">
      <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
        <span>🏆</span> Challenge Friends
      </h2>
      {challengeData ? (
        <p className="text-sm text-yellow-400/80 mb-3">
          Challenge Mode — you and your friends played under identical conditions.
        </p>
      ) : (
        <p className="text-sm text-text-muted mb-3">
          Think you played well? Share this exact game — same deals, events, and market conditions — and see who builds a better holdco.
        </p>
      )}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onChallengeShare}
          className="btn-secondary flex-1 text-sm min-h-[44px]"
        >
          {challengeCopied ? 'Copied!' : 'Share Challenge Link'}
        </button>
        <button
          onClick={onShareResult}
          className="btn-secondary flex-1 text-sm min-h-[44px]"
        >
          Share My Result
        </button>
      </div>
      <button
        onClick={onShowComparison}
        className="mt-3 min-h-[44px] text-xs text-accent hover:text-accent/80 transition-colors w-full text-center flex items-center justify-center"
      >
        Compare Results
      </button>
    </div>
  );
}
