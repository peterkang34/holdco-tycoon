interface PlayAgainSectionProps {
  onPlayAgain: () => void;
  difficulty: string;
  duration: string;
  isFundManagerMode: boolean;
  onShowFeedback: () => void;
}

function getDifficultyLabel(difficulty: string): string {
  return difficulty === 'normal' ? 'Hard' : 'Easy';
}

function getDurationYears(duration: string): string {
  return duration === 'standard' ? '20' : '10';
}

interface ModeSuggestion {
  label: string;
  description: string;
}

function getModeSuggestions(
  isFundManagerMode: boolean,
  difficulty: string,
): ModeSuggestion[] {
  if (isFundManagerMode) {
    // Suggest holdco modes
    return [
      {
        label: `Holdco (${difficulty === 'normal' ? 'Easy' : 'Hard'}, 20yr)`,
        description: difficulty === 'normal'
          ? 'Try the easier holdco mode with more starting capital.'
          : 'Test yourself with less capital and real leverage.',
      },
      {
        label: 'Holdco (Easy, 10yr)',
        description: 'Quick 10-year sprint with institutional backing.',
      },
    ];
  }

  const suggestions: ModeSuggestion[] = [];

  // Suggest PE Fund Manager
  suggestions.push({
    label: 'PE Fund Manager (10yr)',
    description: 'Manage $100M for LPs. Earn carry above the hurdle rate.',
  });

  // Suggest opposite difficulty
  if (difficulty === 'easy') {
    suggestions.push({
      label: 'Holdco (Hard, 20yr)',
      description: 'Self-funded with $5M. 100% ownership, real leverage.',
    });
  } else {
    suggestions.push({
      label: 'Holdco (Easy, 10yr)',
      description: 'Quick sprint with $20M institutional capital.',
    });
  }

  return suggestions;
}

export function PlayAgainSection({
  onPlayAgain,
  difficulty,
  duration,
  isFundManagerMode,
  onShowFeedback,
}: PlayAgainSectionProps) {
  const diffLabel = getDifficultyLabel(difficulty);
  const durationYrs = getDurationYears(duration);
  const suggestions = getModeSuggestions(isFundManagerMode, difficulty);

  return (
    <div className="mb-6">
      {/* Primary play again */}
      <button
        onClick={onPlayAgain}
        className="btn-primary text-lg py-3 w-full font-medium"
      >
        Play Again ({diffLabel} {durationYrs}yr)
      </button>

      {/* Mode suggestions */}
      <div className="mt-6">
        <p className="text-xs font-bold tracking-widest text-text-muted mb-3">
          TRY SOMETHING DIFFERENT
        </p>
        <div className="space-y-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.label}
              onClick={onPlayAgain}
              className="w-full text-left p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            >
              <p className="text-sm font-medium">{suggestion.label}</p>
              <p className="text-xs text-text-muted">{suggestion.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Links */}
      <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
        <a
          href="https://holdcoguide.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-accent hover:text-accent-secondary min-h-[44px] inline-flex items-center"
        >
          Get The Holdco Guide &rarr;
        </a>
        <button
          onClick={onShowFeedback}
          className="text-sm text-text-muted hover:text-text-secondary transition-colors min-h-[44px] inline-flex items-center"
        >
          Send Feedback
        </button>
      </div>
    </div>
  );
}
