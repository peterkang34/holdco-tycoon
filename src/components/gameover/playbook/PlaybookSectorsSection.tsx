import { useState } from 'react';
import type { PlaybookData } from '../../../engine/types';
import { SECTORS } from '../../../data/sectors';

interface PlaybookSectorsSectionProps {
  sectors: PlaybookData['sectors'];
}

function getSectorLabel(count: number): string {
  if (count === 1) return 'Deep Specialist';
  if (count === 2) return 'Focused';
  return 'Diversified';
}

function getSectorName(sectorId: string): string {
  const sector = SECTORS[sectorId as keyof typeof SECTORS];
  return sector?.name ?? sectorId;
}

function getSectorEmoji(sectorId: string): string {
  const sector = SECTORS[sectorId as keyof typeof SECTORS];
  return sector?.emoji ?? '';
}

export function PlaybookSectorsSection({ sectors }: PlaybookSectorsSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const sectorCount = sectors.endingSectorIds.length;
  const maxBusinesses = Math.max(1, ...Object.values(sectors.businessesPerSector));

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-mono text-text-muted">02</span>
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-xs font-bold tracking-widest text-text-muted uppercase">Sector Strategy</span>
      </div>

      {/* Concentration label */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg font-bold">{getSectorLabel(sectorCount)}</span>
        <span className="text-sm text-text-muted">
          {sectorCount} sector{sectorCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Horizontal bar chart */}
      {sectorCount > 0 ? (
        <div className="space-y-2 mb-4">
          {Object.entries(sectors.businessesPerSector)
            .sort(([, a], [, b]) => b - a)
            .map(([sectorId, count]) => {
              const isPlatformSector = sectors.platformSectors.includes(sectorId);
              return (
                <div key={sectorId} className="flex items-center gap-3">
                  <span className="text-sm w-36 md:w-44 shrink-0 truncate text-text-secondary">
                    {getSectorEmoji(sectorId)} {getSectorName(sectorId)}
                  </span>
                  <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden">
                    <div
                      className={`h-full rounded transition-all duration-500 ${
                        isPlatformSector
                          ? 'bg-gradient-to-r from-accent/60 to-accent-secondary/60'
                          : 'bg-white/15'
                      }`}
                      style={{ width: `${(count / maxBusinesses) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-text-muted w-6 text-right">{count}</span>
                  {isPlatformSector && (
                    <span className="text-[10px] text-accent shrink-0">Platform</span>
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        <p className="text-sm text-text-muted mb-4">No active businesses at game end.</p>
      )}

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
          {/* Sub-types */}
          <div>
            <p className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wider">Sub-Types at End</p>
            {sectors.endingSubTypes.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {sectors.endingSubTypes.map((st) => (
                  <span
                    key={st}
                    className="px-2 py-0.5 rounded text-[11px] bg-white/5 text-text-secondary border border-white/10"
                  >
                    {st}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted">No active businesses.</p>
            )}
          </div>

          {/* All-time sectors */}
          {sectors.allTimeSectorIds.length > sectors.endingSectorIds.length && (
            <div>
              <p className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wider">All-Time Sectors</p>
              <div className="flex flex-wrap gap-1.5">
                {sectors.allTimeSectorIds.map((sid) => {
                  const isEnding = sectors.endingSectorIds.includes(sid);
                  return (
                    <span
                      key={sid}
                      className={`px-2 py-0.5 rounded text-[11px] border ${
                        isEnding
                          ? 'bg-white/5 text-text-secondary border-white/10'
                          : 'bg-white/[0.02] text-text-muted/60 border-white/5'
                      }`}
                    >
                      {getSectorEmoji(sid)} {getSectorName(sid)}
                      {!isEnding && ' (exited)'}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Platform sectors highlight */}
          {sectors.platformSectors.length > 0 && (
            <div>
              <p className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wider">Platform Sectors</p>
              <div className="flex flex-wrap gap-1.5">
                {sectors.platformSectors.map((sid) => (
                  <span
                    key={sid}
                    className="px-2 py-0.5 rounded text-[11px] bg-accent/10 text-accent border border-accent/20"
                  >
                    {getSectorEmoji(sid)} {getSectorName(sid)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
