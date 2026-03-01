import { useState } from 'react';
import { formatMoney } from '../../engine/types';

interface FamilyOfficeTutorialModalProps {
  foStartingCash: number;
  philanthropyDeduction: number;
  onClose: () => void;
}

export function FamilyOfficeTutorialModal({ foStartingCash, philanthropyDeduction, onClose }: FamilyOfficeTutorialModalProps) {
  const [page, setPage] = useState(0);
  const totalCapital = foStartingCash + philanthropyDeduction;

  const pages = [
    {
      title: 'Welcome to the Family Office',
      icon: '\u{1F985}', // eagle
      content: (
        <>
          <p className="text-text-secondary mb-4">
            You've built a legacy. Now steward it.
          </p>

          <div className="bg-white/5 rounded-lg p-4 border border-amber-500/20 mb-4">
            <p className="text-sm font-bold mb-3 text-amber-400">Capital Deployment</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Accumulated distributions</span>
                <span className="font-mono text-amber-400">{formatMoney(totalCapital)}</span>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Philanthropy (25%)</span>
                <span className="font-mono">-{formatMoney(philanthropyDeduction)}</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-2 font-bold">
                <span>Net available capital</span>
                <span className="font-mono text-amber-400">{formatMoney(foStartingCash)}</span>
              </div>
            </div>
          </div>

          <p className="text-text-secondary text-sm">
            You have <strong className="text-amber-400">5 rounds</strong> to deploy this capital into a fresh portfolio.
            You own <strong>100%</strong> of everything you build — no outside investors.
          </p>
        </>
      ),
    },
    {
      title: "What's Different",
      icon: '\u{1F512}', // lock
      content: (
        <>
          <p className="text-text-secondary mb-4">
            Family Office mode restricts your toolkit to pure capital allocation:
          </p>
          <div className="space-y-3">
            <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/20">
              <p className="text-sm font-bold text-red-400 mb-1">Blocked</p>
              <p className="text-sm text-text-muted">
                No equity raises, distributions, buybacks, turnarounds, or IPO
              </p>
            </div>
            <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
              <p className="text-sm font-bold text-amber-400 mb-1">Different</p>
              <p className="text-sm text-text-muted">
                Higher-quality deal flow (Q3+ floor) with inflated prices.
                Only tools: acquire, improve, pay debt, sell.
              </p>
            </div>
            <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
              <p className="text-sm font-bold text-amber-400 mb-1">Exclusive</p>
              <p className="text-sm text-text-muted">
                Pro Sports Franchises unlock as trophy assets — legacy plays only available in Family Office mode.
              </p>
            </div>
          </div>
        </>
      ),
    },
    {
      title: "How You're Scored",
      icon: '\u{1F3C6}', // trophy
      content: (
        <>
          <div className="bg-white/5 rounded-lg p-4 border border-amber-500/20 mb-4">
            <p className="text-sm font-bold text-amber-400 mb-2">MOIC = Ending FEV / Starting Cash</p>
            <p className="text-sm text-text-muted">
              Your MOIC converts to a <strong>1.0x&ndash;1.5x multiplier</strong> on your main-game Adjusted FEV.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-bold text-text-secondary mb-2">Legacy Grades</p>
            <div className="flex justify-between items-center p-2 bg-amber-500/10 rounded border border-amber-500/20">
              <span className="text-sm font-bold text-amber-400">Enduring</span>
              <span className="text-sm text-text-muted">3.5x+ MOIC</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-white/5 rounded">
              <span className="text-sm font-bold text-text-secondary">Influential</span>
              <span className="text-sm text-text-muted">2.0x&ndash;3.5x</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-white/5 rounded">
              <span className="text-sm font-bold text-text-secondary">Established</span>
              <span className="text-sm text-text-muted">1.0x&ndash;2.0x</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-red-500/10 rounded border border-red-500/20">
              <span className="text-sm font-bold text-red-400">Fragile</span>
              <span className="text-sm text-text-muted">&lt;1.0x</span>
            </div>
          </div>
          <p className="text-xs text-red-400/80 mt-3">
            Restructuring during FO applies a 0.80x penalty to your FO FEV before MOIC calculation.
          </p>
        </>
      ),
    },
    {
      title: 'Strategy Tips',
      icon: '\u{1F9ED}', // compass
      content: (
        <>
          <div className="space-y-3">
            <div className="flex gap-3">
              <span className="text-amber-400">&#x25B8;</span>
              <p className="text-text-secondary text-sm">
                <strong>Deploy capital fast</strong> — idle cash sitting uninvested kills your MOIC.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-amber-400">&#x25B8;</span>
              <p className="text-text-secondary text-sm">
                <strong>Quality over quantity</strong> — FO deals start at Q3+. Every acquisition should be strong.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-amber-400">&#x25B8;</span>
              <p className="text-text-secondary text-sm">
                <strong>Build platforms</strong> — platform bonuses compound even across just 5 rounds.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-red-400">&#x2717;</span>
              <p className="text-text-secondary text-sm">
                <strong>Avoid restructuring</strong> — the 0.80x penalty to your FO FEV is devastating.
              </p>
            </div>
          </div>
          <div className="mt-6 p-4 bg-amber-500/10 rounded-lg border border-amber-500/30 text-center">
            <p className="text-amber-400 font-bold">Build something that endures.</p>
          </div>
        </>
      ),
    },
  ];

  const currentPage = pages[page];
  const isLastPage = page === pages.length - 1;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-bg-card border border-amber-500/20 rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-amber-500/20 text-center flex-shrink-0">
          <span className="text-5xl mb-3 block">{currentPage.icon}</span>
          <h2 className="text-2xl font-bold text-amber-400">{currentPage.title}</h2>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0">
          {currentPage.content}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-amber-500/20 flex-shrink-0">
          {/* Page indicators */}
          <div className="flex justify-center gap-2 mb-4">
            {pages.map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === page ? 'bg-amber-400 w-6' : 'bg-white/20 hover:bg-white/40'
                }`}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex gap-3">
            {page > 0 && (
              <button
                onClick={() => setPage(page - 1)}
                className="btn-secondary flex-1"
              >
                &larr; Back
              </button>
            )}
            {!isLastPage ? (
              <button
                onClick={() => setPage(page + 1)}
                className="flex-1 px-4 py-2 rounded-lg font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors"
              >
                Next &rarr;
              </button>
            ) : (
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-lg font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors"
              >
                Begin Stewardship &rarr;
              </button>
            )}
          </div>

          {/* Skip button */}
          {!isLastPage && (
            <button
              onClick={onClose}
              className="w-full mt-3 text-text-muted text-sm hover:text-text-secondary transition-colors"
            >
              Skip Tutorial
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
