interface BarItem {
  label: string;
  value: number;
  color?: string; // hex color for the bar, defaults to accent
  emoji?: string;
}

interface AdminBarChartProps {
  title: string;
  items: BarItem[];
  formatValue?: (val: number) => string;
  maxItems?: number;
}

export function AdminBarChart({ title, items, formatValue, maxItems = 15 }: AdminBarChartProps) {
  const sorted = [...items].sort((a, b) => b.value - a.value).slice(0, maxItems);
  const maxVal = Math.max(...sorted.map(i => i.value), 1);

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-text-secondary mb-3">{title}</h3>
      <div className="space-y-2">
        {sorted.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="text-xs text-text-muted w-24 shrink-0 truncate" title={item.label}>
              {item.emoji ? `${item.emoji} ` : ''}{item.label}
            </span>
            <div className="flex-1 h-5 bg-bg-primary rounded-full overflow-hidden relative">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max((item.value / maxVal) * 100, 2)}%`,
                  backgroundColor: item.color || 'var(--color-accent)',
                }}
              />
            </div>
            <span className="text-xs font-mono text-text-secondary w-12 text-right shrink-0">
              {formatValue ? formatValue(item.value) : item.value}
            </span>
          </div>
        ))}
        {sorted.length === 0 && (
          <p className="text-xs text-text-muted italic">No data yet</p>
        )}
      </div>
    </div>
  );
}
