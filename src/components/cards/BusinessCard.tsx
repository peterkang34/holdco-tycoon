import { useState, useMemo } from 'react';
import { Business, IntegratedPlatform, ActiveTurnaround, formatMoney, formatPercent, formatMultiple } from '../../engine/types';
import { getProgramById } from '../../data/turnaroundPrograms';
import { SECTORS } from '../../data/sectors';
import { calculateExitValuation } from '../../engine/simulation';
import { EARNOUT_EXPIRATION_YEARS } from '../../data/gameConfig';
import { debtCountdownLabel, earnoutTargetLabel, earnoutCountdownLabel } from '../../data/mechanicsCopy';
import { Tooltip } from '../ui/Tooltip';

interface BusinessCardProps {
  business: Business;
  showDetails?: boolean;
  onSell?: () => void;
  onImprove?: () => void;

  onDesignatePlatform?: () => void;
  onShowRollUpGuide?: () => void;
  compact?: boolean;
  isPlatform?: boolean;
  platformScale?: number;
  boltOnCount?: number;
  canAffordPlatform?: boolean;
  currentRound?: number;
  lastEventType?: string;
  integratedPlatforms?: IntegratedPlatform[];
  activeTurnaround?: ActiveTurnaround | null;
  onStartTurnaround?: () => void;
  turnaroundEligible?: boolean;
}

