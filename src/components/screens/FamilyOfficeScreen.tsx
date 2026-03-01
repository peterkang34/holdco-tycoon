import { useGameStore } from '../../hooks/useGame';
import { formatMoney } from '../../engine/types';
import { PHILANTHROPY_STORIES } from '../../data/philanthropyStories';

interface FamilyOfficeScreenProps {
  onComplete: () => void;
  isTestMode?: boolean;
}

const GRADE_COLORS: Record<string, string> = {
  Enduring: 'text-yellow-400',
  Influential: 'text-blue-400',
  Established: 'text-gray-400',
  Fragile: 'text-red-400',
};

const GRADE_BG: Record<string, string> = {
  Enduring: 'from-yellow-500/20 to-amber-500/20',
  Influential: 'from-blue-500/20 to-cyan-500/20',
  Established: 'from-gray-500/20 to-slate-500/20',
  Fragile: 'from-red-500/20 to-orange-500/20',
};

export function FamilyOfficeScreen({ onComplete, isTestMode }: FamilyOfficeScreenProps) {
  const familyOfficeState = useGameStore(s => s.familyOfficeState);
  const holdcoName = useGameStore(s => s.holdcoName);
  const seed = useGameStore(s => s.seed);

  if (!familyOfficeState?.legacyScore) {
    return (
      <div className="min-h-screen px-4 sm:px-8 py-8 pb-16 max-w-2xl mx-auto flex flex-col items-center justify-center">
        <p className="text-text-muted">Family Office data not available.</p>
        <button onClick={onComplete} className="btn-primary mt-4">
          {isTestMode ? 'Back to Menu' : 'Continue to Results'}
        </button>
      </div>
    );
  }

  const ls = familyOfficeState.legacyScore;
  const gradeColor = GRADE_COLORS[ls.grade] || 'text-text-primary';
  const gradeBg = GRADE_BG[ls.grade] || 'from-white/10 to-white/5';

  const philanthropyAmount = familyOfficeState.philanthropyDeduction;
  const story = PHILANTHROPY_STORIES[seed % PHILANTHROPY_STORIES.length];

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 pb-16 max-w-2xl mx-auto">
      <div className={`card bg-gradient-to-r ${gradeBg} border-amber-500/30 text-center mb-8`}>
        <span className="text-6xl block mb-4">🦅</span>
        <h1 className={`text-5xl font-bold mb-2 ${gradeColor}`}>{ls.grade}</h1>
        <p className="text-xl text-text-secondary mb-1">{holdcoName} Family Office</p>
      </div>

      <div className="card mb-8">
        <h2 className="text-lg font-bold mb-4">Family Office Performance</h2>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Starting Capital (after 25% philanthropy)</span>
            <span className="font-mono">{formatMoney(ls.foStartingCash)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Ending FEV</span>
            <span className="font-mono">{formatMoney(ls.foFEV)}</span>
          </div>
          <div className="border-t border-white/10 pt-2 flex justify-between text-sm font-bold">
            <span>MOIC</span>
            <span className="font-mono">{ls.foMOIC.toFixed(2)}x</span>
          </div>
          <div className="flex justify-between text-sm font-bold text-amber-400">
            <span>FEV Multiplier Earned</span>
            <span className="font-mono">{ls.foMultiplier.toFixed(2)}x</span>
          </div>
        </div>
      </div>

      {philanthropyAmount > 0 && (
        <div className="card mb-8 border-green-500/30 bg-gradient-to-br from-green-500/10 to-emerald-500/5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">{story.emoji}</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-green-400">{story.category}</span>
          </div>
          <h3 className="text-lg font-bold text-green-300 mb-2">{story.title}</h3>
          <p className="text-sm text-text-secondary leading-relaxed mb-3">
            {story.narrative(formatMoney(philanthropyAmount))}
          </p>
          <div className="border-t border-green-500/20 pt-3 flex justify-between items-center">
            <span className="text-xs text-text-muted">Philanthropy Contribution</span>
            <span className="font-mono text-green-400 font-bold">{formatMoney(philanthropyAmount)}</span>
          </div>
        </div>
      )}

      <button onClick={onComplete} className="btn-primary text-lg py-4 w-full">
        {isTestMode ? 'Back to Menu' : 'Continue to Results'}
      </button>
    </div>
  );
}
