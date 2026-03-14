interface ScoreBarProps {
  label: string;
  value: number;
  max: number;
  tip?: string;
}

export function ScoreBar({ label, value, max, tip }: ScoreBarProps) {
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-text-muted">{label}</span>
        <span className="font-mono">{value.toFixed(1)} / {max}</span>
      </div>
      <div className="h-3 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent to-accent-secondary transition-all duration-1000"
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
      {tip && (
        <p className="text-xs text-text-muted mt-1 italic">{tip}</p>
      )}
    </div>
  );
}
