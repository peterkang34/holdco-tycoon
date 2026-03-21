import type { PlaybookData } from '../../../engine/types';
import { formatMoney } from '../../../engine/types';
import { generateThesis, getArchetypeDisplayName } from '../../../utils/playbookThesis';

interface PlaybookThesisSectionProps {
  playbook: PlaybookData;
}

const GRADE_COLORS: Record<string, string> = {
  S: 'text-amber-400',
  A: 'text-emerald-400',
  B: 'text-blue-400',
  C: 'text-zinc-300',
  D: 'text-orange-400',
  F: 'text-red-400',
};

export function PlaybookThesisSection({ playbook }: PlaybookThesisSectionProps) {
  const { thesis } = playbook;
  const isBankrupt = thesis.isBankrupt;
  const isPE = thesis.isFundManager;
  const thesisText = generateThesis(playbook);
  const archetypeName = getArchetypeDisplayName(thesis.archetype);

  const sectionTitle = isBankrupt ? 'Post-Mortem' : isPE ? "GP's Thesis" : 'Investment Thesis';

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-mono text-text-muted">01</span>
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-xs font-bold tracking-widest text-text-muted uppercase">{sectionTitle}</span>
      </div>

      {/* Holdco name */}
      <h2 className="text-2xl md:text-3xl font-bold mb-2">{thesis.holdcoName}</h2>

      {/* Archetype badge */}
      {!isBankrupt && (
        <div className="inline-flex items-center gap-2 mb-4">
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-accent/15 text-accent border border-accent/25">
            {archetypeName}
          </span>
        </div>
      )}
      {isBankrupt && (
        <div className="inline-flex items-center gap-2 mb-4">
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/25">
            Bankrupt
          </span>
        </div>
      )}

      {/* Thesis sentence */}
      <p className="text-text-secondary text-sm leading-relaxed mb-6">{thesisText}</p>

      {/* Hero numbers */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* FEV or Carry */}
        <div className="bg-white/[0.03] rounded-lg p-3 text-center">
          <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">
            {isPE ? 'Carry Earned' : 'FEV'}
          </p>
          <p className="text-xl font-bold font-mono">
            {isPE && thesis.carryEarned != null
              ? formatMoney(thesis.carryEarned)
              : formatMoney(thesis.fev)}
          </p>
        </div>

        {/* Grade */}
        <div className="bg-white/[0.03] rounded-lg p-3 text-center">
          <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">Grade</p>
          <p className={`text-xl font-bold ${GRADE_COLORS[thesis.grade] ?? 'text-text-primary'}`}>
            {thesis.grade}
          </p>
        </div>

        {/* Score */}
        <div className="bg-white/[0.03] rounded-lg p-3 text-center">
          <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">Score</p>
          <p className="text-xl font-bold font-mono">{thesis.score}</p>
        </div>
      </div>

      {/* Difficulty / Duration / Sophistication badges */}
      <div className="flex flex-wrap gap-2">
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-white/5 text-text-muted border border-white/10">
          {thesis.difficulty === 'easy' ? 'Easy' : 'Normal'}
        </span>
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-white/5 text-text-muted border border-white/10">
          {thesis.duration === 'standard' ? '20yr' : '10yr'}
        </span>
        {isPE && (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
            PE Fund
          </span>
        )}
        {thesis.challengeSeed && (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Challenge
          </span>
        )}
        <span className="px-2 py-0.5 rounded text-[11px] font-mono text-text-muted/60 bg-white/[0.02] border border-white/5">
          Soph: {thesis.sophisticationScore}
        </span>
      </div>
    </div>
  );
}
