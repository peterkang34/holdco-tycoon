interface PlayAgainSectionProps {
  onPlayAgain: () => void;
  onShowFeedback: () => void;
}

export function PlayAgainSection({
  onPlayAgain,
  onShowFeedback,
}: PlayAgainSectionProps) {
  return (
    <div className="mb-6">
      <button
        onClick={onPlayAgain}
        className="btn-primary text-lg py-3 w-full font-medium"
      >
        Play Again
      </button>

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
