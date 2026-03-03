import { useMemo } from 'react';
import { AdminBarChart } from './AdminBarChart';
import { ScoreRadar } from './ScoreRadar';
import { SectionHeader, HorizontalBar, DonutChart, computeAdjFev, MultiplierBadges } from './adminShared';
import { formatMoney } from '../../engine/types';
import type { LeaderboardStrategy } from '../../engine/types';
import { getGradeColor } from '../../utils/gradeColors';
import { SECTORS } from '../../data/sectors';
import type { AnalyticsData, Totals, LeaderboardEntryAdmin } from './adminTypes';

// ── Section 1: How Top Players Win ──

function TopPlayerCard({ entry }: { entry: LeaderboardEntryAdmin & { strategy: LeaderboardStrategy } }) {
  const s = entry.strategy;
  const adjFev = computeAdjFev(entry);

  const dimensions = [
    { label: 'Val', value: s.scoreBreakdown.valueCreation, max: 20 },
    { label: 'FCF', value: s.scoreBreakdown.fcfShareGrowth, max: 20 },
    { label: 'ROIC', value: s.scoreBreakdown.portfolioRoic, max: 15 },
    { label: 'Cap', value: s.scoreBreakdown.capitalDeployment, max: 15 },
    { label: 'B/S', value: s.scoreBreakdown.balanceSheetHealth, max: 15 },
    { label: 'Strat', value: s.scoreBreakdown.strategicDiscipline, max: 15 },
  ];

  const sectorIcons = s.sectorIds.slice(0, 5).map(id => SECTORS[id]?.emoji || '').join('');

  return (
    <div className="card p-3 min-w-[200px] flex-shrink-0">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-lg font-bold ${getGradeColor(entry.grade)}`}>{entry.grade}</span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-primary truncate">{entry.holdcoName}</p>
          <p className="text-[10px] text-text-muted font-mono">{formatMoney(adjFev)} Adj FEV</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">
          {s.archetype.replace(/_/g, ' ')}
        </span>
        <span className="text-xs">{sectorIcons}</span>
      </div>
      <div className="mb-2">
        <MultiplierBadges entry={entry} />
      </div>
      <ScoreRadar dimensions={dimensions} size={100} />
    </div>
  );
}

function HowTopPlayersWin({ entries }: { entries: LeaderboardEntryAdmin[] }) {
  const withStrategy = entries.filter((e): e is LeaderboardEntryAdmin & { strategy: LeaderboardStrategy } => !!e.strategy).slice(0, 10);

  if (withStrategy.length === 0) {
    return (
      <div className="card p-4 mb-4">
        <SectionHeader title="How Top Players Win" />
        <p className="text-xs text-text-muted">No strategy data available yet. New leaderboard entries will include strategy details.</p>
      </div>
    );
  }

  return (
    <div className="card p-4 mb-4">
      <SectionHeader title="How Top Players Win" />
      <div className="flex gap-3 overflow-x-auto pb-2">
        {withStrategy.map((entry, i) => (
          <TopPlayerCard key={i} entry={entry} />
        ))}
      </div>
    </div>
  );
}

// ── Section 2: Score Dimensions ──

const SCORE_DIM_CONFIG = [
  { key: 'valueCreation', label: 'Value Creation', max: 20 },
  { key: 'fcfShareGrowth', label: 'FCF/Share Growth', max: 20 },
  { key: 'portfolioRoic', label: 'Portfolio ROIC', max: 15 },
  { key: 'capitalDeployment', label: 'Capital Deployment', max: 15 },
  { key: 'balanceSheetHealth', label: 'Balance Sheet Health', max: 15 },
  { key: 'strategicDiscipline', label: 'Strategic Discipline', max: 15 },
];

const GRADE_TIERS = ['S', 'A', 'B', 'C'] as const;

function ScoreDimensions({ totals }: { totals: Totals }) {
  // Compute average score per dimension (stored as 10x for precision)
  const totalCount = totals.allScoreDimCounts['total'] || 0;

  const avgDimensions = SCORE_DIM_CONFIG.map(dim => ({
    label: dim.label,
    shortLabel: dim.label.split(' ')[0],
    value: totalCount > 0 ? (totals.allScoreDimSums[dim.key] || 0) / 10 / totalCount : 0,
    max: dim.max,
  }));

  // Per-grade breakdown from leaderboard entries with strategy
  // (This uses the archetype_grade counter as a proxy — actual per-dim by grade would need more data)

  const radarDimensions = avgDimensions.map(d => ({
    label: d.shortLabel,
    value: d.value,
    max: d.max,
  }));

  return (
    <div className="card p-4 mb-4">
      <SectionHeader title="Score Dimensions" />
      {totalCount === 0 ? (
        <p className="text-xs text-text-muted">No score dimension data yet. New game completions will populate this.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Radar chart */}
          <div className="flex flex-col items-center">
            <ScoreRadar dimensions={radarDimensions} size={200} />
            <p className="text-[10px] text-text-muted mt-2">Average across {totalCount} games</p>
          </div>

          {/* Dimension table */}
          <div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="text-left py-1.5">Dimension</th>
                  <th className="text-right py-1.5">Avg</th>
                  <th className="text-right py-1.5">Max</th>
                  <th className="text-right py-1.5">% of Max</th>
                </tr>
              </thead>
              <tbody>
                {avgDimensions.map(d => {
                  const pct = d.max > 0 ? (d.value / d.max) * 100 : 0;
                  return (
                    <tr key={d.label} className="border-b border-border/30">
                      <td className="py-1.5 text-text-secondary">{d.label}</td>
                      <td className="py-1.5 text-right font-mono">{d.value.toFixed(1)}</td>
                      <td className="py-1.5 text-right font-mono text-text-muted">{d.max}</td>
                      <td className="py-1.5 text-right">
                        <span className={`font-mono ${pct >= 70 ? 'text-green-400' : pct >= 40 ? 'text-warning' : 'text-danger'}`}>
                          {pct.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section 3: Strategy Landscape ──

function StrategyLandscape({ totals }: { totals: Totals }) {
  // Archetype distribution with avg grade
  const archetypeItems = useMemo(() => {
    const entries = Object.entries(totals.allArchetypes)
      .map(([a, v]) => ({ label: a.replace(/_/g, ' '), value: v }))
      .sort((a, b) => b.value - a.value);

    return entries;
  }, [totals.allArchetypes]);

  // Compute avg grade per archetype from archetypeByGrade counter
  const archetypeGradeInfo = useMemo(() => {
    const gradeValues: Record<string, number> = { S: 5, A: 4, B: 3, C: 2, D: 1, F: 0 };
    const info: Record<string, { totalGrade: number; count: number }> = {};

    for (const [key, count] of Object.entries(totals.allArchetypeByGrade)) {
      const parts = key.split(':');
      const archetype = parts[0].replace(/_/g, ' ');
      const grade = parts[1];
      if (!info[archetype]) info[archetype] = { totalGrade: 0, count: 0 };
      info[archetype].totalGrade += (gradeValues[grade] || 0) * count;
      info[archetype].count += count;
    }

    const result: Record<string, string> = {};
    for (const [arch, data] of Object.entries(info)) {
      if (data.count > 0) {
        const avgVal = data.totalGrade / data.count;
        // Map back to letter
        if (avgVal >= 4.5) result[arch] = 'S';
        else if (avgVal >= 3.5) result[arch] = 'A';
        else if (avgVal >= 2.5) result[arch] = 'B';
        else if (avgVal >= 1.5) result[arch] = 'C';
        else if (avgVal >= 0.5) result[arch] = 'D';
        else result[arch] = 'F';
      }
    }
    return result;
  }, [totals.allArchetypeByGrade]);

  // Anti-pattern by grade (stacked breakdown)
  const antiPatternByGradeItems = useMemo(() => {
    const patterns: Record<string, Record<string, number>> = {};
    for (const [key, count] of Object.entries(totals.allAntiPatternByGrade)) {
      const parts = key.split(':');
      const pattern = parts[0].replace(/_/g, ' ');
      const grade = parts[1];
      if (!patterns[pattern]) patterns[pattern] = {};
      patterns[pattern][grade] = count;
    }

    return Object.entries(patterns)
      .map(([pattern, grades]) => ({
        pattern,
        total: Object.values(grades).reduce((s, v) => s + v, 0),
        grades,
      }))
      .sort((a, b) => b.total - a.total);
  }, [totals.allAntiPatternByGrade]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
      {/* Archetypes with avg grade */}
      <div className="card p-4">
        <SectionHeader title="Strategy Archetypes" />
        <div className="space-y-2">
          {archetypeItems.map(item => {
            const avgGrade = archetypeGradeInfo[item.label];
            const max = Math.max(...archetypeItems.map(i => i.value), 1);
            return (
              <div key={item.label} className="flex items-center gap-2">
                <span className="text-[11px] text-text-secondary w-28 truncate text-right" title={item.label}>{item.label}</span>
                <div className="flex-1 h-4 bg-bg-primary rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all duration-500"
                    style={{
                      width: `${Math.max((item.value / max) * 100, 2)}%`,
                      backgroundColor: '#a78bfa',
                    }}
                  />
                </div>
                <span className="text-[11px] font-mono text-text-muted w-8 text-right">{item.value}</span>
                {avgGrade && (
                  <span className={`text-[10px] font-bold w-4 text-center ${getGradeColor(avgGrade)}`}>{avgGrade}</span>
                )}
              </div>
            );
          })}
          {archetypeItems.length === 0 && <p className="text-xs text-text-muted">No archetype data yet</p>}
        </div>
      </div>

      {/* Anti-patterns by grade */}
      <div className="card p-4">
        <SectionHeader title="Anti-Patterns by Grade" />
        {antiPatternByGradeItems.length > 0 ? (
          <div className="space-y-2.5">
            {antiPatternByGradeItems.map(item => {
              const max = Math.max(...antiPatternByGradeItems.map(i => i.total), 1);
              return (
                <div key={item.pattern}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] text-text-secondary w-28 truncate text-right" title={item.pattern}>{item.pattern}</span>
                    <div className="flex-1 h-4 bg-bg-primary rounded overflow-hidden flex">
                      {GRADE_TIERS.map(g => {
                        const count = item.grades[g] || 0;
                        if (count === 0) return null;
                        const pct = (count / max) * 100;
                        const colors: Record<string, string> = { S: '#facc15', A: '#60a5fa', B: '#34d399', C: '#f59e0b' };
                        return (
                          <div
                            key={g}
                            className="h-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: colors[g] || '#ef4444' }}
                            title={`${g}: ${count}`}
                          />
                        );
                      })}
                    </div>
                    <span className="text-[11px] font-mono text-text-muted w-8 text-right">{item.total}</span>
                  </div>
                </div>
              );
            })}
            <div className="flex gap-3 mt-2">
              {GRADE_TIERS.map(g => {
                const colors: Record<string, string> = { S: '#facc15', A: '#60a5fa', B: '#34d399', C: '#f59e0b' };
                return (
                  <div key={g} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[g] }} />
                    <span className="text-[10px] text-text-muted">{g}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // Fallback to flat anti-pattern list
          <HorizontalBar
            items={Object.entries(totals.allAntiPatterns)
              .map(([a, v]) => ({ label: a.replace(/_/g, ' '), value: v }))
              .sort((a, b) => b.value - a.value)}
            colorFn={() => '#ef4444'}
          />
        )}
      </div>
    </div>
  );
}

// ── Section 4: Deal & Sector Usage ──

function DealSectorUsage({ totals, sectorItems }: { totals: Totals; sectorItems: { label: string; value: number; color?: string; emoji?: string }[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
      <div className="card p-4">
        <SectionHeader title="Deal Structure Distribution" />
        <HorizontalBar
          items={Object.entries(totals.allStructures)
            .map(([s, v]) => ({ label: s.replace(/_/g, ' '), value: v }))
            .sort((a, b) => b.value - a.value)}
          colorFn={() => '#f59e0b'}
        />
        {Object.keys(totals.allStructures).length === 0 && <p className="text-xs text-text-muted">No deal structure data yet</p>}
      </div>
      <AdminBarChart title="Sector Popularity" items={sectorItems} />
    </div>
  );
}

// ── Section 5: Portfolio Profile ──

function PortfolioProfile({ totals, gradeItems, fevItems }: {
  totals: Totals;
  gradeItems: { label: string; value: number }[];
  fevItems: { label: string; value: number }[];
}) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Grade + FEV */}
        <div className="space-y-4">
          <div className="card p-4">
            <SectionHeader title="Grade Distribution" />
            <div className="space-y-2">
              {gradeItems.map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className={`text-sm font-bold w-6 ${getGradeColor(item.label)}`}>{item.label}</span>
                  <div className="flex-1 h-5 bg-bg-primary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max((item.value / Math.max(...gradeItems.map(g => g.value), 1)) * 100, 2)}%`,
                        backgroundColor: item.label === 'S' ? '#facc15' : item.label === 'A' ? 'var(--color-accent)' : item.label === 'B' ? '#60a5fa' : item.label === 'C' ? '#f59e0b' : item.label === 'D' ? '#f97316' : '#ef4444',
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono text-text-secondary w-8 text-right">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
          <AdminBarChart title="FEV Distribution" items={fevItems} />
        </div>

        {/* Platforms Forged Distribution */}
        <div className="space-y-4">
          {/* Platforms forged */}
          <div className="card p-4">
            <SectionHeader title="Platforms Forged Distribution" />
            {Object.keys(totals.allEndingConstruction).length > 0 ? (
              <HorizontalBar
                items={Object.entries(totals.allEndingConstruction)
                  .filter(([k]) => k !== 'standalone' && k !== 'roll_up' && k !== 'integrated_platform')
                  .concat(
                    // Also show the platforms_forged counter data if available
                    // (platformsForgedDistribution from existing telemetry)
                  )
                  .map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: v }))
                  .sort((a, b) => b.value - a.value)}
                colorFn={() => '#a78bfa'}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Completion Profile: Ending Businesses */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Portfolio Construction */}
        <div className="card p-4 min-w-0">
          <SectionHeader title="Portfolio Construction" />
          {Object.keys(totals.allEndingConstruction).length > 0 ? (
            <>
              <DonutChart items={[
                { label: 'Standalone', value: totals.allEndingConstruction['standalone'] || 0, color: 'var(--color-accent)' },
                { label: 'Roll-Up', value: totals.allEndingConstruction['roll_up'] || 0, color: '#a78bfa' },
                { label: 'Integrated Platform', value: totals.allEndingConstruction['integrated_platform'] || 0, color: '#facc15' },
              ].filter(i => i.value > 0)} />
              <p className="text-[10px] text-text-muted mt-2">Distribution of ending business types across completions</p>
            </>
          ) : <p className="text-xs text-text-muted">No data yet</p>}
        </div>

        {/* Avg Ending Business Size */}
        <div className="card p-4 min-w-0 flex flex-col justify-center">
          <SectionHeader title="Avg Ending Business EBITDA" />
          <div className="text-center py-4">
            <p className="text-3xl font-bold text-accent">{totals.avgEndingEbitda > 0 ? formatMoney(totals.avgEndingEbitda) : '—'}</p>
            <p className="text-xs text-text-muted mt-1">Average EBITDA of active businesses at game end</p>
          </div>
        </div>

        {/* Top Ending Sub-Sectors */}
        <div className="card p-4 min-w-0">
          <SectionHeader title="Top Ending Sub-Sectors" />
          {Object.keys(totals.allEndingSubTypes).length > 0 ? (
            <HorizontalBar
              items={Object.entries(totals.allEndingSubTypes)
                .map(([k, v]) => {
                  const parts = k.split(':');
                  const sectorEmoji = SECTORS[parts[0]]?.emoji || '';
                  return { label: `${sectorEmoji} ${(parts[1] || k).replace(/_/g, ' ')}`, value: v };
                })
                .sort((a, b) => b.value - a.value)
                .slice(0, 12)}
              colorFn={() => '#34d399'}
            />
          ) : <p className="text-xs text-text-muted">No data yet</p>}
        </div>
      </div>
    </>
  );
}

// ── Main BalanceTab ──

interface BalanceTabProps {
  data: AnalyticsData;
  totals: Totals;
  sectorItems: { label: string; value: number; color?: string; emoji?: string }[];
  gradeItems: { label: string; value: number }[];
  fevItems: { label: string; value: number }[];
}

export function BalanceTab({ data, totals, sectorItems, gradeItems, fevItems }: BalanceTabProps) {
  return (
    <>
      {/* Section 1: How Top Players Win */}
      <HowTopPlayersWin entries={data.leaderboardEntries} />

      {/* Section 2: Score Dimensions */}
      <ScoreDimensions totals={totals} />

      {/* Section 3: Strategy Landscape */}
      <StrategyLandscape totals={totals} />

      {/* Section 4: Deal & Sector Usage */}
      <DealSectorUsage totals={totals} sectorItems={sectorItems} />

      {/* Section 5: Portfolio Profile */}
      <PortfolioProfile totals={totals} gradeItems={gradeItems} fevItems={fevItems} />
    </>
  );
}
