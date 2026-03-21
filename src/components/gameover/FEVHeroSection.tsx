import { useState } from 'react';
import { formatMoney, formatMultiple } from '../../engine/types';
import type { GameDifficulty, GameDuration } from '../../engine/types';
import { useGameStore } from '../../hooks/useGame';
import { calculatePublicCompanyBonus } from '../../engine/ipo';
import { EV_WATERFALL_LABELS, FEV_LABELS } from '../../data/mechanicsCopy';
import { ARCHETYPE_DISPLAY_NAMES } from '../../data/archetypeNames';
import { Tooltip } from '../ui/Tooltip';

interface FamilyOfficeLegacy {
  grade: string;
  foStartingCash: number;
  foMOIC: number;
  foMultiplier: number;
}

interface FEVBreakdown {
  currentOwnership: number;
  opcoDebt: number;
  portfolioValue: number;
  blendedMultiple: number;
  hypotheticalFEV: number;
}

interface FEVHeroSectionProps {
  holdcoName: string;
  founderEquityValue: number;
  adjustedFEV: number;
  enterpriseValue: number;
  founderPersonalWealth: number;
  difficulty: GameDifficulty;
  duration: GameDuration;
  maxRounds: number;
  hasRestructured: boolean;
  difficultyMultiplier: number;
  restructuringMultiplier: number;
  foMultiplier: number;
  archetype: string;
  familyOfficeLegacy: FamilyOfficeLegacy | null;
  fevBreakdown: FEVBreakdown;
  cash: number;
  totalDebt: number;
  initialOwnershipPct: number;
  /** When provided, renders a side-by-side "FEV Breakdown / Strategy Debrief" CTA pair */
  onViewPlaybook?: () => void;
  hasPlaybook?: boolean;
}

