import { useState, Fragment } from 'react';
import { MetricCard } from '../ui/MetricCard';
import { ScoreRadar } from './ScoreRadar';
import { formatMoney } from '../../engine/types';
import type { LeaderboardStrategy } from '../../engine/types';
import { getGradeColor } from '../../utils/gradeColors';
import { SECTORS } from '../../data/sectors';
import { computeAdjFev, MultiplierBadges } from './adminShared';
import { AnalyticsChart } from './AnalyticsChart';
import type { AnalyticsData, Totals, ActivityEvent, DayData } from './adminTypes';

function getTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

// ── Strategy Drill-Down Panel ──

function StrategyDrillDown({ strategy }: { strategy: LeaderboardStrategy }) {
  const dimensions = [
    { label: 'Value', value: strategy.scoreBreakdown.valueCreation, max: 20 },
    { label: 'FCF/Sh', value: strategy.scoreBreakdown.fcfShareGrowth, max: 20 },
    { label: 'ROIC', value: strategy.scoreBreakdown.portfolioRoic, max: 15 },
    { label: 'Deploy', value: strategy.scoreBreakdown.capitalDeployment, max: 15 },
    { label: 'B/S', value: strategy.scoreBreakdown.balanceSheetHealth, max: 15 },
    { label: 'Strat', value: strategy.scoreBreakdown.strategicDiscipline, max: 15 },
  ];

  const sectorNames = strategy.sectorIds
    .map(id => SECTORS[id]?.emoji || id)
    .join(' ');

  const structureEntries = Object.entries(strategy.dealStructureTypes || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="px-4 pb-4 pt-2 bg-bg-secondary/50 border-t border-border/30">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Score Breakdown Radar */}
        <div className="flex flex-col items-center">
          <p className="text-[10px] text-text-muted mb-1 font-semibold">Score Breakdown</p>
          <ScoreRadar dimensions={dimensions} size={130} />
        </div>

        {/* Strategy & Composition */}
        <div className="text-xs space-y-1.5">
          <p className="text-[10px] text-text-muted font-semibold mb-2">Strategy & Composition</p>
          <div className="flex justify-between">
            <span className="text-text-muted">Archetype</span>
            <span className="text-text-primary font-medium">{strategy.archetype.replace(/_/g, ' ')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Sophistication</span>
            <span className="text-text-primary font-mono">{strategy.sophisticationScore}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Sectors</span>
            <span className="text-text-primary">{sectorNames || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Platforms</span>
            <span className="text-text-primary font-mono">{strategy.platformsForged}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">MA Tier</span>
            <span className="text-text-primary font-mono">{strategy.maSourcingTier}</span>
          </div>
        </div>

        {/* Deal Activity */}
        <div className="text-xs space-y-1.5">
          <p className="text-[10px] text-text-muted font-semibold mb-2">Deal Activity</p>
          <div className="flex justify-between">
            <span className="text-text-muted">Acquisitions</span>
            <span className="text-text-primary font-mono">{strategy.totalAcquisitions}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Sells</span>
            <span className="text-text-primary font-mono">{strategy.totalSells}</span>
          </div>
          {structureEntries.length > 0 && (
            <div className="flex justify-between">
              <span className="text-text-muted">Structures</span>
              <span className="text-text-primary font-mono text-right">
                {structureEntries.map(([k, v]) => `${k.replace(/_/g, ' ')}(${v})`).join(', ')}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-text-muted">Rollover Equity</span>
            <span className="text-text-primary font-mono">{strategy.rolloverEquityCount}</span>
          </div>
          {((strategy.sourceDealUses ?? 0) > 0 || (strategy.proactiveOutreachUses ?? 0) > 0 || (strategy.smbBrokerUses ?? 0) > 0) && (
            <>
              <div className="flex justify-between">
                <span className="text-text-muted">Source Deals</span>
                <span className="text-text-primary font-mono">{strategy.sourceDealUses ?? 0}</span>
              </div>
              {(strategy.proactiveOutreachUses ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Outreach</span>
                  <span className="text-text-primary font-mono">{strategy.proactiveOutreachUses}</span>
                </div>
              )}
              {(strategy.smbBrokerUses ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-text-muted">SMB Broker</span>
                  <span className="text-text-primary font-mono">{strategy.smbBrokerUses}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Capital Management */}
        <div className="text-xs space-y-1.5">
          <p className="text-[10px] text-text-muted font-semibold mb-2">Capital Management</p>
          <div className="flex justify-between">
            <span className="text-text-muted">Distributions</span>
            <span className="text-text-primary font-mono">{formatMoney(strategy.totalDistributions)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Buybacks</span>
            <span className="text-text-primary font-mono">{formatMoney(strategy.totalBuybacks)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Equity Raises</span>
            <span className="text-text-primary font-mono">{strategy.equityRaisesUsed}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Peak Leverage</span>
            <span className="text-text-primary font-mono">{strategy.peakLeverage.toFixed(1)}x</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Turnarounds</span>
            <span className="text-text-primary font-mono">{strategy.turnaroundsSucceeded}/{strategy.turnaroundsStarted} succeeded</span>
          </div>
          {strategy.antiPatterns && strategy.antiPatterns.length > 0 && (
            <div className="flex justify-between">
              <span className="text-text-muted">Anti-Patterns</span>
              <span className="text-danger text-right">{strategy.antiPatterns.map(p => p.replace(/_/g, ' ')).join(', ')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Overview Tab ──

interface OverviewTabProps {
  data: AnalyticsData;
  totals: Totals;
  avgSophistication: number;
  kFactor: string;
  dailyData: DayData[];
}

export function OverviewTab({ data, totals, avgSophistication, kFactor, dailyData }: OverviewTabProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [expandedRecentRow, setExpandedRecentRow] = useState<number | null>(null);

  return (
    <>
      {/* Hero metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        <MetricCard label="Games Started" value={data.allTime.started} />
        <MetricCard label="Completion Rate" value={totals.completionRate} status={parseFloat(totals.completionRate) > 50 ? 'positive' : 'warning'} />
        <MetricCard label="2nd Game Rate" value={totals.secondGameRate} />
        <MetricCard label="Avg Session" value={totals.avgSessionDuration} />
        <MetricCard label="k-factor" value={kFactor} status={Number(kFactor) > 1 ? 'positive' : 'neutral'} />
        <MetricCard label="Mobile Share" value={totals.mobileSharePct} />
        <MetricCard label="Avg Sophistication" value={avgSophistication} />
      </div>

      {/* Trends chart */}
      <AnalyticsChart dailyData={dailyData} monthlyData={data.months} />

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <MetricCard label="Unique Players" value={totals.totalUnique} />
        <MetricCard label="Avg FEV (est)" value={formatMoney(totals.avgFev)} />
        <MetricCard label="Top FEV" value={formatMoney(totals.topFev)} status="positive" />
        <MetricCard label="Normal Mode" value={totals.normalPct} />
        <MetricCard label="Quick Play" value={totals.quickPct} />
        <MetricCard label="Visit->Start" value={totals.visitStartRate} />
      </div>

      {/* Leaderboard with drill-down */}
      {data.leaderboardEntries.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Top Leaderboard Entries</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted border-b border-border">
                  <th className="text-left py-2 pr-3">#</th>
                  <th className="text-left py-2 pr-3">Name</th>
                  <th className="text-center py-2 pr-3">Init</th>
                  <th className="text-right py-2 pr-3">Adj FEV</th>
                  <th className="text-right py-2 pr-3">Raw FEV</th>
                  <th className="text-center py-2 pr-3">Score</th>
                  <th className="text-center py-2 pr-3">Grade</th>
                  <th className="text-center py-2 pr-3">Mode</th>
                  <th className="text-left py-2 pr-3">Multipliers</th>
                  <th className="text-center py-2 pr-3">Biz</th>
                  <th className="text-right py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.leaderboardEntries.map((entry, i) => {
                  const adjFev = computeAdjFev(entry);
                  const durationLabel = entry.duration === 'quick' ? '10' : '20';
                  const diffLabel = entry.difficulty === 'normal' ? 'H' : 'E';
                  const isExpanded = expandedRow === i;
                  const hasStrategy = !!entry.strategy;

                  return (
                    <Fragment key={i}>
                      <tr
                        className={`border-b border-border/50 ${hasStrategy ? 'cursor-pointer hover:bg-white/5' : ''} transition-colors`}
                        onClick={() => hasStrategy && setExpandedRow(isExpanded ? null : i)}
                      >
                        <td className="py-1.5 pr-3 text-text-muted font-mono">{i + 1}</td>
                        <td className="py-1.5 pr-3 text-text-primary truncate max-w-[150px]">
                          {entry.holdcoName}
                          {hasStrategy && <span className="ml-1 text-accent text-[10px]">{isExpanded ? '▼' : '▶'}</span>}
                        </td>
                        <td className="py-1.5 pr-3 text-center font-mono text-text-secondary">{entry.initials || '—'}</td>
                        <td className="py-1.5 pr-3 text-right font-mono text-accent">{formatMoney(adjFev)}</td>
                        <td className="py-1.5 pr-3 text-right font-mono text-text-secondary">{formatMoney(entry.founderEquityValue)}</td>
                        <td className="py-1.5 pr-3 text-center font-mono text-text-secondary">{entry.score ?? '—'}</td>
                        <td className={`py-1.5 pr-3 text-center font-bold ${getGradeColor(entry.grade)}`}>{entry.grade}</td>
                        <td className="py-1.5 pr-3 text-center">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${entry.difficulty === 'normal' ? 'bg-warning/20 text-warning' : 'bg-accent/20 text-accent'}`}>
                            {diffLabel}/{durationLabel}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3">
                          <MultiplierBadges entry={entry} />
                        </td>
                        <td className="py-1.5 pr-3 text-center font-mono text-text-secondary">{entry.businessCount ?? '—'}</td>
                        <td className="py-1.5 text-right text-text-muted font-mono">{new Date(entry.date).toLocaleDateString()}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-border/50">
                          <td colSpan={11} className="p-0">
                            {hasStrategy && entry.strategy ? (
                              <StrategyDrillDown strategy={entry.strategy} />
                            ) : (
                              <div className="px-4 pb-3 pt-2 text-xs text-text-muted italic bg-bg-secondary/30 border-t border-border/30">
                                Strategy data not available for this entry
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Games Feed */}
      {data.recentEntries && data.recentEntries.length > 0 && (
        <div className="card p-4 mt-4">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Recent Games (Last 25)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted border-b border-border">
                  <th className="text-left py-2 pr-3">Date</th>
                  <th className="text-center py-2 pr-3">Init</th>
                  <th className="text-left py-2 pr-3">Name</th>
                  <th className="text-right py-2 pr-3">Adj FEV</th>
                  <th className="text-center py-2 pr-3">Score</th>
                  <th className="text-center py-2 pr-3">Grade</th>
                  <th className="text-center py-2 pr-3">Mode</th>
                  <th className="text-left py-2">Multipliers</th>
                </tr>
              </thead>
              <tbody>
                {data.recentEntries.map((entry, i) => {
                  const adjFev = computeAdjFev(entry);
                  const durationLabel = entry.duration === 'quick' ? '10' : '20';
                  const diffLabel = entry.difficulty === 'normal' ? 'H' : 'E';
                  const dateObj = new Date(entry.date);
                  const timeAgo = getTimeAgo(dateObj);
                  const hasStrategy = !!entry.strategy?.scoreBreakdown;
                  const isExpanded = expandedRecentRow === i;
                  return (
                    <Fragment key={i}>
                      <tr
                        className={`border-b border-border/50 ${hasStrategy ? 'cursor-pointer hover:bg-white/5' : ''} ${isExpanded ? 'bg-accent/5' : ''}`}
                        onClick={() => hasStrategy && setExpandedRecentRow(isExpanded ? null : i)}
                      >
                        <td className="py-1.5 pr-3 text-text-muted font-mono" title={dateObj.toLocaleString()}>
                          {timeAgo}
                        </td>
                        <td className="py-1.5 pr-3 text-center font-mono text-text-primary font-bold">{entry.initials || '—'}</td>
                        <td className="py-1.5 pr-3 text-text-secondary truncate max-w-[150px]">
                          {entry.holdcoName}
                          {hasStrategy && <span className="ml-1 text-accent text-[10px]">{isExpanded ? '▼' : '▶'}</span>}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono text-accent">{formatMoney(adjFev)}</td>
                        <td className="py-1.5 pr-3 text-center font-mono text-text-secondary">{entry.score ?? '—'}</td>
                        <td className={`py-1.5 pr-3 text-center font-bold ${getGradeColor(entry.grade)}`}>{entry.grade}</td>
                        <td className="py-1.5 pr-3 text-center">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${entry.difficulty === 'normal' ? 'bg-warning/20 text-warning' : 'bg-accent/20 text-accent'}`}>
                            {diffLabel}/{durationLabel}
                          </span>
                        </td>
                        <td className="py-1.5">
                          <MultiplierBadges entry={entry} />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-border/50">
                          <td colSpan={8} className="p-0">
                            {entry.strategy ? (
                              <StrategyDrillDown strategy={entry.strategy} />
                            ) : (
                              <div className="px-4 pb-3 pt-2 text-xs text-text-muted italic bg-bg-secondary/30 border-t border-border/30">
                                Strategy data not available for this entry
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activity Feed */}
      {data.activityFeed && data.activityFeed.length > 0 && (
        <div className="card p-4 mt-4">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Live Activity Feed</h3>
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {data.activityFeed.map((evt: ActivityEvent, i: number) => {
              const dateObj = new Date(evt.ts);
              const timeAgo = getTimeAgo(dateObj);
              const durationLabel = evt.duration === 'quick' ? '10yr' : '20yr';
              const diffLabel = evt.difficulty === 'normal' ? 'Hard' : 'Easy';

              if (evt.type === 'start') {
                return (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border/30 text-xs">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-medium w-16 text-center shrink-0">START</span>
                    <span className="text-text-muted font-mono w-16 shrink-0" title={dateObj.toLocaleString()}>{timeAgo}</span>
                    <span className="text-text-secondary">{diffLabel} {durationLabel}</span>
                    {evt.sector && <span className="text-text-muted">· {evt.sector}</span>}
                    {evt.device && <span className="text-text-muted ml-auto">{evt.device}</span>}
                    {evt.gameNumber != null && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${evt.gameNumber === 1 ? 'bg-accent/20 text-accent' : 'bg-white/5 text-text-muted'}`}>
                        {evt.gameNumber === 1 ? 'New' : `#${evt.gameNumber}`}
                      </span>
                    )}
                  </div>
                );
              } else {
                const mins = evt.sessionDurationMs ? Math.round(evt.sessionDurationMs / 60000) : null;
                return (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border/30 text-xs">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium w-16 text-center shrink-0">ABANDON</span>
                    <span className="text-text-muted font-mono w-16 shrink-0" title={dateObj.toLocaleString()}>{timeAgo}</span>
                    {evt.round != null && <span className="text-text-secondary">Year {evt.round}</span>}
                    {evt.difficulty && <span className="text-text-muted">· {diffLabel} {durationLabel}</span>}
                    {evt.fev != null && <span className="font-mono text-accent">{formatMoney(evt.fev)}</span>}
                    {mins != null && <span className="text-text-muted ml-auto">{mins}m played</span>}
                    {evt.device && <span className="text-text-muted">{evt.device}</span>}
                  </div>
                );
              }
            })}
          </div>
          <p className="text-[10px] text-text-muted mt-2">Shows last 50 events. Feed populates from new sessions going forward.</p>
        </div>
      )}
    </>
  );
}
