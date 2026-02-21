import { useState } from 'react';
import { Deal, DealHeat, SellerArchetype, formatMoney, Business } from '../../engine/types';
import { SECTORS } from '../../data/sectors';
import { getSizeRatioTier } from '../../engine/businesses';
import { Tooltip } from '../ui/Tooltip';

interface DealCardProps {
  deal: Deal;
  onSelect?: () => void;
  disabled?: boolean;
  unaffordable?: boolean;
  availablePlatforms?: Business[]; // Platforms in the same sector that can receive this as a tuck-in
  isPassed?: boolean;
  onPass?: () => void;
  collapsible?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
}

export function DealCard({ deal, onSelect, disabled, unaffordable, availablePlatforms = [], isPassed, onPass, collapsible, isExpanded, onToggle }: DealCardProps) {
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

  const getArchetypeBadge = (archetype?: SellerArchetype) => {
    switch (archetype) {
      case 'retiring_founder': return { label: 'Retiring', color: 'bg-blue-500/20 text-blue-400', tip: 'Founder ready to hand over the keys. Fair price, stable business, smooth transition.' };
      case 'burnt_out_operator': return { label: 'Burnt Out', color: 'bg-orange-500/20 text-orange-400', tip: 'Owner is exhausted and wants out. Expect a discount, but the business may need operational attention.' };
      case 'accidental_holdco': return { label: 'Divestiture', color: 'bg-purple-500/20 text-purple-400', tip: 'Parent company shedding a non-core division. Slight premium, but clean separation.' };
      case 'distressed_seller': return { label: 'Distressed', color: 'bg-red-500/20 text-red-400', tip: 'Seller under financial pressure. Steep discount, but expect weak operations and higher risk.' };
      case 'mbo_candidate': return { label: 'MBO', color: 'bg-green-500/20 text-green-400', tip: 'Management buyout — strong operator team already in place. Fair price with built-in leadership.' };
      case 'franchise_breakaway': return { label: 'Ex-Franchise', color: 'bg-teal-500/20 text-teal-400', tip: 'Former franchisee going independent. Slight premium, but comes with entrepreneurial energy and higher growth.' };
      default: return null;
    }
  };
  const archetypeBadge = getArchetypeBadge(deal.sellerArchetype);

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

  // Collapsible: collapsed state — compact one-line summary
  if (collapsible && !isExpanded) {
    return (
      <div
        className={`card flex items-center gap-2 py-2 cursor-pointer hover:border-accent/50 transition-colors ${disabled ? 'opacity-50' : unaffordable ? 'opacity-65' : ''}`}
        style={{ borderLeftColor: sector.color, borderLeftWidth: '3px' }}
        onClick={onToggle}
      >
        <span className="text-xl shrink-0">{sector.emoji}</span>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{deal.business.name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${acquisitionBadge.color}`}>
            {acquisitionBadge.label}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${heatBadge.color}`}>
            {heatBadge.label}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-sm font-bold">{formatMoney(deal.effectivePrice)}</span>
          <span className="text-xs text-text-muted font-mono">{formatMoney(deal.business.ebitda)}</span>
          <span className={`text-[10px] font-mono font-bold px-1 py-0.5 rounded ${
            qualityRating >= 4 ? 'bg-accent/20 text-accent' :
            qualityRating === 3 ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-danger/20 text-danger'
          }`}>Q{qualityRating}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
            deal.freshness === 1 ? 'bg-warning/20 text-warning' : 'bg-white/10 text-text-muted'
          }`}>
            {deal.freshness === 1 ? '!' : `${deal.freshness}y`}
          </span>
          <span className="text-text-muted text-xs">▼</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`card transition-all ${disabled ? 'opacity-50' : unaffordable ? 'opacity-65 cursor-pointer hover:border-accent/50' : 'cursor-pointer hover:border-accent'}`}
      style={{ borderTopColor: sector.color, borderTopWidth: '3px' }}
      onClick={!disabled ? onSelect : undefined}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {collapsible && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle?.();
              }}
              className="text-text-muted hover:text-text-secondary transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2"
              aria-label="Collapse card"
            >
              ▲
            </button>
          )}
          <span className="text-2xl">{sector.emoji}</span>
          <div>
            <h3 className="font-bold truncate">{deal.business.name}</h3>
            <p className="text-xs text-text-muted truncate">{deal.business.subType}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5 sm:gap-1">
          <div className="flex items-center gap-1">
            <Tooltip
              trigger={<span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded ${heatBadge.color} ${heatBadge.pulse ? 'animate-pulse' : ''}`}>{heatBadge.label}</span>}
              align="right"
              width="w-48"
            >
              {heatBadge.tip}
            </Tooltip>
            <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded ${acquisitionBadge.color}`}>
              {acquisitionBadge.label}
            </span>
          </div>
          {archetypeBadge && (
            <Tooltip
              trigger={<span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded ${archetypeBadge.color}`}>{archetypeBadge.label}</span>}
              align="right"
              width="w-56"
            >
              {archetypeBadge.tip}
            </Tooltip>
          )}
          <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded ${
            deal.freshness === 1 ? 'bg-warning/20 text-warning' : 'bg-white/10 text-text-muted'
          }`}>
            {freshnessLabel}
          </span>
        </div>
      </div>

      {/* Tuck-in indicator */}
      {canTuckIn && (() => {
        const bestTier = availablePlatforms.reduce((best, p) => {
          const { tier } = getSizeRatioTier(deal.business.ebitda, p.ebitda);
          const rank = { ideal: 0, stretch: 1, strained: 2, overreach: 3 };
          return rank[tier] < rank[best] ? tier : best;
        }, 'overreach' as 'ideal' | 'stretch' | 'strained' | 'overreach');
        const sizeWarning = bestTier === 'strained' || bestTier === 'overreach';
        return (
          <div className={`${sizeWarning ? 'bg-warning/10 border-warning/30' : 'bg-accent-secondary/10 border-accent-secondary/30'} border rounded-lg p-1.5 sm:p-2 mb-3`}>
            <p className={`text-[10px] sm:text-xs ${sizeWarning ? 'text-warning' : 'text-accent-secondary'}`}>
              Can be tucked into: {availablePlatforms.map(p => p.name).join(', ')}
              {sizeWarning && ' (!) oversized for available platforms'}
            </p>
          </div>
        );
      })()}

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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
        <div>
          <p className="text-xs text-text-muted">Revenue</p>
          <p className="font-mono font-bold text-base sm:text-lg">{formatMoney(deal.business.revenue)}</p>
          <p className="text-xs text-text-muted">+{(deal.business.revenueGrowthRate * 100).toFixed(0)}%/yr</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">EBITDA</p>
          <p className="font-mono font-bold text-base sm:text-lg">{formatMoney(deal.business.ebitda)}</p>
          <p className="text-xs text-text-muted">{(deal.business.ebitdaMargin * 100).toFixed(0)}% margin</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Asking Price</p>
          <p className="font-mono font-bold text-base sm:text-lg">{formatMoney(deal.effectivePrice)}</p>
          <p className="text-xs text-text-muted">{deal.business.acquisitionMultiple.toFixed(1)}x EBITDA</p>
          {hasHeatPremium && (
            <Tooltip
              trigger={
                <span className="text-xs text-text-muted inline-flex items-center gap-1">
                  <span className="line-through">{formatMoney(deal.askingPrice)}</span>
                  <span className="text-warning">+{premiumPct}%</span>
                </span>
              }
              align="left"
              width="w-52"
            >
              Competitive premium: other buyers are bidding up the price. Sourced and off-market deals face less competition.
            </Tooltip>
          )}
        </div>
        <div>
          <p className="text-xs text-text-muted">Quality</p>
          <Tooltip
            trigger={
              <span className="font-mono font-bold text-base sm:text-lg">
                {'★'.repeat(qualityRating)}{'☆'.repeat(5 - qualityRating)}
              </span>
            }
            align="right"
            width="w-56"
          >
            <p className="font-medium text-text-primary mb-1">
              {qualityRating === 1 ? 'Struggling Business' :
               qualityRating === 2 ? 'Below Average' :
               qualityRating === 3 ? 'Solid Performer' :
               qualityRating === 4 ? 'Well-Run Business' : 'Best-in-Class'}
            </p>
            <div className="space-y-1 text-text-muted">
              <p>Exit multiple: <span className={`font-mono ${(qualityRating - 3) * 0.4 >= 0 ? 'text-accent' : 'text-danger'}`}>
                {(qualityRating - 3) * 0.4 >= 0 ? '+' : ''}{((qualityRating - 3) * 0.4).toFixed(1)}x
              </span></p>
              <p>Integration: <span className="text-text-secondary">
                {qualityRating >= 4 ? 'easier success' : qualityRating <= 2 ? 'higher failure risk' : 'standard odds'}
              </span></p>
              {qualityRating >= 3 && <p className="text-accent">Eligible for earn-out deals</p>}
              {qualityRating <= 2 && <p className="text-danger">Larger tuck-in discounts available</p>}
            </div>
            <p className="text-[10px] text-text-muted mt-1.5 pt-1.5 border-t border-white/10">
              Affects exit valuation, bolt-on integration, and deal heat.
            </p>
          </Tooltip>
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

      <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-white/10">
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
            unaffordable ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-warning bg-warning/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                  Need {formatMoney(deal.effectivePrice * 0.25)}
                </span>
                <button className="btn-primary text-sm py-1.5 px-3 sm:px-4 opacity-80">
                  Review
                </button>
              </div>
            ) : (
              <button className="btn-primary text-sm py-1.5 px-4">
                Review Deal
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
