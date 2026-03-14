import { useState } from 'react';
import { formatMoney } from '../../engine/types';
import type { CarryWaterfall } from '../../engine/types';
import type { LPSpeaker } from '../../data/lpCommentary';

interface CarryWaterfallSectionProps {
  carryWaterfallData: CarryWaterfall;
  outcomeReactions: { speaker: LPSpeaker; text: string }[] | null;
}

export function CarryWaterfallSection({
  carryWaterfallData,
  outcomeReactions,
}: CarryWaterfallSectionProps) {
  const [waterfallStep, setWaterfallStep] = useState(0);
  const maxWaterfallSteps = carryWaterfallData.hurdleCleared ? 7 : 4;

  return (
    <div className="card mb-6 border-purple-500/20">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-purple-300">Carry Waterfall</h2>
        {waterfallStep < maxWaterfallSteps && (
          <button
            onClick={() => setWaterfallStep(maxWaterfallSteps)}
            className="text-xs text-text-muted hover:text-text-secondary"
          >
            Show All
          </button>
        )}
      </div>
      <div className="space-y-3">
        {/* Step 1: Total Fund Value */}
        {waterfallStep >= 1 && (
          <div className="bg-white/5 rounded-lg p-3 border-l-2 border-purple-400">
            <p className="text-sm font-medium mb-1">Step 1: Total Fund Value</p>
            <p className="text-xs text-text-muted">Your fund generated {formatMoney(Math.round(carryWaterfallData.grossTotalReturns))} in total value over 10 years.</p>
            <p className="text-xs text-text-muted">Distributed to LPs: {formatMoney(Math.round(carryWaterfallData.lpDistributions))} | At liquidation: {formatMoney(Math.round(carryWaterfallData.liquidationProceeds))}</p>
          </div>
        )}
        {/* Step 2: Return of Capital */}
        {waterfallStep >= 2 && (
          <div className="bg-white/5 rounded-lg p-3 border-l-2 border-purple-400">
            <p className="text-sm font-medium mb-1">Step 2: Return of Capital</p>
            <p className="text-xs text-text-muted">LPs get their {formatMoney(carryWaterfallData.returnOfCapital)} back first.</p>
            <p className="text-xs text-text-muted">Profits: {formatMoney(Math.round(Math.max(0, carryWaterfallData.grossTotalReturns - carryWaterfallData.returnOfCapital)))}</p>
          </div>
        )}
        {/* Step 3: Preferred Return */}
        {waterfallStep >= 3 && (
          <div className={`bg-white/5 rounded-lg p-3 border-l-2 ${carryWaterfallData.hurdleCleared ? 'border-green-400' : 'border-red-400'}`}>
            <p className="text-sm font-medium mb-1">Step 3: Preferred Return (The Hurdle)</p>
            <p className="text-xs text-text-muted">LPs are entitled to 8% annually for 10 years = {formatMoney(Math.round(carryWaterfallData.hurdleAmount))}.</p>
            {carryWaterfallData.hurdleCleared ? (
              <p className="text-xs font-bold text-green-400">You CLEARED the hurdle by {formatMoney(Math.round(carryWaterfallData.aboveHurdle))}!</p>
            ) : (
              <p className="text-xs font-bold text-red-400">You did not clear the hurdle. Carried interest: $0.</p>
            )}
          </div>
        )}
        {/* Step 4: Your Carry (only if hurdle cleared) */}
        {waterfallStep >= 4 && carryWaterfallData.hurdleCleared && (() => {
          const tierLabel = carryWaterfallData.irrMultiplier >= 1.30 ? 'Legendary'
            : carryWaterfallData.irrMultiplier >= 1.20 ? 'Exceptional'
            : carryWaterfallData.irrMultiplier >= 1.10 ? 'Top Quartile'
            : carryWaterfallData.irrMultiplier >= 1.00 ? 'Solid'
            : carryWaterfallData.irrMultiplier >= 0.85 ? 'Below Median'
            : 'Poor';
          const tierColor = carryWaterfallData.irrMultiplier > 1.0 ? 'text-green-400'
            : carryWaterfallData.irrMultiplier >= 1.0 ? 'text-purple-300'
            : 'text-amber-400';
          return (
            <div className="bg-purple-500/10 rounded-lg p-3 border-l-2 border-purple-400">
              <p className="text-sm font-medium mb-1 text-purple-300">Step 4: Your Carry</p>
              <p className="text-xs text-text-muted">Base carry (20% of above-hurdle): {formatMoney(Math.round(carryWaterfallData.aboveHurdle))} x 20% = {formatMoney(Math.round(carryWaterfallData.baseCarry))}</p>
              <p className="text-xs text-text-muted">
                IRR Multiplier: <span className={`font-bold ${tierColor}`}>{carryWaterfallData.irrMultiplier.toFixed(2)}x</span>
                {' '}({tierLabel})
              </p>
              <p className="text-xs font-bold text-purple-300">Adjusted Carry: {formatMoney(Math.round(carryWaterfallData.carry))}</p>
              <p className="text-xs text-text-muted mt-1">Management fees earned: {formatMoney(Math.round(carryWaterfallData.managementFees))}</p>
              <p className="text-xs font-bold text-purple-300">Total GP Economics: {formatMoney(Math.round(carryWaterfallData.totalGpEconomics))}</p>
            </div>
          );
        })()}
        {/* Step 5: Supercarry Tier (only if hurdle cleared) */}
        {waterfallStep >= 5 && carryWaterfallData.hurdleCleared && (() => {
          const mult = carryWaterfallData.irrMultiplier;
          const bonusPct = Math.round((mult - 1.0) * 100);
          return (
            <div className={`bg-white/5 rounded-lg p-3 border-l-2 ${mult > 1.0 ? 'border-green-400' : mult < 1.0 ? 'border-amber-400' : 'border-white/20'}`}>
              <p className="text-sm font-medium mb-1">Step 5: Supercarry</p>
              {mult > 1.0 && (
                <p className="text-xs text-green-400">Your early distributions boosted carry by {bonusPct}%.</p>
              )}
              {mult < 1.0 && (
                <p className="text-xs text-amber-400">Distributing earlier would have increased carry.</p>
              )}
              {mult === 1.0 && (
                <p className="text-xs text-text-muted">Baseline multiplier — solid IRR performance.</p>
              )}
              <p className="text-xs text-text-muted mt-1">Net MOIC to LPs: {((carryWaterfallData.grossTotalReturns - carryWaterfallData.carry) / (carryWaterfallData.returnOfCapital || 1)).toFixed(2)}x</p>
            </div>
          );
        })()}
        {/* Step 6: What If? (only if hurdle cleared) */}
        {waterfallStep >= 6 && carryWaterfallData.hurdleCleared && (
          <div className="bg-white/5 rounded-lg p-3 border-l-2 border-white/20">
            <p className="text-sm font-medium mb-1">Step 6: What If?</p>
            <p className="text-xs text-text-muted">At 3.5x MOIC: Carry = {formatMoney(Math.round(Math.max(0, (350_000 - carryWaterfallData.hurdleAmount) * 0.20)))}</p>
            <p className="text-xs text-text-muted">At 2.0x MOIC: Carry = {200_000 > carryWaterfallData.hurdleAmount ? formatMoney(Math.round((200_000 - carryWaterfallData.hurdleAmount) * 0.20)) : '$0 (below hurdle)'}</p>
            <p className="text-xs text-text-muted">Net MOIC to LPs: {((carryWaterfallData.grossTotalReturns - carryWaterfallData.carry) / (carryWaterfallData.returnOfCapital || 1)).toFixed(2)}x</p>
          </div>
        )}
        {/* Step 7: LP Reactions (outcome-based) */}
        {waterfallStep >= (carryWaterfallData.hurdleCleared ? 7 : 4) && outcomeReactions && outcomeReactions.length > 0 && (
          <div className="bg-white/5 rounded-lg p-3 border-l-2 border-blue-400">
            <p className="text-sm font-medium mb-2">LP Reactions</p>
            {outcomeReactions.map((lp, i) => (
              <div key={i} className="flex items-start gap-2 mb-2">
                <span className={`w-6 h-6 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 ${lp.speaker === 'edna' ? 'bg-blue-500/30 text-blue-300' : 'bg-amber-500/30 text-amber-300'}`}>
                  {lp.speaker === 'edna' ? 'EM' : 'CH'}
                </span>
                <p className="text-xs text-text-muted italic">"{lp.text}"</p>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Step progression button */}
      {waterfallStep < maxWaterfallSteps && (
        <button
          onClick={() => setWaterfallStep(s => s + 1)}
          className="w-full mt-4 px-4 py-2 rounded-lg font-medium bg-purple-600 text-white hover:bg-purple-500 transition-colors text-sm"
        >
          {waterfallStep === 0 ? 'Reveal Waterfall' : 'Next Step'} ({waterfallStep + 1}/{maxWaterfallSteps})
        </button>
      )}
    </div>
  );
}
