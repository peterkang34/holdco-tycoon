import type { PlaybookData } from '../../engine/types';
import { formatMoney } from '../../engine/utils';
import { generateThesis, getArchetypeDisplayName } from '../../utils/playbookThesis';

interface PlaybookCardProps {
  playbook: PlaybookData;
  isLoggedIn: boolean;
  onView: () => void;
  onSignUp: () => void;
}

export function PlaybookCard({ playbook, isLoggedIn, onView, onSignUp }: PlaybookCardProps) {
  const { thesis } = playbook;
  const displayName = getArchetypeDisplayName(thesis.archetype);
  const thesisText = generateThesis(playbook);
  const heroValue = thesis.isFundManager ? thesis.carryEarned ?? 0 : thesis.fev;
  const heroLabel = thesis.isFundManager ? 'Carry Earned' : 'FEV';
  const isBankrupt = thesis.isBankrupt;
  const title = isBankrupt ? 'Post-Mortem' : thesis.isFundManager ? 'Fund Strategy Debrief' : 'Strategy Debrief';

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-text-muted text-xs uppercase tracking-wider mb-1">{title}</p>
          <h3 className="text-lg font-bold text-text-primary">{thesis.holdcoName}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isBankrupt ? 'bg-red-500/20 text-red-400' : 'bg-accent/20 text-accent'
          }`}>
            {displayName}
          </span>
          <span className="text-xs font-bold bg-white/10 px-2 py-0.5 rounded-full">
            {thesis.grade}
          </span>
        </div>
      </div>

      {/* Thesis snippet */}
      <p className="text-text-muted text-sm leading-relaxed mb-4 line-clamp-2">
        {thesisText}
      </p>

      {/* Key metrics */}
      <div className="flex items-center gap-4 mb-4 text-sm">
        <div>
          <span className="text-text-muted text-xs">{heroLabel}</span>
          <p className="font-mono font-bold text-text-primary">{formatMoney(heroValue)}</p>
        </div>
        <div className="w-px h-8 bg-white/10" />
        <div>
          <span className="text-text-muted text-xs">Score</span>
          <p className="font-mono font-bold text-text-primary">{thesis.score}</p>
        </div>
        <div className="w-px h-8 bg-white/10" />
        <div>
          <span className="text-text-muted text-xs">Mode</span>
          <p className="font-bold text-text-primary text-xs">
            {thesis.difficulty === 'normal' ? 'Hard' : 'Easy'}-{thesis.duration === 'standard' ? '20' : '10'}
            {thesis.isFundManager ? ' PE' : ''}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={onView}
          className="flex-1 bg-accent hover:bg-accent/90 text-white font-medium text-sm py-2.5 px-4 rounded-lg transition-colors active:scale-[0.98]"
        >
          View Your Playbook
        </button>
      </div>

      {/* Save nudge for anonymous / saved confirmation for auth */}
      {isLoggedIn ? (
        <p className="text-text-muted text-xs mt-2.5 text-center">Saved to your Strategy Library</p>
      ) : (
        <button
          onClick={onSignUp}
          className="w-full text-accent text-xs mt-2.5 hover:underline"
        >
          Sign up to save this to your library
        </button>
      )}
    </div>
  );
}
