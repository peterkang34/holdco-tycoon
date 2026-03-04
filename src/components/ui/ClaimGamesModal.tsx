import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { useAuthStore } from '../../hooks/useAuth';
import { useToastStore } from '../../hooks/useToast';
import { fetchWithAuth } from '../../lib/supabase';
import { formatMoney } from '../../engine/types';
import { getGradeColor } from '../../utils/gradeColors';

interface LocalEntry {
  id: string;
  holdcoName: string;
  initials: string;
  grade: string;
  score: number;
  founderEquityValue?: number;
  enterpriseValue: number;
  difficulty?: string;
  duration?: string;
  date: string;
  claimToken?: string;
  // Composite match fields (Era 1)
  businessCount?: number;
}

interface ClaimResult {
  status: 'claimed' | 'already_claimed' | 'not_found' | 'mismatch';
  holdcoName?: string;
}

export function ClaimGamesModal() {
  const { showClaimModal, closeClaimModal, openStatsModal } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);

  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [claiming, setClaiming] = useState(false);
  const [results, setResults] = useState<ClaimResult[] | null>(null);

  // Load local leaderboard entries on open
  useEffect(() => {
    if (!showClaimModal) return;
    try {
      const raw = localStorage.getItem('holdco-tycoon-leaderboard');
      if (raw) {
        const parsed = JSON.parse(raw) as LocalEntry[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEntries(parsed);
          setSelected(new Set(parsed.map((e) => e.id)));
        }
      }
    } catch { /* ignore */ }
  }, [showClaimModal]);

  const toggleEntry = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClaim = async () => {
    if (selected.size === 0) return;
    setClaiming(true);

    const claims = entries
      .filter((e) => selected.has(e.id))
      .slice(0, 10) // Max 10 per request
      .map((e) => ({
        ...(e.claimToken
          ? { type: 'token' as const, claimToken: e.claimToken }
          : {
              type: 'historical' as const,
              initials: e.initials,
              holdcoName: e.holdcoName,
              score: e.score,
              grade: e.grade,
              difficulty: e.difficulty ?? 'easy',
              duration: e.duration ?? 'standard',
              date: e.date,
            }),
      }));

    try {
      const res = await fetchWithAuth('/api/player/claim-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claims }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const serverMsg = body?.error;
        const msg = res.status === 429
          ? 'Too many attempts. Try again in a few minutes.'
          : res.status === 401
          ? 'Session expired — please refresh the page and sign in again'
          : `Claim failed${serverMsg ? ': ' + serverMsg : ''} (${res.status})`;
        addToast({ message: msg, type: 'danger' });
        setClaiming(false);
        return;
      }

      const data = await res.json();
      setResults(data.results);

      const claimedCount = (data.results as ClaimResult[]).filter((r) => r.status === 'claimed').length;
      if (claimedCount > 0) {
        addToast({ message: `${claimedCount} game${claimedCount > 1 ? 's' : ''} claimed!`, type: 'success' });
      }
    } catch {
      addToast({ message: 'Network error', type: 'danger' });
    } finally {
      setClaiming(false);
    }
  };

  const handleDone = () => {
    closeClaimModal();
    if (results && results.some((r) => r.status === 'claimed')) {
      openStatsModal();
    }
    // Reset
    setEntries([]);
    setSelected(new Set());
    setResults(null);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Modal isOpen={showClaimModal} onClose={handleDone} title="Claim Your Games" size="sm">
      {results ? (
        /* Results view */
        <div className="space-y-3">
          <p className="text-text-secondary text-sm mb-3">
            {results.filter((r) => r.status === 'claimed').length} of {results.length} games claimed
          </p>
          {results.map((result, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 bg-white/5 rounded-lg">
              <span className={`text-sm ${result.status === 'claimed' ? 'text-green-400' : result.status === 'already_claimed' ? 'text-yellow-400' : 'text-text-muted'}`}>
                {result.status === 'claimed' ? '✓' : result.status === 'already_claimed' ? '~' : '✕'}
              </span>
              <span className="text-sm flex-1 truncate">{result.holdcoName ?? `Entry ${i + 1}`}</span>
              <span className="text-xs text-text-muted">
                {result.status === 'claimed' ? 'Claimed' : result.status === 'already_claimed' ? 'Already claimed' : result.status === 'mismatch' ? 'Mismatch' : 'Not found'}
              </span>
            </div>
          ))}
          <button onClick={handleDone} className="btn-primary w-full mt-4">
            {results.some((r) => r.status === 'claimed') ? 'View My Stats' : 'Close'}
          </button>
        </div>
      ) : (
        /* Selection view */
        <div className="space-y-3">
          <p className="text-text-secondary text-sm">
            We found {entries.length} game{entries.length !== 1 ? 's' : ''} on this device. Claim them to add to your stats.
          </p>

          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {entries.map((entry) => (
              <label
                key={entry.id}
                className="flex items-center gap-3 p-2.5 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.has(entry.id)}
                  onChange={() => toggleEntry(entry.id)}
                  className="accent-accent w-4 h-4"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{entry.holdcoName}</p>
                  <p className="text-xs text-text-muted">
                    {formatDate(entry.date)}
                    {entry.claimToken ? '' : ' (historical)'}
                  </p>
                </div>
                <span className={`font-mono font-bold text-sm ${getGradeColor(entry.grade as any)}`}>{entry.grade}</span>
                <span className="font-mono text-xs text-text-secondary">
                  {formatMoney(entry.founderEquityValue ?? entry.enterpriseValue)}
                </span>
              </label>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { closeClaimModal(); setResults(null); }}
              className="btn-secondary flex-1"
            >
              Skip for Now
            </button>
            <button
              onClick={handleClaim}
              disabled={claiming || selected.size === 0}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              {claiming ? 'Claiming...' : `Claim ${selected.size} Game${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
