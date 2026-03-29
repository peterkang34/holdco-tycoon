import { useState, useEffect, useCallback, Fragment } from 'react';
import { MetricCard } from '../ui/MetricCard';
import { DonutChart, MiniTrend, SectionHeader } from './adminShared';
import { formatMoney } from '../../engine/types';
import type { CommunityData, PlayerDetail } from './adminTypes';

// ── Constants ────────────────────────────────────────────────────

const PAGE_SIZE = 25;

type SortField = 'display_name' | 'initials' | 'total_games' | 'best_grade' | 'best_adjusted_fev' | 'created_at';

const COLUMNS: { key: SortField | string; label: string; className?: string }[] = [
  { key: 'display_name', label: 'Email' },
  { key: 'initials', label: 'Init' },
  { key: 'total_games', label: 'Games', className: 'text-right' },
  { key: 'best_grade', label: 'Grade', className: 'text-center' },
  { key: 'best_adjusted_fev', label: 'Best FEV', className: 'text-right' },
  { key: 'achievements_count', label: 'Achievements', className: 'text-right' },
  { key: 'auth_provider', label: 'Auth' },
  { key: 'last_played_at', label: 'Last Played', className: 'text-right' },
  { key: 'created_at', label: 'Joined', className: 'text-right' },
];

const PROVIDER_COLORS: Record<string, string> = {
  google: '#4285f4',
  email: '#34d399',
  anonymous: '#6b7280',
};

const GRADE_COLORS: Record<string, string> = {
  S: '#facc15', A: '#34d399', B: '#60a5fa', C: '#a78bfa', D: '#f59e0b', F: '#ef4444',
};

// ── Helpers ──────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

// ── Component ────────────────────────────────────────────────────

