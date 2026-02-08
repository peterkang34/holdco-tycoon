import { ReactNode } from 'react';
import { METRIC_TOOLTIPS } from '../../data/tips';

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  status?: 'positive' | 'negative' | 'warning' | 'neutral';
  tooltip?: string;
  icon?: ReactNode;
}

export function MetricCard({ label, value, subValue, status = 'neutral', tooltip, icon }: MetricCardProps) {
  const statusColors = {
    positive: 'text-accent',
    negative: 'text-danger',
    warning: 'text-warning',
    neutral: 'text-text-primary',
  };

  const tooltipData = METRIC_TOOLTIPS[label.toLowerCase().replace(/[\/\s]/g, '')];

  return (
    <div className="card min-w-0 relative group" style={{ padding: '10px' }}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-text-muted">{icon}</span>}
        <span className="text-[10px] text-text-muted uppercase tracking-wider leading-tight">{label}</span>
        {(tooltip || tooltipData) && (
          <span className="text-text-muted cursor-help text-[10px]">?</span>
        )}
      </div>
      <div className={`text-lg font-bold font-mono ${statusColors[status]}`}>
        {value}
      </div>
      {subValue && (
        <div className="text-xs text-text-muted mt-1">{subValue}</div>
      )}

      {/* Tooltip - appears below the card */}
      {(tooltip || tooltipData) && (
        <div className="absolute top-full left-0 mt-2 w-64 p-3 bg-bg-primary border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
          <p className="text-sm text-text-secondary">
            {tooltip || tooltipData?.definition}
          </p>
          {tooltipData?.formula && (
            <p className="text-xs text-text-muted mt-2 font-mono">
              {tooltipData.formula}
            </p>
          )}
          {tooltipData?.benchmark && (
            <p className="text-xs text-accent mt-2">
              {tooltipData.benchmark}
            </p>
          )}
          {tooltipData?.chapter && (
            <p className="text-xs text-text-muted mt-1 italic">
              {tooltipData.chapter}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
