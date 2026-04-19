import { useState, useMemo, Fragment } from 'react';
import { MetricCard } from '../ui/MetricCard';
import { ScoreRadar } from './ScoreRadar';
import { formatMoney } from '../../engine/types';
import type { LeaderboardStrategy } from '../../engine/types';
import { getGradeColor } from '../../utils/gradeColors';
import { SECTORS } from '../../data/sectors';
import { computeAdjFev, MultiplierBadges, DonutChart, SectionHeader, FunnelStep } from './adminShared';
import { AdminBarChart } from './AdminBarChart';
import { AnalyticsChart } from './AnalyticsChart';
import type { AnalyticsData, Totals, ActivityEvent, DayData, GameCompletionAdmin, LeaderboardEntryAdmin } from './adminTypes';

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
  const [expandedCompletionRow, setExpandedCompletionRow] = useState<number | null>(null);

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
                  const isPE = entry.isFundManager === true;
                  const modeLabel = isPE ? 'PE' : `${entry.difficulty === 'normal' ? 'H' : 'E'}/${entry.duration === 'quick' ? '10' : '20'}`;
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
                        <td className="py-1.5 pr-3 text-right font-mono text-accent">{isPE ? formatMoney(entry.carryEarned ?? 0) : formatMoney(adjFev)}</td>
                        <td className="py-1.5 pr-3 text-right font-mono text-text-secondary">{isPE ? `${(entry.grossMoic ?? 0).toFixed(2)}x` : formatMoney(entry.founderEquityValue)}</td>
                        <td className="py-1.5 pr-3 text-center font-mono text-text-secondary">{entry.score ?? '—'}</td>
                        <td className={`py-1.5 pr-3 text-center font-bold ${getGradeColor(entry.grade)}`}>{entry.grade}</td>
                        <td className="py-1.5 pr-3 text-center">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${isPE ? 'bg-purple-500/20 text-purple-400' : entry.difficulty === 'normal' ? 'bg-warning/20 text-warning' : 'bg-accent/20 text-accent'}`}>
                            {modeLabel}
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

      {/* All Completed Games Feed (includes anonymous) */}
      {data.completionEntries && data.completionEntries.length > 0 && (() => {
        // Build lookup: completionId → initials from leaderboard entries
        const leaderboardInitials = new Map<string, string>();
        for (const entry of [...(data.leaderboardEntries || []), ...(data.recentEntries || [])]) {
          const e = entry as LeaderboardEntryAdmin & { completionId?: string };
          if (e.initials && e.completionId) {
            leaderboardInitials.set(e.completionId, e.initials);
          }
        }
        return (
        <div className="card p-4 mt-4">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">
            All Completed Games (Last 50)
            <span className="text-[10px] text-text-muted ml-2 font-normal">Includes players who skipped leaderboard</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted border-b border-border">
                  <th className="text-left py-2 pr-3">Date</th>
                  <th className="text-center py-2 pr-3">Player</th>
                  <th className="text-left py-2 pr-3">Name</th>
                  <th className="text-right py-2 pr-3">FEV</th>
                  <th className="text-center py-2 pr-3">Score</th>
                  <th className="text-center py-2 pr-3">Grade</th>
                  <th className="text-center py-2 pr-3">Mode</th>
                  <th className="text-left py-2">Info</th>
                </tr>
              </thead>
              <tbody>
                {data.completionEntries.map((c: GameCompletionAdmin, i: number) => {
                  const isPE = c.isFundManager === true;
                  const modeLabel = isPE ? 'PE' : `${c.difficulty === 'normal' ? 'H' : 'E'}/${c.duration === 'quick' ? '10' : '20'}`;
                  const dateObj = new Date(c.date);
                  const timeAgo = getTimeAgo(dateObj);
                  const resolvedInitials = (c.initials && c.initials !== 'AA' ? c.initials : null) || leaderboardInitials.get(c.completionId) || null;
                  const hasStrategy = !!c.strategy?.scoreBreakdown;
                  const isExpanded = expandedCompletionRow === i;
                  return (
                    <Fragment key={i}>
                    <tr className={`border-b border-border/50 ${hasStrategy ? 'cursor-pointer hover:bg-white/5' : ''}`}
                        onClick={() => hasStrategy && setExpandedCompletionRow(isExpanded ? null : i)}>
                      <td className="py-1.5 pr-3 text-text-muted font-mono" title={dateObj.toLocaleString()}>{timeAgo}</td>
                      <td className="py-1.5 pr-3 text-center">
                        {resolvedInitials
                          ? <span className="font-mono font-bold text-text-primary">{resolvedInitials}</span>
                          : <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-text-muted">anon</span>
                        }
                      </td>
                      <td className="py-1.5 pr-3 text-text-secondary truncate max-w-[150px]">
                        {c.holdcoName}
                        {hasStrategy && <span className="ml-1 text-accent text-[10px]">{isExpanded ? '▼' : '▶'}</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono text-accent">
                        {isPE ? formatMoney(c.carryEarned ?? 0) : formatMoney(c.founderEquityValue)}
                      </td>
                      <td className="py-1.5 pr-3 text-center font-mono text-text-secondary">{c.score ?? '—'}</td>
                      <td className={`py-1.5 pr-3 text-center font-bold ${getGradeColor(c.grade)}`}>{c.grade}</td>
                      <td className="py-1.5 pr-3 text-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${isPE ? 'bg-purple-500/20 text-purple-400' : c.difficulty === 'normal' ? 'bg-warning/20 text-warning' : 'bg-accent/20 text-accent'}`}>
                          {modeLabel}
                        </span>
                      </td>
                      <td className="py-1.5 text-text-muted">
                        {c.archetype && <span className="text-[10px] mr-1">{c.archetype}</span>}
                        {c.isChallenge && <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 mr-1">challenge</span>}
                        {c.device && <span className="text-[10px]">{c.device === 'mobile' ? '📱' : c.device === 'tablet' ? '📱' : '💻'}</span>}
                      </td>
                    </tr>
                    {isExpanded && c.strategy && (
                      <tr>
                        <td colSpan={8}>
                          <div className="px-4 pb-3 pt-2 bg-bg-secondary/50 border-t border-border/30">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                              {c.strategy.scoreBreakdown && !isPE && (
                                <div>
                                  <p className="text-text-muted font-semibold mb-1">Score Breakdown</p>
                                  <ScoreRadar dimensions={[
                                    { label: 'Value', value: c.strategy.scoreBreakdown.valueCreation, max: 20 },
                                    { label: 'FCF/Sh', value: c.strategy.scoreBreakdown.fcfShareGrowth, max: 20 },
                                    { label: 'ROIC', value: c.strategy.scoreBreakdown.portfolioRoic, max: 15 },
                                    { label: 'Deploy', value: c.strategy.scoreBreakdown.capitalDeployment, max: 15 },
                                    { label: 'B/S', value: c.strategy.scoreBreakdown.balanceSheetHealth, max: 15 },
                                    { label: 'Strat', value: c.strategy.scoreBreakdown.strategicDiscipline, max: 15 },
                                  ]} size={110} />
                                </div>
                              )}
                              <div>
                                <p className="text-text-muted font-semibold mb-1">Activity</p>
                                <p>Acquisitions: {c.strategy.totalAcquisitions ?? '—'}</p>
                                <p>Exits: {c.strategy.totalSells ?? '—'}</p>
                                <p>Platforms: {c.strategy.platformsForged ?? 0}</p>
                                <p>Peak Leverage: {c.strategy.peakLeverage ?? '—'}x</p>
                              </div>
                              {c.strategy.sectorIds && c.strategy.sectorIds.length > 0 && (
                                <div>
                                  <p className="text-text-muted font-semibold mb-1">Sectors</p>
                                  <p>{c.strategy.sectorIds.map(id => SECTORS[id]?.emoji || id).join(' ')}</p>
                                </div>
                              )}
                              {c.strategy.dealStructureTypes && Object.keys(c.strategy.dealStructureTypes).length > 0 && (
                                <div>
                                  <p className="text-text-muted font-semibold mb-1">Deal Structures</p>
                                  {Object.entries(c.strategy.dealStructureTypes).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                                    <p key={k}>{k}: {v}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                            {c.strategy.antiPatterns && c.strategy.antiPatterns.length > 0 && (
                              <div className="mt-2 flex gap-1 flex-wrap">
                                {c.strategy.antiPatterns.map(p => (
                                  <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">{p}</span>
                                ))}
                              </div>
                            )}
                          </div>
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
        );
      })()}

      {/* Leaderboard Submissions (with strategy drill-down) */}
      {data.recentEntries && data.recentEntries.length > 0 && (
        <div className="card p-4 mt-4">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Leaderboard Submissions (Last 25)</h3>
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
                  const isPERecent = entry.isFundManager === true;
                  const recentModeLabel = isPERecent ? 'PE' : `${entry.difficulty === 'normal' ? 'H' : 'E'}/${entry.duration === 'quick' ? '10' : '20'}`;
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
                        <td className="py-1.5 pr-3 text-right font-mono text-accent">{isPERecent ? formatMoney(entry.carryEarned ?? 0) : formatMoney(adjFev)}</td>
                        <td className="py-1.5 pr-3 text-center font-mono text-text-secondary">{entry.score ?? '—'}</td>
                        <td className={`py-1.5 pr-3 text-center font-bold ${getGradeColor(entry.grade)}`}>{entry.grade}</td>
                        <td className="py-1.5 pr-3 text-center">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${isPERecent ? 'bg-purple-500/20 text-purple-400' : entry.difficulty === 'normal' ? 'bg-warning/20 text-warning' : 'bg-accent/20 text-accent'}`}>
                            {recentModeLabel}
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
              const isPEEvt = evt.gameMode === 'fund_manager' || evt.isFundManager === true;
              const modeDisplay = isPEEvt ? 'PE Fund' : `${evt.difficulty === 'normal' ? 'Hard' : 'Easy'} ${evt.duration === 'quick' ? '10yr' : '20yr'}`;

              if (evt.type === 'start') {
                return (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border/30 text-xs">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-medium w-16 text-center shrink-0">START</span>
                    <span className="text-text-muted font-mono w-16 shrink-0" title={dateObj.toLocaleString()}>{timeAgo}</span>
                    <span className={`text-text-secondary ${isPEEvt ? 'text-purple-400' : ''}`}>{modeDisplay}</span>
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
                    {evt.difficulty && <span className={`text-text-muted ${isPEEvt ? 'text-purple-400' : ''}`}>· {modeDisplay}</span>}
                    {evt.fev != null && <span className="font-mono text-accent">{formatMoney(evt.fev)}</span>}
                    {mins != null && <span className="text-text-muted ml-auto">{mins}m played</span>}
                    {evt.device && <span className="text-text-muted">{evt.device}</span>}
                    {evt.gameNumber != null && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${evt.gameNumber === 1 ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-text-muted'}`}>
                        {evt.gameNumber === 1 ? '1st game' : `#${evt.gameNumber}`}
                      </span>
                    )}
                  </div>
                );
              }
            })}
          </div>
          <p className="text-[10px] text-text-muted mt-2">Shows last 50 events. Feed populates from new sessions going forward.</p>
        </div>
      )}

      {/* ── Engagement Insights ── */}
      <EngagementInsights data={data} totals={totals} />
    </>
  );
}

