import { GameEvent, Business, formatMoney, formatPercent } from '../../engine/types';
import { calculateExitValuation } from '../../engine/simulation';
import { SECTORS } from '../../data/sectors';

interface EventCardProps {
  event: GameEvent;
  businesses?: Business[];
  currentRound?: number;
  lastEventType?: string;
  onChoice?: (action: string) => void;
  onContinue?: () => void;
}

export function EventCard({ event, businesses, currentRound, lastEventType, onChoice, onContinue }: EventCardProps) {
  const getEventIcon = () => {
    switch (event.type) {
      case 'global_bull_market':
        return '📈';
      case 'global_recession':
        return '📉';
      case 'global_interest_hike':
        return '🏦';
      case 'global_interest_cut':
        return '💵';
      case 'global_inflation':
        return '💸';
      case 'global_credit_tightening':
        return '🔒';
      case 'portfolio_star_joins':
        return '⭐';
      case 'portfolio_talent_leaves':
        return '🚪';
      case 'portfolio_client_signs':
        return '🤝';
      case 'portfolio_client_churns':
        return '😔';
      case 'portfolio_breakthrough':
        return '💡';
      case 'portfolio_compliance':
        return '⚠️';
      case 'portfolio_referral_deal':
        return '🤝';
      case 'portfolio_equity_demand':
        return '👤';
      case 'portfolio_seller_note_renego':
        return '📝';
      case 'unsolicited_offer':
        return '💰';
      case 'sector_event':
        return '📊';
      default:
        return '📋';
    }
  };

  const isPositive = event.type === 'global_bull_market' ||
    event.type === 'global_interest_cut' ||
    event.type === 'portfolio_star_joins' ||
    event.type === 'portfolio_client_signs' ||
    event.type === 'portfolio_breakthrough' ||
    event.type === 'portfolio_referral_deal' ||
    (event.type === 'sector_event' && !event.effect.includes('-'));

  const isNegative = event.type === 'global_recession' ||
    event.type === 'global_interest_hike' ||
    event.type === 'global_inflation' ||
    event.type === 'global_credit_tightening' ||
    event.type === 'portfolio_talent_leaves' ||
    event.type === 'portfolio_client_churns' ||
    event.type === 'portfolio_compliance' ||
    (event.type === 'sector_event' && event.effect.includes('-'));

  const borderColor = event.type === 'global_quiet' ? 'border-white/20' :
    isPositive ? 'border-accent' : isNegative ? 'border-danger' : 'border-warning';

  return (
    <div className={`card max-w-lg mx-auto border-2 ${borderColor}`}>
      <div className="text-center mb-4">
        <span className="text-5xl mb-3 block">{getEventIcon()}</span>
        <h2 className="text-2xl font-bold mb-2">{event.title}</h2>
        <p className="text-text-secondary">{event.description}</p>
      </div>

      {/* AI-Generated Narrative */}
      {event.narrative && (
        <div className="bg-gradient-to-r from-white/5 to-transparent p-4 rounded-lg mb-4 border-l-2 border-accent/50">
          <p className="text-sm text-text-primary italic leading-relaxed">
            "{event.narrative}"
          </p>
        </div>
      )}

      <div className={`p-4 rounded-lg mb-4 ${isPositive ? 'bg-accent/10' : isNegative ? 'bg-danger/10' : 'bg-white/5'}`}>
        <p className={`text-sm font-medium ${isPositive ? 'text-accent' : isNegative ? 'text-danger' : 'text-text-primary'}`}>
          {event.effect}
        </p>
      </div>

      {/* Impact Summary */}
      {event.impacts && event.impacts.length > 0 && (
        <div className="bg-white/5 rounded-lg p-4 mb-4">
          <p className="text-xs text-text-muted font-medium mb-3 uppercase tracking-wide">Impact Summary</p>
          <div className="space-y-2">
            {event.impacts.map((impact, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-1 sm:gap-0">
                <span className="text-text-secondary">
                  {impact.businessName
                    ? `${impact.businessName}${impact.metric === 'revenue' ? ' Rev' : impact.metric === 'margin' ? ' Margin' : ''}`
                    : (impact.metric === 'interestRate' ? 'Interest Rate' : impact.metric === 'cash' ? 'Cash' : impact.metric === 'revenue' ? 'Revenue' : impact.metric === 'margin' ? 'Margin' : 'Portfolio')}
                </span>
                <div className="flex items-center gap-3">
                  {impact.metric === 'interestRate' || impact.metric === 'margin' ? (
                    <>
                      <span className="text-text-muted font-mono">
                        {impact.metric === 'margin' ? `${(impact.before * 100).toFixed(1)}%` : formatPercent(impact.before)}
                      </span>
                      <span className="text-text-muted">→</span>
                      <span className="font-mono font-bold">
                        {impact.metric === 'margin' ? `${(impact.after * 100).toFixed(1)}%` : formatPercent(impact.after)}
                      </span>
                      <span className={`font-mono text-xs px-2 py-0.5 rounded ${impact.delta > 0 ? (impact.metric === 'margin' ? 'bg-accent/20 text-accent' : 'bg-danger/20 text-danger') : (impact.metric === 'margin' ? 'bg-danger/20 text-danger' : 'bg-accent/20 text-accent')}`}>
                        {impact.delta > 0 ? '+' : ''}{impact.metric === 'margin' ? `${(impact.delta * 100).toFixed(1)}ppt` : formatPercent(impact.delta)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-text-muted font-mono">{formatMoney(impact.before)}</span>
                      <span className="text-text-muted">→</span>
                      <span className="font-mono font-bold">{formatMoney(impact.after)}</span>
                      <span className={`font-mono text-xs px-2 py-0.5 rounded ${impact.delta >= 0 ? 'bg-accent/20 text-accent' : 'bg-danger/20 text-danger'}`}>
                        {impact.delta >= 0 ? '+' : ''}{formatMoney(impact.delta)}
                        {impact.deltaPercent !== undefined && ` (${impact.deltaPercent >= 0 ? '+' : ''}${(impact.deltaPercent * 100).toFixed(0)}%)`}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Business Summary (unsolicited offers) */}
      {event.type === 'unsolicited_offer' && businesses && currentRound && (() => {
        const business = businesses.find(b => b.id === event.affectedBusinessId);
        if (!business) return null;
        const sector = SECTORS[business.sectorId];
        const valuation = calculateExitValuation(business, currentRound, lastEventType);
        const totalInvested = business.totalAcquisitionCost || business.acquisitionPrice;
        const offerAmount = event.offerAmount ?? 0;
        const premiumPct = valuation.exitPrice > 0
          ? ((offerAmount - valuation.exitPrice) / valuation.exitPrice) * 100
          : 0;
        const gainVsInvested = totalInvested > 0
          ? ((offerAmount - totalInvested) / totalInvested) * 100
          : 0;
        const fcf = business.ebitda * (1 - sector.capexRate);

        return (
          <div className="bg-white/5 rounded-lg p-4 mb-4 border border-white/10">
            <p className="text-xs text-text-muted font-medium mb-3 uppercase tracking-wide">Business Being Solicited</p>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">{sector.emoji}</span>
              <div>
                <span className="font-bold text-sm">{business.name}</span>
                <span className="text-xs text-text-muted ml-2">{business.subType}</span>
              </div>
              <div className="ml-auto flex">
                {Array(5).fill(0).map((_, i) => (
                  <span key={i} className={`text-xs ${i < business.qualityRating ? 'text-yellow-400' : 'text-white/20'}`}>★</span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center mb-3">
              <div>
                <p className="text-xs text-text-muted">Revenue</p>
                <p className="font-mono text-sm font-medium">{formatMoney(business.revenue)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">EBITDA</p>
                <p className="font-mono text-sm font-medium">{formatMoney(business.ebitda)}</p>
                <p className="text-[10px] text-text-muted">{(business.ebitdaMargin * 100).toFixed(0)}% margin</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Annual FCF</p>
                <p className="font-mono text-sm font-medium">{formatMoney(fcf)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center mb-3">
              <div>
                <p className="text-xs text-text-muted">Est. Exit Value</p>
                <p className="font-mono text-sm font-medium">{formatMoney(valuation.exitPrice)}</p>
                <p className="text-[10px] text-text-muted">{valuation.totalMultiple.toFixed(1)}x multiple</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">You Invested</p>
                <p className="font-mono text-sm font-medium">{formatMoney(totalInvested)}</p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <div className="text-xs">
                <span className="text-text-muted">vs. Invested: </span>
                <span className={`font-mono font-medium ${gainVsInvested >= 0 ? 'text-accent' : 'text-danger'}`}>
                  {gainVsInvested >= 0 ? '+' : ''}{gainVsInvested.toFixed(0)}%
                </span>
              </div>
              <div className="text-xs">
                <span className="text-text-muted">vs. Est. Value: </span>
                <span className={`font-mono font-bold px-1.5 py-0.5 rounded ${premiumPct >= 0 ? 'bg-accent/20 text-accent' : 'bg-danger/20 text-danger'}`}>
                  {premiumPct >= 0 ? '+' : ''}{premiumPct.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Buyer Profile (unsolicited offers) */}
      {event.buyerProfile && (
        <div className="bg-white/5 rounded-lg p-4 mb-4 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-bold text-sm">{event.buyerProfile.name}</span>
            <span className="text-xs bg-white/10 text-text-secondary px-2 py-0.5 rounded">
              {event.buyerProfile.type === 'strategic' ? 'Strategic' :
               event.buyerProfile.type === 'individual' ? 'Individual' :
               event.buyerProfile.type === 'family_office' ? 'Family Office' :
               event.buyerProfile.type === 'small_pe' ? 'Small PE' :
               event.buyerProfile.type === 'lower_middle_pe' ? 'Lower Middle PE' :
               event.buyerProfile.type === 'institutional_pe' ? 'Institutional PE' :
               event.buyerProfile.type === 'large_pe' ? 'Large PE' :
               event.buyerProfile.type}
            </span>
            {event.buyerProfile.isStrategic && (
              <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded">Strategic Buyer</span>
            )}
          </div>
          {event.buyerProfile.fundSize && (
            <p className="text-xs text-text-muted mb-1">{event.buyerProfile.fundSize}</p>
          )}
          <p className="text-xs text-text-secondary italic leading-relaxed">
            "{event.buyerProfile.investmentThesis}"
          </p>
        </div>
      )}

      {/* Generalized choice buttons */}
      {event.choices && event.choices.length > 0 && onChoice ? (
        <div className="flex gap-3">
          {event.choices.map((choice, idx) => (
            <button
              key={idx}
              onClick={() => onChoice(choice.action)}
              className={`flex-1 ${
                choice.variant === 'positive' ? 'btn-primary' :
                choice.variant === 'negative' ? 'btn-secondary' :
                'btn-secondary'
              }`}
              title={choice.description}
            >
              {choice.label}
            </button>
          ))}
        </div>
      ) : (
        onContinue && (
          <button onClick={onContinue} className="btn-primary w-full">
            Continue
          </button>
        )
      )}
    </div>
  );
}
