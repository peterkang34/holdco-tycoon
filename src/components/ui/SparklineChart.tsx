import React from 'react';

interface GameDataPoint {
  score: number;
  grade: string;
}

interface SparklineChartProps {
  games: GameDataPoint[];
}

function getGradeSvgColor(grade: string): string {
  switch (grade) {
    case 'S': return '#facc15';
    case 'A': return 'var(--color-accent)';
    case 'B': return '#60a5fa';
    case 'C': return 'var(--color-warning)';
    case 'D': return '#f97316';
    case 'F': return 'var(--color-danger)';
    default: return 'var(--color-text-secondary)';
  }
}

const GRADE_BOUNDARIES = [25, 45, 65, 82];
const PAD_X_MIN = 20;
const PAD_X_MAX = 380;
const PAD_Y_MIN = 10;
const PAD_Y_MAX = 110;

function scoreToY(score: number): number {
  // score 0 → bottom (PAD_Y_MAX), score 100 → top (PAD_Y_MIN)
  return PAD_Y_MAX - ((score / 100) * (PAD_Y_MAX - PAD_Y_MIN));
}

function SparklineChart({ games }: SparklineChartProps) {
  if (games.length < 3) {
    return (
      <p className="text-text-muted text-sm text-center">
        Play more games to see your trend
      </p>
    );
  }

  const xStep = games.length > 1
    ? (PAD_X_MAX - PAD_X_MIN) / (games.length - 1)
    : 0;

  const points = games.map((g, i) => ({
    x: PAD_X_MIN + i * xStep,
    y: scoreToY(g.score),
    score: g.score,
    grade: g.grade,
  }));

  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg
      viewBox="0 0 400 120"
      width="100%"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Grade boundary reference lines */}
      {GRADE_BOUNDARIES.map(boundary => (
        <line
          key={boundary}
          x1={PAD_X_MIN}
          y1={scoreToY(boundary)}
          x2={PAD_X_MAX}
          y2={scoreToY(boundary)}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.15}
          className="text-text-muted"
        />
      ))}

      {/* Trend line */}
      <polyline
        points={polylinePoints}
        stroke="var(--color-accent)"
        strokeWidth={2}
        strokeOpacity={0.4}
        fill="none"
      />

      {/* Data points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={4}
          fill={getGradeSvgColor(p.grade)}
        >
          <title>{`Game #${i + 1}: ${p.score} (${p.grade})`}</title>
        </circle>
      ))}
    </svg>
  );
}

export default React.memo(SparklineChart);
