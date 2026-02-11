import { useState } from 'react';
import { SECTOR_LIST } from '../../data/sectors';
import { formatMoney, formatPercent } from '../../engine/types';

interface MarketGuideModalProps {
  onClose: () => void;
}

type SortBy = 'multiple' | 'stability' | 'growth' | 'size';

export function MarketGuideModal({ onClose }: MarketGuideModalProps) {
  const [sortBy, setSortBy] = useState<SortBy>('multiple');

  // Calculate derived metrics for each sector
  const sectorsWithMetrics = SECTOR_LIST.map(sector => {
    const avgMultiple = (sector.acquisitionMultiple[0] + sector.acquisitionMultiple[1]) / 2;
    const avgEbitda = (sector.baseEbitda[0] + sector.baseEbitda[1]) / 2;
    const avgGrowth = (sector.organicGrowthRange[0] + sector.organicGrowthRange[1]) / 2;
    const stabilityScore = 1 - sector.volatility - (sector.recessionSensitivity * 0.1);

    return {
      ...sector,
      avgMultiple,
      avgEbitda,
      avgGrowth,
      stabilityScore,
    };
  });

  // Sort sectors based on selected criteria
  const sortedSectors = [...sectorsWithMetrics].sort((a, b) => {
    switch (sortBy) {
      case 'multiple':
        return b.avgMultiple - a.avgMultiple;
      case 'stability':
        return b.stabilityScore - a.stabilityScore;
      case 'growth':
        return b.avgGrowth - a.avgGrowth;
      case 'size':
        return b.avgEbitda - a.avgEbitda;
      default:
        return 0;
    }
  });

  const getMultipleColor = (low: number, high: number) => {
    const avg = (low + high) / 2;
    if (avg >= 6) return 'text-accent';
    if (avg >= 4) return 'text-text-primary';
    return 'text-accent-secondary';
  };

  const getVolatilityLabel = (volatility: number) => {
    if (volatility <= 0.06) return { label: 'Low', color: 'text-green-400' };
    if (volatility <= 0.12) return { label: 'Med', color: 'text-yellow-400' };
    return { label: 'High', color: 'text-red-400' };
  };

  const getRecessionLabel = (sensitivity: number) => {
    if (sensitivity <= 0.3) return { label: 'Defensive', color: 'text-green-400' };
    if (sensitivity < 0) return { label: 'Counter-cycl', color: 'text-accent' };
    if (sensitivity <= 0.7) return { label: 'Moderate', color: 'text-yellow-400' };
    return { label: 'Cyclical', color: 'text-red-400' };
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-bg-primary border border-white/10 rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold">Market Guide: Sector Multiples</h3>
            <p className="text-text-muted">Reference for typical acquisition multiples by sector</p>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-2xl"
          >
            ×
          </button>
        </div>

        {/* Educational Header */}
        <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 mb-6">
          <h4 className="font-bold text-accent mb-2">What Drives Multiples?</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="font-medium text-text-primary">Higher Multiples</p>
              <ul className="text-text-secondary mt-1 space-y-1">
                <li>• Recurring revenue (SaaS)</li>
                <li>• Low volatility</li>
                <li>• Recession-resistant</li>
                <li>• Asset-light</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-text-primary">Lower Multiples</p>
              <ul className="text-text-secondary mt-1 space-y-1">
                <li>• Project-based revenue</li>
                <li>• High volatility</li>
                <li>• Cyclical exposure</li>
                <li>• Talent-dependent</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-text-primary">Multiple Expansion</p>
              <ul className="text-text-secondary mt-1 space-y-1">
                <li>• Grow EBITDA</li>
                <li>• Build platform scale</li>
                <li>• Improve quality</li>
                <li>• Hold longer</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Sort Controls */}
        <div className="flex gap-2 mb-4">
          <span className="text-sm text-text-muted py-1">Sort by:</span>
          {[
            { id: 'multiple' as SortBy, label: 'Multiple' },
            { id: 'stability' as SortBy, label: 'Stability' },
            { id: 'growth' as SortBy, label: 'Growth' },
            { id: 'size' as SortBy, label: 'EBITDA Size' },
          ].map(option => (
            <button
              key={option.id}
              onClick={() => setSortBy(option.id)}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                sortBy === option.id
                  ? 'bg-accent text-bg-primary'
                  : 'bg-white/5 text-text-muted hover:bg-white/10'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Sector Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-2 text-text-muted font-medium">Sector</th>
                <th className="text-center py-3 px-2 text-text-muted font-medium">Multiple Range</th>
                <th className="text-center py-3 px-2 text-text-muted font-medium">Typical EBITDA</th>
                <th className="text-center py-3 px-2 text-text-muted font-medium">Growth</th>
                <th className="text-center py-3 px-2 text-text-muted font-medium">Volatility</th>
                <th className="text-center py-3 px-2 text-text-muted font-medium">Recession</th>
                <th className="text-center py-3 px-2 text-text-muted font-medium">CapEx</th>
              </tr>
            </thead>
            <tbody>
              {sortedSectors.map((sector, index) => {
                const volatility = getVolatilityLabel(sector.volatility);
                const recession = getRecessionLabel(sector.recessionSensitivity);

                return (
                  <tr
                    key={sector.id}
                    className={`border-b border-white/5 ${index % 2 === 0 ? 'bg-white/[0.02]' : ''}`}
                  >
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{sector.emoji}</span>
                        <div>
                          <p className="font-medium">{sector.name}</p>
                          <p className="text-xs text-text-muted">
                            {sector.clientConcentration === 'high' ? 'High client concentration' :
                             sector.talentDependency === 'high' ? 'Talent-dependent' :
                             sector.sharedServicesBenefit >= 1.3 ? 'Strong shared services fit' :
                             'Diversified revenue'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={`font-mono font-bold ${getMultipleColor(sector.acquisitionMultiple[0], sector.acquisitionMultiple[1])}`}>
                        {sector.acquisitionMultiple[0].toFixed(1)}x – {sector.acquisitionMultiple[1].toFixed(1)}x
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center font-mono">
                      {formatMoney(sector.baseEbitda[0])} – {formatMoney(sector.baseEbitda[1])}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={`font-mono ${sector.avgGrowth >= 0.04 ? 'text-accent' : sector.avgGrowth < 0.02 ? 'text-text-muted' : ''}`}>
                        {formatPercent(sector.organicGrowthRange[0])} – {formatPercent(sector.organicGrowthRange[1])}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={`text-xs px-2 py-1 rounded ${volatility.color} bg-white/5`}>
                        {volatility.label}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={`text-xs px-2 py-1 rounded ${recession.color} bg-white/5`}>
                        {recession.label}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center font-mono text-text-muted">
                      {formatPercent(sector.capexRate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Tips */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-white/5 rounded-lg text-sm">
            <p className="font-medium text-text-secondary mb-2">Reading the Table</p>
            <ul className="text-text-muted space-y-1">
              <li><span className="text-accent">●</span> Green multiples = premium sectors (5x+)</li>
              <li><span className="text-accent-secondary">●</span> Orange multiples = value sectors (under 4x)</li>
              <li>Higher CapEx = lower FCF conversion from EBITDA</li>
            </ul>
          </div>
          <div className="p-4 bg-white/5 rounded-lg text-sm">
            <p className="font-medium text-text-secondary mb-2">Deal Evaluation Tips</p>
            <ul className="text-text-muted space-y-1">
              <li>• Compare deal multiple to sector range</li>
              <li>• Quality businesses command top of range</li>
              <li>• Distressed sellers offer bottom of range</li>
              <li>• Platform premiums add 0.5-1.0x on exit</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
