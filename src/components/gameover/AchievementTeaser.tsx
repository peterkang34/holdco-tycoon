interface Achievement {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface AchievementTeaserProps {
  achievements: Achievement[];
  totalPossible: number;
  isLoggedIn: boolean;
  onSignUp: () => void;
}

export function AchievementTeaser({
  achievements,
  totalPossible,
  isLoggedIn,
  onSignUp,
}: AchievementTeaserProps) {
  const count = achievements.length;

  return (
    <div className="card mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold tracking-widest text-text-muted">
          ACHIEVEMENTS UNLOCKED THIS GAME
        </p>
        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-white/10 text-text-secondary">
          {count}/{totalPossible}
        </span>
      </div>

      {/* Achievement grid or empty state */}
      {count === 0 ? (
        <p className="text-sm text-text-muted">Play longer to earn achievements.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {achievements.map((achievement) => (
            <div
              key={achievement.id}
              className="rounded-lg p-3 bg-green-500/5 border border-green-500/10"
            >
              <div className="flex items-start gap-2">
                <span className="text-sm mt-0.5 shrink-0" role="img" aria-label="unlocked">
                  &#x1F513;
                </span>
                <div>
                  <p className="text-sm font-bold">{achievement.name}</p>
                  <p className="text-xs text-text-muted">{achievement.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer — what achievements unlock */}
      <div className="pt-3 border-t border-white/10">
        <p className="text-sm text-text-secondary mb-1">
          Achievements unlock new sectors, deal structures, and gameplay events.
        </p>
        {!isLoggedIn ? (
          <button
            onClick={onSignUp}
            className="text-sm text-accent hover:text-accent-secondary inline-flex items-center min-h-[44px] font-medium"
          >
            Sign up to start tracking achievements &rarr;
          </button>
        ) : (
          <p className="text-xs text-text-muted">
            Full tracking is coming soon — you'll get credit for games you play now.
          </p>
        )}
      </div>
    </div>
  );
}
