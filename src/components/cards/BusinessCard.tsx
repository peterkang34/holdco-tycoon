import { useState } from 'react';
import { Business, ExitValuation, formatMoney, formatPercent, formatMultiple } from '../../engine/types';
import { SECTORS } from '../../data/sectors';
import { calculateExitValuation } from '../../engine/simulation';

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
}: BusinessCardProps) {
  const [showValuation, setShowValuation] = useState(false);
  const sector = SECTORS[business.sectorId];
  const annualFcf = Math.round(business.ebitda * (1 - sector.capexRate) * 0.7);

  // Calculate proper exit valuation
  const exitValuation = calculateExitValuation(business, currentRound, lastEventType);
  const gainLoss = exitValuation.netProceeds - business.acquisitionPrice;
  const moic = exitValuation.netProceeds / business.acquisitionPrice;

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
        <div className="flex items-center gap-2">
          <span className="text-2xl">{sector.emoji}</span>
          <div>
            <h3 className="font-bold">{business.name}</h3>
            <p className="text-xs text-text-muted">{business.subType}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isPlatform && (
            <span className="text-xs bg-accent/20 text-accent px-2 py-1 rounded">
              Platform {platformScale}/3
            </span>
          )}
          {business.integrationRoundsRemaining > 0 && (
            <span className="text-xs bg-warning/20 text-warning px-2 py-1 rounded">
              Integrating ({business.integrationRoundsRemaining}y)
            </span>
          )}
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
          <p className="text-text-secondary italic leading-relaxed">
            "{business.storyBeats[business.storyBeats.length - 1].narrative}"
          </p>
          <p className="text-text-muted mt-1">— Year {business.storyBeats[business.storyBeats.length - 1].round}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <p className="text-xs text-text-muted">Annual EBITDA</p>
          <p className={`font-mono font-bold text-lg ${isDeclining ? 'text-danger' : ''}`}>
            {formatMoney(business.ebitda)}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Annual FCF</p>
          <p className="font-mono font-bold text-lg text-accent">
            {formatMoney(annualFcf)}
          </p>
        </div>
      </div>

      {showDetails && (
        <>
          <div className="grid grid-cols-3 gap-2 text-xs mb-3">
            <div>
              <p className="text-text-muted">Acquired @</p>
              <p className="font-mono">{business.acquisitionMultiple.toFixed(1)}x</p>
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
          </div>

          {(business.sellerNoteBalance > 0 || business.bankDebtBalance > 0) && (
            <div className="text-xs mb-3 p-2 bg-white/5 rounded border border-white/10">
              <p className="text-text-muted font-medium mb-1">Opco-Level Debt</p>
              {business.sellerNoteBalance > 0 && (
                <p className="text-text-secondary">
                  Seller Note: {formatMoney(business.sellerNoteBalance)}
                  <span className="text-text-muted"> ({business.sellerNoteRoundsRemaining}y auto-pay)</span>
                </p>
              )}
              {business.bankDebtBalance > 0 && (
                <p className="text-text-secondary">
                  Bank Debt: {formatMoney(business.bankDebtBalance)}
                  <span className="text-text-muted"> (paid on exit)</span>
                </p>
              )}
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
              <span className="font-mono font-bold text-lg">{formatMoney(exitValuation.exitPrice)}</span>
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
                {exitValuation.platformPremium > 0 && (
                  <div className="flex justify-between text-accent">
                    <span>Platform Scale ({platformScale}/3)</span>
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
                {(business.sellerNoteBalance > 0 || business.bankDebtBalance > 0) && (
                  <>
                    <div className="flex justify-between text-danger">
                      <span>- Debt Payoff</span>
                      <span className="font-mono">-{formatMoney(business.sellerNoteBalance + business.bankDebtBalance)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-accent">
                      <span>= Net Proceeds</span>
                      <span className="font-mono">{formatMoney(exitValuation.netProceeds)}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {(onSell || onImprove || onDesignatePlatform) && (
            <div className="flex flex-col gap-2 mt-3">
              <div className="flex gap-2">
                {onImprove && (
                  <button onClick={onImprove} className="btn-secondary text-xs flex-1">
                    Improve
                  </button>
                )}
                {onSell && (
                  <button
                    onClick={onSell}
                    className={`btn-secondary text-xs flex-1 ${moic >= 2 ? 'border-accent' : moic < 1 ? 'border-danger' : ''}`}
                  >
                    Sell for {formatMoney(exitValuation.netProceeds)}
                  </button>
                )}
              </div>
              {onDesignatePlatform && !isPlatform && (
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
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
