import { useState } from 'react';
import { Business, formatMoney, formatMultiple } from '../../engine/types';
import { calculateExitValuation } from '../../engine/simulation';
import { SECTORS } from '../../data/sectors';

interface RestructurePhaseProps {
  businesses: Business[];
  cash: number;
  totalDebt: number;
  netDebtToEbitda: number;
  round: number;
  hasRestructured: boolean;
  lastEventType?: string;
  intrinsicValuePerShare: number;
  founderShares: number;
  sharesOutstanding: number;
  onDistressedSale: (businessId: string) => void;
  onEmergencyEquityRaise: (amount: number) => void;
  onDeclareBankruptcy: () => void;
  onContinue: () => void;
}

export function RestructurePhase({
  businesses,
  cash,
  totalDebt,
  netDebtToEbitda,
  round,
  hasRestructured,
  lastEventType,
  intrinsicValuePerShare,
  founderShares,
  sharesOutstanding,
  onDistressedSale,
  onEmergencyEquityRaise,
  onDeclareBankruptcy,
  onContinue,
}: RestructurePhaseProps) {
  const [equityAmount, setEquityAmount] = useState('');
  const [showBankruptcyConfirm, setShowBankruptcyConfirm] = useState(false);
  const [actionsTaken, setActionsTaken] = useState(0);

  const activeBusinesses = businesses.filter(b => b.status === 'active');
  const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);

  // Calculate fire-sale prices for each business
  const businessValues = activeBusinesses.map(b => {
    const valuation = calculateExitValuation(b, round, lastEventType);
    const fireSalePrice = Math.round(valuation.exitPrice * 0.70);
    const netProceeds = Math.max(0, fireSalePrice - b.sellerNoteBalance);
    // Project post-sale ND/E
    const postSaleDebt = totalDebt - b.sellerNoteBalance;
    const postSaleCash = cash + netProceeds;
    const postSaleEbitda = totalEbitda - b.ebitda;
    const postSaleNDE = postSaleEbitda > 0 ? (postSaleDebt - postSaleCash) / postSaleEbitda : 99;
    return { business: b, valuation, fireSalePrice, netProceeds, postSaleNDE };
  });

  const canContinue = actionsTaken > 0;
  const breachResolved = netDebtToEbitda < 4.5 && cash >= 0;

  // Calculate how much cash needed to reach comfortable (2.5x) and breach exit (4.5x)
  const netDebt = totalDebt - cash;
  const cashToExitBreach = totalEbitda > 0 ? Math.max(0, netDebt - totalEbitda * 4.5) : netDebt;
  const cashToComfortable = totalEbitda > 0 ? Math.max(0, netDebt - totalEbitda * 2.5) : netDebt;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-8">
      {/* Danger Banner */}
      <div className="bg-red-900/40 border-2 border-red-500/60 rounded-xl p-6 mb-8 text-center">
        <h2 className="text-3xl font-bold text-red-400 mb-2">Financial Distress</h2>
        <p className="text-lg text-red-300 mb-4">
          Your lenders require immediate corrective action
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-center">
          <div>
            <p className="text-text-muted text-sm">Cash</p>
            <p className="text-2xl font-bold font-mono text-red-400">{formatMoney(cash)}</p>
          </div>
          <div>
            <p className="text-text-muted text-sm">Total Debt</p>
            <p className="text-2xl font-bold font-mono text-red-400">{formatMoney(totalDebt)}</p>
          </div>
          <div>
            <p className="text-text-muted text-sm">Net Debt/EBITDA</p>
            <p className={`text-2xl font-bold font-mono ${breachResolved ? 'text-green-400' : 'text-red-400'}`}>
              {formatMultiple(netDebtToEbitda)}
            </p>
          </div>
        </div>
        {hasRestructured && (
          <p className="mt-4 text-sm text-red-300 bg-red-900/40 rounded px-3 py-2">
            This is your second financial distress event. If you cannot resolve it, bankruptcy is the only option.
          </p>
        )}
      </div>

      {/* Breach Resolved Banner */}
      {actionsTaken > 0 && breachResolved && (
        <div className="bg-green-900/30 border-2 border-green-500/50 rounded-xl p-4 mb-6 text-center">
          <p className="text-green-300 font-bold text-lg mb-1">Breach Resolved</p>
          <p className="text-green-400 text-sm">
            ND/E is now {formatMultiple(netDebtToEbitda)} (below 4.5x). You can continue.
          </p>
        </div>
      )}

      {/* What triggered this + Prescriptive guidance */}
      <div className="card mb-6 bg-white/5">
        <h3 className="font-bold mb-2">What happened?</h3>
        <p className="text-sm text-text-secondary mb-4">
          {cash <= 0
            ? 'Your holding company ran out of cash. Interest payments and operating costs exceeded your free cash flow.'
            : 'You have been in covenant breach for 2 consecutive years. Your net debt/EBITDA ratio has exceeded 4.5x.'}
        </p>

        {/* Prescriptive guidance */}
        <div className="bg-white/5 rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-text-muted">Current ND/E</span>
            <span className={`font-mono font-bold ${netDebtToEbitda >= 4.5 ? 'text-red-400' : netDebtToEbitda >= 2.5 ? 'text-orange-400' : 'text-green-400'}`}>
              {formatMultiple(netDebtToEbitda)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Target to exit breach (&lt; 4.5x)</span>
            <span className="font-mono text-orange-300">
              {cashToExitBreach > 0 ? `Raise or free up ${formatMoney(cashToExitBreach)}` : 'Met'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Target for comfortable (&lt; 2.5x)</span>
            <span className="font-mono text-text-muted">
              {cashToComfortable > 0 ? `Raise or free up ${formatMoney(cashToComfortable)}` : 'Met'}
            </span>
          </div>
          {businessValues.length > 0 && (
            <div className="border-t border-white/10 pt-2 mt-2">
              <p className="text-text-muted text-xs mb-1.5">Projected ND/E after each sale:</p>
              {businessValues.slice(0, 3).map(v => (
                <p key={v.business.id} className="text-xs text-text-secondary">
                  {SECTORS[v.business.sectorId].emoji} {v.business.name}: +{formatMoney(v.netProceeds)} → ND/E {v.postSaleNDE < 0 ? '0.0x' : formatMultiple(v.postSaleNDE)}
                  {v.postSaleNDE < 4.5 && <span className="text-green-400 ml-1">(resolves breach)</span>}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action Cards */}
      <div className="space-y-6 mb-8">
        {/* 1. Distressed Asset Sale */}
        <div className="card border-l-4 border-orange-500/60">
          <h3 className="font-bold text-lg mb-2">1. Distressed Asset Sale</h3>
          <p className="text-sm text-text-secondary mb-4">
            Sell businesses at a 30% discount to normal exit value. Proceeds go toward stabilizing your balance sheet.
          </p>

          {activeBusinesses.length === 0 ? (
            <p className="text-text-muted text-sm italic">No businesses to sell.</p>
          ) : (
            <div className="space-y-3">
              {businessValues.map(({ business, fireSalePrice, netProceeds, postSaleNDE }) => {
                const sector = SECTORS[business.sectorId];
                return (
                  <div
                    key={business.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 sm:p-3 bg-white/5 rounded-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl">{sector.emoji}</span>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{business.name}</p>
                        <p className="text-xs text-text-muted">
                          EBITDA: {formatMoney(business.ebitda)} | Fire-sale: {formatMoney(fireSalePrice)}
                          <span className="text-red-400"> (70% of fair value)</span>
                        </p>
                        <p className="text-xs text-text-muted">
                          → ND/E after: <span className={postSaleNDE < 4.5 ? 'text-green-400' : 'text-orange-400'}>
                            {postSaleNDE < 0 ? '0.0x' : formatMultiple(postSaleNDE)}
                          </span>
                          {postSaleNDE < 4.5 && <span className="text-green-400"> (resolves breach)</span>}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onDistressedSale(business.id);
                        setActionsTaken(prev => prev + 1);
                      }}
                      className="btn-primary text-sm bg-orange-600 hover:bg-orange-500 w-full sm:w-auto"
                    >
                      Sell (+{formatMoney(netProceeds)})
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Emergency Equity Raise */}
        <div className="card border-l-4 border-yellow-500/60">
          <h3 className="font-bold text-lg mb-2">2. Emergency Equity Raise</h3>
          <p className="text-sm text-text-secondary mb-4">
            Issue shares at 50% of intrinsic value — extreme dilution, but it raises cash immediately.
            Normal ownership minimums do not apply during restructuring.
          </p>

          <div className="flex gap-2 mb-3">
            <input
              type="number"
              value={equityAmount}
              onChange={(e) => setEquityAmount(e.target.value)}
              placeholder="$k to raise"
              className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm"
            />
            <button
              onClick={() => {
                const amount = parseInt(equityAmount);
                if (amount > 0) {
                  onEmergencyEquityRaise(amount);
                  setEquityAmount('');
                  setActionsTaken(prev => prev + 1);
                }
              }}
              disabled={!equityAmount || parseInt(equityAmount) <= 0}
              className="btn-primary text-sm bg-yellow-600 hover:bg-yellow-500"
            >
              Issue Shares
            </button>
          </div>

          {equityAmount && parseInt(equityAmount) > 0 && intrinsicValuePerShare > 0 && (() => {
            const amt = parseInt(equityAmount);
            const emergencyPrice = intrinsicValuePerShare * 0.5;
            const newShares = Math.round((amt / emergencyPrice) * 1000) / 1000;
            const newTotal = sharesOutstanding + newShares;
            const newOwnership = founderShares / newTotal * 100;
            const postRaiseNetDebt = totalDebt - (cash + amt);
            const postRaiseNDE = totalEbitda > 0 ? postRaiseNetDebt / totalEbitda : 99;
            return (
              <div className="p-3 bg-white/5 rounded text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-text-muted">Price per share</span>
                  <span className="font-mono text-red-400">{formatMoney(emergencyPrice)} (50% discount)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">New shares issued</span>
                  <span className="font-mono">{newShares.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Your ownership after</span>
                  <span className={`font-mono font-bold ${newOwnership < 51 ? 'text-red-400' : 'text-warning'}`}>
                    {newOwnership.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-1 mt-1">
                  <span className="text-text-muted">ND/E after raise</span>
                  <span className={`font-mono ${postRaiseNDE < 4.5 ? 'text-green-400' : 'text-orange-400'}`}>
                    {postRaiseNDE < 0 ? '0.0x' : formatMultiple(postRaiseNDE)}
                    {postRaiseNDE < 4.5 && ' (resolves breach)'}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* 3. Declare Bankruptcy */}
        <div className="card border-l-4 border-red-600/60">
          <h3 className="font-bold text-lg mb-2 text-red-400">3. Declare Bankruptcy</h3>
          <p className="text-sm text-text-secondary mb-4">
            End the game immediately. Your holding company cannot service its debt obligations.
          </p>
          {showBankruptcyConfirm ? (
            <div className="bg-red-900/30 rounded-lg p-4">
              <p className="text-sm text-red-300 mb-3">
                Are you sure? This ends the game with an F grade and a score of 0.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBankruptcyConfirm(false)}
                  className="btn-secondary flex-1 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={onDeclareBankruptcy}
                  className="flex-1 text-sm btn-primary bg-red-600 hover:bg-red-500"
                >
                  Confirm Bankruptcy
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowBankruptcyConfirm(true)}
              className="btn-secondary text-sm border-red-600/50 text-red-400 hover:bg-red-900/30"
            >
              Declare Bankruptcy
            </button>
          )}
        </div>
      </div>

      {/* Educational Note */}
      <div className="card mb-6 bg-white/5 text-sm text-text-muted">
        <p className="font-medium text-text-secondary mb-2">Real-World Context</p>
        <p>
          In real holding companies, financial distress triggers lender intervention — covenant breaches lead to
          forced asset sales, equity infusions at punitive terms, or ultimately Chapter 11 bankruptcy. The best
          operators avoid this by maintaining conservative leverage (under 2.5x net debt/EBITDA), building cash
          reserves, and matching debt maturity to cash flow predictability. Once you're in distress, every option
          is expensive.
        </p>
      </div>

      {/* Continue Button */}
      <button
        onClick={onContinue}
        disabled={!canContinue}
        className={`w-full text-lg py-4 rounded-lg transition-colors ${
          canContinue
            ? 'btn-primary'
            : 'bg-white/10 text-text-muted cursor-not-allowed'
        }`}
      >
        {canContinue
          ? (breachResolved ? 'Continue (Breach Resolved) →' : 'Continue to Events →')
          : 'Take at least one action to continue'}
      </button>
    </div>
  );
}
