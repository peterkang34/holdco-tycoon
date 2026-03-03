/** SVG radar/spider chart for 6-dimensional score breakdowns. No external deps. */

interface Dimension {
  label: string;
  value: number;
  max: number;
}

interface ScoreRadarProps {
  dimensions: Dimension[];
  size?: number;
}

export function ScoreRadar({ dimensions, size = 160 }: ScoreRadarProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 24; // leave room for labels
  const n = dimensions.length;
  if (n < 3) return null;

  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2; // 12 o'clock

  // Helper: get x,y for a given index and fraction (0-1) of radius
  const point = (i: number, frac: number) => ({
    x: cx + r * frac * Math.cos(startAngle + i * angleStep),
    y: cy + r * frac * Math.sin(startAngle + i * angleStep),
  });

  // Grid rings at 25%, 50%, 75%, 100%
  const rings = [0.25, 0.5, 0.75, 1.0];

  // Data polygon points
  const dataPoints = dimensions.map((d, i) => {
    const frac = d.max > 0 ? Math.min(d.value / d.max, 1) : 0;
    return point(i, frac);
  });
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + 'Z';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block" aria-label="Score radar chart">
      {/* Grid rings */}
      {rings.map(frac => {
        const ringPoints = Array.from({ length: n }, (_, i) => point(i, frac));
        const ringPath = ringPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + 'Z';
        return <path key={frac} d={ringPath} fill="none" stroke="var(--color-border, rgba(255,255,255,0.1))" strokeWidth="0.5" />;
      })}

      {/* Axis lines */}
      {dimensions.map((_, i) => {
        const outer = point(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke="var(--color-border, rgba(255,255,255,0.08))" strokeWidth="0.5" />;
      })}

      {/* Data polygon */}
      <path d={dataPath} fill="var(--color-accent, #60a5fa)" fillOpacity="0.2" stroke="var(--color-accent, #60a5fa)" strokeWidth="1.5" />

      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="var(--color-accent, #60a5fa)" />
      ))}

      {/* Labels */}
      {dimensions.map((d, i) => {
        const labelPos = point(i, 1.22);
        const angle = startAngle + i * angleStep;
        // Determine text-anchor based on position
        let anchor: 'start' | 'middle' | 'end' = 'middle';
        if (Math.cos(angle) > 0.3) anchor = 'start';
        else if (Math.cos(angle) < -0.3) anchor = 'end';
        let baseline: 'auto' | 'middle' | 'hanging' = 'middle';
        if (Math.sin(angle) > 0.3) baseline = 'hanging';
        else if (Math.sin(angle) < -0.3) baseline = 'auto';
        return (
          <text
            key={i}
            x={labelPos.x}
            y={labelPos.y}
            textAnchor={anchor}
            dominantBaseline={baseline}
            className="fill-text-muted"
            style={{ fontSize: '8px' }}
          >
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}
