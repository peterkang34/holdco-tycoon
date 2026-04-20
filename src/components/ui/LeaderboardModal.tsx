import type React from 'react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { LeaderboardEntry, GameDifficulty, GameDuration, formatMoney, RankingMetric } from '../../engine/types';
import { loadLeaderboard } from '../../engine/scoring';
import { getGradeColor, getRankColor } from '../../utils/gradeColors';
import { Modal } from './Modal';
import { RESTRUCTURING_FEV_PENALTY } from '../../data/gameConfig';
import { useAuthStore } from '../../hooks/useAuth';
import { ACHIEVEMENT_PREVIEW } from '../../data/achievementPreview';
import { ProfileModal } from './ProfileModal';
import {
  fetchScenarioList,
  fetchScenarioLeaderboard,
  formatRankingMetric,
  type ScenarioListSummary,
  type ScenarioLeaderboardEntry,
} from '../../services/scenarioLeaderboard';
import { isScenarioChallengesPlayerFacingEnabled } from '../../utils/featureFlags';

type LeaderboardTab = 'overall' | 'hard20' | 'hard10' | 'easy20' | 'easy10' | 'distributions' | 'pe' | 'scenarios';

interface TabDef {
  id: LeaderboardTab;
  label: string;
  mobileLabel: string;
}

const ALL_TABS: TabDef[] = [
  { id: 'overall', label: 'Overall', mobileLabel: 'All' },
  { id: 'hard20', label: 'Hard / 20yr', mobileLabel: 'H/20' },
  { id: 'hard10', label: 'Hard / 10yr', mobileLabel: 'H/10' },
  { id: 'easy20', label: 'Easy / 20yr', mobileLabel: 'E/20' },
  { id: 'easy10', label: 'Easy / 10yr', mobileLabel: 'E/10' },
  { id: 'distributions', label: 'Distributions', mobileLabel: 'Dist' },
  { id: 'pe', label: 'PE Fund', mobileLabel: 'PE' },
  { id: 'scenarios', label: 'Scenarios', mobileLabel: 'SC' },
];

// Scenarios tab is feature-flagged (plan §12). Hidden in the tab bar when flag off,
// but we keep it in `ALL_TABS` for type exhaustiveness; `TABS` is the render set.
const TABS: TabDef[] = isScenarioChallengesPlayerFacingEnabled()
  ? ALL_TABS
  : ALL_TABS.filter(t => t.id !== 'scenarios');

const TAB_DISPLAY_CAP = 50;