// ── Engagement Insights Section ──

function EngagementInsights({ data, totals }: { data: AnalyticsData; totals: Totals }) {
  const abandonItems = useMemo(() =>
    Object.entries(totals.allAbandon)
      .map(([round, count]) => ({ label: `Year ${round}`, value: count, color: '#ef4444' }))
      .sort((a, b) => parseInt(a.label.split(' ')[1]) - parseInt(b.label.split(' ')[1])),
  [totals.allAbandon]);

  const totalAbandons = useMemo(() =>
    Object.values(totals.allAbandon).reduce((s, v) => s + v, 0),
  [totals.allAbandon]);

  const durationItems = useMemo(() => {
    const order = ['<5m', '5-15m', '15-30m', '30-60m', '60m+'];
    return order.map(k => ({
      label: k,
      value: totals.allDuration[k] || 0,
      color: '#60a5fa',
    })).filter(i => i.value > 0);
  }, [totals.allDuration]);

  // Abandon rate: first-game vs returning
  const newStarts = totals.allReturning['new'] || 0;
  const returningStarts = totals.allReturning['returning'] || 0;
  const abandonRate = data.allTime.started > 0
    ? ((totalAbandons / data.allTime.started) * 100).toFixed(1) + '%'
    : '—';

  // Compute funnel milestones
  const reachedYear3 = useMemo(() =>
    Object.entries(totals.allRounds).filter(([r]) => parseInt(r) >= 3).reduce((s, [, v]) => s + v, 0)
    + Object.entries(totals.allAbandon).filter(([r]) => parseInt(r) >= 3).reduce((s, [, v]) => s + v, 0),
  [totals.allRounds, totals.allAbandon]);

  const reachedYear5 = useMemo(() =>
    Object.entries(totals.allRounds).filter(([r]) => parseInt(r) >= 5).reduce((s, [, v]) => s + v, 0)
    + Object.entries(totals.allAbandon).filter(([r]) => parseInt(r) >= 5).reduce((s, [, v]) => s + v, 0),
  [totals.allRounds, totals.allAbandon]);

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-text-secondary mb-3">Engagement Insights</h3>

      {/* Quick metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Abandon Rate" value={abandonRate} status={parseFloat(abandonRate) > 50 ? 'warning' : 'neutral'} />
        <MetricCard label="Total Abandons" value={totalAbandons} />
        <MetricCard label="New Players" value={newStarts} />
        <MetricCard label="Returning Players" value={returningStarts} />
      </div>

      {/* Funnel + Abandon by Round */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-4">
          <SectionHeader title="Player Funnel" />
          <div className="space-y-2">
            <FunnelStep label="Page Views" value={totals.totalViews} maxValue={totals.totalViews || 1} />
            <FunnelStep label="Games Started" value={data.allTime.started} maxValue={totals.totalViews || data.allTime.started} />
            <FunnelStep label="Reached Year 3" value={reachedYear3} maxValue={data.allTime.started} color="#60a5fa" />
            <FunnelStep label="Reached Year 5" value={reachedYear5} maxValue={data.allTime.started} color="#a78bfa" />
            <FunnelStep label="Completed" value={data.allTime.completed} maxValue={data.allTime.started} color="#34d399" />
          </div>
        </div>

        <AdminBarChart title="Abandonment by Round" items={abandonItems} />
      </div>

      {/* Session Duration + Device Abandon + New vs Returning */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AdminBarChart title="Session Duration (Completed)" items={durationItems} />

        <div className="card p-4">
          <SectionHeader title="Abandons by Device" />
          <DonutChart items={[
            { label: 'Desktop', value: totals.allDeviceAbandon['desktop'] || 0, color: 'var(--color-accent)' },
            { label: 'Mobile', value: totals.allDeviceAbandon['mobile'] || 0, color: '#f59e0b' },
            { label: 'Tablet', value: totals.allDeviceAbandon['tablet'] || 0, color: '#a78bfa' },
          ]} />
        </div>

        <div className="card p-4">
          <SectionHeader title="New vs Returning" />
          <DonutChart items={[
            { label: 'New', value: newStarts, color: 'var(--color-accent)' },
            { label: 'Returning', value: returningStarts, color: '#f59e0b' },
          ]} />
        </div>
      </div>
    </div>
  );
}