export function FEVHeroSection({
  holdcoName,
  founderEquityValue,
  adjustedFEV,
  enterpriseValue,
  founderPersonalWealth,
  difficulty,
  duration: _duration,
  maxRounds,
  hasRestructured,
  difficultyMultiplier,
  restructuringMultiplier,
  foMultiplier,
  archetype,
  familyOfficeLegacy,
  fevBreakdown,
  cash,
  totalDebt,
  initialOwnershipPct,
  onViewPlaybook,
  hasPlaybook = false,
}: FEVHeroSectionProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const archetypeDisplay = ARCHETYPE_DISPLAY_NAMES[archetype] || 'The Balanced Allocator';

  return (
    <div className="mb-6">
      {/* Hero header */}
      <div className="text-center mb-4">
        <h1 className="text-3xl font-bold mb-1 break-words">{holdcoName}</h1>
        <div className="flex justify-center gap-2 mt-1 mb-4">
          <span className={`text-xs px-2 py-0.5 rounded ${difficulty === 'normal' ? 'bg-orange-500/20 text-orange-400' : 'bg-accent/20 text-accent'}`}>
            {difficulty === 'normal' ? 'Hard' : 'Easy'}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-text-secondary">
            {maxRounds}yr
          </span>
          {familyOfficeLegacy && (
            <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400" title={`FO ${familyOfficeLegacy.grade} Legacy — ${familyOfficeLegacy.foMultiplier.toFixed(2)}x multiplier`}>
              🦅 {familyOfficeLegacy.grade} Legacy
            </span>
          )}
        </div>
      </div>

      {/* FEV Hero Card */}
      <div className={`card mb-4 bg-gradient-to-r ${hasRestructured ? 'from-red-900/20 to-orange-900/20 border-red-500/30' : foMultiplier > 1.0 ? 'from-amber-500/10 to-yellow-500/10 border-amber-500/30' : 'from-accent/20 to-accent-secondary/20 border-accent/30'}`}>
        <div className="text-center">
          <p className="text-text-muted text-sm mb-1">
            <Tooltip
              trigger={<span className="underline decoration-dotted decoration-text-muted/50 cursor-help">{FEV_LABELS.fullName} (FEV)</span>}
              align="left"
              width="w-72 sm:w-80"
            >
              <p className="font-bold text-text-primary mb-1.5">{FEV_LABELS.fullName}</p>
              <p className="mb-1.5">{FEV_LABELS.definition}</p>
              <p className="font-mono text-[11px] bg-white/5 rounded px-2 py-1 mb-1.5">{FEV_LABELS.formula}</p>
              <p className="text-text-muted">{FEV_LABELS.whyItMatters}</p>
            </Tooltip>
            {hasRestructured && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-red-900/30 border border-red-500/50 text-red-400" title="Your FEV has been reduced by 20% due to financial restructuring.">
                -20% Restructuring
              </span>
            )}
            {foMultiplier > 1.0 && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 border border-amber-500/50 text-amber-400" title={`Your FEV has been boosted by ${((foMultiplier - 1) * 100).toFixed(0)}% from Family Office performance.`}>
                +{((foMultiplier - 1) * 100).toFixed(0)}% Family Office
              </span>
            )}
          </p>
          {hasRestructured || foMultiplier > 1.0 ? (
            <div className="mb-2">
              <p className="text-lg font-mono text-text-muted line-through">{formatMoney(founderEquityValue)}</p>
              <p className={`text-3xl sm:text-5xl font-bold font-mono ${hasRestructured ? 'text-red-400' : 'text-amber-400'}`}>
                {formatMoney(adjustedFEV)}
              </p>
            </div>
          ) : (
            <p className="text-3xl sm:text-5xl font-bold font-mono text-accent mb-2">
              {formatMoney(founderEquityValue)}
            </p>
          )}
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-6 mt-3">
            <div>
              <p className="text-text-muted text-xs">Enterprise Value</p>
              <p className="font-mono text-text-secondary">{formatMoney(enterpriseValue)}</p>
            </div>
            {founderPersonalWealth > 0 && (
              <div>
                <p className="text-text-muted text-xs">Personal Wealth</p>
                <p className="font-mono text-text-secondary">{formatMoney(founderPersonalWealth)}</p>
              </div>
            )}
          </div>
          {/* Strategy archetype line */}
          <p className="text-sm text-text-muted mt-3">Playstyle: {archetypeDisplay}</p>
        </div>
      </div>

      {/* CTA pair: FEV Breakdown + Operator's Playbook */}
      {hasPlaybook ? (
        <div className="grid grid-cols-2 gap-3 mb-2">
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className={`min-h-[48px] text-sm transition-colors rounded-lg border flex items-center justify-center gap-1.5 ${
              showBreakdown
                ? 'bg-white/[0.06] border-accent/40 text-text-primary'
                : 'bg-white/[0.03] border-white/10 text-text-muted hover:bg-white/[0.06] hover:text-text-secondary'
            }`}
            aria-expanded={showBreakdown}
          >
            <span className={`text-xs transition-transform ${showBreakdown ? 'rotate-90' : ''}`}>▶</span>
            FEV Breakdown
          </button>
          <button
            onClick={onViewPlaybook}
            className="min-h-[48px] text-sm bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 transition-colors rounded-lg flex items-center justify-center gap-1.5"
          >
            <span className="text-xs">📋</span>
            Strategy Debrief
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="w-full min-h-[44px] text-sm text-text-muted hover:text-text-secondary transition-colors mb-2 flex items-center justify-center gap-1"
          aria-expanded={showBreakdown}
        >
          <span className={`transition-transform ${showBreakdown ? 'rotate-90' : ''}`}>▶</span>
          {showBreakdown ? 'Hide' : 'Show'} FEV / EV Breakdown
        </button>
      )}

      {showBreakdown && (
        <div className="card mb-4">
          <h2 className="text-lg font-bold mb-4">FEV / EV Breakdown</h2>
          <div className="space-y-2 mb-5">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Portfolio Value <span className="text-xs">({formatMultiple(fevBreakdown.blendedMultiple)} blended)</span></span>
              <span className="font-mono">{formatMoney(fevBreakdown.portfolioValue)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">+ Cash</span>
              <span className="font-mono">{formatMoney(cash)}</span>
            </div>
            {totalDebt > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">- {EV_WATERFALL_LABELS.bankDebt}</span>
                <span className="font-mono text-danger">({formatMoney(totalDebt)})</span>
              </div>
            )}
            {fevBreakdown.opcoDebt > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">- {EV_WATERFALL_LABELS.sellerNotes}</span>
                <span className="font-mono text-danger">({formatMoney(fevBreakdown.opcoDebt)})</span>
              </div>
            )}
            <div className="border-t border-white/10 pt-2 flex justify-between text-sm font-bold">
              <span>= Enterprise Value</span>
              <span className="font-mono">{formatMoney(enterpriseValue)}</span>
            </div>
            {(() => {
              const gameState = useGameStore.getState();
              const publicBonus = calculatePublicCompanyBonus(gameState);
              return publicBonus > 0 ? (
                <div className="text-xs text-green-400/70 -mt-0.5">
                  Includes +{(publicBonus * 100).toFixed(0)}% public company bonus
                </div>
              ) : null;
            })()}
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">x Your Ownership ({(fevBreakdown.currentOwnership * 100).toFixed(1)}%)</span>
              <span className="font-mono"></span>
            </div>
            <div className="flex justify-between text-sm font-bold text-accent">
              <span>= Raw FEV <span className="font-normal text-text-muted text-xs">(Founder Equity Value)</span></span>
              <span className="font-mono">{formatMoney(founderEquityValue)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">x Difficulty ({formatMultiple(difficultyMultiplier)})</span>
              <span className="font-mono">{formatMoney(Math.round(founderEquityValue * difficultyMultiplier))}</span>
            </div>
            {hasRestructured && (
              <div className="flex justify-between text-sm">
                <span className="text-red-400">x Restructuring (-20%)</span>
                <span className="font-mono text-red-400">-{formatMoney(Math.round(founderEquityValue * difficultyMultiplier) - Math.round(founderEquityValue * difficultyMultiplier * restructuringMultiplier))}</span>
              </div>
            )}
            {foMultiplier > 1.0 && (
              <div className="flex justify-between text-sm">
                <span className="text-amber-400">x FO Multiplier ({foMultiplier.toFixed(2)}x)</span>
                <span className="font-mono text-amber-400">{formatMoney(Math.round(founderEquityValue * difficultyMultiplier * restructuringMultiplier * foMultiplier))}</span>
              </div>
            )}
            <div className="border-t border-white/10 pt-2 flex justify-between text-sm font-bold">
              <span>= Adjusted FEV</span>
              <span className={`font-mono ${hasRestructured ? 'text-red-400' : 'text-accent'}`}>{formatMoney(adjustedFEV)}</span>
            </div>
          </div>

          {/* Ownership Impact */}
          {fevBreakdown.currentOwnership < initialOwnershipPct - 0.001 && (
            <div className="p-3 bg-white/5 rounded text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-text-muted">Initial Ownership</span>
                <span className="font-mono">{(initialOwnershipPct * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-text-muted">Final Ownership</span>
                <span className="font-mono">{(fevBreakdown.currentOwnership * 100).toFixed(1)}%</span>
              </div>
              <p className="text-xs text-text-muted">
                At {(initialOwnershipPct * 100).toFixed(0)}% ownership, FEV would be {formatMoney(fevBreakdown.hypotheticalFEV)} ({fevBreakdown.hypotheticalFEV > founderEquityValue ? '+' : ''}{formatMoney(fevBreakdown.hypotheticalFEV - founderEquityValue)})
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
