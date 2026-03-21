import { useState, useEffect, useCallback } from 'react';
import { Modal } from './Modal';
import { fetchWithAuth } from '../../lib/supabase';
import { useAuthStore, useIsLoggedIn } from '../../hooks/useAuth';
import { getArchetypeDisplayName } from '../../utils/playbookThesis';
import type { PlaybookData } from '../../engine/types';
import { OperatorPlaybook } from '../gameover/OperatorPlaybook';

interface PlaybookIndexEntry {
  gameId: string;
  shareId: string;
  holdcoName: string;
  archetype: string;
  grade: string;
  score: number;
  fev: number;
  adjustedFev: number;
  difficulty: string;
  duration: string;
  isFundManager: boolean;
  isBankrupt: boolean;
  completedAt: string;
}

type DifficultyFilter = 'all' | 'easy' | 'normal';
type DurationFilter = 'all' | 'standard' | 'quick';
type SortKey = 'date' | 'fev' | 'grade';

const GRADE_ORDER: Record<string, number> = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 };

function fmtMoney(thousands: number): string {
  if (thousands >= 1_000_000) return `$${(thousands / 1000).toFixed(0)}B`;
  if (thousands >= 1000) return `$${(thousands / 1000).toFixed(0)}M`;
  return `$${thousands.toFixed(0)}K`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function StrategyLibraryModal() {
  const { showStrategyLibraryModal: isOpen, closeStrategyLibraryModal: onClose } = useAuthStore();
  const isLoggedIn = useIsLoggedIn();
  const [playbooks, setPlaybooks] = useState<PlaybookIndexEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Filters
  const [diffFilter, setDiffFilter] = useState<DifficultyFilter>('all');
  const [durFilter, setDurFilter] = useState<DurationFilter>('all');
  const [peToggle, setPeToggle] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('date');

  // Playbook viewer
  const [viewingPlaybook, setViewingPlaybook] = useState<PlaybookData | null>(null);
  const [loadingPlaybook, setLoadingPlaybook] = useState(false);

  const fetchLibrary = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetchWithAuth('/api/player/playbooks?limit=50');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setPlaybooks(data.playbooks ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && isLoggedIn) fetchLibrary();
  }, [isOpen, isLoggedIn, fetchLibrary]);

  const handleViewPlaybook = async (entry: PlaybookIndexEntry) => {
    setLoadingPlaybook(true);
    try {
      const res = await fetch(`/api/player/playbook/${entry.shareId}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      setViewingPlaybook(data.playbook);
    } catch {
      // Fallback: couldn't load
    } finally {
      setLoadingPlaybook(false);
    }
  };

  // Filter + sort
  const filtered = playbooks.filter(p => {
    if (diffFilter !== 'all' && p.difficulty !== diffFilter) return false;
    if (durFilter !== 'all' && p.duration !== durFilter) return false;
    if (peToggle && !p.isFundManager) return false;
    if (!peToggle && p.isFundManager) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'date') return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
    if (sortKey === 'fev') return b.adjustedFev - a.adjustedFev;
    if (sortKey === 'grade') return (GRADE_ORDER[b.grade] ?? 0) - (GRADE_ORDER[a.grade] ?? 0);
    return 0;
  });

  const header = (
    <div>
      <h3 className="text-xl font-bold">Strategy Library</h3>
      <p className="text-text-muted text-sm mt-0.5">{total} playbook{total !== 1 ? 's' : ''}</p>
    </div>
  );

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} header={header} size="lg">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* Difficulty */}
          <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs">
            {(['all', 'easy', 'normal'] as const).map(v => (
              <button
                key={v}
                onClick={() => setDiffFilter(v)}
                className={`px-2.5 py-1.5 transition-colors ${diffFilter === v ? 'bg-white/10 text-text-primary' : 'text-text-muted hover:bg-white/5'}`}
              >
                {v === 'all' ? 'All' : v === 'normal' ? 'Hard' : 'Easy'}
              </button>
            ))}
          </div>

          {/* Duration */}
          <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs">
            {(['all', 'standard', 'quick'] as const).map(v => (
              <button
                key={v}
                onClick={() => setDurFilter(v)}
                className={`px-2.5 py-1.5 transition-colors ${durFilter === v ? 'bg-white/10 text-text-primary' : 'text-text-muted hover:bg-white/5'}`}
              >
                {v === 'all' ? 'All' : v === 'standard' ? '20yr' : '10yr'}
              </button>
            ))}
          </div>

          {/* PE toggle */}
          <button
            onClick={() => setPeToggle(!peToggle)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${peToggle ? 'border-accent/50 bg-accent/10 text-accent' : 'border-white/10 text-text-muted hover:bg-white/5'}`}
          >
            PE Fund
          </button>

          <div className="flex-1" />

          {/* Sort */}
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            className="bg-transparent border border-white/10 rounded-lg px-2 py-1.5 text-xs text-text-muted"
          >
            <option value="date">Newest</option>
            <option value="fev">Highest FEV</option>
            <option value="grade">Best Grade</option>
          </select>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center text-text-muted py-12 text-sm">Loading...</div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-text-muted text-sm mb-2">Couldn't load your playbooks. Try again.</p>
            <button onClick={fetchLibrary} className="text-accent text-sm hover:underline">Retry</button>
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center text-text-muted py-12 text-sm">
            {playbooks.length === 0
              ? 'Complete a game to generate your first Strategy Debrief.'
              : 'No playbooks match these filters.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sorted.map(entry => (
              <button
                key={entry.gameId}
                onClick={() => handleViewPlaybook(entry)}
                disabled={loadingPlaybook}
                className="text-left bg-white/[0.03] border border-white/10 rounded-lg p-4 hover:bg-white/[0.06] transition-colors active:scale-[0.99] disabled:opacity-50"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="font-semibold text-text-primary text-sm truncate">{entry.holdcoName}</h4>
                  <span className="text-xs font-bold bg-white/10 px-1.5 py-0.5 rounded shrink-0">{entry.grade}</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${entry.isBankrupt ? 'bg-red-500/20 text-red-400' : 'bg-accent/20 text-accent'}`}>
                    {getArchetypeDisplayName(entry.archetype)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-text-muted">
                  <span className="font-mono">{fmtMoney(entry.isFundManager ? entry.adjustedFev : entry.fev)}</span>
                  <span>{entry.difficulty === 'normal' ? 'Hard' : 'Easy'}-{entry.duration === 'standard' ? '20' : '10'}</span>
                  <span className="ml-auto">{fmtDate(entry.completedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* Playbook viewer overlay */}
      {viewingPlaybook && (
        <OperatorPlaybook
          isOpen={!!viewingPlaybook}
          onClose={() => setViewingPlaybook(null)}
          playbook={viewingPlaybook}
        />
      )}
    </>
  );
}
