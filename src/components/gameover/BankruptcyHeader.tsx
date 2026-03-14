import { formatMoney, formatMultiple } from '../../engine/types';
import type { Metrics, HistoricalMetrics, Business, GameDifficulty } from '../../engine/types';

interface BankruptcyHeaderProps {
  holdcoName: string;
  fundName?: string;
  isFundManagerMode: boolean;
  bankruptRound: number;
  cash: number;
  metrics: Metrics;
  metricsHistory: HistoricalMetrics[];
  businesses: Business[];
  sharesOutstanding: number;
  hasRestructured: boolean;
  difficulty: GameDifficulty;
  maxRounds: number;
}

export function BankruptcyHeader({
  holdcoName,
  fundName,
  isFundManagerMode,
  bankruptRound,
  cash,
  metrics,
  metricsHistory,
  businesses,
  sharesOutstanding,
  hasRestructured,
  difficulty,
  maxRounds,
}: BankruptcyHeaderProps) {
  if (isFundManagerMode) {
    return (
      <div className="text-center mb-8">
        <span className="text-6xl mb-4 block">💀</span>
        <h1 className="text-3xl font-bold mb-2 break-words">{fundName || 'PE Fund'}</h1>
        <div className="text-4xl sm:text-7xl font-bold mb-2 text-red-500">FUND COLLAPSE</div>
        <p className="text-xl text-red-400">Your fund failed in Year {bankruptRound}</p>
        <div className="card mt-6 bg-red-900/20 border-red-500/30">
          <p className="text-text-secondary mb-4">Your fund couldn't meet its obligations. All LP capital is at risk.</p>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-text-muted text-sm">LP Capital Lost</p>
              <p className="text-2xl font-bold font-mono text-red-400">{formatMoney(100_000 - (cash > 0 ? cash : 0))}</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Gross MOIC</p>
              <p className="text-2xl font-bold font-mono text-red-400">{((cash > 0 ? cash : 0) / 100_000).toFixed(2)}x</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Holdco bankruptcy
  const activeCount = businesses.filter(b => b.status === 'active').length;
  const intrinsicValue = metrics.intrinsicValuePerShare * sharesOutstanding;

  let explanation: string;
  if (activeCount === 0 && cash <= 0) {
    explanation = 'With no portfolio businesses and no capital to rebuild, your holding company was dissolved.';
  } else if (intrinsicValue <= 0 && hasRestructured) {
    explanation = "Your holding company's equity value was completely wiped out. With no remaining value for shareholders, the company was declared insolvent.";
  } else {
    explanation = "Your holding company couldn't service its debt obligations and was forced into bankruptcy. All equity value was wiped out.";
  }

  return (
    <div className="text-center mb-8">
      <span className="text-6xl mb-4 block">💀</span>
      <h1 className="text-3xl font-bold mb-2 break-words">{holdcoName}</h1>
      <div className="text-4xl sm:text-7xl font-bold mb-2 text-red-500">BANKRUPT</div>
      <p className="text-xl text-red-400">Filed for bankruptcy in Year {bankruptRound}</p>
      <div className="flex justify-center gap-2 mt-3">
        <span className={`text-xs px-2 py-0.5 rounded ${difficulty === 'normal' ? 'bg-orange-500/20 text-orange-400' : 'bg-accent/20 text-accent'}`}>
          {difficulty === 'normal' ? 'Hard' : 'Easy'}
        </span>
        <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-text-secondary">
          {maxRounds}yr
        </span>
      </div>
      <div className="card mt-6 bg-red-900/20 border-red-500/30">
        <p className="text-text-secondary">{explanation}</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-text-muted text-sm">Final Debt</p>
            <p className="text-2xl font-bold font-mono text-red-400">{formatMoney(metrics.totalDebt)}</p>
          </div>
          <div>
            <p className="text-text-muted text-sm">Peak Leverage</p>
            <p className="text-2xl font-bold font-mono text-red-400">
              {formatMultiple(Math.max(...metricsHistory.map(h => h.metrics.netDebtToEbitda), metrics.netDebtToEbitda))}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
