import { GameEvent, EventImpact, BuyerProfile, formatMoney, formatPercent } from '../../engine/types';

interface EventCardProps {
  event: GameEvent;
  onAcceptOffer?: () => void;
  onDeclineOffer?: () => void;
  onContinue?: () => void;
}

export function EventCard({ event, onAcceptOffer, onDeclineOffer, onContinue }: EventCardProps) {
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
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">
                  {impact.businessName || (impact.metric === 'interestRate' ? 'Interest Rate' : impact.metric === 'cash' ? 'Cash' : 'Portfolio')}
                </span>
                <div className="flex items-center gap-3">
                  {impact.metric === 'interestRate' ? (
                    <>
                      <span className="text-text-muted font-mono">{formatPercent(impact.before)}</span>
                      <span className="text-text-muted">→</span>
                      <span className="font-mono font-bold">{formatPercent(impact.after)}</span>
                      <span className={`font-mono text-xs px-2 py-0.5 rounded ${impact.delta > 0 ? 'bg-danger/20 text-danger' : 'bg-accent/20 text-accent'}`}>
                        {impact.delta > 0 ? '+' : ''}{formatPercent(impact.delta)}
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

      {event.tip && (
        <div className="bg-white/5 p-3 rounded-lg mb-4 border-l-2 border-accent">
          <p className="text-sm text-text-secondary italic">
            {event.tip}
          </p>
          {event.tipSource && (
            <p className="text-xs text-text-muted mt-1">— {event.tipSource}</p>
          )}
        </div>
      )}

      {event.type === 'unsolicited_offer' && onAcceptOffer && onDeclineOffer ? (
        <div>
          {event.buyerProfile && (
            <div className="bg-white/5 rounded-lg p-4 mb-4 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-sm">{event.buyerProfile.name}</span>
                <span className="text-xs bg-white/10 text-text-secondary px-2 py-0.5 rounded">
                  {event.buyerProfile.type === 'strategic' ? 'Strategic' :
                   event.buyerProfile.type === 'individual' ? 'Individual' :
                   event.buyerProfile.type === 'family_office' ? 'Family Office' :
                   event.buyerProfile.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
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
          <div className="flex gap-3">
            <button
              onClick={onDeclineOffer}
              className="btn-secondary flex-1"
            >
              Decline
            </button>
            <button
              onClick={onAcceptOffer}
              className="btn-primary flex-1"
            >
              Accept {event.offerAmount ? formatMoney(event.offerAmount) : ''}
            </button>
          </div>
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
