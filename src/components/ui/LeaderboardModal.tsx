import { Fragment, useEffect, useMemo, useState } from 'react';
import { LeaderboardEntry, GameDifficulty, GameDuration, formatMoney } from '../../engine/types';
import { loadLeaderboard } from '../../engine/scoring';
import { getGradeColor, getRankColor } from '../../utils/gradeColors';
import { Modal } from './Modal';
import { DIFFICULTY_CONFIG } from '../../data/gameConfig';

type LeaderboardTab = 'overall' | 'hard20' | 'hard10' | 'easy20' | 'easy10' | 'distributions';

interface TabDef {
  id: LeaderboardTab;
  label: string;
  mobileLabel: string;
}

const TABS: TabDef[] = [
  { id: 'overall', label: 'Overall', mobileLabel: 'All' },
  { id: 'hard20', label: 'Hard / 20yr', mobileLabel: 'H/20' },
  { id: 'hard10', label: 'Hard / 10yr', mobileLabel: 'H/10' },
  { id: 'easy20', label: 'Easy / 20yr', mobileLabel: 'E/20' },
  { id: 'easy10', label: 'Easy / 10yr', mobileLabel: 'E/10' },
  { id: 'distributions', label: 'Distributions', mobileLabel: 'Dist' },
];

const TAB_DISPLAY_CAP = 50;

