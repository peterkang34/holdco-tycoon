import { useState } from 'react';
import {
  Business,
  OperationalImprovementType,
  formatMoney,
} from '../../engine/types';
import { SECTORS } from '../../data/sectors';
import { IMPROVEMENT_COST_FLOOR } from '../../data/gameConfig';
import { Modal } from '../ui/Modal';

// Per-type improvement exit premiums (matches simulation.ts)
const IMPROVEMENT_EXIT_PREMIUMS: Record<string, number> = {
  operating_playbook: 0.15,
  pricing_model: 0.15,
  service_expansion: 0.15,
  fix_underperformance: 0.15,
  recurring_revenue_conversion: 0.50,
  management_professionalization: 0.30,
  digital_transformation: 0.15,
};

interface ImprovementModalProps {
  business: Business;
  cash: number;
  round: number;
  maxRounds: number;
  onImprove: (businessId: string, improvementType: OperationalImprovementType) => void;
  onClose: () => void;
}

export function ImprovementModal({
  business,
  cash,
  round,
  maxRounds,
  onImprove,
  onClose,
}: ImprovementModalProps) {
  const [showExplainer, setShowExplainer] = useState(false);
  const sector = SECTORS[business.sectorId];
  const appliedTypes = new Set(business.improvements.map(i => i.type));
  const remainingYears = maxRounds - round;

  const improvements: {
    type: OperationalImprovementType;
    name: string;
    description: string;
    costPercent: number;
    ebitdaBoostMin: number;
    ebitdaBoostMax: number;
    growthBoost: number;
    extraBenefit?: string;
    available: boolean;
    unavailableReason?: string;
  }[] = [
    {
      type: 'operating_playbook',
      name: 'Install Operating Playbook',
      description: 'Implement standardized processes and KPIs from your holdco playbook.',
      costPercent: 0.15,
      ebitdaBoostMin: 0.08,
      ebitdaBoostMax: 0.08,
      growthBoost: 0,
      extraBenefit: 'Reduced earnings volatility',
      available: !appliedTypes.has('operating_playbook'),
      unavailableReason: 'Already applied',
    },
    {
      type: 'pricing_model',
      name: 'Upgrade Pricing Model',
      description: 'Optimize pricing strategy to capture more value from customers.',
      costPercent: 0.10,
      ebitdaBoostMin: 0.05,
      ebitdaBoostMax: 0.12,
      growthBoost: 0.01,
      available: !appliedTypes.has('pricing_model'),
      unavailableReason: 'Already applied',
    },
    {
      type: 'service_expansion',
      name: 'Expand Service Line',
      description: 'Add complementary services to grow wallet share with existing customers.',
      costPercent: 0.20,
      ebitdaBoostMin: 0.10,
      ebitdaBoostMax: 0.18,
      growthBoost: 0,
      available: !appliedTypes.has('service_expansion'),
      unavailableReason: 'Already applied',
    },
    {
      type: 'fix_underperformance',
      name: 'Fix Underperformance',
      description: 'Address operational issues dragging down performance.',
      costPercent: 0.12,
      ebitdaBoostMin: Math.max(0, (business.peakEbitda * 0.8 - business.ebitda) / business.ebitda),
      ebitdaBoostMax: Math.max(0, (business.peakEbitda * 0.8 - business.ebitda) / business.ebitda),
      growthBoost: 0,
      available: !appliedTypes.has('fix_underperformance') && business.ebitda < business.peakEbitda * 0.8,
      unavailableReason: appliedTypes.has('fix_underperformance') ? 'Already applied' : 'Business is performing well',
    },
    {
      type: 'recurring_revenue_conversion',
      name: 'Convert to Recurring Revenue',
      description: 'Shift business model toward recurring/subscription revenue streams.',
      costPercent: 0.25,
      ebitdaBoostMin: 0,
      ebitdaBoostMax: 0,
      growthBoost: 0.03,
      extraBenefit: '-2ppt margin now, +0.50x exit premium',
      available: !appliedTypes.has('recurring_revenue_conversion'),
      unavailableReason: 'Already applied',
    },
    {
      type: 'management_professionalization',
      name: 'Professionalize Management',
      description: 'Install professional management layer with executive coaching and governance.',
      costPercent: 0.18,
      ebitdaBoostMin: 0.03,
      ebitdaBoostMax: 0.06,
      growthBoost: 0.01,
      extraBenefit: 'Upgrades operator quality, +0.30x exit premium',
      available: !appliedTypes.has('management_professionalization'),
      unavailableReason: 'Already applied',
    },
    {
      type: 'digital_transformation',
      name: 'Digital Transformation',
      description: 'Modernize operations with digital tools, automation, and data analytics.',
      costPercent: 0.22,
      ebitdaBoostMin: 0.04,
      ebitdaBoostMax: 0.08,
      growthBoost: 0.02,
      extraBenefit: 'Defends margins against drift',
      available: !appliedTypes.has('digital_transformation'),
      unavailableReason: 'Already applied',
    },
  ];

  const currentImprovementMultiple = Math.min(
    1.0,
    business.improvements.reduce((sum, imp) => sum + (IMPROVEMENT_EXIT_PREMIUMS[imp.type] || 0.15), 0)
  );
  const hasDeRiskingBonus = business.improvements.length >= 2;
  const totalImprovementTypes = improvements.length;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      header={
        <div className="flex items-center gap-3">
          <span className="text-2xl sm:text-3xl">{sector.emoji}</span>
          <div>
            <h3 className="text-lg sm:text-xl font-bold truncate">{business.name}</h3>
            <p className="text-text-muted">{business.subType}</p>
          </div>
        </div>
      }
      size="xl"
    >
        {/* Summary stats — single row on mobile, 3 cards on desktop */}
        <div className="hidden sm:grid grid-cols-3 gap-4 mb-6">
          <div className="card text-center">
            <p className="text-text-muted text-sm">Current EBITDA</p>
            <p className="text-2xl font-bold font-mono">{formatMoney(business.ebitda)}</p>
          </div>
          <div className="card text-center">
            <p className="text-text-muted text-sm">Improvements Applied</p>
            <p className="text-2xl font-bold font-mono">{business.improvements.length}/{totalImprovementTypes}</p>
          </div>
          <div className="card text-center">
            <p className="text-text-muted text-sm">Exit Multiple Bonus</p>
            <p className="text-2xl font-bold font-mono text-accent">
              +{(currentImprovementMultiple + (hasDeRiskingBonus ? 0.2 : 0)).toFixed(1)}x
            </p>
          </div>
        </div>
        <div className="sm:hidden card flex items-center justify-between gap-3 mb-4 py-2.5">
          <div className="text-center">
            <p className="text-[10px] text-text-muted">EBITDA</p>
            <p className="text-sm font-bold font-mono">{formatMoney(business.ebitda)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-text-muted">Applied</p>
            <p className="text-sm font-bold font-mono">{business.improvements.length}/{totalImprovementTypes}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-text-muted">Exit Bonus</p>
            <p className="text-sm font-bold font-mono text-accent">
              +{(currentImprovementMultiple + (hasDeRiskingBonus ? 0.2 : 0)).toFixed(1)}x
            </p>
          </div>
        </div>

        {/* How Improvements Work */}
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 mb-6">
          <button
            className="font-bold text-sm w-full text-left flex items-center justify-between md:cursor-default min-h-[44px] md:min-h-0"
            onClick={() => setShowExplainer(!showExplainer)}
            aria-expanded={showExplainer}
          >
            <span>How Improvements Work</span>
            <span className="md:hidden text-text-muted text-xs">{showExplainer ? '▲' : '▼'}</span>
          </button>
          <div className={`${showExplainer ? 'block' : 'hidden'} md:block mt-2`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-text-secondary">
              <div>
                <p className="text-text-primary font-medium mb-1">Immediate EBITDA Boost</p>
                <p>One-time cost produces an instant, permanent EBITDA increase that compounds with organic growth.</p>
              </div>
              <div>
                <p className="text-text-primary font-medium mb-1">Exit Multiple Impact</p>
                <p>Variable exit premium per improvement (0.15x-0.50x, max 1.0x total). At 2+ improvements, an additional +0.2x de-risking premium kicks in.</p>
              </div>
              <div>
                <p className="text-text-primary font-medium mb-1">One Per Business</p>
                <p>Each improvement type can only be applied once. All effects are permanent — they never expire.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Applied improvements */}
        {business.improvements.length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-text-muted font-medium mb-2 uppercase tracking-wide">Applied Improvements</p>
            <div className="flex flex-wrap gap-2">
              {business.improvements.map((imp, idx) => (
                <span key={idx} className="text-xs bg-accent/15 text-accent px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  <span>&#10003;</span>
                  {{ operating_playbook: 'Operating Playbook', pricing_model: 'Pricing Model', service_expansion: 'Service Expansion', fix_underperformance: 'Fix Underperformance', recurring_revenue_conversion: 'Recurring Revenue', management_professionalization: 'Professionalize Mgmt', digital_transformation: 'Digital Transformation' }[imp.type] || imp.type}
                  <span className="text-accent/60 ml-1">(Year {imp.appliedRound}, +{(imp.effect * 100).toFixed(0)}%)</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <h4 className="font-bold mb-4">Choose Improvement</h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {improvements.map((improvement) => {
            const cost = Math.max(IMPROVEMENT_COST_FLOOR, Math.round((Math.abs(business.ebitda) || 1) * improvement.costPercent));
            const canAfford = cash >= cost;
            const disabled = !improvement.available || !canAfford;

            // ROI calculations
            const avgBoost = (improvement.ebitdaBoostMin + improvement.ebitdaBoostMax) / 2;
            const ebitdaGainPerYear = Math.round(business.ebitda * avgBoost);
            const boostIsRange = improvement.ebitdaBoostMin !== improvement.ebitdaBoostMax;
            const paybackYears = ebitdaGainPerYear > 0 ? cost / ebitdaGainPerYear : Infinity;

            // Exit value impact: per-type premium, plus potential de-risking bonus
            const nextImprovementCount = business.improvements.length + 1;
            const typePremium = IMPROVEMENT_EXIT_PREMIUMS[improvement.type] || 0.15;
            const exitMultipleGain = Math.min(typePremium, 1.0 - currentImprovementMultiple) + (nextImprovementCount === 2 ? 0.2 : 0);
            const exitValueGain = Math.round(business.ebitda * exitMultipleGain);

            // Total value = remaining years of EBITDA gain + exit value gain
            const totalLifetimeValue = ebitdaGainPerYear * remainingYears + exitValueGain;
            const roiMultiple = cost > 0 ? totalLifetimeValue / cost : 0;

            return (
              <div
                key={improvement.type}
                className={`card ${disabled ? 'opacity-50' : 'cursor-pointer hover:border-accent'}`}
                onClick={() => {
                  if (!disabled) {
                    onImprove(business.id, improvement.type);
                  }
                }}
              >
                <h5 className="font-bold mb-2">{improvement.name}</h5>
                <p className="text-sm text-text-secondary mb-3">{improvement.description}</p>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Cost</span>
                    <span className={`font-mono ${!canAfford ? 'text-danger' : ''}`}>
                      {formatMoney(cost)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">EBITDA</span>
                    <span className="font-mono text-accent">
                      {boostIsRange
                        ? `+${formatMoney(Math.round(business.ebitda * improvement.ebitdaBoostMin))}-${formatMoney(Math.round(business.ebitda * improvement.ebitdaBoostMax))}`
                        : `+${formatMoney(ebitdaGainPerYear)}`
                      }/yr
                    </span>
                  </div>
                  {improvement.growthBoost > 0 && (
                    <div className="flex justify-between">
                      <span className="text-text-muted">Growth</span>
                      <span className="font-mono text-accent">+{(improvement.growthBoost * 100).toFixed(0)}%/yr</span>
                    </div>
                  )}
                  {improvement.extraBenefit && (
                    <div className="flex justify-between">
                      <span className="text-text-muted">Bonus</span>
                      <span className="text-text-secondary">{improvement.extraBenefit}</span>
                    </div>
                  )}
                  <div className="col-span-2 border-t border-white/10 pt-2 mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    <span className="text-text-muted">
                      Exit <span className="font-mono text-accent">+{exitMultipleGain.toFixed(2)}x</span>
                      {nextImprovementCount === 2 && ' (de-risk)'}
                    </span>
                    <span className="text-text-muted">
                      Payback <span className="font-mono">{paybackYears <= 1 ? '<1yr' : paybackYears < 10 ? `~${paybackYears.toFixed(1)}yr` : 'N/A'}</span>
                    </span>
                    <span className={`font-mono font-bold ${roiMultiple >= 2 ? 'text-accent' : roiMultiple >= 1 ? 'text-text-primary' : 'text-warning'}`}>
                      ROI {roiMultiple.toFixed(1)}x <span className="font-normal text-text-muted">({remainingYears}yr)</span>
                    </span>
                  </div>
                </div>

                <button
                  className={`w-full col-span-2 mt-2 text-sm ${disabled ? 'btn-secondary opacity-50 cursor-not-allowed' : 'btn-primary'}`}
                  disabled={disabled}
                >
                  {!improvement.available
                    ? improvement.unavailableReason || 'Not Available'
                    : !canAfford
                    ? 'Not Enough Cash'
                    : 'Apply Improvement'}
                </button>
              </div>
            );
          })}
        </div>

        <div className="hidden md:block mt-6 p-4 bg-white/5 rounded-lg text-sm text-text-muted">
          <p className="font-medium text-text-secondary mb-1">Operational Improvement Tip</p>
          <p>Improvements are the highest-ROI capital allocation move: the EBITDA boost compounds every year through organic growth, and each improvement increases your exit multiple. Danaher's DBS proves this — operational improvement is reinvestment that never depreciates.</p>
        </div>
    </Modal>
  );
}
