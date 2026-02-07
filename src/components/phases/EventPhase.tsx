import { GameEvent } from '../../engine/types';
import { EventCard } from '../cards/EventCard';

interface EventPhaseProps {
  event: GameEvent | null;
  onAcceptOffer: () => void;
  onDeclineOffer: () => void;
  onContinue: () => void;
}

export function EventPhase({ event, onAcceptOffer, onDeclineOffer, onContinue }: EventPhaseProps) {
  if (!event) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center">
        <p className="text-text-muted mb-4">No event this year.</p>
        <button onClick={onContinue} className="btn-primary">
          Continue to Allocate →
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-2">Market Event</h2>
        <p className="text-text-secondary">Economic conditions affect your portfolio</p>
      </div>

      <EventCard
        event={event}
        onAcceptOffer={event.type === 'unsolicited_offer' ? onAcceptOffer : undefined}
        onDeclineOffer={event.type === 'unsolicited_offer' ? onDeclineOffer : undefined}
        onContinue={event.type !== 'unsolicited_offer' ? onContinue : undefined}
      />
    </div>
  );
}
