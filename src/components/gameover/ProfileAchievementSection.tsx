import { useState, useMemo } from 'react';
import type { AchievementDef } from '../../data/achievementPreview';
import { AchievementBrowserModal } from './AchievementBrowserModal';
import { getEarnedAchievementIds } from '../../hooks/useUnlocks';

interface ProfileAchievementSectionProps {
  earnedAchievements: AchievementDef[];
  newlyEarned: AchievementDef[];
  allAchievements: AchievementDef[];
  isLoggedIn: boolean;
  onSignUp: () => void;
}

export function ProfileAchievementSection({
  earnedAchievements,
  newlyEarned,
  allAchievements,
  isLoggedIn,
  onSignUp,
}: ProfileAchievementSectionProps) {
  const [showBrowser, setShowBrowser] = useState(false);

  // All achievements earned across ALL games (localStorage, already merged with server)
  const allEarnedIds = useMemo(() => {
    // Include current game's earned achievements to catch just-saved ones
    const fromStorage = new Set(getEarnedAchievementIds());
    for (const a of earnedAchievements) fromStorage.add(a.id);
    return fromStorage;
  }, [earnedAchievements]);

  const totalCount = allAchievements.length;
  const totalEarnedCount = allEarnedIds.size;

  // Achievements not yet earned at all (across all games)
  const unearnedAchievements = allAchievements.filter(a => !allEarnedIds.has(a.id));

  return (
    <>
      <div className="card mb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-bold tracking-widest text-text-muted">
            ACHIEVEMENTS
          </p>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-white/10 text-text-secondary">
            {totalEarnedCount}/{totalCount}
          </span>
        </div>

        {/* ── New This Game ── */}
        {newlyEarned.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-semibold tracking-wide text-amber-400 mb-2.5 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
              NEW THIS GAME
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {newlyEarned.map((achievement) => (
                <div
                  key={achievement.id}
                  className="rounded-lg p-3 bg-amber-500/10 border border-amber-500/20 ring-1 ring-amber-500/10"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg mt-0.5 shrink-0">
                      {achievement.emoji}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-amber-100">{achievement.name}</p>
                      <p className="text-xs text-amber-200/60">{achievement.description}</p>
                    </div>
                    <span className="text-amber-400 text-xs font-bold shrink-0 mt-0.5">NEW</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state — no new achievements this game */}
        {newlyEarned.length === 0 && unearnedAchievements.length > 0 && (
          <p className="text-sm text-text-muted mb-4">
            No new achievements this game — {totalEarnedCount} of {totalCount} earned so far.
          </p>
        )}

        {/* Completionist state — all achievements earned */}
        {newlyEarned.length === 0 && unearnedAchievements.length === 0 && (
          <div className="rounded-lg p-4 bg-amber-500/5 border border-amber-500/10 mb-4">
            <p className="text-sm font-bold text-amber-200">All {totalCount} achievements earned</p>
            <p className="text-xs text-amber-200/60 mt-1">You've unlocked everything. True holdco tycoon.</p>
          </div>
        )}

        {/* ── Not Yet Earned (teaser) ── */}
        {unearnedAchievements.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold tracking-wide text-text-muted mb-2.5">
              UP NEXT
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {unearnedAchievements.slice(0, 6).map((achievement) => (
                <div
                  key={achievement.id}
                  className="rounded-lg p-2.5 bg-white/[0.03] border border-white/[0.06]"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-base opacity-30 shrink-0">
                      {achievement.emoji}
                    </span>
                    <p className="text-xs text-text-muted truncate">{achievement.name}</p>
                  </div>
                </div>
              ))}
            </div>
            {unearnedAchievements.length > 6 && (
              <p className="text-xs text-text-muted mt-2">
                +{unearnedAchievements.length - 6} more to discover
              </p>
            )}
          </div>
        )}

        {/* Browse all + unlock info */}
        <div className="pt-3 border-t border-white/10">
          <p className="text-sm text-text-secondary mb-2">
            Achievements unlock new sectors and platform recipes.
          </p>
          <button
            onClick={() => setShowBrowser(true)}
            className="text-sm text-accent hover:text-accent-secondary font-medium min-h-[44px] inline-flex items-center"
          >
            View all {totalCount} achievements &rarr;
          </button>
        </div>

        {/* Signup footer for anonymous users */}
        {!isLoggedIn && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-sm text-text-secondary mb-3">
              Create a free account to track achievements, unlock new sectors, and compete on the leaderboard.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onSignUp}
                className="btn-primary flex-1 min-h-[44px] text-sm font-medium"
              >
                Sign Up (Free)
              </button>
            </div>
            <p className="text-xs text-text-muted mt-2 text-center">
              Just your email. Takes 10 seconds.
            </p>
          </div>
        )}

        {/* Logged-in footer */}
        {isLoggedIn && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs text-text-muted">
              Full tracking is coming soon — you'll get credit for games you play now.
            </p>
          </div>
        )}
      </div>

      {/* Achievement Browser Modal */}
      <AchievementBrowserModal
        isOpen={showBrowser}
        onClose={() => setShowBrowser(false)}
        allAchievements={allAchievements}
        earnedIds={allEarnedIds}
        isLoggedIn={isLoggedIn}
        onSignUp={onSignUp}
      />
    </>
  );
}
