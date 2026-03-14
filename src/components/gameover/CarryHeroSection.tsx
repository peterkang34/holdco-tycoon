import { formatMoney } from '../../engine/types';
import type { PEScoreBreakdown, CarryWaterfall } from '../../engine/types';
import { ARCHETYPE_DISPLAY_NAMES } from '../../data/archetypeNames';

interface CarryHeroSectionProps {
  fundName: string;
  peScore: PEScoreBreakdown;
  carryWaterfallData: CarryWaterfall;
  difficulty: string;
  archetype: string;
}

export function CarryHeroSection({
  fundName,
  peScore: _peScore,
  carryWaterfallData,
  difficulty: _difficulty,
  archetype,
}: CarryHeroSectionProps) {
  const archetypeDisplay = ARCHETYPE_DISPLAY_NAMES[archetype] || 'The Balanced Allocator';

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="text-center mb-4">
        <h1 className="text-3xl font-bold mb-1 break-words">{fundName}</h1>
        <div className="flex justify-center gap-2 mt-1 mb-4">
          <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">Fund Manager</span>
          <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-text-secondary">10yr</span>
        </div>
      </div>

      {/* Carry Hero Card */}
      <div className="card mb-4 bg-gradient-to-r from-purple-500/10 to-purple-500/5 border-purple-500/30">
        <div className="text-center">
          <p className="text-text-muted text-sm mb-1">Carried Interest Earned</p>
          <p className="text-3xl sm:text-5xl font-bold font-mono text-purple-300">
            {carryWaterfallData.carry > 0 ? formatMoney(Math.round(carryWaterfallData.carry)) : '$0'}
          </p>
          {carryWaterfallData.carry > 0 && (
            <p className="text-sm text-text-muted mt-2">
              Total GP Economics: {formatMoney(Math.round(carryWaterfallData.totalGpEconomics))} (carry + mgmt fees)
            </p>
          )}
          <div className="grid grid-cols-3 gap-4 mt-4 text-center">
            <div>
              <p className="text-xs text-text-muted">Net IRR</p>
              <p className="font-mono font-bold text-lg">{(carryWaterfallData.netIrr * 100).toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Gross MOIC</p>
              <p className="font-mono font-bold text-lg">{carryWaterfallData.grossMoic.toFixed(2)}x</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">DPI</p>
              <p className="font-mono font-bold text-lg">{carryWaterfallData.dpi.toFixed(2)}x</p>
            </div>
          </div>
          {/* Strategy archetype line */}
          <p className="text-sm text-text-muted mt-3">Playstyle: {archetypeDisplay}</p>
        </div>
      </div>
    </div>
  );
}