export function BusinessCard({
  business,
  showDetails = true,
  onSell,
  onImprove,

  onDesignatePlatform,
  onShowRollUpGuide,
  compact = false,
  isPlatform = false,
  platformScale = 0,
  boltOnCount = 0,
  canAffordPlatform = true,
  currentRound = 1,
  lastEventType,
  integratedPlatforms = [],
  activeTurnaround = null,
  onStartTurnaround,
  turnaroundEligible = false,
}: BusinessCardProps) {
  const [showValuation, setShowValuation] = useState(false);
  const sector = SECTORS[business.sectorId];
  const annualFcf = Math.round(business.ebitda * (1 - sector.capexRate));

  // Memoize exit valuation — involves multiple premium calculations, buyer pool logic, etc.
  const exitValuation = useMemo(
    () => calculateExitValuation(business, currentRound, lastEventType, undefined, integratedPlatforms),
    [business, currentRound, lastEventType, integratedPlatforms]
  );

  // Look up integrated platform name for badge
  const integratedPlatformName = business.integratedPlatformId
    ? integratedPlatforms.find(p => p.id === business.integratedPlatformId)?.name
    : undefined;
  const totalInvested = business.totalAcquisitionCost || business.acquisitionPrice;
  const gainLoss = exitValuation.netProceeds - totalInvested;
  const moic = exitValuation.netProceeds / totalInvested;

  const isGrowing = business.ebitda > business.acquisitionEbitda;
  const isDeclining = business.ebitda < business.peakEbitda * 0.7;

  if (compact) {
    return (
      <div
        className="card flex items-center gap-3 py-2"
        style={{ borderLeftColor: sector.color, borderLeftWidth: '3px' }}
      >
        <span className="text-xl">{sector.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{business.name}</div>
          <div className="text-xs text-text-muted">{sector.name}</div>
        </div>
        <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
          business.qualityRating >= 4 ? 'bg-accent/20 text-accent' :
          business.qualityRating === 3 ? 'bg-yellow-500/20 text-yellow-400' :
          'bg-danger/20 text-danger'
        }`}>Q{business.qualityRating}</span>
        <div className="text-right">
          <div className="font-mono font-bold">{formatMoney(business.ebitda)}</div>
          <div className={`text-xs ${isGrowing ? 'text-accent' : isDeclining ? 'text-danger' : 'text-text-muted'}`}>
            {isGrowing ? '▲' : isDeclining ? '▼' : '–'} FCF: {formatMoney(annualFcf)}/y
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="card"
      style={{ borderTopColor: sector.color, borderTopWidth: '3px' }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xl shrink-0">{sector.emoji}</span>
          <div className="min-w-0">
            <h3 className="font-bold truncate">{business.name}</h3>
            <p className="text-xs text-text-muted truncate">{business.subType}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Tooltip
            trigger={
              <span className={`text-xs font-mono font-bold px-2 py-1 rounded ${
                business.qualityRating >= 4 ? 'bg-accent/20 text-accent' :
                business.qualityRating === 3 ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-danger/20 text-danger'
              }`}>
                Q{business.qualityRating}
                {(business.qualityImprovedTiers ?? 0) > 0 && (
                  <span className="text-accent ml-0.5">+{business.qualityImprovedTiers}</span>
                )}
              </span>
            }
            align="right"
            width="w-48 md:w-56"
          >
            <p className="text-sm text-text-secondary font-normal">Quality Rating: {business.qualityRating}/5</p>
            <p className="text-xs text-text-muted mt-1 font-normal">
              {business.qualityRating >= 4 ? 'Strong business — commands premium multiples.' :
               business.qualityRating === 3 ? 'Average quality — solid foundation for improvements.' :
               'Below average — turnaround candidate.'}
            </p>
            {(business.qualityImprovedTiers ?? 0) > 0 && (
              <p className="text-xs text-accent mt-1 font-normal">Improved {business.qualityImprovedTiers} tier{(business.qualityImprovedTiers ?? 0) > 1 ? 's' : ''} via turnaround.</p>
            )}
          </Tooltip>
          {integratedPlatformName && (
            <Tooltip
              trigger={<span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded truncate max-w-[140px]">{integratedPlatformName}</span>}
              align="right"
              width="w-48 md:w-56"
            >
              <p className="text-sm text-text-secondary font-normal">Part of the <strong>{integratedPlatformName}</strong> integrated platform. Receives exit multiple premium and recession resistance.</p>
            </Tooltip>
          )}
          {isPlatform && (
            <Tooltip
              trigger={<span className="text-xs bg-accent/20 text-accent px-2 py-1 rounded">Scale {platformScale}</span>}
              align="right"
              width="w-56 md:w-64"
            >
              <p className="text-sm text-text-secondary font-normal">This is a roll-up hub. Tuck-in bolt-on acquisitions or merge with another business to increase scale and unlock synergies + exit multiple expansion.</p>
              <p className="text-xs text-text-muted mt-2 font-normal">Multiple expansion caps at Scale 3 (+1.0x). Exit premium caps at Scale 5 (+1.0x). Merges add more scale than tuck-ins.</p>
              <p className="text-xs text-accent mt-1 font-normal">Current: Scale {platformScale}, {boltOnCount} bolt-on{boltOnCount !== 1 ? 's' : ''}</p>
            </Tooltip>
          )}
          {business.integrationRoundsRemaining > 0 && (
            <Tooltip
              trigger={<span className="text-xs bg-warning/20 text-warning px-2 py-1 rounded">Integrating ({business.integrationRoundsRemaining}y)</span>}
              align="right"
              width="w-56"
            >
              <p className="text-sm text-text-secondary font-normal">Recently acquired — organic growth is dampened during integration. {business.integrationRoundsRemaining} year{business.integrationRoundsRemaining !== 1 ? 's' : ''} remaining until fully integrated.</p>
            </Tooltip>
          )}
          {business.rolloverEquityPct > 0 && (
            <Tooltip
              trigger={<span className="text-xs bg-accent/20 text-accent px-1.5 py-0.5 rounded">{Math.round(business.rolloverEquityPct * 100)}% Rollover</span>}
              align="right"
              width="w-48 md:w-56"
            >
              <p className="text-sm text-text-secondary font-normal">Seller retains {Math.round(business.rolloverEquityPct * 100)}% equity. At exit, they receive that share of net proceeds.</p>
            </Tooltip>
          )}
          {activeTurnaround && activeTurnaround.status === 'active' && (() => {
            const prog = getProgramById(activeTurnaround.programId);
            if (!prog) return null;
            const roundsLeft = activeTurnaround.endRound - (currentRound || 1);
            const totalDuration = activeTurnaround.endRound - activeTurnaround.startRound;
            const progress = totalDuration > 0 ? Math.round(((totalDuration - roundsLeft) / totalDuration) * 100) : 100;
            return (
              <div className="w-full mt-1">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded p-1.5">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs text-amber-400 font-medium truncate">{prog.displayName}</span>
                    <span className="text-xs text-text-muted whitespace-nowrap hidden sm:inline">
                      Q{prog.sourceQuality}→Q{prog.targetQuality}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Turnaround progress: ${progress}%`}>
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-text-muted whitespace-nowrap">
                      {roundsLeft > 0 ? `${roundsLeft}yr` : 'Done'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Platform stats */}
      {isPlatform && boltOnCount > 0 && (
        <div className="bg-accent/10 border border-accent/30 rounded-lg p-2 mb-3 text-xs">
          <span className="text-accent">{boltOnCount} bolt-on{boltOnCount > 1 ? 's' : ''} integrated</span>
          {business.synergiesRealized > 0 && (
            <span className="text-text-muted ml-2">
              (+{formatMoney(business.synergiesRealized)} synergies)
            </span>
          )}
        </div>
      )}

      {/* Latest Story Beat */}
      {business.storyBeats && business.storyBeats.length > 0 && (
        <div className="bg-gradient-to-r from-accent/5 to-transparent border-l-2 border-accent/30 p-2 mb-3 text-xs">
          <p className="text-text-secondary italic leading-relaxed line-clamp-3">
            "{business.storyBeats[business.storyBeats.length - 1].narrative}"
          </p>
          <p className="text-text-muted mt-1">— Year {business.storyBeats[business.storyBeats.length - 1].round}</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2 md:gap-3 mb-3">
        <div>
          <p className="text-xs text-text-muted">Revenue</p>
          <p className="font-mono font-bold text-base sm:text-lg">{formatMoney(business.revenue)}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">EBITDA</p>
          <p className={`font-mono font-bold text-base sm:text-lg ${isDeclining ? 'text-danger' : ''}`}>
            {formatMoney(business.ebitda)}
          </p>
          <p className={`text-xs ${business.ebitdaMargin > business.acquisitionMargin ? 'text-accent' : business.ebitdaMargin < business.acquisitionMargin ? 'text-danger' : 'text-text-muted'}`}>
            {(business.ebitdaMargin * 100).toFixed(1)}% margin {business.ebitdaMargin > business.acquisitionMargin ? '▲' : business.ebitdaMargin < business.acquisitionMargin ? '▼' : ''}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Annual FCF</p>
          <p className="font-mono font-bold text-base sm:text-lg text-accent">
            {formatMoney(annualFcf)}
          </p>
        </div>
      </div>

      {showDetails && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 text-[11px] sm:text-xs mb-3">
            <div>
              <p className="text-text-muted">Invested</p>
              <p className="font-mono">{formatMoney(totalInvested)}</p>
            </div>
            <div>
              <p className="text-text-muted">MOIC</p>
              <p className={`font-mono ${moic >= 2 ? 'text-accent' : moic < 1 ? 'text-danger' : ''}`}>
                {moic.toFixed(1)}x
              </p>
            </div>
            <div>
              <p className="text-text-muted">Growth</p>
              <p className={`font-mono ${business.organicGrowthRate >= 0 ? 'text-accent' : 'text-danger'}`}>
                {formatPercent(business.organicGrowthRate)}
              </p>
            </div>
            <div>
              <p className="text-text-muted">Acquired @</p>
              <p className="font-mono">{business.acquisitionMultiple.toFixed(1)}x</p>
            </div>
          </div>

          {(business.sellerNoteBalance > 0 || business.bankDebtBalance > 0 || business.earnoutRemaining > 0) && (
            <div className="text-xs mb-3 p-2 bg-white/5 rounded border border-white/10">
              <p className="text-text-muted font-medium mb-1">Opco-Level Debt</p>
              {business.sellerNoteBalance > 0 && (
                <p className="text-text-secondary">
                  Seller Note: {formatMoney(business.sellerNoteBalance)}
                  <span className="text-text-muted"> ({debtCountdownLabel(business.sellerNoteRoundsRemaining)})</span>
                </p>
              )}
              {business.bankDebtBalance > 0 && (
                <p className="text-text-secondary">
                  Bank Debt: {formatMoney(business.bankDebtBalance)}
                  <span className="text-text-muted"> ({debtCountdownLabel(business.bankDebtRoundsRemaining)})</span>
                </p>
              )}
              {business.earnoutRemaining > 0 && (() => {
                const yearsLeft = EARNOUT_EXPIRATION_YEARS - (currentRound - business.acquisitionRound);
                return (
                  <p className="text-text-secondary">
                    Earn-out: {formatMoney(business.earnoutRemaining)}
                    <span className="text-text-muted"> ({earnoutTargetLabel(business.earnoutTarget)})</span>
                    {yearsLeft > 0 && (
                      <span className={`ml-1 ${yearsLeft <= 1 ? 'text-warning' : 'text-text-muted'}`}>
                        ({earnoutCountdownLabel(yearsLeft)})
                      </span>
                    )}
                  </p>
                );
              })()}
            </div>
          )}

          {/* Exit Valuation Summary */}
          <div className="text-xs mb-3 p-2 bg-white/5 rounded border border-white/10">
            <div className="flex items-center justify-between mb-1">
              <span className="text-text-muted">Est. Exit Value</span>
              <button
                onClick={() => setShowValuation(!showValuation)}
                className="text-accent hover:underline"
              >
                {showValuation ? 'Hide' : 'Details'}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-base sm:text-lg">{formatMoney(exitValuation.exitPrice)}</span>
              <span className={`font-mono ${gainLoss >= 0 ? 'text-accent' : 'text-danger'}`}>
                {gainLoss >= 0 ? '+' : ''}{formatMoney(gainLoss)} ({formatMultiple(moic)} MOIC)
              </span>
            </div>

            {showValuation && (
              <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
                <p className="text-text-muted font-medium mb-2">Multiple Build-Up:</p>
                <div className="flex justify-between">
                  <span>Acquisition Multiple</span>
                  <span className="font-mono">{formatMultiple(exitValuation.baseMultiple)}</span>
                </div>
                {exitValuation.growthPremium !== 0 && (
                  <div className="flex justify-between">
                    <span className={exitValuation.growthPremium >= 0 ? 'text-accent' : 'text-danger'}>
                      EBITDA Growth ({exitValuation.ebitdaGrowth >= 0 ? '+' : ''}{(exitValuation.ebitdaGrowth * 100).toFixed(0)}%)
                    </span>
                    <span className={`font-mono ${exitValuation.growthPremium >= 0 ? 'text-accent' : 'text-danger'}`}>
                      {exitValuation.growthPremium >= 0 ? '+' : ''}{exitValuation.growthPremium.toFixed(1)}x
                    </span>
                  </div>
                )}
                {exitValuation.qualityPremium !== 0 && (
                  <div className="flex justify-between">
                    <span className={exitValuation.qualityPremium >= 0 ? 'text-accent' : 'text-danger'}>
                      Quality Rating ({business.qualityRating}/5)
                    </span>
                    <span className={`font-mono ${exitValuation.qualityPremium >= 0 ? 'text-accent' : 'text-danger'}`}>
                      {exitValuation.qualityPremium >= 0 ? '+' : ''}{exitValuation.qualityPremium.toFixed(1)}x
                    </span>
                  </div>
                )}
                {exitValuation.sizeTierPremium > 0 && (
                  <div className="flex justify-between text-accent">
                    <span>
                      {exitValuation.buyerPoolTier === 'individual' ? 'Individual Buyers' :
                       exitValuation.buyerPoolTier === 'small_pe' ? 'Small PE Buyers' :
                       exitValuation.buyerPoolTier === 'lower_middle_pe' ? 'Lower-Mid PE Buyers' :
                       exitValuation.buyerPoolTier === 'institutional_pe' ? 'Institutional PE Buyers' :
                       'Large PE Buyers'}
                    </span>
                    <span className="font-mono">+{exitValuation.sizeTierPremium.toFixed(1)}x</span>
                  </div>
                )}
                {exitValuation.deRiskingPremium > 0 && (
                  <div className="flex justify-between text-accent">
                    <span>De-risking Factors</span>
                    <span className="font-mono">+{exitValuation.deRiskingPremium.toFixed(1)}x</span>
                  </div>
                )}
                {exitValuation.platformPremium > 0 && (
                  <div className="flex justify-between text-accent">
                    <span>Platform Scale ({platformScale})</span>
                    <span className="font-mono">+{exitValuation.platformPremium.toFixed(1)}x</span>
                  </div>
                )}
                {exitValuation.holdPremium > 0 && (
                  <div className="flex justify-between text-accent">
                    <span>Hold Period ({exitValuation.yearsHeld}y)</span>
                    <span className="font-mono">+{exitValuation.holdPremium.toFixed(1)}x</span>
                  </div>
                )}
                {exitValuation.improvementsPremium > 0 && (
                  <div className="flex justify-between text-accent">
                    <span>Improvements ({business.improvements.length})</span>
                    <span className="font-mono">+{exitValuation.improvementsPremium.toFixed(1)}x</span>
                  </div>
                )}
                {exitValuation.integratedPlatformPremium > 0 && (
                  <div className="flex justify-between">
                    <span className="text-purple-400">Integrated Platform</span>
                    <span className="font-mono text-purple-400">+{exitValuation.integratedPlatformPremium.toFixed(1)}x</span>
                  </div>
                )}
                {exitValuation.marketModifier !== 0 && (
                  <div className="flex justify-between">
                    <span className={exitValuation.marketModifier >= 0 ? 'text-accent' : 'text-danger'}>
                      Market Conditions
                    </span>
                    <span className={`font-mono ${exitValuation.marketModifier >= 0 ? 'text-accent' : 'text-danger'}`}>
                      {exitValuation.marketModifier >= 0 ? '+' : ''}{exitValuation.marketModifier.toFixed(1)}x
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-white/10 font-bold">
                  <span>Exit Multiple</span>
                  <span className="font-mono">{formatMultiple(exitValuation.totalMultiple)}</span>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>× Current EBITDA</span>
                  <span className="font-mono">{formatMoney(business.ebitda)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>= Exit Price</span>
                  <span className="font-mono">{formatMoney(exitValuation.exitPrice)}</span>
                </div>
                {(business.sellerNoteBalance > 0 || business.bankDebtBalance > 0 || business.earnoutRemaining > 0) && (
                  <>
                    <div className="flex justify-between text-danger">
                      <span>- Debt Payoff</span>
                      <span className="font-mono">-{formatMoney(business.sellerNoteBalance + business.bankDebtBalance + business.earnoutRemaining)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-accent">
                      <span>= Net Proceeds</span>
                      <span className="font-mono">{formatMoney(exitValuation.netProceeds)}</span>
                    </div>
                  </>
                )}
                {exitValuation.commentary && (
                  <p className="text-text-muted italic mt-2 pt-2 border-t border-white/10 leading-relaxed">
                    {exitValuation.commentary.buyerPoolDescription}
                  </p>
                )}
              </div>
            )}
          </div>

          {(onSell || onImprove || onDesignatePlatform || onStartTurnaround) && (
            <div className="flex flex-col gap-2 mt-3">
              <div className="flex flex-col sm:flex-row gap-2">
                {onStartTurnaround && turnaroundEligible && !activeTurnaround && (
                  <button onClick={onStartTurnaround} className="btn-secondary text-xs flex-1 min-h-[44px] border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                    Turnaround
                  </button>
                )}
                {onImprove && (
                  <button onClick={onImprove} className="btn-secondary text-xs flex-1">
                    Improve
                  </button>
                )}
                {onSell && (
                  exitValuation.yearsHeld < 2 ? (
                    <Tooltip
                      trigger={
                        <button
                          onClick={onSell}
                          className={`btn-secondary text-xs flex-1 ${moic >= 2 ? 'border-accent' : moic < 1 ? 'border-danger' : ''}`}
                        >
                          Sell for {formatMoney(exitValuation.netProceeds)}
                        </button>
                      }
                      width="w-64"
                    >
                      <p className="text-sm text-text-secondary font-normal">
                        {exitValuation.yearsHeld === 0
                          ? 'Just acquired — exit premiums don\'t apply yet. Buyers won\'t pay above the base acquisition multiple until you\'ve proven ownership.'
                          : 'Held for 1 year — exit premiums are at 50%. Buyers discount new ownership; full premiums apply after 2 years.'}
                      </p>
                      <p className="text-xs text-text-muted mt-2 font-normal">
                        Seasoning: {Math.round(Math.min(1, exitValuation.yearsHeld / 2) * 100)}% of premiums applied.
                        {exitValuation.yearsHeld === 0 ? ' Hold for 2 years for full value.' : ' Full value next year.'}
                      </p>
                    </Tooltip>
                  ) : (
                    <button
                      onClick={onSell}
                      className={`btn-secondary text-xs flex-1 ${moic >= 2 ? 'border-accent' : moic < 1 ? 'border-danger' : ''}`}
                    >
                      Sell for {formatMoney(exitValuation.netProceeds)}
                    </button>
                  )
                )}

              </div>
              {onDesignatePlatform && !isPlatform && (
                <div>
                  <div className="flex gap-2">
                    <button
                      onClick={onDesignatePlatform}
                      disabled={!canAffordPlatform}
                      className="btn-primary text-xs flex-1"
                    >
                      {canAffordPlatform
                        ? `Designate as Platform (${formatMoney(Math.round(business.ebitda * 0.05))})`
                        : 'Need more cash for platform setup'}
                    </button>
                    {onShowRollUpGuide && (
                      <button
                        onClick={onShowRollUpGuide}
                        className="btn-secondary text-xs px-2"
                        title="What is a platform?"
                      >
                        ?
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-text-muted mt-1">
                    Only needed for tuck-in acquisitions. Merging two businesses creates a platform automatically.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
