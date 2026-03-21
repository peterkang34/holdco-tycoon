import { useState } from 'react';
import type { PlaybookData } from '../../../engine/types';

interface PlaybookOperationsSectionProps {
  operations: PlaybookData['operations'];
}

const MA_TIER_LABELS: Record<number, string> = {
  0: 'Standard (Broker Only)',
  1: 'Tier 1 — Source Deals',
  2: 'Tier 2 — Proactive Outreach',
  3: 'Tier 3 — Full Pipeline',
};

export function PlaybookOperationsSection({ operations }: PlaybookOperationsSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const turnaroundRate =
    operations.turnaroundsStarted > 0
      ? Math.round((operations.turnaroundsSucceeded / operations.turnaroundsStarted) * 100)
      : 0;

  const totalSourcingUses = operations.sourceDealUses + operations.proactiveOutreachUses + operations.smbBrokerUses;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-mono text-text-muted">05</span>
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-xs font-bold tracking-widest text-text-muted uppercase">Operational Playbook</span>
      </div>

      {/* Turnaround track record */}
      <div className="mb-4">
        <p className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wider">Turnaround Track Record</p>
        {operations.turnaroundsStarted > 0 ? (
          <div className="flex items-center gap-4">
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold font-mono">{operations.turnaroundsStarted}</span>
              <span className="text-xs text-text-muted">started</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold font-mono text-emerald-400">
                {operations.turnaroundsSucceeded}
              </span>
              <span className="text-xs text-text-muted">succeeded</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold font-mono text-red-400">
                {operations.turnaroundsFailed}
              </span>
              <span className="text-xs text-text-muted">failed</span>
            </div>
            <div className="ml-auto">
              <span
                className={`text-sm font-mono font-medium ${
                  turnaroundRate >= 75 ? 'text-emerald-400' : turnaroundRate >= 50 ? 'text-amber-400' : 'text-red-400'
                }`}
              >
                {turnaroundRate}% success
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">No turnarounds attempted. Clean portfolio or missed opportunities.</p>
        )}
      </div>

      {/* Summary badges */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white/[0.03] rounded-lg p-3">
          <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">Shared Services</p>
          <p className="text-lg font-bold font-mono">{operations.sharedServicesActive}</p>
        </div>
        <div className="bg-white/[0.03] rounded-lg p-3">
          <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">M&A Tier</p>
          <p className="text-lg font-bold font-mono">{operations.maSourcingTier}</p>
        </div>
        {operations.recessionAcquisitionCount > 0 && (
          <div className="bg-white/[0.03] rounded-lg p-3">
            <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">Recession Buys</p>
            <p className="text-lg font-bold font-mono text-amber-400">{operations.recessionAcquisitionCount}</p>
          </div>
        )}
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-text-muted hover:text-text-secondary transition-colors"
      >
        {expanded ? 'Hide Details' : 'Show Details'}
      </button>

      {/* Tier 3: Expanded details */}
      {expanded && (
        <div className="mt-4 space-y-4">
          {/* M&A sourcing tier description */}
          <div className="bg-white/[0.02] rounded-lg p-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">M&A Sourcing</p>
            <p className="text-sm text-text-secondary">
              {MA_TIER_LABELS[operations.maSourcingTier] ?? `Tier ${operations.maSourcingTier}`}
            </p>
          </div>

          {/* Deal sourcing breakdown */}
          {totalSourcingUses > 0 && (
            <div>
              <p className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wider">Deal Sourcing</p>
              <div className="space-y-1.5">
                {operations.sourceDealUses > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">Source Deals</span>
                    <span className="font-mono text-text-muted">{operations.sourceDealUses} uses</span>
                  </div>
                )}
                {operations.proactiveOutreachUses > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">Proactive Outreach</span>
                    <span className="font-mono text-text-muted">{operations.proactiveOutreachUses} uses</span>
                  </div>
                )}
                {operations.smbBrokerUses > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">SMB Broker</span>
                    <span className="font-mono text-text-muted">{operations.smbBrokerUses} uses</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recession buys detail */}
          {operations.recessionAcquisitionCount > 0 && (
            <div className="bg-amber-500/5 rounded-lg p-3 border border-amber-500/10">
              <p className="text-xs text-amber-400 font-medium">
                {operations.recessionAcquisitionCount} acquisition{operations.recessionAcquisitionCount !== 1 ? 's' : ''} during recessions
              </p>
              <p className="text-[11px] text-text-muted mt-0.5">
                Counter-cyclical discipline: buying when others are selling.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
