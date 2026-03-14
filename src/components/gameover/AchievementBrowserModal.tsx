import { Modal } from '../ui/Modal';
import type { AchievementDef } from '../../data/achievementPreview';

const CATEGORY_META: Record<string, { label: string; flavor: string }> = {
  milestone: { label: 'MILESTONES', flavor: 'The fundamentals. Every great holdco starts here.' },
  feat: { label: 'FEATS', flavor: 'Distinctive plays that show real skill.' },
  mastery: { label: 'MASTERY', flavor: 'The elite tier. Few reach it.' },
  mode: { label: 'CHALLENGE MODES', flavor: 'Prove yourself under different conditions.' },
};

const CATEGORY_ORDER = ['milestone', 'feat', 'mastery', 'mode'];

interface AchievementBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  allAchievements: AchievementDef[];
  earnedIds: Set<string>;
  isLoggedIn: boolean;
  onSignUp: () => void;
}

export function AchievementBrowserModal({
  isOpen,
  onClose,
  allAchievements,
  earnedIds,
  isLoggedIn,
  onSignUp,
}: AchievementBrowserModalProps) {
  const earnedCount = earnedIds.size;
  const totalCount = allAchievements.length;

  const header = (
    <div>
      <h3 className="text-xl font-bold">All Achievements</h3>
      <div className="flex items-center gap-3 mt-1">
        <p className="text-text-muted text-sm">{earnedCount} of {totalCount} unlocked</p>
        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden max-w-[120px]">
          <div
            className="h-full bg-gradient-to-r from-accent to-accent-secondary rounded-full"
            style={{ width: `${(earnedCount / totalCount) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} header={header}>
      <div className="space-y-6">
        {/* Signup CTA for anonymous users */}
        {!isLoggedIn && (
          <div className="rounded-xl p-4 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
            <p className="text-sm text-text-secondary mb-3">
              Create a free account to collect achievements, track your progress across games, and unlock new sectors and gameplay events.
            </p>
            <button
              onClick={onSignUp}
              className="btn-primary w-full min-h-[44px] text-sm font-medium"
            >
              Sign Up to Start Tracking (Free)
            </button>
            <p className="text-xs text-text-muted mt-2 text-center">
              Just your email. Takes 10 seconds.
            </p>
          </div>
        )}

        {CATEGORY_ORDER.map((category) => {
          const meta = CATEGORY_META[category];
          const items = allAchievements.filter((a) => a.category === category);
          const categoryEarned = items.filter((a) => earnedIds.has(a.id)).length;

          return (
            <div key={category}>
              {/* Category header */}
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold tracking-widest text-text-muted">{meta.label}</p>
                <span className="text-xs font-mono text-text-muted">{categoryEarned}/{items.length}</span>
              </div>
              <p className="text-xs text-text-muted mb-3">{meta.flavor}</p>

              {/* Achievement grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map((achievement) => {
                  const isUnlocked = earnedIds.has(achievement.id);
                  return (
                    <div
                      key={achievement.id}
                      className={`rounded-lg p-3 ${
                        isUnlocked
                          ? 'bg-green-500/5 border border-green-500/10'
                          : 'bg-white/[0.02] border border-white/5'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`text-lg mt-0.5 shrink-0 ${isUnlocked ? '' : 'opacity-40 grayscale'}`}>
                          {achievement.emoji}
                        </span>
                        <div>
                          <p className={`text-sm font-bold ${isUnlocked ? '' : 'text-text-secondary'}`}>
                            {achievement.name}
                          </p>
                          <p className={`text-xs ${isUnlocked ? 'text-text-muted' : 'text-text-muted/60'}`}>
                            {achievement.description}
                          </p>
                        </div>
                        {isUnlocked && (
                          <span className="text-green-400 text-xs shrink-0 mt-0.5">✓</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
