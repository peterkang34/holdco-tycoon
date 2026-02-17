import {
  Business,
  ActiveTurnaround,
  TurnaroundTier,
  GameDuration,
  formatMoney,
  formatPercent,
} from '../../engine/types';
import { SECTORS } from '../../data/sectors';
import { Modal } from '../ui/Modal';
import {
  getEligiblePrograms,
  calculateTurnaroundCost,
  getTurnaroundDuration,
} from '../../engine/turnarounds';
import { TURNAROUND_FATIGUE_THRESHOLD } from '../../data/gameConfig';
import { TURNAROUND_TIER_CONFIG } from '../../data/turnaroundPrograms';

interface TurnaroundModalProps {
  business: Business;
  cash: number;
  turnaroundTier: TurnaroundTier;
  activeTurnarounds: ActiveTurnaround[];
  duration: GameDuration;
  onStartTurnaround: (businessId: string, programId: string) => void;
  onClose: () => void;
}

export function TurnaroundModal({
  business,
  cash,
  turnaroundTier,
  activeTurnarounds,
  duration,
  onStartTurnaround,
  onClose,
}: TurnaroundModalProps) {
  const sector = SECTORS[business.sectorId];
  const eligiblePrograms = getEligiblePrograms(business, turnaroundTier, activeTurnarounds);
  const activeCount = activeTurnarounds.filter(t => t.status === 'active').length;
  const tierName = turnaroundTier === 0
    ? 'No Tier'
    : TURNAROUND_TIER_CONFIG[turnaroundTier as 1 | 2 | 3].name;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      header={
        <div className="flex items-center gap-3">
          <span className="text-2xl sm:text-3xl">{sector.emoji}</span>
          <div>
            <h3 className="text-lg sm:text-xl font-bold truncate">{business.name}</h3>
            <p className="text-text-muted">{business.subType} &middot; Q{business.qualityRating}</p>
          </div>
        </div>
      }
      size="xl"
    >
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="card text-center">
          <p className="text-text-muted text-sm">Current Quality</p>
          <p className="text-2xl font-bold font-mono">Q{business.qualityRating}</p>
        </div>
        <div className="card text-center">
          <p className="text-text-muted text-sm">Active Turnarounds</p>
          <p className="text-2xl font-bold font-mono">{activeCount}</p>
        </div>
        <div className="card text-center">
          <p className="text-text-muted text-sm">Turnaround Tier</p>
          <p className="text-2xl font-bold font-mono text-amber-400">{tierName}</p>
        </div>
      </div>

      {/* How Turnarounds Work */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 mb-6">
        <p className="font-bold text-sm mb-2">How Turnarounds Work</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-text-secondary">
          <div>
            <p className="text-text-primary font-medium mb-1">Quality Upgrade</p>
            <p>Programs improve your business quality rating (Q1{'\u2192'}Q3 etc). Higher quality = better exit multiples.</p>
          </div>
          <div>
            <p className="text-text-primary font-medium mb-1">Risk & Reward</p>
            <p>Each program has success/partial/failure rates. Success = full quality jump + EBITDA boost. Partial = +1 tier. Failure = small EBITDA damage.</p>
          </div>
          <div>
            <p className="text-text-primary font-medium mb-1">Duration</p>
            <p>Programs take multiple years. Annual costs apply until completion.</p>
          </div>
        </div>
      </div>

      {/* Program Cards */}
      <h4 className="font-bold mb-4">Choose Program</h4>

      {eligiblePrograms.length === 0 ? (
        <div className="card text-center py-8 text-text-muted">
          <p className="text-lg mb-2">No eligible programs</p>
          <p className="text-sm">
            {turnaroundTier === 0
              ? 'Unlock a turnaround tier first to access programs.'
              : 'This business already has an active turnaround or no programs match its current quality.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {eligiblePrograms.map((prog) => {
            const upfrontCost = calculateTurnaroundCost(prog, business);
            const programDuration = getTurnaroundDuration(prog, duration);
            const canAfford = cash >= upfrontCost;
            const nearFatigue = activeCount >= TURNAROUND_FATIGUE_THRESHOLD - 1;

            return (
              <div key={prog.id} className="card">
                <h5 className="font-bold mb-1">{prog.displayName}</h5>
                <p className="text-sm text-amber-400 font-medium mb-3">
                  Q{prog.sourceQuality} {'\u2192'} Q{prog.targetQuality} &middot; {programDuration} years
                </p>

                {/* 2x2 Stats Grid */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-white/5 rounded-lg p-2 text-center">
                    <p className="text-text-muted text-xs">Success Rate</p>
                    <p className="font-mono font-bold text-green-400">{formatPercent(prog.successRate)}</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2 text-center">
                    <p className="text-text-muted text-xs">Failure Rate</p>
                    <p className="font-mono font-bold text-red-400">{formatPercent(prog.failureRate)}</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2 text-center">
                    <p className="text-text-muted text-xs">Upfront Cost</p>
                    <p className={`font-mono font-bold ${!canAfford ? 'text-red-400' : ''}`}>{formatMoney(upfrontCost)}</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2 text-center">
                    <p className="text-text-muted text-xs">Annual Cost</p>
                    <p className="font-mono font-bold">{formatMoney(prog.annualCost)}/yr</p>
                  </div>
                </div>

                {/* Outcome Details */}
                <div className="space-y-1 text-xs text-text-secondary mb-3">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Success EBITDA Boost</span>
                    <span className="font-mono text-green-400">+{(prog.ebitdaBoostOnSuccess * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Partial EBITDA Boost</span>
                    <span className="font-mono text-amber-400">+{(prog.ebitdaBoostOnPartial * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Failure EBITDA Damage</span>
                    <span className="font-mono text-red-400">-{(prog.ebitdaDamageOnFailure * 100).toFixed(0)}%</span>
                  </div>
                </div>

                {/* Fatigue Warning */}
                {nearFatigue && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 mb-3 text-xs text-amber-400">
                    Starting this turnaround will trigger portfolio fatigue ({TURNAROUND_FATIGUE_THRESHOLD}+ active), reducing all success rates by 10ppt.
                  </div>
                )}

                {/* Start Button */}
                <button
                  className={`w-full mt-1 text-sm min-h-[44px] rounded-lg font-medium transition-colors ${
                    canAfford
                      ? 'bg-amber-600 hover:bg-amber-500 text-white active:scale-[0.98]'
                      : 'bg-white/5 text-text-muted cursor-not-allowed'
                  }`}
                  disabled={!canAfford}
                  onClick={() => {
                    if (canAfford) {
                      onStartTurnaround(business.id, prog.id);
                      onClose();
                    }
                  }}
                >
                  {canAfford ? 'Start Program' : 'Not Enough Cash'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Tip */}
      <div className="mt-6 p-4 bg-white/5 rounded-lg text-sm text-text-muted">
        <p className="font-medium text-text-secondary mb-1">Turnaround Tip</p>
        <p>Turnarounds are the only way to improve quality ratings beyond operational improvements. A Q1 business bought at 3x that becomes Q4 can exit at 7x+ — the math on turnarounds is about transformation, not quick fixes.</p>
      </div>
    </Modal>
  );
}