interface LeaderboardModalProps {
  onClose: () => void;
  hypotheticalEV?: number;
  hypotheticalRawFEV?: number;
  hypotheticalWealth?: number;
  currentDifficulty?: GameDifficulty;
  currentDuration?: GameDuration;
  /** Deep-link: open on a specific tab. */
  initialTab?: LeaderboardTab;
  /** Deep-link: when initialTab==='scenarios', focus this scenario's leaderboard. */
  initialScenarioId?: string | null;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getAdjustedFEV(entry: LeaderboardEntry): number {
  const raw = entry.founderEquityValue ?? entry.enterpriseValue;
  const difficulty = entry.difficulty ?? 'easy';
  // Grandfather: use stored multiplier if available, otherwise legacy defaults
  const multiplier = entry.submittedMultiplier
    ?? (difficulty === 'easy' ? 1.0 : 1.35);
  const restructuringPenalty = entry.hasRestructured ? RESTRUCTURING_FEV_PENALTY : 1.0;
  const foMultiplier = entry.foMultiplier ?? 1.0;
  return Math.round(raw * multiplier * restructuringPenalty * foMultiplier);
}

function getEntryDifficulty(entry: LeaderboardEntry): GameDifficulty {
  return entry.difficulty ?? 'easy';
}

function getEntryDuration(entry: LeaderboardEntry): GameDuration {
  return entry.duration ?? 'standard';
}

function filterAndSort(entries: LeaderboardEntry[], tab: LeaderboardTab): LeaderboardEntry[] {
  let filtered: LeaderboardEntry[];

  // PE entries are separated — exclude from holdco tabs, holdco entries excluded from PE tab
  const holdcoEntries = entries.filter(e => !e.isFundManager);
  const peEntries = entries.filter(e => e.isFundManager);

  switch (tab) {
    case 'overall':
      filtered = [...holdcoEntries];
      filtered.sort((a, b) => getAdjustedFEV(b) - getAdjustedFEV(a));
      break;
    case 'hard20':
      filtered = holdcoEntries.filter(e => getEntryDifficulty(e) === 'normal' && getEntryDuration(e) === 'standard');
      filtered.sort((a, b) => getAdjustedFEV(b) - getAdjustedFEV(a));
      break;
    case 'hard10':
      filtered = holdcoEntries.filter(e => getEntryDifficulty(e) === 'normal' && getEntryDuration(e) === 'quick');
      filtered.sort((a, b) => getAdjustedFEV(b) - getAdjustedFEV(a));
      break;
    case 'easy20':
      filtered = holdcoEntries.filter(e => getEntryDifficulty(e) === 'easy' && getEntryDuration(e) === 'standard');
      filtered.sort((a, b) => getAdjustedFEV(b) - getAdjustedFEV(a));
      break;
    case 'easy10':
      filtered = holdcoEntries.filter(e => getEntryDifficulty(e) === 'easy' && getEntryDuration(e) === 'quick');
      filtered.sort((a, b) => getAdjustedFEV(b) - getAdjustedFEV(a));
      break;
    case 'distributions':
      filtered = holdcoEntries.filter(e => (e.founderPersonalWealth ?? 0) > 0);
      filtered.sort((a, b) => (b.founderPersonalWealth ?? 0) - (a.founderPersonalWealth ?? 0));
      break;
    case 'pe':
      filtered = [...peEntries];
      filtered.sort((a, b) => (b.carryEarned ?? 0) - (a.carryEarned ?? 0));
      break;
    case 'scenarios':
      // Scenarios have their own endpoint + panel; never surface global entries here.
      filtered = [];
      break;
  }

  return filtered.slice(0, TAB_DISPLAY_CAP);
}

/** Get the display value for an entry in a given tab */
function getDisplayValue(entry: LeaderboardEntry, tab: LeaderboardTab): number {
  if (tab === 'distributions') return entry.founderPersonalWealth ?? 0;
  if (tab === 'pe') return entry.carryEarned ?? 0;
  return getAdjustedFEV(entry);
}

function getDisplayLabel(tab: LeaderboardTab): string {
  if (tab === 'distributions') return 'Wealth';
  if (tab === 'pe') return 'Carry';
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
    case 'pe':
      return -1; // No ghost row for PE tab (PE games always end before viewing leaderboard mid-game)
    case 'scenarios':
      return -1; // No ghost row — scenarios tab uses a separate panel.
  }
}