interface LeaderboardModalProps {
  onClose: () => void;
  hypotheticalEV?: number;
  hypotheticalRawFEV?: number;
  hypotheticalWealth?: number;
  currentDifficulty?: GameDifficulty;
  currentDuration?: GameDuration;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getAdjustedFEV(entry: LeaderboardEntry): number {
  const raw = entry.founderEquityValue ?? entry.enterpriseValue;
  const difficulty = entry.difficulty ?? 'easy';
  return Math.round(raw * (DIFFICULTY_CONFIG[difficulty]?.leaderboardMultiplier ?? 1.0));
}

function getEntryDifficulty(entry: LeaderboardEntry): GameDifficulty {
  return entry.difficulty ?? 'easy';
}

function getEntryDuration(entry: LeaderboardEntry): GameDuration {
  return entry.duration ?? 'standard';
}

function filterAndSort(entries: LeaderboardEntry[], tab: LeaderboardTab): LeaderboardEntry[] {
  let filtered: LeaderboardEntry[];

  switch (tab) {
    case 'overall':
      filtered = [...entries];
      filtered.sort((a, b) => getAdjustedFEV(b) - getAdjustedFEV(a));
      break;
    case 'hard20':
      filtered = entries.filter(e => getEntryDifficulty(e) === 'normal' && getEntryDuration(e) === 'standard');
      filtered.sort((a, b) => getAdjustedFEV(b) - getAdjustedFEV(a));
      break;
    case 'hard10':
      filtered = entries.filter(e => getEntryDifficulty(e) === 'normal' && getEntryDuration(e) === 'quick');
      filtered.sort((a, b) => getAdjustedFEV(b) - getAdjustedFEV(a));
      break;
    case 'easy20':
      filtered = entries.filter(e => getEntryDifficulty(e) === 'easy' && getEntryDuration(e) === 'standard');
      filtered.sort((a, b) => getAdjustedFEV(b) - getAdjustedFEV(a));
      break;
    case 'easy10':
      filtered = entries.filter(e => getEntryDifficulty(e) === 'easy' && getEntryDuration(e) === 'quick');
      filtered.sort((a, b) => getAdjustedFEV(b) - getAdjustedFEV(a));
      break;
    case 'distributions':
      filtered = entries.filter(e => (e.founderPersonalWealth ?? 0) > 0);
      filtered.sort((a, b) => (b.founderPersonalWealth ?? 0) - (a.founderPersonalWealth ?? 0));
      break;
  }

  return filtered.slice(0, TAB_DISPLAY_CAP);
}

/** Get the display value for an entry in a given tab */
function getDisplayValue(entry: LeaderboardEntry, tab: LeaderboardTab): number {
  if (tab === 'distributions') return entry.founderPersonalWealth ?? 0;
  return getAdjustedFEV(entry);
}

function getDisplayLabel(tab: LeaderboardTab): string {
  if (tab === 'distributions') return 'Wealth';
  return 'Adj FEV';
}

/** Get the ghost row value for a given tab, or -1 if no ghost should show */
function getGhostValue(
  tab: LeaderboardTab,
  hypotheticalEV?: number,
  hypotheticalRawFEV?: number,
  hypotheticalWealth?: number,
  currentDifficulty?: GameDifficulty,
  currentDuration?: GameDuration,
): number {
  // No ghost if no game is in progress (all props undefined)
  if (hypotheticalEV === undefined && hypotheticalRawFEV === undefined) return -1;

  switch (tab) {
    case 'overall':
      return hypotheticalEV && hypotheticalEV > 0 ? hypotheticalEV : -1;
    case 'hard20':
      if (currentDifficulty !== 'normal' || currentDuration !== 'standard') return -1;
      return hypotheticalRawFEV && hypotheticalRawFEV > 0 ? hypotheticalRawFEV : -1;
    case 'hard10':
      if (currentDifficulty !== 'normal' || currentDuration !== 'quick') return -1;
      return hypotheticalRawFEV && hypotheticalRawFEV > 0 ? hypotheticalRawFEV : -1;
    case 'easy20':
      if (currentDifficulty !== 'easy' || (currentDuration && currentDuration !== 'standard')) return -1;
      return hypotheticalRawFEV && hypotheticalRawFEV > 0 ? hypotheticalRawFEV : -1;
    case 'easy10':
      if (currentDifficulty !== 'easy' || currentDuration !== 'quick') return -1;
      return hypotheticalRawFEV && hypotheticalRawFEV > 0 ? hypotheticalRawFEV : -1;
    case 'distributions':
      return hypotheticalWealth && hypotheticalWealth > 0 ? hypotheticalWealth : -1;
  }
}

export function LeaderboardModal({
  onClose,
  hypotheticalEV,
  hypotheticalRawFEV,
  hypotheticalWealth,
  currentDifficulty,
  currentDuration,
}: LeaderboardModalProps) {
  const [allEntries, setAllEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('overall');

  const fetchLeaderboard = () => {
    setLoading(true);
    setError(false);
    loadLeaderboard()
      .then(entries => {
        setAllEntries(entries);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const filtered = useMemo(() => filterAndSort(allEntries, activeTab), [allEntries, activeTab]);

  const ghostValue = getGhostValue(activeTab, hypotheticalEV, hypotheticalRawFEV, hypotheticalWealth, currentDifficulty, currentDuration);
  const showWealth = activeTab === 'distributions';
  const valueLabel = getDisplayLabel(activeTab);

  // Compute ghost rank within filtered list
  const ghostRank = ghostValue > 0
    ? filtered.filter(e => getDisplayValue(e, activeTab) > ghostValue).length
    : -1;

  const tabSubtitle = activeTab === 'overall'
    ? 'All runs ranked by adjusted FEV'
    : activeTab === 'distributions'
    ? 'Ranked by founder distributions received'
    : 'Ranked by adjusted FEV within mode';

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      header={
        <>
          <h3 className="text-xl font-bold flex items-center gap-2">
            <span>🌍</span> Global Leaderboard
          </h3>
          <p className="text-text-muted text-sm">{tabSubtitle}</p>
        </>
      }
      size="md"
    >
      {/* Tab Bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-3 mb-3 -mx-1 px-1 scrollbar-hide">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap text-sm min-h-[36px] ${
              activeTab === tab.id
                ? 'bg-accent text-bg-primary font-medium'
                : 'text-text-muted hover:text-text-primary hover:bg-white/5'
            }`}
          >
            <span className="sm:hidden">{tab.mobileLabel}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-14 bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="card text-center text-text-muted py-8">
          <p>Failed to load leaderboard.</p>
          <button onClick={fetchLeaderboard} className="btn-secondary text-sm mt-3">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && ghostRank === -1 ? (
        <div className="card text-center text-text-muted py-8">
          <p>No scores yet{activeTab !== 'overall' ? ' in this category' : ''}.</p>
          <p className="text-sm mt-2">Complete a game to set your first record.</p>
        </div>
      ) : null}

      {!loading && !error && (filtered.length > 0 || ghostRank !== -1) && (
        <div className="space-y-2">
          {filtered.map((entry, index) => (
            <Fragment key={entry.id}>
              {ghostRank === index && (
                <GhostRow rank={index + 1} value={ghostValue} label={valueLabel} />
              )}
              <LeaderboardRow
                entry={entry}
                rank={index < ghostRank || ghostRank === -1 ? index + 1 : index + 2}
                showWealth={showWealth}
                tab={activeTab}
              />
            </Fragment>
          ))}
          {ghostRank === filtered.length && (
            <GhostRow rank={filtered.length + 1} value={ghostValue} label={valueLabel} />
          )}
        </div>
      )}
    </Modal>
  );
}

function RankBadge({ rank }: { rank: number }) {
  return <span className={`text-base sm:text-lg font-bold tabular-nums w-10 text-center inline-block ${getRankColor(rank)}`}>#{rank}</span>;
}

function LeaderboardRow({ entry, rank, showWealth, tab }: { entry: LeaderboardEntry; rank: number; showWealth: boolean; tab: LeaderboardTab }) {
  const displayValue = getDisplayValue(entry, tab);
  const displayLabel = showWealth ? 'Wealth' : 'Adj FEV';

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <RankBadge rank={rank} />
        <div className="min-w-0">
          <p className="font-bold">{entry.initials}</p>
          <p className="text-xs text-text-muted truncate">{entry.holdcoName}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4 md:gap-6 text-right shrink-0">
        <div className="min-w-[4.5rem]">
          <p className="text-xs text-text-muted">{displayLabel}</p>
          <p className="font-mono tabular-nums font-bold text-accent">{formatMoney(displayValue)}</p>
        </div>
        <div className="min-w-[3.5rem]">
          <p className="text-xs text-text-muted">Score</p>
          <p className={`font-mono tabular-nums ${getGradeColor(entry.grade)}`}>{entry.score} ({entry.grade})</p>
        </div>
        <div className="w-8 flex justify-center">
          {entry.difficulty ? (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${entry.difficulty === 'normal' ? 'bg-orange-500/20 text-orange-400' : 'bg-accent/20 text-accent'}`}>
              {entry.difficulty === 'normal' ? 'H' : 'E'}{entry.duration === 'quick' ? '/10' : ''}
            </span>
          ) : null}
        </div>
        <div className="text-xs text-text-muted hidden sm:block w-20">
          {formatDate(entry.date)}
        </div>
      </div>
    </div>
  );
}

function GhostRow({ rank, value, label }: { rank: number; value: number; label: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border-2 border-dashed border-accent/40 bg-accent/5">
      <div className="flex items-center gap-4">
        <RankBadge rank={rank} />
        <div>
          <p className="font-bold text-accent">You are here</p>
          <p className="text-xs text-text-muted">Current run</p>
        </div>
      </div>
      <div className="flex items-center gap-4 sm:gap-6 text-right">
        <div className="min-w-[4.5rem]">
          <p className="text-xs text-text-muted">{label}</p>
          <p className="font-mono tabular-nums font-bold text-accent">{formatMoney(value)}</p>
        </div>
        <div className="min-w-[3.5rem]" />
        <div className="w-8" />
        <div className="w-20 hidden sm:block" />
      </div>
    </div>
  );
}

// --- Exported utilities for GameOverScreen inline leaderboard ---

export { TABS, TAB_DISPLAY_CAP, filterAndSort, getDisplayValue, getDisplayLabel, getGhostValue, getAdjustedFEV };
export type { LeaderboardTab };
