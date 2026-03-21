import type { PlaybookData } from '../../../engine/types';

interface PlaybookRealityCheckProps {
  realityCheck: PlaybookData['realityCheck'];
}

export function PlaybookRealityCheck({ realityCheck }: PlaybookRealityCheckProps) {
  const gaps = realityCheck.gameToRealityGaps;

  if (gaps.length === 0) return null;

  return (
    <div className="mt-6 pt-4 border-t border-white/5">
      <p className="text-xs font-bold tracking-widest text-text-muted/60 mb-3 uppercase">Reality Check</p>
      <div className="space-y-2.5">
        {gaps.map((text, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-text-muted/40 text-xs mt-0.5 shrink-0">{i + 1}.</span>
            <p className="text-[11px] text-text-muted/70 leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-text-muted/40 mt-4">
        This game is a learning tool, not a simulation. Real holdco building involves far more complexity, risk, and human factors.
      </p>
    </div>
  );
}
