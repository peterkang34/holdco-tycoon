import { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../../hooks/useAuth';
import { ACHIEVEMENT_PREVIEW } from '../../data/achievementPreview';
import { getEarnedAchievementIds, getUnlockedSectorIds } from '../../hooks/useUnlocks';
import { SECTORS } from '../../data/sectors';
import { computePrestigeTier, getPrestigeTierColor } from '../../data/prestigeTitles';

export function CelebrationModal() {
  const show = useAuthStore((s) => s.showCelebrationModal);
  const data = useAuthStore((s) => s.celebrationData);
  const close = useAuthStore((s) => s.closeCelebrationModal);
  const [visibleCards, setVisibleCards] = useState(0);
  const [showContent, setShowContent] = useState(false);

  const earnedIds = useMemo(() => (show ? getEarnedAchievementIds() : []), [show]);
  const earnedAchievements = useMemo(
    () => ACHIEVEMENT_PREVIEW.filter(a => earnedIds.includes(a.id)).slice(0, 12),
    [earnedIds],
  );
  const unlockedSectors = useMemo(
    () => (show ? getUnlockedSectorIds(false) : []),
    [show],
  );

  // Stagger card reveals
  useEffect(() => {
    if (!show) {
      setVisibleCards(0);
      setShowContent(false);
      return;
    }
    const contentTimer = setTimeout(() => setShowContent(true), 300);
    const timers = earnedAchievements.map((_, i) =>
      setTimeout(() => setVisibleCards(i + 1), 600 + i * 150),
    );
    return () => {
      clearTimeout(contentTimer);
      timers.forEach(clearTimeout);
    };
  }, [show, earnedAchievements.length]);

  if (!show || !data) return null;

  const prestige = computePrestigeTier({
    totalGames: data.gamesLinked,
    avgScore: 0,
    achievementCount: earnedIds.length,
    bestGrade: 'F',
    sGradeCount: 0,
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fadeIn"
        onClick={close}
      />

      {/* Content */}
      <div className={`relative z-10 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto rounded-2xl bg-gradient-to-b from-zinc-900 to-zinc-950 border border-white/10 shadow-2xl transition-all duration-500 ${showContent ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🏛️</div>
            <h2 className="text-2xl font-bold mb-1">Your Holdco Legacy Awaits</h2>
            <p className="text-text-muted text-sm">
              Your past games count. Here's what you've earned.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-white/5 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold font-mono text-accent">{data.achievementCount}</p>
              <p className="text-xs text-text-muted">Achievements Earned</p>
            </div>
            <div className="bg-white/5 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold font-mono">{data.gamesLinked}</p>
              <p className="text-xs text-text-muted">Games Linked</p>
            </div>
          </div>

          {/* Prestige title */}
          {prestige.title && (
            <div className="text-center mb-6">
              <p className="text-xs text-text-muted mb-1">Your Title</p>
              <p className={`text-lg font-bold ${getPrestigeTierColor(prestige.tier)}`}>
                {prestige.title}
              </p>
            </div>
          )}

          {/* Achievement reveals */}
          {earnedAchievements.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-bold tracking-widest text-text-muted mb-3">ACHIEVEMENTS EARNED</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {earnedAchievements.map((achievement, i) => (
                  <div
                    key={achievement.id}
                    className={`rounded-lg p-2.5 bg-green-500/5 border border-green-500/10 transition-all duration-300 ${
                      i < visibleCards ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base shrink-0">{achievement.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{achievement.name}</p>
                        <p className="text-[10px] text-text-muted truncate">{achievement.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {earnedIds.length > 12 && (
                <p className="text-xs text-text-muted mt-2 text-center">
                  +{earnedIds.length - 12} more achievements
                </p>
              )}
            </div>
          )}

          {/* Unlocked sectors */}
          {unlockedSectors.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-bold tracking-widest text-amber-400 mb-3">
                SECTORS UNLOCKED
              </p>
              <div className="flex flex-wrap gap-2">
                {unlockedSectors.map(sectorId => {
                  const sector = SECTORS[sectorId];
                  if (!sector) return null;
                  return (
                    <div
                      key={sectorId}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20"
                    >
                      <span>{sector.emoji}</span>
                      <span className="text-xs font-medium text-amber-200">{sector.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* CTA */}
          <button
            onClick={close}
            className="btn-primary w-full min-h-[48px] text-base font-medium"
          >
            Continue
          </button>
        </div>
      </div>

      {/* CSS animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
