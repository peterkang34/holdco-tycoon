import { useMemo, useState } from 'react';
import { Business } from '../../engine/types';
import { calculateRouteDensityBonus, calculateSubTypeSpecBonus } from '../../engine/portfolioBonuses';
import { useGameStore } from '../../hooks/useGame';

interface PortfolioBonusesProps {
  businesses: Business[];
  isMobile?: boolean;
}

export function PortfolioBonuses({ businesses, isMobile }: PortfolioBonusesProps) {
  const [collapsed, setCollapsed] = useState(false);
  const hasEnhancedUnlock = useGameStore(s => s.unlockedMechanics?.enhancedSubTypeSpec ?? false);

  const routeDensity = useMemo(
    () => calculateRouteDensityBonus(businesses),
    [businesses]
  );
  const subTypeSpec = useMemo(
    () => calculateSubTypeSpecBonus(businesses, hasEnhancedUnlock),
    [businesses, hasEnhancedUnlock]
  );

  const hasAnyBonus = routeDensity || subTypeSpec;
  if (!hasAnyBonus) {
    // Dormant state — show hint for discoverability
    const activeCount = businesses.filter(b => b.status === 'active').length;
    if (activeCount < 2) return null; // Too early to show hints

    return (
      <div className="card bg-gray-500/5 border-gray-500/20 mb-6">
        <h3 className="font-bold text-text-muted mb-1 text-sm">Portfolio Synergies</h3>
        <p className="text-xs text-text-muted">
          Own 2+ adjacent distribution businesses or 3+ same sub-type businesses to unlock synergy bonuses.
        </p>
      </div>
    );
  }

  if (isMobile && collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="card bg-emerald-500/5 border-emerald-500/30 mb-6 w-full text-left"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-emerald-400 text-sm">Portfolio Synergies</h3>
          <span className="text-text-muted text-xs">tap to expand</span>
        </div>
      </button>
    );
  }

  return (
    <div className="card bg-emerald-500/5 border-emerald-500/30 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-emerald-400">Portfolio Synergies</h3>
        {isMobile && (
          <button onClick={() => setCollapsed(true)} className="text-text-muted hover:text-text-primary text-lg leading-none">
            ×
          </button>
        )}
      </div>

      <div className="space-y-3">
        {/* Route Density */}
        {routeDensity && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">📦</span>
              <span className="text-sm font-medium text-text-primary">Route Density</span>
              <span className="text-xs text-text-muted">({routeDensity.adjacentCount} adjacent distribution businesses)</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="bg-green-500/15 text-green-400 px-2 py-0.5 rounded">
                +{(routeDensity.marginBoost * 100).toFixed(0)}% margin
              </span>
              <span className="bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded">
                -{(routeDensity.capexReduction * 100).toFixed(0)}% capex
              </span>
            </div>
          </div>
        )}

        {/* Sub-Type Specialization */}
        {subTypeSpec && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">🎯</span>
              <span className="text-sm font-medium text-text-primary">
                Sub-Type Focus
              </span>
              <span className="text-xs text-text-muted">
                ({subTypeSpec.count}× {subTypeSpec.subType})
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="bg-green-500/15 text-green-400 px-2 py-0.5 rounded">
                +{(subTypeSpec.marginBoost * 100).toFixed(1)}% margin
              </span>
              {subTypeSpec.growthBoost > 0 && (
                <span className="bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded">
                  +{(subTypeSpec.growthBoost * 100).toFixed(1)}% growth
                </span>
              )}
              <span className="bg-yellow-500/15 text-yellow-400 px-2 py-0.5 rounded">
                +{(subTypeSpec.integrationBoost * 100).toFixed(0)}% integration
              </span>
              {subTypeSpec.tier === 'base' && (
                <span className="text-text-muted italic">
                  Earn Sector Specialist to unlock enhanced bonuses
                </span>
              )}
              {subTypeSpec.tier !== 'base' && (
                <span className="bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded">
                  Enhanced
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
