import { useState } from 'react';
import { PE_FUND_CONFIG } from '../../data/gameConfig';

interface FundManagerTutorialModalProps {
  fundName: string;
  onClose: () => void;
}

export function FundManagerTutorialModal({ fundName, onClose }: FundManagerTutorialModalProps) {
  const [page, setPage] = useState(0);
  const hurdleAmount = Math.round(PE_FUND_CONFIG.hurdleReturn / 1000);

  const pages = [
    {
      title: 'Welcome, Fund Manager',
      icon: '\u{1F3E6}', // bank
      content: (
        <>
          <p className="text-text-secondary mb-4">
            You're managing <strong className="text-purple-300">{fundName}</strong>, a $100M PE fund.
          </p>
          <div className="bg-white/5 rounded-lg p-4 border border-purple-500/20 mb-4">
            <p className="text-sm font-bold mb-3 text-purple-300">Your Investors</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-500/30 text-blue-300 text-[9px] font-bold flex items-center justify-center">EM</span>
                  <span className="text-text-muted">Edna Morrison (State Pension)</span>
                </div>
                <span className="font-mono text-blue-300">$60M</span>
              </div>
              <div className="flex justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-amber-500/30 text-amber-300 text-[9px] font-bold flex items-center justify-center">CH</span>
                  <span className="text-text-muted">Chip Henderson (Family Office)</span>
                </div>
                <span className="font-mono text-amber-300">$40M</span>
              </div>
            </div>
          </div>
          <p className="text-text-secondary text-sm">
            Your investors expect you to buy businesses, grow them, and return their capital with a profit.
            You have <strong className="text-purple-300">10 years</strong>.
          </p>
        </>
      ),
    },
    {
      title: 'The Hurdle and Your Carry',
      icon: '\u{1F4B0}', // money bag
      content: (
        <>
          <p className="text-text-secondary mb-4">
            LPs get their money back first, plus <strong className="text-purple-300">8% per year</strong>.
          </p>
          <div className="bg-white/5 rounded-lg p-4 border border-purple-500/20 mb-4">
            <p className="text-sm font-bold mb-3 text-purple-300">The Carry Waterfall</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">1. Return LP capital</span>
                <span className="font-mono text-text-secondary">$100M</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">2. Preferred return (8%/yr)</span>
                <span className="font-mono text-text-secondary">~${hurdleAmount}M total</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-2 font-bold">
                <span className="text-purple-300">3. Your carry: 20% above hurdle</span>
                <span className="font-mono text-purple-300">???</span>
              </div>
            </div>
          </div>
          <p className="text-text-secondary text-sm">
            Over 10 years, you need to turn $100M into at least ~${hurdleAmount}M before carry kicks in.
            Above that, <strong className="text-purple-300">you keep 20%</strong>.
          </p>
        </>
      ),
    },
    {
      title: "What's New",
      icon: '\u{2728}', // sparkles
      content: (
        <>
          <div className="space-y-3">
            <div className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/20">
              <p className="text-sm font-bold text-purple-300 mb-1">Management Fee</p>
              <p className="text-sm text-text-muted">
                $2M/year deducted from your fund cash. The clock starts ticking whether you've deployed capital or not.
              </p>
            </div>
            <div className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/20">
              <p className="text-sm font-bold text-purple-300 mb-1">LP Distributions</p>
              <p className="text-sm text-text-muted">
                Return cash to LPs in the Capital tab. Early distributions improve your IRR and keep LPs happy.
              </p>
            </div>
            <div className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/20">
              <p className="text-sm font-bold text-purple-300 mb-1">LP Reactions</p>
              <p className="text-sm text-text-muted">
                Two LP characters react to your decisions. Keep them satisfied — unhappy LPs can block deals.
              </p>
            </div>
          </div>
          <p className="text-xs text-text-muted mt-4">
            Everything else works the same — buy, improve, build platforms, sell at the right time.
          </p>
        </>
      ),
    },
  ];

  const currentPage = pages[page];
  const isLastPage = page === pages.length - 1;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-bg-card border border-purple-500/20 rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-purple-500/20 text-center flex-shrink-0">
          <span className="text-5xl mb-3 block">{currentPage.icon}</span>
          <h2 className="text-2xl font-bold text-purple-300">{currentPage.title}</h2>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0">
          {currentPage.content}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-purple-500/20 flex-shrink-0">
          {/* Page indicators */}
          <div className="flex justify-center gap-2 mb-4">
            {pages.map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === page ? 'bg-purple-400 w-6' : 'bg-white/20 hover:bg-white/40'
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
                className="flex-1 px-4 py-2 rounded-lg font-medium bg-purple-600 text-white hover:bg-purple-500 transition-colors"
              >
                Next &rarr;
              </button>
            ) : (
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-lg font-medium bg-purple-600 text-white hover:bg-purple-500 transition-colors"
              >
                Launch Fund &rarr;
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
