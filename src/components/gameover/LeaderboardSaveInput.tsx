interface LeaderboardSaveInputProps {
  canMakeLeaderboard: boolean;
  potentialRank: number;
  initials: string;
  onInitialsChange: (value: string) => void;
  hasSaved: boolean;
  saving: boolean;
  saveError: boolean;
  onSave: () => void;
  leaderboardLoading: boolean;
}

export function LeaderboardSaveInput({
  canMakeLeaderboard,
  potentialRank,
  initials,
  onInitialsChange,
  hasSaved,
  saving,
  saveError,
  onSave,
  leaderboardLoading,
}: LeaderboardSaveInputProps) {
  if (hasSaved) {
    return (
      <div className="card mb-6 border-accent/30 text-center">
        <p className="text-accent font-bold">Score saved to global leaderboard!</p>
      </div>
    );
  }

  if (leaderboardLoading || !canMakeLeaderboard) return null;

  return (
    <div className="card mb-6 border-yellow-400/30">
      <div className="text-center">
        <p className="text-yellow-400 font-bold mb-2">
          You made the leaderboard! (Rank #{potentialRank})
        </p>
        <p className="text-text-secondary text-sm mb-4">
          Enter your initials to save your score
        </p>
        <div className="flex items-center justify-center gap-4">
          <input
            type="text"
            value={initials}
            onChange={(e) => onInitialsChange(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase())}
            placeholder="AAA"
            maxLength={4}
            className="w-20 sm:w-28 text-center text-2xl font-bold bg-white/10 border border-white/20 rounded-lg py-2 px-4 focus:outline-none focus:border-accent"
          />
          <button
            onClick={onSave}
            disabled={initials.length < 2 || saving}
            className="btn-primary text-sm sm:text-base min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : saveError ? 'Retry' : 'Save Score'}
          </button>
        </div>
        {saveError && (
          <p className="text-red-400 text-sm mt-2">
            Failed to save to global leaderboard. Your score was saved locally — please try again.
          </p>
        )}
      </div>
    </div>
  );
}
