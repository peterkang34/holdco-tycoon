import { Metrics, DistressLevel, formatMoney, formatPercent, formatMultiple } from '../../engine/types';
import { getDistressLabel } from '../../engine/distress';
import { MetricCard } from '../ui/MetricCard';

interface DashboardProps {
  metrics: Metrics;
  liveCash: number; // Live cash value that updates in real-time
  sharesOutstanding: number;
  founderOwnership: number; // Founder ownership percentage (0-1)
  round: number;
  totalRounds: number;
  sharedServicesCount: number;
  focusTier?: number;
  focusSector?: string;
  distressLevel: DistressLevel;
}

export function Dashboard({
  metrics,
  liveCash,
  sharesOutstanding,
  founderOwnership,
  round,
  totalRounds,
  sharedServicesCount,
  focusTier,
  focusSector,
  distressLevel,
}: DashboardProps) {
  const getCashStatus = () => {
    if (liveCash > 5000) return 'positive';  // $5M+ is healthy
    if (liveCash > 2000) return 'warning';   // $2M-$5M is tight
    return 'negative';                        // Under $2M is concerning
  };

  const getRoicStatus = () => {
    if (metrics.portfolioRoic > 0.15) return 'positive';
    if (metrics.portfolioRoic > 0.08) return 'warning';
    return 'negative';
  };

  const getRoiicStatus = () => {
    if (metrics.roiic > 0.20) return 'positive';
    if (metrics.roiic > 0.10) return 'warning';
    return 'neutral';
  };

  const getLeverageStatus = () => {
    if (metrics.netDebtToEbitda <= 0) return 'positive'; // Net cash position
    if (metrics.netDebtToEbitda < 2.5) return 'positive';
    if (metrics.netDebtToEbitda < 3.5) return 'warning';
    return 'negative';
  };

  // Calculate net cash amount when in net cash position
  const isNetCash = metrics.netDebtToEbitda < 0;
  const netCashAmount = isNetCash ? Math.abs(metrics.netDebtToEbitda * metrics.totalEbitda) : 0;

  const getMoicStatus = () => {
    if (metrics.portfolioMoic > 2.0) return 'positive';
    if (metrics.portfolioMoic > 1.2) return 'neutral';
    return 'negative';
  };

  const getCashConversionStatus = () => {
    if (metrics.cashConversion > 0.80) return 'positive';
    if (metrics.cashConversion > 0.65) return 'warning';
    return 'negative';
  };

  return (
    <div className="bg-bg-card border-b border-white/10 p-4">
      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-text-muted">Year {round} of {totalRounds}</span>
          <span className="text-sm text-text-muted">{totalRounds - round} years remaining</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-accent to-accent-secondary transition-all duration-500"
            style={{ width: `${(round / totalRounds) * 100}%` }}
          />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
        <MetricCard
          label="Cash"
          value={formatMoney(liveCash)}
          status={getCashStatus()}
        />
        <MetricCard
          label="Total EBITDA"
          value={formatMoney(metrics.totalEbitda)}
          subValue="/year"
        />
        <MetricCard
          label="FCF/Share"
          value={`$${metrics.fcfPerShare.toFixed(0)}`}
          subValue={`${sharesOutstanding.toFixed(0)} shares`}
          status={metrics.fcfPerShare > 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          label="Portfolio ROIC"
          value={formatPercent(metrics.portfolioRoic)}
          status={getRoicStatus()}
        />
        <MetricCard
          label="ROIIC"
          value={formatPercent(metrics.roiic)}
          status={getRoiicStatus()}
        />
        <MetricCard
          label="MOIC"
          value={formatMultiple(metrics.portfolioMoic)}
          status={getMoicStatus()}
        />
        <MetricCard
          label="Leverage"
          value={isNetCash ? 'Net Cash' : formatMultiple(metrics.netDebtToEbitda)}
          subValue={
            metrics.totalDebt > 0
              ? `${formatMoney(metrics.totalDebt)} debt ${isNetCash ? '(cash > debt)' : '/ EBITDA'}`
              : isNetCash ? 'No debt' : 'Net Debt/EBITDA'
          }
          status={getLeverageStatus()}
        />
        <MetricCard
          label="Cash Conv."
          value={formatPercent(metrics.cashConversion)}
          status={getCashConversionStatus()}
        />
      </div>

      {/* Status Badges */}
      <div className="flex flex-wrap gap-2 mt-4">
        <span className={`text-xs px-2 py-1 rounded-full ${
          founderOwnership >= 0.70 ? 'bg-accent/20 text-accent' :
          founderOwnership >= 0.51 ? 'bg-warning/20 text-warning' :
          'bg-danger/20 text-danger'
        }`}>
          Your Ownership: {formatPercent(founderOwnership)}
        </span>
        {sharedServicesCount > 0 && (
          <span className="text-xs bg-accent/20 text-accent px-2 py-1 rounded-full">
            {sharedServicesCount} Shared Service{sharedServicesCount > 1 ? 's' : ''} Active
          </span>
        )}
        {focusTier && focusTier > 0 && (
          <span className="text-xs bg-accent/20 text-accent px-2 py-1 rounded-full">
            Tier {focusTier} {focusSector} Focus
          </span>
        )}
        {metrics.interestRate > 0.08 && (
          <span className="text-xs bg-warning/20 text-warning px-2 py-1 rounded-full">
            High Interest: {formatPercent(metrics.interestRate)}
          </span>
        )}
        {distressLevel === 'elevated' && (
          <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full">
            {getDistressLabel(distressLevel)}
          </span>
        )}
        {distressLevel === 'stressed' && (
          <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded-full">
            {getDistressLabel(distressLevel)}
          </span>
        )}
        {distressLevel === 'breach' && (
          <span className="text-xs bg-red-600/30 text-red-400 px-2 py-1 rounded-full animate-pulse font-bold">
            {getDistressLabel(distressLevel)}
          </span>
        )}
      </div>
    </div>
  );
}
