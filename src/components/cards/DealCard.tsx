import { useState } from 'react';
import { Deal, DealHeat, formatMoney, formatPercent, Business } from '../../engine/types';
import { SECTORS } from '../../data/sectors';

interface DealCardProps {
  deal: Deal;
  onSelect?: () => void;
  disabled?: boolean;
  availablePlatforms?: Business[]; // Platforms in the same sector that can receive this as a tuck-in
  isPassed?: boolean;
  onPass?: () => void;
}

export function DealCard({ deal, onSelect, disabled, availablePlatforms = [], isPassed, onPass }: DealCardProps) {
  const [showStory, setShowStory] = useState(false);
  const sector = SECTORS[deal.business.sectorId];
  const { dueDiligence, qualityRating } = deal.business;

  const freshnessLabel = deal.freshness === 1 ? 'Expires next year' : `${deal.freshness} years left`;

  // Acquisition type badge styling
  const getAcquisitionTypeBadge = () => {
    switch (deal.acquisitionType) {
      case 'tuck_in':
        return { label: 'Tuck-In', color: 'bg-accent-secondary/20 text-accent-secondary' };
      case 'platform':
        return { label: 'Platform', color: 'bg-accent/20 text-accent' };
      default:
        return { label: 'Standalone', color: 'bg-white/10 text-text-muted' };
    }
  };

  const acquisitionBadge = getAcquisitionTypeBadge();
  const canTuckIn = deal.acquisitionType === 'tuck_in' && availablePlatforms.length > 0;

  const getHeatBadge = (heat: DealHeat) => {
    switch (heat) {
      case 'cold': return { label: 'Cold', color: 'bg-blue-500/20 text-blue-400', pulse: false, tip: 'Low buyer interest. No premium, no competition risk.' };
      case 'warm': return { label: 'Warm', color: 'bg-yellow-500/20 text-yellow-400', pulse: false, tip: 'Moderate interest. 10-15% premium over base price.' };
      case 'hot': return { label: 'Hot', color: 'bg-orange-500/20 text-orange-400', pulse: false, tip: 'Multiple buyers competing. 20-30% premium over base price.' };
      case 'contested': return { label: 'Contested', color: 'bg-red-500/20 text-red-400', pulse: true, tip: '30-50% premium and 40% chance another buyer snatches the deal before you close.' };
    }
  };
  const heatBadge = getHeatBadge(deal.heat);
  const hasHeatPremium = deal.effectivePrice > deal.askingPrice;
  const premiumPct = hasHeatPremium ? Math.round(((deal.effectivePrice / deal.askingPrice) - 1) * 100) : 0;

  const getSignalColor = (type: string, value: string) => {
    if (type === 'concentration') {
      return value === 'low' ? 'text-accent' : value === 'medium' ? 'text-warning' : 'text-danger';
    }
    if (type === 'operator') {
      return value === 'strong' ? 'text-accent' : value === 'moderate' ? 'text-text-secondary' : 'text-danger';
    }
    if (type === 'trend') {
      return value === 'growing' ? 'text-accent' : value === 'flat' ? 'text-text-secondary' : 'text-danger';
    }
    if (type === 'position') {
      return value === 'leader' ? 'text-accent' : value === 'competitive' ? 'text-text-secondary' : 'text-danger';
    }
    return 'text-text-secondary';
  };

  return (
    <div
      className={`card cursor-pointer transition-all ${disabled ? 'opacity-50' : 'hover:border-accent'}`}
      style={{ borderTopColor: sector.color, borderTopWidth: '3px' }}
      onClick={!disabled ? onSelect : undefined}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{sector.emoji}</span>
          <div>
            <h3 className="font-bold">{deal.business.name}</h3>
            <p className="text-xs text-text-muted">{deal.business.subType}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <span className="relative group/heat">
              <span className={`text-xs px-2 py-1 rounded cursor-help ${heatBadge.color} ${heatBadge.pulse ? 'animate-pulse' : ''}`}>
                {heatBadge.label}
              </span>
              <span className="absolute right-0 top-full mt-1 w-48 p-2 bg-bg-primary border border-white/10 rounded-lg shadow-xl text-xs text-text-secondary opacity-0 invisible group-hover/heat:opacity-100 group-hover/heat:visible transition-all z-50">
                {heatBadge.tip}
              </span>
            </span>
            <span className={`text-xs px-2 py-1 rounded ${acquisitionBadge.color}`}>
              {acquisitionBadge.label}
            </span>
          </div>
          <span className={`text-xs px-2 py-1 rounded ${
            deal.freshness === 1 ? 'bg-warning/20 text-warning' : 'bg-white/10 text-text-muted'
          }`}>
            {freshnessLabel}
          </span>
        </div>
      </div>

      {/* Tuck-in indicator */}
      {canTuckIn && (
        <div className="bg-accent-secondary/10 border border-accent-secondary/30 rounded-lg p-2 mb-3">
          <p className="text-xs text-accent-secondary">
            Can be tucked into: {availablePlatforms.map(p => p.name).join(', ')}
          </p>
        </div>
      )}

      {/* Tuck-in discount indicator */}
      {deal.tuckInDiscount && deal.tuckInDiscount > 0 && (
        <div className="bg-accent/10 border border-accent/30 rounded-lg p-2 mb-3">
          <p className="text-xs text-accent">
            {Math.round(deal.tuckInDiscount * 100)}% tuck-in discount applied
          </p>
        </div>
      )}

      {/* AI-generated story content */}
      {deal.aiContent && (
        <div className="mb-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowStory(!showStory);
            }}
            className="text-xs text-accent hover:underline flex items-center gap-1"
          >
            {showStory ? '▼' : '▶'} Company Story
          </button>
          {showStory && (
            <div className="mt-2 p-3 bg-white/5 rounded-lg text-xs space-y-2">
              <p className="text-text-secondary italic">"{deal.aiContent.backstory}"</p>
              <p className="text-text-muted">
                <span className="font-medium text-text-secondary">Why selling:</span> {deal.aiContent.sellerMotivation}
              </p>
              {deal.aiContent.quirks && deal.aiContent.quirks.length > 0 && (
                <div>
                  <span className="font-medium text-text-secondary">Notable:</span>
                  <ul className="list-disc list-inside text-text-muted mt-1">
                    {deal.aiContent.quirks.map((quirk, i) => (
                      <li key={i}>{quirk}</li>
                    ))}
                  </ul>
                </div>
              )}
              {deal.aiContent.redFlags && deal.aiContent.redFlags.length > 0 && (
                <div className="text-warning">
                  <span className="font-medium">Watch out:</span>
                  <ul className="list-disc list-inside mt-1">
                    {deal.aiContent.redFlags.map((flag, i) => (
                      <li key={i}>{flag}</li>
                    ))}
                  </ul>
                </div>
              )}
              {deal.aiContent.opportunities && deal.aiContent.opportunities.length > 0 && (
                <div className="text-accent">
                  <span className="font-medium">Upside potential:</span>
                  <ul className="list-disc list-inside mt-1">
                    {deal.aiContent.opportunities.map((opp, i) => (
                      <li key={i}>{opp}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div>
          <p className="text-xs text-text-muted">Revenue</p>
          <p className="font-mono font-bold text-lg">{formatMoney(deal.business.revenue)}</p>
          <p className="text-xs text-text-muted">+{(deal.business.revenueGrowthRate * 100).toFixed(0)}%/yr</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">EBITDA</p>
          <p className="font-mono font-bold text-lg">{formatMoney(deal.business.ebitda)}</p>
          <p className="text-xs text-text-muted">{(deal.business.ebitdaMargin * 100).toFixed(0)}% margin</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Asking Price</p>
          <p className="font-mono font-bold text-lg">{formatMoney(deal.effectivePrice)}</p>
          {hasHeatPremium ? (
            <p className="text-xs text-text-muted relative group/price inline-flex items-center gap-1 cursor-help">
              <span className="line-through">{formatMoney(deal.askingPrice)}</span>
              <span className="text-warning">+{premiumPct}%</span>
              <span className="absolute left-0 top-full mt-1 w-52 p-2 bg-bg-primary border border-white/10 rounded-lg shadow-xl text-xs text-text-secondary opacity-0 invisible group-hover/price:opacity-100 group-hover/price:visible transition-all z-50">
                Competitive premium: other buyers are bidding up the price. Sourced and off-market deals face less competition.
              </span>
            </p>
          ) : (
            <p className="text-xs text-text-muted">{deal.business.acquisitionMultiple.toFixed(1)}x EBITDA</p>
          )}
        </div>
        <div>
          <p className="text-xs text-text-muted">Quality</p>
          <p className="font-mono font-bold text-lg">
            {'★'.repeat(qualityRating)}{'☆'.repeat(5 - qualityRating)}
          </p>
        </div>
      </div>

      {/* Due Diligence Signals */}
      <div className="space-y-1.5 text-xs border-t border-white/10 pt-3">
        <p className="text-text-muted font-medium mb-2">Due Diligence Notes:</p>
        <p className={getSignalColor('concentration', dueDiligence.revenueConcentration)}>
          {dueDiligence.revenueConcentrationText}
        </p>
        <p className={getSignalColor('operator', dueDiligence.operatorQuality)}>
          {dueDiligence.operatorQualityText}
        </p>
        <p className={getSignalColor('trend', dueDiligence.trend)}>
          {dueDiligence.trendText}
        </p>
        <p className="text-text-secondary">
          {dueDiligence.customerRetentionText}
        </p>
        <p className={getSignalColor('position', dueDiligence.competitivePosition)}>
          {dueDiligence.competitivePositionText}
        </p>
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
        <div className="flex items-center gap-2">
          {deal.source === 'proprietary' && (
            <span className="text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">Off-Market</span>
          )}
          {deal.source === 'sourced' && (
            <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">Sourced</span>
          )}
          <span className="text-xs text-text-muted">
            {deal.source === 'inbound' ? 'Inbound' : deal.source === 'sourced' ? 'IB Sourced' : deal.source === 'proprietary' ? 'Proprietary' : 'Brokered'}
          </span>
          {deal.aiContent?.backstory && deal.aiContent.backstory.length > 100 && (
            <span className="text-xs bg-accent/20 text-accent px-1.5 py-0.5 rounded">AI</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onPass && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPass();
              }}
              className={`text-xs py-1.5 px-3 rounded transition-colors ${
                isPassed
                  ? 'bg-white/10 text-text-secondary hover:text-text-primary'
                  : 'text-text-muted hover:text-warning hover:bg-warning/10'
              }`}
            >
              {isPassed ? 'Restore' : 'Pass'}
            </button>
          )}
          {onSelect && !disabled && !isPassed && (
            <button className="btn-primary text-sm py-1.5 px-4">
              Review Deal
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
