import { useState, useRef, useCallback } from 'react';
import { useGameStore } from '../../hooks/useGame';
import { formatMoney } from '../../engine/types';
import { getSuccessionChoices, isSuccessionRound, isFamilyOfficeComplete, philanthropyRepGain } from '../../engine/familyOffice';
import { FAMILY_OFFICE_ROUNDS } from '../../data/gameConfig';
import type { FOSuccessionChoice } from '../../engine/types';

interface FamilyOfficeScreenProps {
  onComplete: () => void;
}

const INVESTMENT_TYPES = [
  { id: 'equities', label: 'Public Equities', emoji: '📈', description: 'Diversified stock portfolio' },
  { id: 'fixed_income', label: 'Fixed Income', emoji: '💵', description: 'Bonds and treasuries' },
  { id: 'real_estate', label: 'Real Estate', emoji: '🏠', description: 'Commercial and residential' },
  { id: 'alternatives', label: 'Alternatives', emoji: '🎯', description: 'PE, hedge funds, venture' },
] as const;

const PHILANTHROPY_PRESETS = [10000, 25000, 50000, 100000]; // in thousands ($10M, $25M, $50M, $100M)
const INVESTMENT_PRESETS = [10000, 25000, 50000]; // in thousands

const SUCCESSION_EMOJIS: Record<FOSuccessionChoice, string> = {
  heir_apparent: '👨‍👦',
  professional_ceo: '👔',
  family_council: '👥',
};

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
  const cash = useGameStore(s => s.cash);
  const holdcoName = useGameStore(s => s.holdcoName);
  const startFamilyOffice = useGameStore(s => s.startFamilyOffice);
  const familyOfficePhilanthropy = useGameStore(s => s.familyOfficePhilanthropy);
  const familyOfficeInvest = useGameStore(s => s.familyOfficeInvest);
  const familyOfficeSuccession = useGameStore(s => s.familyOfficeSuccession);
  const familyOfficeAdvanceRound = useGameStore(s => s.familyOfficeAdvanceRound);

  const [started, setStarted] = useState(false);
  const advancingRef = useRef(false);

  const handleBegin = () => {
    if (!familyOfficeState?.isActive) startFamilyOffice();
    setStarted(true);
  };

  const handleAdvance = useCallback(() => {
    if (advancingRef.current) return; // debounce rapid clicks
    advancingRef.current = true;
    familyOfficeAdvanceRound();
    // Reset after a tick so the next render can re-enable
    requestAnimationFrame(() => { advancingRef.current = false; });
  }, [familyOfficeAdvanceRound]);

  // Not started yet — intro card (skip if already active, e.g. returning mid-game)
  if ((!started && !familyOfficeState?.isActive) || !familyOfficeState) {
    return (
      <div className="min-h-screen px-4 sm:px-8 py-8 pb-16 max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <span className="text-6xl block mb-4">🦅</span>
          <h1 className="text-3xl font-bold mb-2">Family Office</h1>
          <p className="text-text-secondary">{holdcoName}</p>
        </div>
        <div className="card max-w-xl mx-auto text-center">
          <p className="text-text-secondary mb-6">
            Your holding company has grown into an institution. Now, build a legacy that endures beyond you.
          </p>
          <p className="text-sm text-text-muted mb-6">
            Over 5 rounds, you'll make philanthropy commitments, diversify investments, and choose a succession plan.
            Every decision shapes your legacy score.
          </p>
          <button onClick={handleBegin} className="btn-primary text-lg py-3">
            Begin
          </button>
        </div>
      </div>
    );
  }

  // Completed — legacy score reveal
  if (isFamilyOfficeComplete(familyOfficeState) && familyOfficeState.legacyScore) {
    const ls = familyOfficeState.legacyScore;
    const gradeColor = GRADE_COLORS[ls.grade] || 'text-text-primary';
    const gradeBg = GRADE_BG[ls.grade] || 'from-white/10 to-white/5';

    const components = [
      { label: 'Wealth Preservation', value: ls.wealthPreservation, max: 20 },
      { label: 'Reputation', value: ls.reputationScore, max: 20 },
      { label: 'Philanthropy', value: ls.philanthropyScore, max: 20 },
      { label: 'Succession Quality', value: ls.successionQuality, max: 20 },
      { label: 'Permanent Holdings', value: ls.permanentHoldPerformance, max: 20 },
    ];

    return (
      <div className="min-h-screen px-4 sm:px-8 py-8 pb-16 max-w-4xl mx-auto">
        <div className={`card bg-gradient-to-r ${gradeBg} border-amber-500/30 text-center mb-8`}>
          <span className="text-6xl block mb-4">🦅</span>
          <h1 className={`text-5xl font-bold mb-2 ${gradeColor}`}>{ls.grade}</h1>
          <p className="text-xl text-text-secondary mb-1">Legacy</p>
          <p className="text-3xl font-bold font-mono">{ls.total}/100</p>
        </div>

        <div className="card mb-8">
          <h2 className="text-lg font-bold mb-4">Score Breakdown</h2>
          <div className="space-y-4">
            {components.map(c => (
              <div key={c.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-text-secondary">{c.label}</span>
                  <span className="font-mono font-bold">{c.value}/{c.max}</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden" role="progressbar" aria-valuenow={c.value} aria-valuemin={0} aria-valuemax={c.max} aria-label={c.label}>
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-500"
                    style={{ width: `${(c.value / c.max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <button onClick={onComplete} className="btn-primary text-lg py-4 w-full">
          Return to Results
        </button>
      </div>
    );
  }

  // Active play — rounds 1-5
  const { foRound, reputation, philanthropyCommitted, investments } = familyOfficeState;
  const isSuccession = isSuccessionRound(familyOfficeState);
  const successionChoices = getSuccessionChoices();
  const hasSuccessionChoice = !!familyOfficeState.generationalSuccessionChoice;
  const uniqueAssetClasses = new Set(investments.map(i => i.type)).size;
  const canAdvance = !isSuccession || hasSuccessionChoice;

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 pb-16 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold">🦅 Family Office</h1>
        <p className="text-text-secondary text-sm">{holdcoName}</p>
        <p className="text-text-muted text-sm mt-1">Round {foRound} of {FAMILY_OFFICE_ROUNDS}</p>
      </div>

      {/* Status bar */}
      <div className="card mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-xs text-text-muted mb-1">Reputation</p>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-1" role="progressbar" aria-valuenow={reputation} aria-valuemin={0} aria-valuemax={100} aria-label="Reputation">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  reputation >= 70 ? 'bg-green-500' : reputation >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${reputation}%` }}
              />
            </div>
            <p className="text-sm font-mono font-bold">{reputation}/100</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Cash Available</p>
            <p className="font-mono font-bold text-accent">{formatMoney(cash)}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Philanthropy</p>
            <p className="font-mono font-bold">{formatMoney(philanthropyCommitted)}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Diversification</p>
            <p className="font-mono font-bold">{uniqueAssetClasses} of 4 classes</p>
          </div>
        </div>
      </div>

      {/* Round progress */}
      <div className="flex gap-1 mb-6">
        {Array.from({ length: FAMILY_OFFICE_ROUNDS }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i + 1 < foRound ? 'bg-accent' : i + 1 === foRound ? 'bg-accent/60' : 'bg-white/10'
            }`}
          />
        ))}
      </div>

      {/* Philanthropy Section */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-bold">Philanthropy</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-400 font-medium">
            IRREVOCABLE
          </span>
        </div>
        <p className="text-sm text-text-muted mb-4">
          Commit capital to philanthropic causes. Builds reputation but cannot be reversed.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PHILANTHROPY_PRESETS.map(amount => {
            const repGain = philanthropyRepGain(amount);
            return (
              <button
                key={amount}
                onClick={() => familyOfficePhilanthropy(amount)}
                disabled={cash < amount}
                className="card !p-3 text-center hover:border-amber-500/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <p className="font-mono font-bold">{formatMoney(amount)}</p>
                <p className="text-xs text-green-400 mt-1">+{repGain} rep</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Investment Section */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold mb-3">Investments</h2>
        <p className="text-sm text-text-muted mb-4">
          Allocate capital across asset classes. Diversification improves your wealth preservation score.
        </p>
        <div className="space-y-4">
          {INVESTMENT_TYPES.map(type => {
            const invested = investments.filter(i => i.type === type.id).reduce((s, i) => s + i.amount, 0);
            return (
              <div key={type.id} className="card !p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{type.emoji}</span>
                  <div>
                    <p className="font-bold text-sm">{type.label}</p>
                    <p className="text-xs text-text-muted">{type.description}</p>
                  </div>
                  {invested > 0 && (
                    <span className="ml-auto text-xs font-mono text-accent">{formatMoney(invested)}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {INVESTMENT_PRESETS.map(amount => (
                    <button
                      key={amount}
                      onClick={() => familyOfficeInvest(type.id, amount)}
                      disabled={cash < amount}
                      className="flex-1 text-xs py-1.5 min-h-[44px] rounded bg-white/5 hover:bg-white/10 border border-white/10 hover:border-accent/30 transition-colors font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {formatMoney(amount)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Succession Section — Round 3 only */}
      {isSuccession && (
        <div className="card mb-6 border-amber-500/30">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-bold">Succession Plan</h2>
            {!hasSuccessionChoice && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-400 font-medium">
                REQUIRED
              </span>
            )}
          </div>
          <p className="text-sm text-text-muted mb-4">
            Choose how leadership will transition to the next generation. This decision is permanent.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {successionChoices.map(({ choice, label, description, riskDescription }) => {
              const isSelected = familyOfficeState.generationalSuccessionChoice === choice;
              return (
                <button
                  key={choice}
                  onClick={() => !hasSuccessionChoice && familyOfficeSuccession(choice)}
                  disabled={hasSuccessionChoice && !isSelected}
                  className={`card !p-4 text-left transition-all ${
                    isSelected
                      ? 'border-accent bg-accent/10'
                      : hasSuccessionChoice
                        ? 'opacity-40 cursor-not-allowed'
                        : 'hover:border-amber-500/50 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{SUCCESSION_EMOJIS[choice]}</span>
                    {isSelected && <span className="text-accent text-lg">✓</span>}
                  </div>
                  <p className="font-bold text-sm mb-1">{label}</p>
                  <p className="text-xs text-text-secondary mb-2">{description}</p>
                  <p className="text-xs text-text-muted italic">{riskDescription}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Advance button */}
      <button
        onClick={handleAdvance}
        disabled={!canAdvance}
        className="btn-primary text-lg py-4 w-full disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {foRound >= FAMILY_OFFICE_ROUNDS
          ? 'Complete Family Office'
          : `Advance to Round ${foRound + 1}`}
      </button>
      {!canAdvance && (
        <p className="text-center text-sm text-amber-400 mt-2">
          You must choose a succession plan before advancing.
        </p>
      )}
    </div>
  );
}
