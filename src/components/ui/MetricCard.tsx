import { ReactNode } from 'react';
import { METRIC_TOOLTIPS } from '../../data/tips';
import { Tooltip } from './Tooltip';

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  status?: 'positive' | 'negative' | 'warning' | 'neutral';
  tooltip?: string;
  icon?: ReactNode;
  onClick?: () => void;
}

export function MetricCard({ label, value, subValue, status = 'neutral', tooltip, icon, onClick }: MetricCardProps) {
  const statusColors = {
    positive: 'text-accent',
    negative: 'text-danger',
    warning: 'text-warning',
    neutral: 'text-text-primary',
  };

  const tooltipData = METRIC_TOOLTIPS[label.toLowerCase().replace(/[\/\s]/g, '')];

  return (
    <div className={`card min-w-0 relative p-1.5 sm:p-2.5${onClick ? ' cursor-pointer hover:border-accent/50 transition-colors' : ''}`} onClick={onClick}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-text-muted">{icon}</span>}
        <span className="text-[8px] sm:text-[10px] md:text-xs text-text-muted uppercase tracking-wider leading-tight">{label}</span>
        {(tooltip || tooltipData) && (
          <Tooltip
            trigger={<span className="text-text-muted text-[10px]">?</span>}
            align="left"
            width="w-48 sm:w-64"
          >
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
          </Tooltip>
        )}
      </div>
      <div className={`text-base sm:text-lg font-bold font-mono ${statusColors[status]}`}>
        {value}
      </div>
      {subValue && (
        <div className="text-[10px] sm:text-xs text-text-muted mt-0.5 sm:mt-1 truncate">{subValue}</div>
      )}
    </div>
  );
}
