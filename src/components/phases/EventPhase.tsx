import { GameEvent, Business, LPComment } from '../../engine/types';
import { EventCard } from '../cards/EventCard';

interface EventPhaseProps {
  event: GameEvent | null;
  businesses?: Business[];
  currentRound?: number;
  lastEventType?: string;
  onChoice: (action: string) => void;
  onContinue: () => void;
  isFundManagerMode?: boolean;
  lpCommentary?: LPComment[];
}

export function EventPhase({ event, businesses, currentRound, lastEventType, onChoice, onContinue, isFundManagerMode, lpCommentary }: EventPhaseProps) {
  // Get LP comments for this round (event reactions)
  const roundComments = isFundManagerMode && lpCommentary && currentRound
    ? lpCommentary.filter(c => c.round === currentRound)
    : [];
  // Only show the last comment (event reaction, not carryover from collect phase)
  const eventComment = roundComments.length > 0 ? roundComments[roundComments.length - 1] : null;

  if (!event) {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-6 text-center">
        <p className="text-text-muted mb-4">No event this year.</p>
        <button onClick={onContinue} className="btn-primary">
          Continue to Allocate →
        </button>
      </div>
    );
  }

  const hasChoices = !!(event.choices && event.choices.length > 0);

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-2">Market Event</h2>
        <p className="text-text-secondary">Economic conditions affect your portfolio</p>
      </div>

      <EventCard
        event={event}
        businesses={businesses}
        currentRound={currentRound}
        lastEventType={lastEventType}
        onChoice={hasChoices ? onChoice : undefined}
        onContinue={!hasChoices ? onContinue : undefined}
      />

      {/* LP Reaction to Event (Fund Mode) */}
      {eventComment && (
        <div className="mt-4 card flex items-start gap-3 bg-white/3 border-l-2 border-purple-500/40">
          <span className={`w-7 h-7 rounded-full flex-shrink-0 text-[9px] font-bold flex items-center justify-center ${
            eventComment.speaker === 'edna' ? 'bg-blue-500/30 text-blue-300' : 'bg-amber-500/30 text-amber-300'
          }`}>
            {eventComment.speaker === 'edna' ? 'EM' : 'CH'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm italic text-text-primary leading-relaxed">"{eventComment.text}"</p>
            <p className="text-xs text-text-muted mt-1">
              — {eventComment.speaker === 'edna' ? 'Edna Morrison, State Pension Fund' : 'Chip Henderson, Family Office'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