export function LeaderboardModal({
  onClose,
  hypotheticalEV,
  hypotheticalRawFEV,
  hypotheticalWealth,
  currentDifficulty,
  currentDuration,
  initialTab,
  initialScenarioId,
}: LeaderboardModalProps) {
  const [allEntries, setAllEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Defense-in-depth: if flag flips off while a deep-link URL is cached, fall back to 'overall'.
  const resolvedInitialTab: LeaderboardTab = initialTab === 'scenarios' && !isScenarioChallengesPlayerFacingEnabled()
    ? 'overall'
    : (initialTab ?? 'overall');
  const [activeTab, setActiveTab] = useState<LeaderboardTab>(resolvedInitialTab);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  // Scenarios-tab state lifted here (Dara H2) so tab flips don't refetch
  // `/api/scenario-challenges/list` — the list changes only on admin activity,
  // which is rare within a single modal session. Selected scenario also persists
  // so back-button lands on the previously-seen browse view instead of losing
  // scroll position.
  const [scenariosList, setScenariosList] = useState<{ active: ScenarioListSummary[]; archived: ScenarioListSummary[] } | null>(null);
  const [scenariosListLoading, setScenariosListLoading] = useState(false);
  const [scenariosListError, setScenariosListError] = useState(false);
  const [scenariosListLoaded, setScenariosListLoaded] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(initialScenarioId ?? null);

  const loadScenariosList = () => {
    setScenariosListLoading(true);
    setScenariosListError(false);
    fetchScenarioList()
      .then(res => {
        setScenariosList(res);
        setScenariosListLoading(false);
        setScenariosListLoaded(true);
      })
      .catch(() => {
        setScenariosListError(true);
        setScenariosListLoading(false);
      });
  };

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
    // Skip global fetch when opening directly on the scenarios tab — saves a round-trip.
    // Browsing the scenarios tab and later flipping to a global tab triggers the effect only if
    // it hadn't loaded yet, so we lazy-fetch instead.
    if (activeTab === 'scenarios') {
      // Opened directly on scenarios tab — kick off list load. List lives in LeaderboardModal
      // state so switching tabs back and forth doesn't refetch (Dara H2).
      loadScenariosList();
    } else {
      fetchLeaderboard();
    }
    // Intentional: we only need to guard the INITIAL fetch; subsequent tab swaps reuse cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazy-load global entries if the user arrives on scenarios then clicks a global tab.
  useEffect(() => {
    if (activeTab !== 'scenarios' && allEntries.length === 0 && !loading && !error) {
      fetchLeaderboard();
    }
    // Lazy-load scenarios list the first time scenarios tab becomes active.
    if (activeTab === 'scenarios' && !scenariosListLoaded && !scenariosListLoading) {
      loadScenariosList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const filtered = useMemo(() => filterAndSort(allEntries, activeTab), [allEntries, activeTab]);

  const ghostValue = getGhostValue(activeTab, hypotheticalEV, hypotheticalRawFEV, hypotheticalWealth, currentDifficulty, currentDuration);
  const showWealth = activeTab === 'distributions';
  const valueLabel = getDisplayLabel(activeTab);

  // Compute ghost rank within filtered list
  const ghostRank = ghostValue > 0
    ? filtered.filter(e => getDisplayValue(e, activeTab) > ghostValue).length
    : -1;

  const handleProfileClick = (pubId: string) => {
    setProfileId(pubId);
    setShowProfile(true);
  };

  const handleBackToLeaderboard = () => {
    setShowProfile(false);
    setProfileId(null);
  };

  // If profile modal is open, render it instead of leaderboard
  if (showProfile) {
    return (
      <ProfileModal
        isOpen={true}
        onClose={handleBackToLeaderboard}
        publicProfileId={profileId}
        onBackToLeaderboard={handleBackToLeaderboard}
      />
    );
  }

  const tabSubtitle = activeTab === 'overall'
    ? 'All runs ranked by adjusted FEV'
    : activeTab === 'distributions'
    ? 'Ranked by founder distributions received'
    : activeTab === 'pe'
    ? 'PE Fund Manager runs ranked by carried interest earned'
    : activeTab === 'scenarios'
    ? 'Themed, time-limited challenges with standalone leaderboards'
    : 'Ranked by adjusted FEV within mode';

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      header={
        <>
          <h3 className="text-xl font-bold flex items-center gap-2">
            {activeTab === 'scenarios' ? (
              <><span>🎯</span> Scenario Challenges</>
            ) : (
              <><span>🌍</span> Global Leaderboard</>
            )}
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
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap text-sm min-h-[44px] flex items-center ${
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

      {activeTab === 'scenarios' ? (
        <ScenariosPanel
          list={scenariosList}
          listLoading={scenariosListLoading}
          listError={scenariosListError}
          onRetryList={loadScenariosList}
          selectedScenarioId={selectedScenarioId}
          onSelectScenario={setSelectedScenarioId}
          onProfileClick={handleProfileClick}
        />
      ) : null}

      {activeTab !== 'scenarios' && loading && (
        <div className="space-y-2 min-h-[300px] sm:min-h-[400px]">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-14 bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {activeTab !== 'scenarios' && error && (
        <div className="card text-center text-text-muted py-8 min-h-[300px] sm:min-h-[400px] flex flex-col items-center justify-center">
          <p>Failed to load leaderboard.</p>
          <button onClick={fetchLeaderboard} className="btn-secondary text-sm mt-3">
            Retry
          </button>
        </div>
      )}

      {activeTab !== 'scenarios' && !loading && !error && filtered.length === 0 && ghostRank === -1 ? (
        <div className="card text-center text-text-muted py-8 min-h-[300px] sm:min-h-[400px] flex flex-col items-center justify-center">
          <p>No scores yet{activeTab !== 'overall' ? ' in this category' : ''}.</p>
          <p className="text-sm mt-2">Complete a game to set your first record.</p>
        </div>
      ) : null}

      {activeTab !== 'scenarios' && !loading && !error && (filtered.length > 0 || ghostRank !== -1) && (
        <div className="space-y-2 min-h-[300px] sm:min-h-[400px]">
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
                onProfileClick={handleProfileClick}
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

function LeaderboardRow({ entry, rank, showWealth, tab, onProfileClick }: { entry: LeaderboardEntry; rank: number; showWealth: boolean; tab: LeaderboardTab; onProfileClick?: (publicProfileId: string) => void }) {
  const isPE = tab === 'pe';
  const displayValue = getDisplayValue(entry, tab);
  const displayLabel = isPE ? 'Carry' : showWealth ? 'Wealth' : 'Adj FEV';
  const rawFEV = entry.founderEquityValue ?? entry.enterpriseValue;
  const adjFEV = getAdjustedFEV(entry);
  const showRaw = !showWealth && !isPE && rawFEV > 0 && adjFEV !== rawFEV;

  const currentPlayerId = useAuthStore((s) => s.player?.id);
  const isYou = !!(currentPlayerId && entry.playerId && currentPlayerId === entry.playerId);
  const isVerified = entry.isVerified || !!entry.playerId;
  const canClick = !!entry.publicProfileId && onProfileClick;

  return (
    <div
      className={`flex items-center justify-between px-3 py-3 sm:py-3 rounded-lg ${isYou ? 'bg-accent/15 border border-accent/30' : 'bg-white/5'} ${canClick ? 'cursor-pointer hover:bg-white/[0.06] active:bg-white/[0.10] transition-colors' : ''}`}
      onClick={canClick ? () => onProfileClick(entry.publicProfileId!) : undefined}
      role={canClick ? 'button' : undefined}
      tabIndex={canClick ? 0 : undefined}
      onKeyDown={canClick ? (e) => { if (e.key === 'Enter') onProfileClick(entry.publicProfileId!); } : undefined}
    >
      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
        <RankBadge rank={rank} />
        <div className="min-w-0">
          <p className="font-bold text-sm sm:text-base">
            {entry.initials}
            {isVerified && <span className="text-blue-300 ml-1 text-sm" role="img" aria-label="Verified account" title="Verified account">✓</span>}
            {entry.familyOfficeCompleted && <span className="ml-1" title="Family Office Legacy">🦅</span>}
            {isPE && <span className="ml-1" title="PE Fund Manager">🏦</span>}
            {isYou && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-medium">You</span>}
          </p>
          <p className="text-xs text-text-muted truncate">{isPE ? (entry.fundName || entry.holdcoName) : entry.holdcoName}</p>
          {entry.strategy?.earnedAchievementIds && entry.strategy.earnedAchievementIds.length > 0 && (
            <p className="text-[10px] leading-tight mt-0.5 max-w-[140px] sm:max-w-none overflow-hidden whitespace-nowrap">
              {entry.strategy.earnedAchievementIds.slice(0, 6).map(id => {
                const a = ACHIEVEMENT_PREVIEW.find(ach => ach.id === id);
                return a ? <span key={id} title={`${a.name}: ${a.description}`} className="mr-0.5 cursor-default">{a.emoji}</span> : null;
              })}
              {entry.strategy.earnedAchievementIds.length > 6 && <span className="text-text-muted">+{entry.strategy.earnedAchievementIds.length - 6}</span>}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 sm:gap-4 md:gap-6 text-right shrink-0">
        <div className="min-w-[4rem] sm:min-w-[4.5rem]">
          <p className="text-xs text-text-muted">{displayLabel}</p>
          <p className="font-mono tabular-nums font-bold text-accent text-sm sm:text-base">
            {formatMoney(displayValue)}
            {!isPE && entry.hasRestructured && <span className="text-red-400 text-[10px] ml-1" title="Restructured — 20% FEV penalty">(R)</span>}
          </p>
          {showRaw && (
            <p className="text-[11px] text-text-secondary font-mono tabular-nums whitespace-nowrap">Raw: {formatMoney(rawFEV)}</p>
          )}
          {isPE && (
            <p className="text-[11px] sm:text-xs text-text-secondary font-mono tabular-nums whitespace-nowrap">
              {entry.grossMoic != null ? `${entry.grossMoic.toFixed(2)}x` : ''}
              {entry.grossMoic != null && entry.netIrr != null ? ' · ' : ''}
              {entry.netIrr != null ? `${(entry.netIrr * 100).toFixed(1)}% IRR` : ''}
            </p>
          )}
        </div>
        <div className="min-w-[3rem] sm:min-w-[3.5rem]">
          <p className="text-xs text-text-muted">Score</p>
          <p className={`font-mono tabular-nums text-sm sm:text-base ${getGradeColor(entry.grade)}`}>{entry.score} ({entry.grade})</p>
        </div>
        <div className="w-8 flex justify-center hidden sm:flex">
          {isPE ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">PE</span>
          ) : entry.difficulty ? (
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

// ════════════════════════════════════════════════════════════════
// Scenarios tab — two sub-views: browse (active+archived) / detail
// ════════════════════════════════════════════════════════════════

interface ScenariosPanelProps {
  list: { active: ScenarioListSummary[]; archived: ScenarioListSummary[] } | null;
  listLoading: boolean;
  listError: boolean;
  onRetryList: () => void;
  selectedScenarioId: string | null;
  onSelectScenario: (id: string | null) => void;
  onProfileClick: (pubId: string) => void;
}

function ScenariosPanel({
  list,
  listLoading,
  listError,
  onRetryList,
  selectedScenarioId,
  onSelectScenario,
  onProfileClick,
}: ScenariosPanelProps) {
  if (selectedScenarioId) {
    return (
      <ScenarioDetail
        scenarioId={selectedScenarioId}
        onBack={() => onSelectScenario(null)}
        onProfileClick={onProfileClick}
      />
    );
  }

  if (listLoading) {
    return (
      <div className="space-y-2 min-h-[300px] sm:min-h-[400px]">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-20 bg-white/5 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (listError || !list) {
    return (
      <div className="card text-center text-text-muted py-8 min-h-[300px] sm:min-h-[400px] flex flex-col items-center justify-center">
        <p>Failed to load scenarios.</p>
        <button onClick={onRetryList} className="btn-secondary text-sm mt-3">Retry</button>
      </div>
    );
  }

  if (list.active.length === 0 && list.archived.length === 0) {
    return (
      <div className="card text-center text-text-muted py-8 min-h-[300px] sm:min-h-[400px] flex flex-col items-center justify-center">
        <p>No scenarios yet.</p>
        <p className="text-sm mt-2">Check back soon — new themed challenges coming.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[300px] sm:min-h-[400px]">
      {list.active.length > 0 && (
        <section className="mb-5">
          <h4 className="text-sm font-bold text-accent mb-2 uppercase tracking-wide">Active</h4>
          <div className="space-y-2">
            {list.active.map(s => (
              <ScenarioCard key={s.id} summary={s} onClick={() => onSelectScenario(s.id)} />
            ))}
          </div>
        </section>
      )}
      {list.archived.length > 0 && (
        <section>
          <h4 className="text-sm font-bold text-text-muted mb-2 uppercase tracking-wide">Archived</h4>
          <div className="space-y-2">
            {list.archived.map(s => (
              <ScenarioCard key={s.id} summary={s} onClick={() => onSelectScenario(s.id)} archived />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ScenarioCard({
  summary,
  onClick,
  archived = false,
}: {
  summary: ScenarioListSummary;
  onClick: () => void;
  archived?: boolean;
}) {
  const topMetric = formatRankingMetric(summary.rankingMetric as RankingMetric, {
    sortScore: summary.topScore ?? undefined,
  });
  const accent = summary.theme?.color || (archived ? '#64748b' : '#f59e0b');

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-3 rounded-lg bg-white/5 hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors flex items-start gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
      style={{ borderLeft: `3px solid ${accent}`, '--tw-ring-color': accent } as React.CSSProperties}
    >
      <span className="text-2xl shrink-0" aria-hidden>{summary.theme?.emoji ?? '🎯'}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-bold text-sm" style={{ color: accent }}>{summary.name}</p>
          {archived && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-500/30 text-slate-200">
              ARCHIVED
            </span>
          )}
          {summary.isPE && !archived && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
              PE
            </span>
          )}
        </div>
        <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{summary.tagline}</p>
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-text-muted tabular-nums">
          <span>{summary.entryCount} {summary.entryCount === 1 ? 'entry' : 'entries'}</span>
          {summary.topScore != null && (
            <span>Top {topMetric.label}: <span className="text-text-secondary">{topMetric.display}</span></span>
          )}
        </div>
      </div>
    </button>
  );
}

function ScenarioDetail({
  scenarioId,
  onBack,
  onProfileClick,
}: {
  scenarioId: string;
  onBack: () => void;
  onProfileClick: (pubId: string) => void;
}) {
  const [data, setData] = useState<{
    scenario: { id: string; name: string; rankingMetric: RankingMetric; entryCount: number };
    entries: ScenarioLeaderboardEntry[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  const currentPlayerId = useAuthStore(s => s.player?.id);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(false);
    fetchScenarioLeaderboard(scenarioId, 50)
      .then(res => {
        if (cancelled) return;
        setData({
          scenario: { ...res.scenario, rankingMetric: res.scenario.rankingMetric as RankingMetric },
          entries: res.entries,
        });
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setErr(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [scenarioId]);

  const retry = () => {
    // Force a re-run of the useEffect by toggling `err` (the effect ignores err in deps;
    // simplest: just re-read by touching state). We inline the same fetch logic here.
    setLoading(true);
    setErr(false);
    fetchScenarioLeaderboard(scenarioId, 50)
      .then(res => {
        setData({
          scenario: { ...res.scenario, rankingMetric: res.scenario.rankingMetric as RankingMetric },
          entries: res.entries,
        });
        setLoading(false);
      })
      .catch(() => { setErr(true); setLoading(false); });
  };

  return (
    <div className="min-h-[300px] sm:min-h-[400px]">
      <button
        onClick={onBack}
        className="text-sm text-text-muted hover:text-text-primary mb-3 flex items-center gap-1"
      >
        ← All scenarios
      </button>

      {loading && (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {err && !loading && (
        <div className="card text-center text-text-muted py-8">
          <p>Failed to load scenario leaderboard.</p>
          <button onClick={retry} className="btn-secondary text-sm mt-3">Retry</button>
        </div>
      )}

      {data && !loading && !err && (
        <>
          <div className="mb-3">
            <p className="font-bold text-lg">{data.scenario.name}</p>
            <p className="text-xs text-text-muted">
              {data.scenario.entryCount} {data.scenario.entryCount === 1 ? 'entry' : 'entries'} ·
              ranked by {formatRankingMetric(data.scenario.rankingMetric, {}).label}
            </p>
          </div>

          {data.entries.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">No entries yet.</p>
          ) : (
            <div className="space-y-1.5">
              {data.entries.map(entry => (
                <ScenarioDetailRow
                  key={entry.id}
                  entry={entry}
                  rankingMetric={data.scenario.rankingMetric}
                  isYou={!!currentPlayerId && entry.playerId === currentPlayerId}
                  onProfileClick={onProfileClick}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ScenarioDetailRow({
  entry,
  rankingMetric,
  isYou,
  onProfileClick,
}: {
  entry: ScenarioLeaderboardEntry;
  rankingMetric: RankingMetric;
  isYou: boolean;
  onProfileClick: (pubId: string) => void;
}) {
  const metric = formatRankingMetric(rankingMetric, {
    founderEquityValue: entry.founderEquityValue,
    grossMoic: entry.grossMoic,
    netIrr: entry.netIrr,
    carryEarned: entry.carryEarned,
    sortScore: entry.sortScore,
  });
  const canClick = !!entry.publicProfileId;

  return (
    <div
      className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${
        isYou ? 'bg-accent/15 border border-accent/30' : 'bg-white/5'
      } ${canClick ? 'cursor-pointer hover:bg-white/[0.08] transition-colors' : ''}`}
      onClick={canClick ? () => onProfileClick(entry.publicProfileId!) : undefined}
      role={canClick ? 'button' : undefined}
      tabIndex={canClick ? 0 : undefined}
      onKeyDown={canClick ? e => { if (e.key === 'Enter') onProfileClick(entry.publicProfileId!); } : undefined}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className={`text-sm font-bold tabular-nums w-8 text-center shrink-0 ${getRankColor(entry.rank)}`}>
          #{entry.rank}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">
            {entry.initials}
            {entry.playerId && <span className="text-blue-300 ml-1 text-xs" title="Verified">✓</span>}
            {isYou && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-medium">You</span>}
          </p>
          <p className="text-[11px] text-text-muted truncate">{entry.holdcoName}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0 text-right">
        <div className="min-w-[4.5rem]">
          <p className="text-[10px] text-text-muted uppercase">{metric.label}</p>
          <p className="font-mono tabular-nums text-sm font-bold text-accent">{metric.display}</p>
        </div>
        <div className="min-w-[3rem]">
          <p className="text-[10px] text-text-muted uppercase">Score</p>
          <p className={`font-mono tabular-nums text-sm ${getGradeColor(entry.grade)}`}>
            {entry.score} ({entry.grade})
          </p>
        </div>
      </div>
    </div>
  );
}

// --- Exported utilities for GameOverScreen inline leaderboard ---

export { TABS, TAB_DISPLAY_CAP, filterAndSort, getDisplayValue, getDisplayLabel, getGhostValue, getAdjustedFEV };
export type { LeaderboardTab };
