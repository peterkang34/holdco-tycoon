import { useState } from 'react';
import { formatMoney } from '../../engine/types';

interface InstructionsModalProps {
  holdcoName: string;
  initialRaise: number;
  founderOwnership: number;
  firstBusinessName?: string;
  firstBusinessPrice?: number;
  startingCash?: number;
  maxRounds?: number;
  onClose: () => void;
}

export function InstructionsModal({ holdcoName, initialRaise, founderOwnership, firstBusinessName, firstBusinessPrice, startingCash, maxRounds = 20, onClose }: InstructionsModalProps) {
  const [page, setPage] = useState(0);

  const pages = [
    {
      title: `Welcome to ${holdcoName}`,
      icon: '🏛️',
      content: (
        <>
          <p className="text-text-secondary mb-4">
            {founderOwnership < 1
              ? <>You sold {Math.round((1 - founderOwnership) * 100)}% of {holdcoName} to outside investors, raising <strong className="text-accent">{formatMoney(initialRaise)}</strong> in equity capital to fund your first acquisition and future deals.</>
              : <>You raised <strong className="text-accent">{formatMoney(initialRaise)}</strong> from personal savings and bank debt to fund your self-funded search and first acquisition.</>
            }
          </p>

          {/* Sources & Uses */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10 mb-4">
            <p className="text-sm font-bold mb-3">Sources & Uses of Funds</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">{founderOwnership < 1 ? `Equity raise (${Math.round((1 - founderOwnership) * 100)}% sold to investors)` : 'Total capital (equity + debt)'}</span>
                <span className="font-mono text-accent">{formatMoney(initialRaise)}</span>
              </div>
              {firstBusinessName && firstBusinessPrice && (
                <div className="flex justify-between text-warning">
                  <span>First acquisition: {firstBusinessName}</span>
                  <span className="font-mono">-{formatMoney(firstBusinessPrice)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-white/10 pt-2 font-bold">
                <span>Starting cash</span>
                <span className="font-mono text-accent">{formatMoney(startingCash ?? (initialRaise - (firstBusinessPrice ?? 0)))}</span>
              </div>
            </div>
          </div>

          {/* Cap Table */}
          <div className="bg-accent/10 rounded-lg p-4 border border-accent/30 mb-4">
            <p className="text-sm font-bold text-accent mb-2">Your Cap Table</p>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Your Ownership:</span>
              <span className="font-bold">{Math.round(founderOwnership * 100)}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Investor Ownership:</span>
              <span className="font-bold">{Math.round((1 - founderOwnership) * 100)}%</span>
            </div>
            <p className="text-xs text-text-muted mt-2">
              You must maintain &gt;51% ownership to keep control. Be careful when issuing new equity!
            </p>
          </div>

          <p className="text-text-secondary mb-4">
            Your mission: <strong className="text-accent">maximize Founder Equity Value over {maxRounds} years</strong> through
            smart acquisitions, operational improvements, and disciplined capital allocation.
          </p>
        </>
      ),
    },
    {
      title: 'The Annual Cycle',
      icon: '🔄',
      content: (
        <>
          <p className="text-text-secondary mb-4">
            Each year follows three phases:
          </p>
          <div className="space-y-3">
            <div className="flex gap-3 items-start">
              <span className="bg-accent/20 text-accent px-2 py-1 rounded text-sm font-bold">1</span>
              <div>
                <p className="font-bold">Collect</p>
                <p className="text-sm text-text-muted">
                  Your businesses generate Free Cash Flow (FCF). You'll pay interest on debt
                  and shared services costs.
                </p>
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <span className="bg-accent/20 text-accent px-2 py-1 rounded text-sm font-bold">2</span>
              <div>
                <p className="font-bold">Event</p>
                <p className="text-sm text-text-muted">
                  Market events occur — recessions, bull markets, unsolicited offers,
                  or changes at your portfolio companies.
                </p>
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <span className="bg-accent/20 text-accent px-2 py-1 rounded text-sm font-bold">3</span>
              <div>
                <p className="font-bold">Allocate</p>
                <p className="text-sm text-text-muted">
                  Deploy your capital: acquire businesses, improve operations, pay down debt,
                  or return capital to shareholders.
                </p>
              </div>
            </div>
          </div>
        </>
      ),
    },
    {
      title: 'Key Metrics to Watch',
      icon: '📊',
      content: (
        <>
          <div className="space-y-3">
            <div className="bg-white/5 rounded-lg p-3">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold">FCF/Share</span>
                <span className="text-accent text-sm">Growth Target</span>
              </div>
              <p className="text-sm text-text-muted">
                Free cash flow per share — the ultimate measure of compounding. Grow this consistently.
              </p>
            </div>
            <div className="bg-white/5 rounded-lg p-3">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold">Net Debt/EBITDA</span>
                <span className="text-warning text-sm">&lt; 3.0x Safe</span>
              </div>
              <p className="text-sm text-text-muted">
                Your leverage ratio. Stay below 3x to maintain financial flexibility.
              </p>
            </div>
            <div className="bg-white/5 rounded-lg p-3">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold">ROIC</span>
                <span className="text-accent text-sm">&gt; 15% Good</span>
              </div>
              <p className="text-sm text-text-muted">
                Return on invested capital. Higher ROIC means your capital is working hard.
              </p>
            </div>
          </div>
        </>
      ),
    },
    {
      title: 'Capital Allocation Hierarchy',
      icon: '💰',
      content: (
        <>
          <p className="text-text-secondary mb-4">
            The best holdco operators follow this priority order:
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 bg-accent/10 rounded-lg border border-accent/30">
              <span className="text-lg">1️⃣</span>
              <div>
                <p className="font-bold text-accent">Reinvest at High Returns</p>
                <p className="text-sm text-text-muted">If ROIIC &gt; 15%, deploy into acquisitions or improvements</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
              <span className="text-lg">2️⃣</span>
              <div>
                <p className="font-bold">Pay Down Debt</p>
                <p className="text-sm text-text-muted">If leverage is high, strengthen the balance sheet</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
              <span className="text-lg">3️⃣</span>
              <div>
                <p className="font-bold">Buyback Shares</p>
                <p className="text-sm text-text-muted">If shares trade below intrinsic value</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
              <span className="text-lg">4️⃣</span>
              <div>
                <p className="font-bold">Distribute to Owners</p>
                <p className="text-sm text-text-muted">When reinvestment opportunities are limited</p>
              </div>
            </div>
          </div>
        </>
      ),
    },
    {
      title: 'Tips for Success',
      icon: '🎯',
      content: (
        <>
          <div className="space-y-3">
            <div className="flex gap-3">
              <span className="text-accent">✓</span>
              <p className="text-text-secondary">
                <strong>Quality over quantity.</strong> A few excellent businesses beat many mediocre ones.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-accent">✓</span>
              <p className="text-text-secondary">
                <strong>Focus on sectors.</strong> Owning 3+ businesses in one sector unlocks synergy bonuses.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-accent">✓</span>
              <p className="text-text-secondary">
                <strong>Shared services scale.</strong> Unlock them when you have 3+ opcos to spread the cost.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-accent">✓</span>
              <p className="text-text-secondary">
                <strong>Sell winners at premium multiples.</strong> But only if you can't reinvest at high returns.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-danger">✗</span>
              <p className="text-text-secondary">
                <strong>Avoid over-leveraging.</strong> Debt above 4x EBITDA is dangerous in recessions.
              </p>
            </div>
          </div>
          <div className="mt-6 p-4 bg-accent/10 rounded-lg border border-accent/30 text-center">
            <p className="text-accent font-bold">Good luck, Capital Allocator!</p>
            <p className="text-sm text-text-muted mt-1">Build something that compounds.</p>
          </div>
        </>
      ),
    },
  ];

  const currentPage = pages[page];
  const isLastPage = page === pages.length - 1;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-bg-card border border-white/10 rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-white/10 text-center flex-shrink-0">
          <span className="text-5xl mb-3 block">{currentPage.icon}</span>
          <h2 className="text-2xl font-bold">{currentPage.title}</h2>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0">
          {currentPage.content}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-white/10 flex-shrink-0">
          {/* Page indicators */}
          <div className="flex justify-center gap-2 mb-4">
            {pages.map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === page ? 'bg-accent w-6' : 'bg-white/20 hover:bg-white/40'
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
                ← Back
              </button>
            )}
            {!isLastPage ? (
              <button
                onClick={() => setPage(page + 1)}
                className="btn-primary flex-1"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={onClose}
                className="btn-primary flex-1"
              >
                Start Playing →
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
