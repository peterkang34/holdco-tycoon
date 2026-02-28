import { useState, useEffect, useMemo, useCallback } from 'react';
import { MetricCard } from '../ui/MetricCard';

// ── Types ────────────────────────────────────────────────────────

type FeedbackStatus = 'new' | 'acknowledged' | 'in-progress' | 'done' | 'deployed';
type FeedbackPriority = 'low' | 'medium' | 'high' | 'critical';
type FeedbackType = 'bug' | 'feature' | 'other';

interface FeedbackEntry {
  id: string;
  type: FeedbackType;
  message: string;
  email?: string;
  context: {
    screen?: string;
    round?: number;
    difficulty?: string;
    duration?: string;
    holdcoName?: string;
    device?: string;
    playerId?: string;
  };
  date: string;
  status: FeedbackStatus;
  priority?: FeedbackPriority;
  note?: string;
  updatedAt?: string;
}

interface FeedbackData {
  entries: FeedbackEntry[];
  counts: { total: number; bug: number; feature: number; other: number };
  statusCounts: Record<FeedbackStatus, number>;
}

// ── Constants ────────────────────────────────────────────────────

const STATUS_ORDER: FeedbackStatus[] = ['new', 'acknowledged', 'in-progress', 'done', 'deployed'];
const STATUS_BADGE: Record<FeedbackStatus, string> = {
  new: 'bg-danger/20 text-danger',
  acknowledged: 'bg-warning/20 text-warning',
  'in-progress': 'bg-accent/20 text-accent',
  done: 'bg-emerald-500/20 text-emerald-400',
  deployed: 'bg-white/5 text-text-muted',
};
const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  'in-progress': 'In Progress',
  done: 'Done',
  deployed: 'Deployed',
};
const TYPE_BADGE: Record<FeedbackType, string> = {
  bug: 'bg-danger/20 text-danger',
  feature: 'bg-accent/20 text-accent',
  other: 'bg-white/10 text-text-secondary',
};
const PRIORITIES: FeedbackPriority[] = ['low', 'medium', 'high', 'critical'];

// ── Component ────────────────────────────────────────────────────

