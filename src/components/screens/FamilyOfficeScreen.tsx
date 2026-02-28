import { useGameStore } from '../../hooks/useGame';
import { formatMoney } from '../../engine/types';

interface FamilyOfficeScreenProps {
  onComplete: () => void;
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

export function FamilyOfficeScreen({ onComplete }: FamilyOfficeScreenProps) {
  const familyOfficeState = useGameStore(s => s.familyOfficeState);
  const holdcoName = useGameStore(s => s.holdcoName);

  if (!familyOfficeState?.legacyScore) {
    return (
      <div className="min-h-screen px-4 sm:px-8 py-8 pb-16 max-w-2xl mx-auto flex flex-col items-center justify-center">
        <p className="text-text-muted">Family Office data not available.</p>
        <button onClick={onComplete} className="btn-primary mt-4">Continue to Results</button>
      </div>
    );
  }

  const ls = familyOfficeState.legacyScore;
  const gradeColor = GRADE_COLORS[ls.grade] || 'text-text-primary';
  const gradeBg = GRADE_BG[ls.grade] || 'from-white/10 to-white/5';

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

      {familyOfficeState.philanthropyDeduction > 0 && (
        <div className="card mb-8 border-green-500/20">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-green-400">Philanthropy Contribution</span>
            <span className="ml-auto font-mono text-green-400">{formatMoney(familyOfficeState.philanthropyDeduction)}</span>
          </div>
        </div>
      )}

      <button onClick={onComplete} className="btn-primary text-lg py-4 w-full">
        Continue to Results
      </button>
    </div>
  );
}
