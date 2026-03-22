import { Modal } from '../ui/Modal';
import type { PlaybookData } from '../../engine/types';
import { getArchetypeDisplayName } from '../../utils/playbookThesis';
import { PlaybookThesisSection } from './playbook/PlaybookThesisSection';
import { PlaybookSectorsSection } from './playbook/PlaybookSectorsSection';
import { PlaybookCapitalSection } from './playbook/PlaybookCapitalSection';
import { PlaybookPortfolioSection } from './playbook/PlaybookPortfolioSection';
import { PlaybookOperationsSection } from './playbook/PlaybookOperationsSection';
import { PlaybookExitsSection } from './playbook/PlaybookExitsSection';
import { PlaybookPerformanceSection } from './playbook/PlaybookPerformanceSection';
import { PlaybookRealityCheck } from './playbook/PlaybookRealityCheck';

interface OperatorPlaybookProps {
  isOpen: boolean;
  onClose: () => void;
  playbook: PlaybookData;
}

export function OperatorPlaybook({ isOpen, onClose, playbook }: OperatorPlaybookProps) {
  const { thesis } = playbook;
  const isBankrupt = thesis.isBankrupt;
  const isMinimal = playbook.isMinimal;
  const isPE = thesis.isFundManager;

  const title = isBankrupt
    ? `${thesis.holdcoName} — Post-Mortem`
    : isPE
      ? `${thesis.fundName ?? thesis.holdcoName} — Fund Strategy Debrief`
      : `${thesis.holdcoName} — Strategy Debrief`;

  const subtitle = getArchetypeDisplayName(thesis.archetype);

  const header = (
    <div>
      <h3 className="text-xl font-bold text-text-primary">{title}</h3>
      <p className="text-text-muted text-sm mt-0.5">{subtitle}</p>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} header={header} size="lg">
      <div className="space-y-6 pb-4">
        {/* Section 1: Investment Thesis — always shown */}
        <PlaybookThesisSection playbook={playbook} />

        {/* Minimal playbook (early bankruptcy): only thesis + capital + reality check */}
        {isMinimal ? (
          <>
            <PlaybookCapitalSection capital={playbook.capital} />
            <PlaybookRealityCheck realityCheck={playbook.realityCheck} />
          </>
        ) : (
          <>
            {/* Section 2: Sector Strategy */}
            <PlaybookSectorsSection sectors={playbook.sectors} />

            {/* Section 3: Capital Structure */}
            <PlaybookCapitalSection capital={playbook.capital} />

            {/* Section 4: Portfolio Construction */}
            <PlaybookPortfolioSection portfolio={playbook.portfolio} />

            {/* Section 5: Operational Playbook */}
            <PlaybookOperationsSection operations={playbook.operations} />

            {/* Section 6: Exit Strategy */}
            <PlaybookExitsSection exits={playbook.exits} />

            {/* Section 7: Financial Performance */}
            <PlaybookPerformanceSection
              performance={playbook.performance}
              thesis={playbook.thesis}
              peFund={playbook.peFund}
            />

            {/* Family Office addendum */}
            {playbook.familyOffice && (
              <div className="border-t border-white/10 pt-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-text-muted text-xs font-mono">FO</span>
                  <h4 className="text-sm font-semibold text-text-primary">Family Office</h4>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-text-muted text-xs">Legacy Grade</p>
                    <p className="font-bold text-text-primary">{playbook.familyOffice.legacyGrade}</p>
                  </div>
                  <div>
                    <p className="text-text-muted text-xs">FO MOIC</p>
                    <p className="font-mono font-bold text-text-primary">{playbook.familyOffice.foMoic.toFixed(2)}x</p>
                  </div>
                  <div>
                    <p className="text-text-muted text-xs">FEV Multiplier</p>
                    <p className="font-mono font-bold text-text-primary">{playbook.familyOffice.foMultiplier.toFixed(2)}x</p>
                  </div>
                  <div>
                    <p className="text-text-muted text-xs">Philanthropy</p>
                    <p className="font-mono font-bold text-text-primary">
                      ${(playbook.familyOffice.philanthropyAmount / 1000).toFixed(0)}M
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* IPO addendum */}
            {playbook.ipo && (
              <div className="border-t border-white/10 pt-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-text-muted text-xs font-mono">IPO</span>
                  <h4 className="text-sm font-semibold text-text-primary">Public Company</h4>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <p className="text-text-muted text-xs">IPO Round</p>
                    <p className="font-bold text-text-primary">Year {playbook.ipo.ipoRound}{playbook.ipo.roundsAsPublic != null ? ` (${playbook.ipo.roundsAsPublic}yr public)` : ''}</p>
                  </div>
                  <div>
                    <p className="text-text-muted text-xs">Stock Price Change</p>
                    <p className={`font-mono font-bold ${(playbook.ipo.stockPriceChangePct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${playbook.ipo.initialStockPrice?.toFixed(2) ?? '?'} → ${playbook.ipo.stockPrice.toFixed(2)}
                      <span className="text-xs ml-1">
                        ({(playbook.ipo.stockPriceChangePct ?? 0) >= 0 ? '+' : ''}{((playbook.ipo.stockPriceChangePct ?? 0) * 100).toFixed(0)}%)
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-text-muted text-xs">Market Sentiment</p>
                    <p className={`font-mono font-bold ${playbook.ipo.marketSentiment >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {playbook.ipo.marketSentiment >= 0 ? '+' : ''}{(playbook.ipo.marketSentiment * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-text-muted text-xs">Public Company Premium</p>
                    <p className="font-mono font-bold text-green-400">+{((playbook.ipo.publicCompanyBonus ?? 0) * 100).toFixed(0)}%</p>
                  </div>
                  <div>
                    <p className="text-text-muted text-xs">Total Dilution</p>
                    <p className="font-mono font-bold text-text-primary">
                      {playbook.ipo.preIPOShares != null && playbook.ipo.sharesOutstanding > 0
                        ? `${((1 - playbook.ipo.preIPOShares / playbook.ipo.sharesOutstanding) * 100).toFixed(0)}%`
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-muted text-xs">Share-Funded Deals</p>
                    <p className="font-mono font-bold text-text-primary">{playbook.ipo.totalShareFundedDeals ?? 0}</p>
                  </div>
                </div>
                {(playbook.ipo.consecutiveMisses ?? 0) > 0 && (
                  <p className="text-xs text-red-400/70 mt-2">
                    Ended with {playbook.ipo.consecutiveMisses} consecutive earnings miss{playbook.ipo.consecutiveMisses === 1 ? '' : 'es'}
                  </p>
                )}
              </div>
            )}

            {/* Reality Check footer */}
            <PlaybookRealityCheck realityCheck={playbook.realityCheck} />
          </>
        )}
      </div>
    </Modal>
  );
}