export function FeedbackTab({ token }: { token: string }) {
  const [feedbackData, setFeedbackData] = useState<FeedbackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | FeedbackType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | FeedbackStatus>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Fetch feedback data
  useEffect(() => {
    fetch('/api/admin/feedback', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((d) => setFeedbackData(d))
      .catch(() => {/* empty state is fine */})
      .finally(() => setLoading(false));
  }, [token]);

  // PATCH helper with optimistic update
  const updateEntry = useCallback(async (
    id: string,
    updates: { status?: FeedbackStatus; priority?: FeedbackPriority; note?: string }
  ) => {
    if (!feedbackData) return;
    setUpdatingId(id);

    // Find current entry to get existing fields
    const current = feedbackData.entries.find(e => e.id === id);
    if (!current) { setUpdatingId(null); return; }

    const patchBody = {
      id,
      status: updates.status ?? current.status,
      priority: updates.priority ?? current.priority,
      note: updates.note ?? current.note,
    };

    // Optimistic update
    setFeedbackData(prev => {
      if (!prev) return prev;
      const oldStatus = current.status;
      const newStatus = patchBody.status;
      const newStatusCounts = { ...prev.statusCounts };
      if (oldStatus !== newStatus) {
        newStatusCounts[oldStatus] = Math.max(0, (newStatusCounts[oldStatus] || 0) - 1);
        newStatusCounts[newStatus] = (newStatusCounts[newStatus] || 0) + 1;
      }
      return {
        ...prev,
        entries: prev.entries.map(e =>
          e.id === id
            ? { ...e, status: patchBody.status, priority: patchBody.priority, note: patchBody.note, updatedAt: new Date().toISOString() }
            : e
        ),
        statusCounts: newStatusCounts,
      };
    });

    try {
      const res = await fetch('/api/admin/feedback', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patchBody),
      });
      if (!res.ok) {
        // Revert on failure — refetch
        const refetch = await fetch('/api/admin/feedback', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (refetch.ok) setFeedbackData(await refetch.json());
      }
    } catch {
      // Revert on network error
    } finally {
      setUpdatingId(null);
    }
  }, [feedbackData, token]);

  // Sort: unresolved first, bugs before features, newest within same status
  const sortedEntries = useMemo(() => {
    if (!feedbackData) return [];
    return [...feedbackData.entries]
      .filter(e => {
        if (typeFilter !== 'all' && e.type !== typeFilter) return false;
        if (statusFilter !== 'all' && e.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => {
        // Status priority (lower index = higher priority)
        const statusDiff = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
        if (statusDiff !== 0) return statusDiff;
        // Bugs before features within same status
        const typeOrder = { bug: 0, feature: 1, other: 2 };
        const typeDiff = typeOrder[a.type] - typeOrder[b.type];
        if (typeDiff !== 0) return typeDiff;
        // Priority (critical first) within same status+type
        const priOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const aPri = a.priority ? priOrder[a.priority] : 99;
        const bPri = b.priority ? priOrder[b.priority] : 99;
        if (aPri !== bPri) return aPri - bPri;
        // Newest first
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
  }, [feedbackData, typeFilter, statusFilter]);

  if (loading) {
    return <div className="text-center text-text-muted py-12">Loading feedback...</div>;
  }

  if (!feedbackData) {
    return <div className="text-center text-text-muted py-12">Failed to load feedback</div>;
  }

  const sc = feedbackData.statusCounts;

  return (
    <>
      {/* Status summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <MetricCard label="New" value={sc.new || 0} status={(sc.new || 0) > 0 ? 'warning' : 'neutral'} />
        <MetricCard label="In Progress" value={sc['in-progress'] || 0} />
        <MetricCard label="Done" value={sc.done || 0} status="positive" />
        <MetricCard label="Deployed" value={sc.deployed || 0} />
      </div>

      {/* Type filter pills */}
      <div className="flex gap-2 mb-2">
        {(['all', 'bug', 'feature', 'other'] as const).map(f => (
          <button
            key={f}
            onClick={() => setTypeFilter(f)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              typeFilter === f
                ? 'bg-accent text-white'
                : 'bg-bg-secondary text-text-muted hover:text-text-primary'
            }`}
          >
            {f === 'all' ? 'All Types' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            statusFilter === 'all'
              ? 'bg-accent text-white'
              : 'bg-bg-secondary text-text-muted hover:text-text-primary'
          }`}
        >
          All Statuses
        </button>
        {STATUS_ORDER.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              statusFilter === s
                ? STATUS_BADGE[s]
                : 'bg-bg-secondary text-text-muted hover:text-text-primary'
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Entries */}
      <div className="space-y-3">
        {sortedEntries.map(entry => (
          <div
            key={entry.id}
            className={`card p-4 transition-opacity ${
              entry.status === 'deployed' ? 'opacity-50' : ''
            } ${entry.priority === 'critical' ? 'border-l-2 border-l-danger' : ''}`}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Status badge */}
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_BADGE[entry.status]}`}>
                  {STATUS_LABELS[entry.status]}
                </span>
                {/* Type badge */}
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${TYPE_BADGE[entry.type]}`}>
                  {entry.type}
                </span>
                {/* Priority badge (bugs only) */}
                {entry.priority && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    entry.priority === 'critical' ? 'bg-danger/30 text-danger' :
                    entry.priority === 'high' ? 'bg-warning/20 text-warning' :
                    'bg-white/5 text-text-muted'
                  }`}>
                    {entry.priority}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-text-muted shrink-0">
                {new Date(entry.date).toLocaleString()}
              </span>
            </div>

            <p className="text-sm text-text-primary whitespace-pre-wrap mb-3">{entry.message}</p>

            {/* Context tags */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {entry.context?.screen && (
                <span className="text-[10px] bg-white/5 text-text-muted px-1.5 py-0.5 rounded">{entry.context.screen}</span>
              )}
              {entry.context?.round != null && (
                <span className="text-[10px] bg-white/5 text-text-muted px-1.5 py-0.5 rounded">R{entry.context.round}</span>
              )}
              {entry.context?.difficulty && (
                <span className="text-[10px] bg-white/5 text-text-muted px-1.5 py-0.5 rounded">{entry.context.difficulty}</span>
              )}
              {entry.context?.duration && (
                <span className="text-[10px] bg-white/5 text-text-muted px-1.5 py-0.5 rounded">{entry.context.duration}</span>
              )}
              {entry.context?.holdcoName && (
                <span className="text-[10px] bg-white/5 text-text-muted px-1.5 py-0.5 rounded">{entry.context.holdcoName}</span>
              )}
              {entry.context?.device && (
                <span className="text-[10px] bg-white/5 text-text-muted px-1.5 py-0.5 rounded">{entry.context.device}</span>
              )}
              {entry.email && (
                <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded">{entry.email}</span>
              )}
            </div>

            {/* Admin controls */}
            <div className="flex items-center gap-3 pt-2 border-t border-border/30">
              {/* Status dropdown */}
              <select
                value={entry.status}
                onChange={(e) => updateEntry(entry.id, { status: e.target.value as FeedbackStatus })}
                disabled={updatingId === entry.id}
                className="text-xs bg-bg-primary border border-border rounded px-2 py-1 text-text-secondary focus:outline-none focus:border-accent"
              >
                {STATUS_ORDER.map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>

              {/* Priority dropdown (bugs only) */}
              {entry.type === 'bug' && (
                <select
                  value={entry.priority || ''}
                  onChange={(e) => updateEntry(entry.id, {
                    priority: e.target.value ? e.target.value as FeedbackPriority : undefined,
                  })}
                  disabled={updatingId === entry.id}
                  className="text-xs bg-bg-primary border border-border rounded px-2 py-1 text-text-secondary focus:outline-none focus:border-accent"
                >
                  <option value="">No priority</option>
                  {PRIORITIES.map(p => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              )}

              {/* Note input */}
              <input
                type="text"
                placeholder="Admin note..."
                defaultValue={entry.note || ''}
                maxLength={500}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if (val !== (entry.note || '')) {
                    updateEntry(entry.id, { note: val });
                  }
                }}
                disabled={updatingId === entry.id}
                className="flex-1 text-xs bg-bg-primary border border-border rounded px-2 py-1 text-text-secondary placeholder:text-text-muted/50 focus:outline-none focus:border-accent"
              />

              {updatingId === entry.id && (
                <span className="text-[10px] text-text-muted animate-pulse">Saving...</span>
              )}
            </div>
          </div>
        ))}

        {sortedEntries.length === 0 && (
          <div className="text-center text-text-muted py-8 text-sm">No feedback entries match filters</div>
        )}
      </div>
    </>
  );
}