export function CommunityTab({ token }: { token: string }) {
  const [data, setData] = useState<CommunityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortField>('created_at');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'anonymous'>('verified');

  // Player detail panel
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [playerDetail, setPlayerDetail] = useState<PlayerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Repair state
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<string | null>(null);

  // Backfill achievements state
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  // KV sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Merge state
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<string | null>(null);

  // Fetch community data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        sort,
        order,
        ...(search && { search }),
        ...(statusFilter !== 'all' && { status: statusFilter }),
      });
      const res = await fetch(`/api/admin/community?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      setData(await res.json());
    } catch {
      // empty state is fine
    } finally {
      setLoading(false);
    }
  }, [token, page, sort, order, search, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch player detail on click
  const openPlayerDetail = useCallback(async (playerId: string) => {
    if (selectedPlayerId === playerId) {
      setSelectedPlayerId(null);
      setPlayerDetail(null);
      return;
    }
    setSelectedPlayerId(playerId);
    setPlayerDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/community-player?playerId=${playerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      setPlayerDetail(await res.json());
    } catch {
      setPlayerDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [token, selectedPlayerId]);

  // Sort handler
  const handleSort = (col: SortField) => {
    if (sort === col) {
      setOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(col);
      setOrder(col === 'created_at' || col === 'total_games' || col === 'best_adjusted_fev' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  // Search handler
  const handleSearch = () => {
    setSearch(searchInput.trim());
    setPage(1);
  };

  if (loading && !data) {
    return <div className="text-center text-text-muted py-12 animate-pulse">Loading community data...</div>;
  }

  if (!data) {
    return <div className="text-center text-text-muted py-12">Failed to load community data</div>;
  }

  const { metrics } = data;
  const conversionRate = metrics.totalAccounts > 0
    ? ((metrics.verifiedAccounts / metrics.totalAccounts) * 100).toFixed(1) + '%'
    : '0%';

  const totalPages = Math.ceil(data.totalPlayers / PAGE_SIZE);

  return (
    <>
      {/* ── Sign-up Metrics ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Total Accounts" value={metrics.totalAccounts} />
        <MetricCard label="Verified" value={metrics.verifiedAccounts} status="positive" />
        <MetricCard label="Anonymous" value={metrics.anonymousAccounts} />
        <MetricCard label="Conversion" value={conversionRate} subValue="anon → verified" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="card p-4">
          <SectionHeader title="Auth Providers" />
          <DonutChart
            items={Object.entries(metrics.providerBreakdown).map(([provider, count]) => ({
              label: provider.charAt(0).toUpperCase() + provider.slice(1),
              value: count,
              color: PROVIDER_COLORS[provider] || '#a78bfa',
            }))}
          />
        </div>
        <MiniTrend
          label="Sign-ups per Week (12 weeks)"
          data={metrics.signUpsByWeek.map(w => ({ month: w.week, value: w.count }))}
        />
      </div>

      {/* ── Player Browser ── */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <SectionHeader title={`Players (${data.totalPlayers})`} />
            <button
              onClick={async () => {
                setRepairing(true);
                setRepairResult(null);
                try {
                  const res = await fetch('/api/admin/repair-initials', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  const json = await res.json();
                  if (res.ok) {
                    setRepairResult(`Repaired ${json.repaired}/${json.checked} profiles`);
                    if (json.repaired > 0) fetchData();
                  } else {
                    setRepairResult(json.error || 'Repair failed');
                  }
                } catch {
                  setRepairResult('Network error');
                } finally {
                  setRepairing(false);
                }
              }}
              disabled={repairing}
              className="text-[10px] bg-warning/20 text-warning px-2 py-0.5 rounded hover:bg-warning/30 transition-colors disabled:opacity-50"
            >
              {repairing ? 'Repairing...' : 'Repair Initials'}
            </button>
            {repairResult && (
              <span className="text-[10px] text-text-muted">{repairResult}</span>
            )}
            <button
              onClick={async () => {
                setBackfilling(true);
                setBackfillResult(null);
                try {
                  const res = await fetch('/api/admin/backfill-achievements', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                  });
                  const json = await res.json();
                  if (res.ok) {
                    setBackfillResult(`Done: ${json.processed}/${json.total} players${json.failed > 0 ? ` (${json.failed} failed)` : ''}`);
                  } else {
                    setBackfillResult(json.error || 'Backfill failed');
                  }
                } catch {
                  setBackfillResult('Network error');
                } finally {
                  setBackfilling(false);
                }
              }}
              disabled={backfilling}
              className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
            >
              {backfilling ? 'Backfilling...' : 'Backfill Achievements'}
            </button>
            {backfillResult && (
              <span className="text-[10px] text-text-muted">{backfillResult}</span>
            )}
            <button
              onClick={async () => {
                setSyncing(true);
                setSyncResult(null);
                try {
                  const res = await fetch('/api/admin/sync-kv-history', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                  });
                  const json = await res.json();
                  if (res.ok) {
                    setSyncResult(`Synced ${json.synced} entries (${json.skipped} existed, ${json.failed} failed)`);
                    if (json.synced > 0) fetchData();
                  } else {
                    setSyncResult(json.error || 'Sync failed');
                  }
                } catch {
                  setSyncResult('Network error');
                } finally {
                  setSyncing(false);
                }
              }}
              disabled={syncing}
              className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded hover:bg-blue-500/30 transition-colors disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync KV → History'}
            </button>
            {syncResult && (
              <span className="text-[10px] text-text-muted">{syncResult}</span>
            )}
            <button
              onClick={() => {
                setMergeMode(m => !m);
                setMergeSource(null);
                setMergeTarget(null);
                setMergeResult(null);
              }}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                mergeMode
                  ? 'bg-danger/20 text-danger hover:bg-danger/30'
                  : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
              }`}
            >
              {mergeMode ? 'Cancel Merge' : 'Merge Players'}
            </button>
            {mergeResult && (
              <span className="text-[10px] text-text-muted">{mergeResult}</span>
            )}
          </div>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value as 'all' | 'verified' | 'anonymous'); setPage(1); }}
              className="text-xs bg-bg-primary border border-border rounded px-2 py-1 text-text-secondary focus:outline-none focus:border-accent"
            >
              <option value="all">All Players</option>
              <option value="verified">Verified Only</option>
              <option value="anonymous">Anonymous Only</option>
            </select>
            <input
              type="text"
              placeholder="Search email or initials..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="text-xs bg-bg-primary border border-border rounded px-2 py-1 text-text-secondary placeholder:text-text-muted/50 focus:outline-none focus:border-accent w-48"
            />
            <button
              onClick={handleSearch}
              className="text-xs bg-accent/20 text-accent px-3 py-1 rounded hover:bg-accent/30 transition-colors"
            >
              Search
            </button>
            {search && (
              <button
                onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
                className="text-xs text-text-muted hover:text-text-primary px-2"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Merge mode banner */}
        {mergeMode && (
          <div className="mb-3 p-3 rounded bg-purple-500/10 border border-purple-500/30 text-xs space-y-2">
            <p className="text-purple-300 font-medium">
              {!mergeSource
                ? '① Click the player to merge FROM (the duplicate that will be deleted)'
                : !mergeTarget
                  ? '② Now click the player to merge INTO (the one to keep)'
                  : '③ Confirm merge below'}
            </p>
            {mergeSource && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-text-muted">From:</span>
                <span className="font-mono text-danger">
                  {data.players.find(p => p.id === mergeSource)?.display_name || mergeSource}
                  {' '}({data.players.find(p => p.id === mergeSource)?.total_games ?? '?'} games)
                </span>
                {mergeTarget && (
                  <>
                    <span className="text-text-muted">→ Into:</span>
                    <span className="font-mono text-accent">
                      {data.players.find(p => p.id === mergeTarget)?.display_name || mergeTarget}
                      {' '}({data.players.find(p => p.id === mergeTarget)?.total_games ?? '?'} games)
                    </span>
                    <button
                      onClick={async () => {
                        setMerging(true);
                        setMergeResult(null);
                        try {
                          const res = await fetch('/api/admin/merge-player', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({ sourceId: mergeSource, targetId: mergeTarget }),
                          });
                          const json = await res.json();
                          if (res.ok) {
                            setMergeResult(`Merged ${json.gamesMoved} games from ${json.source.name} → ${json.target.name}`);
                            setMergeMode(false);
                            setMergeSource(null);
                            setMergeTarget(null);
                            fetchData();
                          } else {
                            setMergeResult(json.error || 'Merge failed');
                          }
                        } catch {
                          setMergeResult('Network error');
                        } finally {
                          setMerging(false);
                        }
                      }}
                      disabled={merging}
                      className="bg-danger/20 text-danger px-3 py-1 rounded hover:bg-danger/30 transition-colors disabled:opacity-50 font-medium"
                    >
                      {merging ? 'Merging...' : 'Confirm Merge'}
                    </button>
                  </>
                )}
                <button
                  onClick={() => { setMergeSource(null); setMergeTarget(null); }}
                  className="text-text-muted hover:text-text-primary px-1"
                >
                  Reset
                </button>
              </div>
            )}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[600px]">
            <thead>
              <tr className="border-b border-border">
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    onClick={() => {
                      const sortableFields: SortField[] = ['display_name', 'initials', 'total_games', 'best_grade', 'best_adjusted_fev', 'created_at'];
                      if (sortableFields.includes(col.key as SortField)) handleSort(col.key as SortField);
                    }}
                    className={`py-2 px-2 font-medium text-text-muted cursor-pointer hover:text-text-primary transition-colors select-none ${col.className || 'text-left'}`}
                  >
                    {col.label}
                    {sort === col.key && (
                      <span className="ml-0.5 text-accent">{order === 'asc' ? ' \u25b2' : ' \u25bc'}</span>
                    )}
                  </th>
                ))}
                <th className="py-2 px-2 text-center text-text-muted font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.players.map(player => (
                <Fragment key={player.id}>
                  <tr
                    onClick={() => {
                      if (mergeMode) {
                        if (!mergeSource) {
                          setMergeSource(player.id);
                        } else if (!mergeTarget && player.id !== mergeSource) {
                          setMergeTarget(player.id);
                        }
                      } else {
                        openPlayerDetail(player.id);
                      }
                    }}
                    className={`border-b border-border/30 cursor-pointer transition-colors ${
                      mergeMode && mergeSource === player.id
                        ? 'bg-danger/15'
                        : mergeMode && mergeTarget === player.id
                          ? 'bg-accent/15'
                          : selectedPlayerId === player.id
                            ? 'bg-accent/10'
                            : 'hover:bg-white/5'
                    }`}
                  >
                    <td className="py-2 px-2 text-text-primary truncate max-w-[200px]">
                      {player.email || <span className="text-text-muted italic">{player.display_name || 'anonymous'}</span>}
                    </td>
                    <td className="py-2 px-2 font-mono text-text-secondary">{player.initials}</td>
                    <td className="py-2 px-2 text-right font-mono text-text-secondary">{player.total_games}</td>
                    <td className="py-2 px-2 text-center">
                      {player.best_grade ? (
                        <span className="font-bold" style={{ color: GRADE_COLORS[player.best_grade] || 'inherit' }}>
                          {player.best_grade}
                        </span>
                      ) : (
                        <span className="text-text-muted">--</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-text-secondary">
                      {player.best_adjusted_fev > 0 ? formatMoney(player.best_adjusted_fev) : '--'}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-text-secondary">
                      {player.achievements_count > 0 ? player.achievements_count : '--'}
                    </td>
                    <td className="py-2 px-2">
                      {player.auth_provider ? (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          player.auth_provider === 'google' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {player.auth_provider === 'google' ? 'Google' : 'Email'}
                        </span>
                      ) : (
                        <span className="text-text-muted">--</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right text-text-muted">
                      {player.last_played_at ? formatDate(player.last_played_at) : '--'}
                    </td>
                    <td className="py-2 px-2 text-right text-text-muted">{formatDate(player.created_at)}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        player.is_anonymous
                          ? 'bg-white/10 text-text-muted'
                          : 'bg-accent/20 text-accent'
                      }`}>
                        {player.is_anonymous ? 'Anon' : 'Verified'}
                      </span>
                    </td>
                  </tr>

                  {/* Detail panel (inline expand) */}
                  {selectedPlayerId === player.id && (
                    <tr>
                      <td colSpan={10} className="p-0">
                        <PlayerDetailPanel detail={playerDetail} loading={detailLoading} token={token} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {data.players.length === 0 && (
          <div className="text-center text-text-muted py-8">No players found</div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="text-xs px-3 py-1 rounded bg-white/8 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            <span className="text-xs text-text-muted">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="text-xs px-3 py-1 rounded bg-white/8 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Player Detail Panel ──────────────────────────────────────────

function PlayerDetailPanel({ detail, loading, token }: { detail: PlayerDetail | null; loading: boolean; token: string }) {
  if (loading) {
    return (
      <div className="bg-bg-secondary p-4 border-t border-accent/20 animate-pulse text-text-muted text-xs">
        Loading player details...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="bg-bg-secondary p-4 border-t border-accent/20 text-text-muted text-xs">
        Failed to load player details
      </div>
    );
  }

  const stats = detail.stats as Record<string, unknown> | null;
  const gradeDistribution = (stats?.grade_distribution ?? {}) as Record<string, number>;

  const [editingInitials, setEditingInitials] = useState(false);
  const [newInitials, setNewInitials] = useState(detail.profile.initials as string || '');
  const [savingInitials, setSavingInitials] = useState(false);

  return (
    <div className="bg-bg-secondary p-4 border-t border-accent/20">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        {/* Auth info */}
        <div>
          <h4 className="text-xs font-semibold text-text-secondary mb-2">Auth Details</h4>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between gap-2">
              <span className="text-text-muted">UUID</span>
              <span className="text-text-primary font-mono text-[9px] select-all truncate max-w-[180px]" title={detail.profile.id as string}>{detail.profile.id as string}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Initials</span>
              {editingInitials ? (
                <span className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newInitials}
                    onChange={e => setNewInitials(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
                    className="w-14 text-[11px] bg-bg-primary border border-border rounded px-1 py-0.5 text-text-primary font-mono text-center"
                    autoFocus
                  />
                  <button
                    onClick={async () => {
                      if (newInitials.length < 2) return;
                      setSavingInitials(true);
                      try {
                        const res = await fetch('/api/admin/update-initials', {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                          body: JSON.stringify({ playerId: detail.profile.id, initials: newInitials }),
                        });
                        if (res.ok) setEditingInitials(false);
                      } catch { /* ignore */ }
                      setSavingInitials(false);
                    }}
                    disabled={savingInitials || newInitials.length < 2}
                    className="text-[9px] text-accent hover:text-accent/80 disabled:opacity-50"
                  >
                    {savingInitials ? '...' : 'Save'}
                  </button>
                  <button onClick={() => setEditingInitials(false)} className="text-[9px] text-text-muted">Cancel</button>
                </span>
              ) : (
                <span className="text-text-primary font-mono cursor-pointer hover:text-accent" onClick={() => { setEditingInitials(true); setNewInitials(detail.profile.initials as string || ''); }}>
                  {detail.profile.initials as string || '??'} <span className="text-[9px] text-text-muted">edit</span>
                </span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Provider</span>
              <span className="text-text-primary capitalize">{detail.auth.provider}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Created</span>
              <span className="text-text-primary">{formatDate(detail.auth.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Last Sign-in</span>
              <span className="text-text-primary">
                {detail.auth.last_sign_in_at ? formatDate(detail.auth.last_sign_in_at) : 'Never'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Status</span>
              <span className={detail.auth.is_anonymous ? 'text-text-muted' : 'text-accent'}>
                {detail.auth.is_anonymous ? 'Anonymous' : 'Verified'}
              </span>
            </div>
          </div>
        </div>

        {/* Player stats */}
        <div>
          <h4 className="text-xs font-semibold text-text-secondary mb-2">Player Stats</h4>
          {stats ? (
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-text-muted">Total Games</span>
                <span className="text-text-primary font-mono">{stats.total_games as number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Avg Score</span>
                <span className="text-text-primary font-mono">{stats.avg_score as number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Best FEV</span>
                <span className="text-text-primary font-mono">{formatMoney((stats.best_adjusted_fev as number) || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Grades</span>
                <span className="text-text-primary font-mono">
                  {Object.entries(gradeDistribution).map(([g, c]) => `${g}:${c}`).join(' ') || '--'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-text-muted">No stats yet</p>
          )}
        </div>

        {/* Grade distribution mini chart */}
        <div>
          <h4 className="text-xs font-semibold text-text-secondary mb-2">Grade Distribution</h4>
          {Object.keys(gradeDistribution).length > 0 ? (
            <div className="flex items-end gap-1 h-12">
              {['S', 'A', 'B', 'C', 'D', 'F'].map(g => {
                const count = gradeDistribution[g] || 0;
                const max = Math.max(...Object.values(gradeDistribution), 1);
                return (
                  <div key={g} className="flex-1 flex flex-col items-center gap-0.5">
                    <div
                      className="w-full rounded-sm transition-all"
                      style={{
                        height: `${Math.max((count / max) * 100, 4)}%`,
                        backgroundColor: GRADE_COLORS[g] || 'var(--color-accent)',
                      }}
                      title={`${g}: ${count}`}
                    />
                    <span className="text-[9px] text-text-muted">{g}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-text-muted">No games played</p>
          )}
        </div>
      </div>

      {/* Recent games */}
      <div>
        <h4 className="text-xs font-semibold text-text-secondary mb-2">
          Recent Games {detail.recentGames.length > 0 ? `(${detail.recentGames.length})` : ''}
        </h4>
        {detail.recentGames.length > 0 ? (
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {detail.recentGames.map((game: any, i: number) => (
              <GameBreakdown key={i} game={game} />
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-text-muted">No game history recorded for this player</p>
        )}
      </div>
    </div>
  );
}

// ── Game Breakdown Card ──────────────────────────────────────────

const SCORE_DIMS = [
  { key: 'score_value_creation', label: 'Value' },
  { key: 'score_fcf_share_growth', label: 'FCF' },
  { key: 'score_portfolio_roic', label: 'ROIC' },
  { key: 'score_capital_deployment', label: 'Deploy' },
  { key: 'score_balance_sheet', label: 'Balance' },
  { key: 'score_strategic_discipline', label: 'Discip' },
];

function GameBreakdown({ game }: { game: any }) {
  const [expanded, setExpanded] = useState(false);
  const strategy = game.strategy as Record<string, unknown> | null;
  const archetype = (strategy?.archetype as string) || null;
  const antiPatterns = (strategy?.antiPatterns as string[]) || [];

  return (
    <div className={`rounded border transition-colors ${expanded ? 'bg-bg-secondary border-accent/30' : 'bg-bg-card border-border/40 hover:border-border'}`}>
      {/* Summary row — clickable to expand */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-white/5 transition-colors cursor-pointer"
      >
        <span className="text-[10px] text-text-muted w-3 shrink-0">{expanded ? '▾' : '▸'}</span>
        <span className="font-bold text-[11px] w-4 shrink-0" style={{ color: GRADE_COLORS[game.grade] || 'inherit' }}>
          {game.grade}
        </span>
        <span className="text-[11px] text-text-primary truncate flex-1">{game.holdco_name || '--'}</span>
        <span className="text-[10px] font-mono text-accent">{formatMoney(game.adjusted_fev || 0)}</span>
        <span className="text-[10px] font-mono text-text-muted">{game.score}/100</span>
        <span className={`text-[10px] ${(game.strategy as any)?.isFundManager ? 'text-purple-400' : 'text-text-muted'}`}>
          {(game.strategy as any)?.isFundManager ? 'PE' : `${game.difficulty === 'normal' ? 'H' : 'E'}/${game.duration === 'quick' ? '10' : '20'}`}
        </span>
        <span className="text-[10px] text-text-muted">{game.completed_at ? formatDate(game.completed_at) : '--'}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-2.5 pb-2.5 pt-1 border-t border-accent/20 space-y-2">
          {/* Score breakdown bar */}
          {game.score_value_creation != null && (
            <div>
              <p className="text-[9px] text-text-muted mb-1 uppercase tracking-wider">Score Breakdown</p>
              <div className="flex gap-1">
                {SCORE_DIMS.map(dim => {
                  const val = game[dim.key] as number | null;
                  if (val == null) return null;
                  const maxDim = 20;
                  const pct = Math.min(100, (val / maxDim) * 100);
                  return (
                    <div key={dim.key} className="flex-1 text-center">
                      <div className="h-6 bg-bg-secondary rounded overflow-hidden relative">
                        <div
                          className="h-full bg-accent/60 rounded transition-all"
                          style={{ width: `${Math.max(pct, 8)}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono text-text-primary mix-blend-difference">
                          {val.toFixed(1)}
                        </span>
                      </div>
                      <span className="text-[8px] text-text-muted">{dim.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Financials + Strategy */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[10px]">
            <div className="flex justify-between">
              <span className="text-text-muted">EV</span>
              <span className="font-mono text-text-primary">{formatMoney(game.enterprise_value || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">FEV (raw)</span>
              <span className="font-mono text-text-primary">{formatMoney(game.founder_equity_value || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Businesses</span>
              <span className="font-mono text-text-primary">{game.business_count ?? '--'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Multiplier</span>
              <span className="font-mono text-text-primary">{(game.submitted_multiplier ?? 1).toFixed(2)}x</span>
            </div>
            {game.total_revenue != null && (
              <div className="flex justify-between">
                <span className="text-text-muted">Revenue</span>
                <span className="font-mono text-text-primary">{formatMoney(game.total_revenue)}</span>
              </div>
            )}
            {game.avg_ebitda_margin != null && (
              <div className="flex justify-between">
                <span className="text-text-muted">Avg Margin</span>
                <span className="font-mono text-text-primary">{(game.avg_ebitda_margin * 100).toFixed(1)}%</span>
              </div>
            )}
            {game.has_restructured && (
              <div className="flex justify-between">
                <span className="text-text-muted">Restructured</span>
                <span className="text-warning font-medium">Yes (-20%)</span>
              </div>
            )}
            {game.family_office_completed && (
              <div className="flex justify-between">
                <span className="text-text-muted">Family Office</span>
                <span className="text-purple-400 font-medium">
                  {game.fo_multiplier > 1 ? `${game.fo_multiplier.toFixed(2)}x` : 'Completed'}
                </span>
              </div>
            )}
            {game.legacy_grade && (
              <div className="flex justify-between">
                <span className="text-text-muted">Legacy</span>
                <span className="text-purple-400 font-medium">{game.legacy_grade}</span>
              </div>
            )}
          </div>

          {/* Archetype + Anti-patterns */}
          {(archetype || antiPatterns.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {archetype && (
                <span className="text-[9px] bg-accent/15 text-accent px-1.5 py-0.5 rounded">
                  {archetype.replace(/_/g, ' ')}
                </span>
              )}
              {antiPatterns.map(ap => (
                <span key={ap} className="text-[9px] bg-danger/15 text-danger px-1.5 py-0.5 rounded">
                  {ap.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}

          {/* Sourcing usage */}
          {((strategy?.maSourcingTier as number) > 0 || (strategy?.sourceDealUses as number) > 0 || (strategy?.proactiveOutreachUses as number) > 0 || (strategy?.smbBrokerUses as number) > 0) && (
            <div className="flex flex-wrap gap-2 text-[10px]">
              <span className="bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded">
                MA Tier {(strategy?.maSourcingTier as number) ?? 0}
              </span>
              {((strategy?.sourceDealUses as number) ?? 0) > 0 && (
                <span className="text-text-muted">Source Deals: <span className="font-mono text-text-primary">{strategy?.sourceDealUses as number}</span></span>
              )}
              {((strategy?.proactiveOutreachUses as number) ?? 0) > 0 && (
                <span className="text-text-muted">Outreach: <span className="font-mono text-text-primary">{strategy?.proactiveOutreachUses as number}</span></span>
              )}
              {((strategy?.smbBrokerUses as number) ?? 0) > 0 && (
                <span className="text-text-muted">SMB Broker: <span className="font-mono text-text-primary">{strategy?.smbBrokerUses as number}</span></span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
