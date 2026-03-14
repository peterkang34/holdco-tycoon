import { useState } from 'react';
import type { AchievementDef } from '../../data/achievementPreview';
import { AchievementBrowserModal } from './AchievementBrowserModal';

interface ProfileAchievementSectionProps {
  earnedAchievements: AchievementDef[];
  allAchievements: AchievementDef[];
  isLoggedIn: boolean;
  onSignUp: () => void;
}

export function ProfileAchievementSection({
  earnedAchievements,
  allAchievements,
  isLoggedIn,
  onSignUp,
}: ProfileAchievementSectionProps) {
  const [showBrowser, setShowBrowser] = useState(false);

  const earnedCount = earnedAchievements.length;
  const totalCount = allAchievements.length;
  const earnedIds = new Set(earnedAchievements.map(a => a.id));

  return (
    <>
      <div className="card mb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-bold tracking-widest text-text-muted">
            ACHIEVEMENTS
          </p>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-white/10 text-text-secondary">
            {earnedCount}/{totalCount}
          </span>
        </div>

        {/* Earned achievements grid or empty state */}
        {earnedCount === 0 ? (
          <p className="text-sm text-text-muted mb-4">
            No achievements unlocked this game. Keep playing to earn them!
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {earnedAchievements.map((achievement) => (
              <div
                key={achievement.id}
                className="rounded-lg p-3 bg-green-500/5 border border-green-500/10"
              >
                <div className="flex items-start gap-2">
                  <span className="text-lg mt-0.5 shrink-0">
                    {achievement.emoji}
                  </span>
                  <div>
                    <p className="text-sm font-bold">{achievement.name}</p>
                    <p className="text-xs text-text-muted">{achievement.description}</p>
                  </div>
                  <span className="text-green-400 text-xs shrink-0 mt-0.5">✓</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Browse all + unlock info */}
        <div className="pt-3 border-t border-white/10">
          <p className="text-sm text-text-secondary mb-2">
            Achievements unlock new sectors, deal structures, and gameplay events.
          </p>
          <button
            onClick={() => setShowBrowser(true)}
            className="text-sm text-accent hover:text-accent-secondary font-medium min-h-[44px] inline-flex items-center"
          >
            View all {totalCount} achievements →
          </button>
        </div>

        {/* Signup footer for anonymous users */}
        {!isLoggedIn && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-sm text-text-secondary mb-3">
              Create a free account to collect achievements, track your game history, and unlock new gameplay.
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
              Google or email. Takes 10 seconds.
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
        earnedIds={earnedIds}
      />
    </>
  );
}
