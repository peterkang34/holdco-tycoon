import { useState } from 'react';
import {
  Business,
  Deal,
  DealStructure,
  SharedService,
  SharedServiceType,
  OperationalImprovementType,
  MAFocus,
  SectorId,
  DealSizePreference,
  formatMoney,
  formatPercent,
} from '../../engine/types';
import { SECTOR_LIST } from '../../data/sectors';
import { BusinessCard } from '../cards/BusinessCard';
import { DealCard } from '../cards/DealCard';
import { generateDealStructures, getStructureLabel, getStructureDescription } from '../../engine/deals';
import { SECTORS } from '../../data/sectors';
import { MIN_OPCOS_FOR_SHARED_SERVICES, MAX_ACTIVE_SHARED_SERVICES } from '../../data/sharedServices';
import { MarketGuideModal } from '../ui/MarketGuideModal';
import { RollUpGuideModal } from '../ui/RollUpGuideModal';
import { isAIEnabled } from '../../services/aiGeneration';

const STARTING_SHARES = 1000;

const DEAL_SOURCING_COST = 500; // $500k

interface AllocatePhaseProps {
  businesses: Business[];
  cash: number;
  totalDebt: number;
  interestRate: number;
  creditTightening: boolean;
  dealPipeline: Deal[];
  sharedServices: SharedService[];
  round: number;
  equityRaisesUsed: number;
  sharesOutstanding: number;
  founderShares: number;
  totalBuybacks: number;
  totalDistributions: number;
  intrinsicValuePerShare: number;
  lastEventType?: string;
  onAcquire: (deal: Deal, structure: DealStructure) => void;
  onAcquireTuckIn: (deal: Deal, structure: DealStructure, platformId: string) => void;
  onMergeBusinesses: (businessId1: string, businessId2: string, newName: string) => void;
  onDesignatePlatform: (businessId: string) => void;
  onUnlockSharedService: (serviceType: SharedServiceType) => void;
  onDeactivateSharedService: (serviceType: SharedServiceType) => void;
  onPayDebt: (amount: number) => void;
  onIssueEquity: (amount: number) => void;
  onBuyback: (amount: number) => void;
  onDistribute: (amount: number) => void;
  onSell: (businessId: string) => void;
  onWindDown: (businessId: string) => void;
  onImprove: (businessId: string, improvementType: OperationalImprovementType) => void;
  onEndRound: () => void;
  onSourceDeals: () => void;
  maFocus: MAFocus;
  onSetMAFocus: (sectorId: SectorId | null, sizePreference: DealSizePreference) => void;
}

type AllocateTab = 'portfolio' | 'deals' | 'shared_services' | 'capital';

export function AllocatePhase({
  businesses,
  cash,
  totalDebt,
  interestRate,
  creditTightening,
  dealPipeline,
  sharedServices,
  round,
  equityRaisesUsed,
  sharesOutstanding,
  founderShares,
  totalBuybacks,
  totalDistributions,
  intrinsicValuePerShare,
  lastEventType,
  onAcquire,
  onAcquireTuckIn,
  onMergeBusinesses,
  onDesignatePlatform,
  onUnlockSharedService,
  onDeactivateSharedService,
  onPayDebt,
  onIssueEquity,
  onBuyback,
  onDistribute,
  onSell,
  onWindDown,
  onImprove,
  onEndRound,
  onSourceDeals,
  maFocus,
  onSetMAFocus,
}: AllocatePhaseProps) {
  const [activeTab, setActiveTab] = useState<AllocateTab>('portfolio');
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [selectedBusinessForImprovement, setSelectedBusinessForImprovement] = useState<Business | null>(null);
  const [payDebtAmount, setPayDebtAmount] = useState('');
  const [equityAmount, setEquityAmount] = useState('');
  const [buybackAmount, setBuybackAmount] = useState('');
  const [distributeAmount, setDistributeAmount] = useState('');
  const [showEndTurnConfirm, setShowEndTurnConfirm] = useState(false);
  // Deal pass state
  const [passedDealIds, setPassedDealIds] = useState<Set<string>>(new Set());
  const [showPassedDeals, setShowPassedDeals] = useState(false);
  // Tuck-in and merge state
  const [selectedTuckInPlatform, setSelectedTuckInPlatform] = useState<string | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<{ first: Business | null; second: Business | null }>({
    first: null,
    second: null,
  });
  const [mergeName, setMergeName] = useState('');
  const [showMarketGuide, setShowMarketGuide] = useState(false);
  const [showRollUpGuide, setShowRollUpGuide] = useState(false);

  const activeBusinesses = businesses.filter(b => b.status === 'active');
  const aiEnabled = isAIEnabled();
  const activeServicesCount = sharedServices.filter(s => s.active).length;
  const canUnlockSharedService =
    activeBusinesses.length >= MIN_OPCOS_FOR_SHARED_SERVICES &&
    activeServicesCount < MAX_ACTIVE_SHARED_SERVICES;

  // Platform and tuck-in helpers
  const platforms = activeBusinesses.filter(b => b.isPlatform);
  const getPlatformsForSector = (sectorId: string) =>
    platforms.filter(p => p.sectorId === sectorId);

  // Merge eligibility: need 2+ businesses in same sector
  const getMergeableSectors = () => {
    const sectorCounts: Record<string, Business[]> = {};
    activeBusinesses.forEach(b => {
      if (!b.parentPlatformId) { // Only standalone or platform businesses, not bolt-ons
        if (!sectorCounts[b.sectorId]) sectorCounts[b.sectorId] = [];
        sectorCounts[b.sectorId].push(b);
      }
    });
    return Object.entries(sectorCounts).filter(([_, businesses]) => businesses.length >= 2);
  };
  const mergeableSectors = getMergeableSectors();

  const tabs: { id: AllocateTab; label: string; badge?: number }[] = [
    { id: 'portfolio', label: 'Portfolio', badge: activeBusinesses.length },
    { id: 'deals', label: 'Deals', badge: dealPipeline.length },
    { id: 'shared_services', label: 'Shared Services' },
    { id: 'capital', label: 'Capital' },
  ];

  const renderDealStructuring = () => {
    if (!selectedDeal) return null;

    const structures = generateDealStructures(selectedDeal, cash, interestRate, creditTightening);
    const availablePlatformsForDeal = getPlatformsForSector(selectedDeal.business.sectorId);
    const canTuckIn = selectedDeal.acquisitionType === 'tuck_in' && availablePlatformsForDeal.length > 0;

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
        <div className="bg-bg-primary border border-white/10 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold">{selectedDeal.business.name}</h3>
              <p className="text-text-muted">
                {SECTORS[selectedDeal.business.sectorId].emoji} {selectedDeal.business.subType}
              </p>
              <span className={`text-xs px-2 py-1 rounded mt-2 inline-block ${
                selectedDeal.acquisitionType === 'tuck_in' ? 'bg-accent-secondary/20 text-accent-secondary' :
                selectedDeal.acquisitionType === 'platform' ? 'bg-accent/20 text-accent' :
                'bg-white/10 text-text-muted'
              }`}>
                {selectedDeal.acquisitionType === 'tuck_in' ? 'Tuck-In Opportunity' :
                 selectedDeal.acquisitionType === 'platform' ? 'Platform Opportunity' : 'Standalone'}
              </span>
            </div>
            <button
              onClick={() => {
                setSelectedDeal(null);
                setSelectedTuckInPlatform(null);
              }}
              className="text-text-muted hover:text-text-primary text-2xl"
            >
              ×
            </button>
          </div>

          {/* Tuck-in Platform Selection */}
          {canTuckIn && (
            <div className="bg-accent-secondary/10 border border-accent-secondary/30 rounded-lg p-4 mb-6">
              <h4 className="font-bold text-accent-secondary mb-2">Tuck-In Acquisition</h4>
              <p className="text-sm text-text-secondary mb-3">
                This business can be tucked into an existing platform for synergies and multiple expansion.
              </p>
              <label className="block text-sm text-text-muted mb-2">Select Platform:</label>
              <select
                value={selectedTuckInPlatform || ''}
                onChange={(e) => setSelectedTuckInPlatform(e.target.value || null)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              >
                <option value="">Acquire as Standalone</option>
                {availablePlatformsForDeal.map(platform => (
                  <option key={platform.id} value={platform.id}>
                    {platform.name} (Scale {platform.platformScale}/3, EBITDA: {formatMoney(platform.ebitda)})
                  </option>
                ))}
              </select>
              {selectedTuckInPlatform && (
                <p className="text-xs text-accent mt-2">
                  Synergies and multiple expansion will be calculated upon acquisition.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="card text-center">
              <p className="text-text-muted text-sm">EBITDA</p>
              <p className="text-2xl font-bold font-mono">{formatMoney(selectedDeal.business.ebitda)}</p>
            </div>
            <div className="card text-center">
              <p className="text-text-muted text-sm">Asking Price</p>
              <p className="text-2xl font-bold font-mono">{formatMoney(selectedDeal.askingPrice)}</p>
            </div>
            <div className="card text-center">
              <p className="text-text-muted text-sm">Multiple</p>
              <p className="text-2xl font-bold font-mono">{selectedDeal.business.acquisitionMultiple.toFixed(1)}x</p>
            </div>
          </div>

          <h4 className="font-bold mb-4">Choose Deal Structure</h4>

          {structures.length === 0 ? (
            <div className="card text-center text-text-muted py-8">
              <p>You don't have enough cash to structure this deal.</p>
              <p className="text-sm mt-2">Need at least {formatMoney(selectedDeal.askingPrice * 0.15)} for minimum down payment.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {structures.map((structure, index) => (
                <div
                  key={index}
                  className={`card cursor-pointer transition-all hover:border-accent ${
                    structure.risk === 'low' ? 'border-green-500/30' :
                    structure.risk === 'medium' ? 'border-yellow-500/30' :
                    'border-red-500/30'
                  }`}
                  onClick={() => {
                    if (selectedTuckInPlatform) {
                      onAcquireTuckIn(selectedDeal, structure, selectedTuckInPlatform);
                    } else {
                      onAcquire(selectedDeal, structure);
                    }
                    setSelectedDeal(null);
                    setSelectedTuckInPlatform(null);
                  }}
                >
                  <h5 className="font-bold mb-2">{getStructureLabel(structure.type)}</h5>
                  <p className="text-sm text-text-secondary mb-4">{getStructureDescription(structure)}</p>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Cash Required</span>
                      <span className="font-mono">{formatMoney(structure.cashRequired)}</span>
                    </div>
                    {structure.sellerNote && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Seller Note</span>
                        <span className="font-mono">{formatMoney(structure.sellerNote.amount)} @ {formatPercent(structure.sellerNote.rate)}</span>
                      </div>
                    )}
                    {structure.bankDebt && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Bank Debt</span>
                        <span className="font-mono">{formatMoney(structure.bankDebt.amount)} @ {formatPercent(structure.bankDebt.rate)}</span>
                      </div>
                    )}
                    {structure.earnout && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Earnout</span>
                        <span className="font-mono">{formatMoney(structure.earnout.amount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-white/10">
                      <span className="text-text-muted">Leverage</span>
                      <span className="font-mono">{structure.leverage.toFixed(1)}x</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Risk</span>
                      <span className={`font-medium ${
                        structure.risk === 'low' ? 'text-green-400' :
                        structure.risk === 'medium' ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {structure.risk.charAt(0).toUpperCase() + structure.risk.slice(1)}
                      </span>
                    </div>
                  </div>

                  <button className="btn-primary w-full mt-4 text-sm">
                    Acquire
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 p-4 bg-white/5 rounded-lg text-sm text-text-muted">
            <p className="font-medium text-text-secondary mb-1">Deal Structuring Tip</p>
            <p>The best holdcos push debt as close to the asset as possible, avoiding parent guarantees unless necessary. Seller notes align incentives; bank debt amplifies returns but amplifies risk too.</p>
          </div>
        </div>
      </div>
    );
  };

  const renderImprovementModal = () => {
    if (!selectedBusinessForImprovement) return null;

    const business = selectedBusinessForImprovement;
    const sector = SECTORS[business.sectorId];
    const appliedTypes = new Set(business.improvements.map(i => i.type));
    const remainingYears = 20 - round;

    const improvements: {
      type: OperationalImprovementType;
      name: string;
      description: string;
      costPercent: number;
      ebitdaBoostMin: number;
      ebitdaBoostMax: number;
      growthBoost: number;
      extraBenefit?: string;
      available: boolean;
      unavailableReason?: string;
    }[] = [
      {
        type: 'operating_playbook',
        name: 'Install Operating Playbook',
        description: 'Implement standardized processes and KPIs from your holdco playbook.',
        costPercent: 0.15,
        ebitdaBoostMin: 0.08,
        ebitdaBoostMax: 0.08,
        growthBoost: 0,
        extraBenefit: 'Reduced earnings volatility',
        available: !appliedTypes.has('operating_playbook'),
        unavailableReason: 'Already applied',
      },
      {
        type: 'pricing_model',
        name: 'Upgrade Pricing Model',
        description: 'Optimize pricing strategy to capture more value from customers.',
        costPercent: 0.10,
        ebitdaBoostMin: 0.05,
        ebitdaBoostMax: 0.12,
        growthBoost: 0.01,
        available: !appliedTypes.has('pricing_model'),
        unavailableReason: 'Already applied',
      },
      {
        type: 'service_expansion',
        name: 'Expand Service Line',
        description: 'Add complementary services to grow wallet share with existing customers.',
        costPercent: 0.20,
        ebitdaBoostMin: 0.10,
        ebitdaBoostMax: 0.18,
        growthBoost: 0,
        available: !appliedTypes.has('service_expansion'),
        unavailableReason: 'Already applied',
      },
      {
        type: 'fix_underperformance',
        name: 'Fix Underperformance',
        description: 'Address operational issues dragging down performance.',
        costPercent: 0.12,
        ebitdaBoostMin: Math.max(0, (business.peakEbitda * 0.8 - business.ebitda) / business.ebitda),
        ebitdaBoostMax: Math.max(0, (business.peakEbitda * 0.8 - business.ebitda) / business.ebitda),
        growthBoost: 0,
        available: !appliedTypes.has('fix_underperformance') && business.ebitda < business.peakEbitda * 0.8,
        unavailableReason: appliedTypes.has('fix_underperformance') ? 'Already applied' : 'Business is performing well',
      },
    ];

    // Calculate current exit multiple premium from improvements
    const currentImprovementMultiple = business.improvements.length * 0.15;
    const hasDeRiskingBonus = business.improvements.length >= 2;

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
        <div className="bg-bg-primary border border-white/10 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{sector.emoji}</span>
              <div>
                <h3 className="text-xl font-bold">{business.name}</h3>
                <p className="text-text-muted">{business.subType}</p>
              </div>
            </div>
            <button
              onClick={() => setSelectedBusinessForImprovement(null)}
              className="text-text-muted hover:text-text-primary text-2xl"
            >
              ×
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="card text-center">
              <p className="text-text-muted text-sm">Current EBITDA</p>
              <p className="text-2xl font-bold font-mono">{formatMoney(business.ebitda)}</p>
            </div>
            <div className="card text-center">
              <p className="text-text-muted text-sm">Improvements Applied</p>
              <p className="text-2xl font-bold font-mono">{business.improvements.length}/4</p>
            </div>
            <div className="card text-center">
              <p className="text-text-muted text-sm">Exit Multiple Bonus</p>
              <p className="text-2xl font-bold font-mono text-accent">
                +{(currentImprovementMultiple + (hasDeRiskingBonus ? 0.2 : 0)).toFixed(1)}x
              </p>
            </div>
          </div>

          {/* How Improvements Work */}
          <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 mb-6">
            <p className="font-bold text-sm mb-2">How Improvements Work</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-text-secondary">
              <div>
                <p className="text-text-primary font-medium mb-1">Immediate EBITDA Boost</p>
                <p>One-time cost produces an instant, permanent EBITDA increase that compounds with organic growth.</p>
              </div>
              <div>
                <p className="text-text-primary font-medium mb-1">Exit Multiple Impact</p>
                <p>Each improvement adds +0.15x to your exit multiple. At 2+ improvements, an additional +0.2x de-risking premium kicks in.</p>
              </div>
              <div>
                <p className="text-text-primary font-medium mb-1">One Per Business</p>
                <p>Each improvement type can only be applied once. All effects are permanent — they never expire.</p>
              </div>
            </div>
          </div>

          {/* Applied improvements */}
          {business.improvements.length > 0 && (
            <div className="mb-6">
              <p className="text-xs text-text-muted font-medium mb-2 uppercase tracking-wide">Applied Improvements</p>
              <div className="flex flex-wrap gap-2">
                {business.improvements.map((imp, idx) => (
                  <span key={idx} className="text-xs bg-accent/15 text-accent px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                    <span>&#10003;</span>
                    {imp.type === 'operating_playbook' ? 'Operating Playbook' :
                     imp.type === 'pricing_model' ? 'Pricing Model' :
                     imp.type === 'service_expansion' ? 'Service Expansion' :
                     'Fix Underperformance'}
                    <span className="text-accent/60 ml-1">(Year {imp.appliedRound}, +{(imp.effect * 100).toFixed(0)}%)</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <h4 className="font-bold mb-4">Choose Improvement</h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {improvements.map((improvement) => {
              const cost = Math.round(business.ebitda * improvement.costPercent);
              const canAfford = cash >= cost;
              const disabled = !improvement.available || !canAfford;

              // ROI calculations
              const avgBoost = (improvement.ebitdaBoostMin + improvement.ebitdaBoostMax) / 2;
              const ebitdaGainPerYear = Math.round(business.ebitda * avgBoost);
              const boostIsRange = improvement.ebitdaBoostMin !== improvement.ebitdaBoostMax;
              const paybackYears = ebitdaGainPerYear > 0 ? cost / ebitdaGainPerYear : Infinity;

              // Exit value impact: +0.15x on current EBITDA, plus potential de-risking bonus
              const nextImprovementCount = business.improvements.length + 1;
              const exitMultipleGain = 0.15 + (nextImprovementCount === 2 ? 0.2 : 0);
              const exitValueGain = Math.round(business.ebitda * exitMultipleGain);

              // Total value = remaining years of EBITDA gain + exit value gain
              const totalLifetimeValue = ebitdaGainPerYear * remainingYears + exitValueGain;
              const roiMultiple = cost > 0 ? totalLifetimeValue / cost : 0;

              return (
                <div
                  key={improvement.type}
                  className={`card ${disabled ? 'opacity-50' : 'cursor-pointer hover:border-accent'}`}
                  onClick={() => {
                    if (!disabled) {
                      onImprove(business.id, improvement.type);
                      setSelectedBusinessForImprovement(null);
                    }
                  }}
                >
                  <h5 className="font-bold mb-2">{improvement.name}</h5>
                  <p className="text-sm text-text-secondary mb-3">{improvement.description}</p>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Cost</span>
                      <span className={`font-mono ${!canAfford ? 'text-danger' : ''}`}>
                        {formatMoney(cost)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">EBITDA Boost</span>
                      <span className="font-mono text-accent">
                        {boostIsRange
                          ? `+${formatMoney(Math.round(business.ebitda * improvement.ebitdaBoostMin))} to ${formatMoney(Math.round(business.ebitda * improvement.ebitdaBoostMax))}`
                          : `+${formatMoney(ebitdaGainPerYear)}`
                        }/yr
                      </span>
                    </div>
                    {improvement.growthBoost > 0 && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Growth Rate</span>
                        <span className="font-mono text-accent">+{(improvement.growthBoost * 100).toFixed(0)}%/yr (permanent)</span>
                      </div>
                    )}
                    {improvement.extraBenefit && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Bonus</span>
                        <span className="text-text-secondary">{improvement.extraBenefit}</span>
                      </div>
                    )}
                    <div className="border-t border-white/10 pt-2 mt-2 space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-text-muted">Exit Multiple</span>
                        <span className="font-mono text-accent">
                          +{exitMultipleGain.toFixed(2)}x
                          {nextImprovementCount === 2 && ' (incl. de-risk bonus)'}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-text-muted">Payback</span>
                        <span className="font-mono">
                          {paybackYears <= 1 ? '< 1 year' : paybackYears < 10 ? `~${paybackYears.toFixed(1)} years` : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-text-muted">Est. ROI ({remainingYears}yr)</span>
                        <span className={`font-mono font-bold ${roiMultiple >= 2 ? 'text-accent' : roiMultiple >= 1 ? 'text-text-primary' : 'text-warning'}`}>
                          {roiMultiple.toFixed(1)}x
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    className={`w-full mt-4 text-sm ${disabled ? 'btn-secondary opacity-50 cursor-not-allowed' : 'btn-primary'}`}
                    disabled={disabled}
                  >
                    {!improvement.available
                      ? improvement.unavailableReason || 'Not Available'
                      : !canAfford
                      ? 'Not Enough Cash'
                      : 'Apply Improvement'}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-6 p-4 bg-white/5 rounded-lg text-sm text-text-muted">
            <p className="font-medium text-text-secondary mb-1">Operational Improvement Tip</p>
            <p>Improvements are the highest-ROI capital allocation move: the EBITDA boost compounds every year through organic growth, and each improvement increases your exit multiple. Danaher's DBS proves this — operational improvement is reinvestment that never depreciates.</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Capital Allocation</h2>
          <p className="text-text-muted">Deploy your cash across portfolio companies, new acquisitions, or return it to owners</p>
        </div>
        <div className="text-right">
          <p className="text-text-muted text-sm">Available Cash</p>
          <p className="text-3xl font-bold font-mono text-accent">{formatMoney(cash)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-white/10 pb-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-accent text-bg-primary font-medium'
                : 'text-text-muted hover:text-text-primary hover:bg-white/5'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="ml-2 text-xs bg-white/20 px-1.5 py-0.5 rounded-full">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mb-6">
        {activeTab === 'portfolio' && (
          <div>
            {/* Roll-up Strategy Actions */}
            {activeBusinesses.length >= 2 && (
              <div className="card bg-accent/5 border-accent/30 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold flex items-center gap-2">
                      Roll-Up Strategy
                      <button
                        onClick={() => setShowRollUpGuide(true)}
                        className="text-text-muted hover:text-accent text-sm font-normal"
                        title="Learn about roll-up strategy"
                      >
                        (?)
                      </button>
                    </h3>
                    <p className="text-sm text-text-muted">
                      {platforms.length > 0
                        ? `${platforms.length} platform${platforms.length > 1 ? 's' : ''} active. Acquire tuck-ins to grow scale.`
                        : 'Designate a platform or merge businesses to unlock roll-up strategy.'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {mergeableSectors.length > 0 && (
                      <button
                        onClick={() => setShowMergeModal(true)}
                        className="btn-secondary text-sm"
                      >
                        Merge Businesses
                      </button>
                    )}
                  </div>
                </div>
                {platforms.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <p className="text-xs text-text-muted mb-2">Active Platforms:</p>
                    <div className="flex flex-wrap gap-2">
                      {platforms.map(p => (
                        <span key={p.id} className="text-xs bg-accent/20 text-accent px-2 py-1 rounded">
                          {SECTORS[p.sectorId].emoji} {p.name} (Scale {p.platformScale}/3, {p.boltOnIds.length} bolt-ons)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeBusinesses.filter(b => !b.parentPlatformId).map(business => (
                <BusinessCard
                  key={business.id}
                  business={business}
                  onSell={() => onSell(business.id)}
                  onImprove={() => setSelectedBusinessForImprovement(business)}
                  onDesignatePlatform={!business.isPlatform ? () => onDesignatePlatform(business.id) : undefined}
                  onShowRollUpGuide={() => setShowRollUpGuide(true)}
                  isPlatform={business.isPlatform}
                  platformScale={business.platformScale}
                  boltOnCount={business.boltOnIds?.length || 0}
                  canAffordPlatform={cash >= business.ebitda * 0.05}
                  currentRound={round}
                  lastEventType={lastEventType}
                />
              ))}
              {activeBusinesses.length === 0 && (
                <div className="col-span-full card text-center text-text-muted py-12">
                  <p>No businesses in your portfolio yet.</p>
                  <p className="text-sm mt-2">Check the Deals tab to acquire your first company.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'deals' && (
          <div>
            {/* M&A Focus Settings */}
            <div className="card mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold">M&A Focus</h3>
                  <p className="text-sm text-text-muted">Set your acquisition preferences to see more relevant deals</p>
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => setShowMarketGuide(true)}
                    className="btn-secondary text-sm flex items-center gap-2"
                  >
                    <span>📊</span> Market Guide
                  </button>
                  {aiEnabled && (
                    <span className="text-xs text-accent flex items-center gap-1 px-2 py-1 bg-accent/10 rounded">
                      <span>🤖</span> AI Enhanced
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-muted mb-2">Target Sector</label>
                  <select
                    value={maFocus.sectorId || ''}
                    onChange={(e) => onSetMAFocus(
                      e.target.value ? e.target.value as SectorId : null,
                      maFocus.sizePreference
                    )}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="">Any Sector</option>
                    {SECTOR_LIST.map(sector => (
                      <option key={sector.id} value={sector.id}>
                        {sector.emoji} {sector.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-2">Target Size</label>
                  <select
                    value={maFocus.sizePreference}
                    onChange={(e) => onSetMAFocus(
                      maFocus.sectorId,
                      e.target.value as DealSizePreference
                    )}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="any">Any Size</option>
                    <option value="small">Small ($500k-$1.5M EBITDA)</option>
                    <option value="medium">Medium ($1.5M-$3M EBITDA)</option>
                    <option value="large">Large ($3M+ EBITDA)</option>
                  </select>
                </div>
              </div>
              {maFocus.sectorId && (
                <p className="text-xs text-accent mt-3">
                  Your M&A focus will generate more {SECTORS[maFocus.sectorId].name} deals next year.
                </p>
              )}

              {/* Source Additional Deals */}
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Need more deal flow?</p>
                    <p className="text-xs text-text-muted">
                      Hire an investment banker to source 3 additional deals
                      {maFocus.sectorId && ` (weighted toward ${SECTORS[maFocus.sectorId].name})`}
                    </p>
                  </div>
                  <button
                    onClick={onSourceDeals}
                    disabled={cash < DEAL_SOURCING_COST}
                    className={`btn-secondary text-sm whitespace-nowrap ${
                      cash >= DEAL_SOURCING_COST ? 'border-accent' : ''
                    }`}
                  >
                    Source Deals ({formatMoney(DEAL_SOURCING_COST)})
                  </button>
                </div>
              </div>
            </div>

            {/* Passed deals toggle */}
            {passedDealIds.size > 0 && (
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setShowPassedDeals(!showPassedDeals)}
                  className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showPassedDeals ? 'Hide' : 'Show'} {passedDealIds.size} passed deal{passedDealIds.size !== 1 ? 's' : ''}
                </button>
              </div>
            )}

            {/* Deals Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dealPipeline
                .filter(deal => showPassedDeals || !passedDealIds.has(deal.id))
                .map(deal => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  onSelect={() => setSelectedDeal(deal)}
                  disabled={cash < deal.askingPrice * 0.15}
                  availablePlatforms={getPlatformsForSector(deal.business.sectorId)}
                  isPassed={passedDealIds.has(deal.id)}
                  onPass={() => {
                    setPassedDealIds(prev => {
                      const next = new Set(prev);
                      if (next.has(deal.id)) {
                        next.delete(deal.id);
                      } else {
                        next.add(deal.id);
                      }
                      return next;
                    });
                  }}
                />
              ))}
              {dealPipeline.length === 0 && (
                <div className="col-span-full card text-center text-text-muted py-12">
                  <p>No deals available this year.</p>
                  <p className="text-sm mt-2">New opportunities will appear next year.</p>
                </div>
              )}
              {dealPipeline.length > 0 && dealPipeline.every(d => passedDealIds.has(d.id)) && !showPassedDeals && (
                <div className="col-span-full card text-center text-text-muted py-12">
                  <p>All deals passed on.</p>
                  <p className="text-sm mt-2">
                    <button
                      onClick={() => setShowPassedDeals(true)}
                      className="text-accent hover:underline"
                    >
                      Show passed deals
                    </button>
                    {' '}or source new ones above.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'shared_services' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sharedServices.map(service => (
              <div
                key={service.type}
                className={`card ${service.active ? 'border-accent' : ''}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-bold">{service.name}</h4>
                  {service.active && (
                    <span className="text-xs bg-accent/20 text-accent px-2 py-1 rounded">Active</span>
                  )}
                </div>
                <p className="text-sm text-text-secondary mb-3">{service.description}</p>
                <p className="text-sm text-accent mb-4">{service.effect}</p>

                <div className="flex justify-between text-sm text-text-muted mb-4">
                  <span>Unlock: {formatMoney(service.unlockCost)}</span>
                  <span>Annual: {formatMoney(service.annualCost)}</span>
                </div>

                {service.active ? (
                  <button
                    onClick={() => onDeactivateSharedService(service.type)}
                    className="btn-secondary w-full text-sm"
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    onClick={() => onUnlockSharedService(service.type)}
                    disabled={!canUnlockSharedService || cash < service.unlockCost}
                    className="btn-primary w-full text-sm"
                  >
                    {!canUnlockSharedService
                      ? activeServicesCount >= MAX_ACTIVE_SHARED_SERVICES
                        ? 'Max 3 Active'
                        : `Need ${MIN_OPCOS_FOR_SHARED_SERVICES}+ Opcos`
                      : cash < service.unlockCost
                      ? 'Not Enough Cash'
                      : 'Unlock'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'capital' && (
          <div className="space-y-6">
            {/* Debt Summary */}
            {(() => {
              const opcoSellerNotes = businesses.reduce((sum, b) => sum + b.sellerNoteBalance, 0);
              const opcoBankDebt = businesses.reduce((sum, b) => sum + b.bankDebtBalance, 0);
              const totalAllDebt = totalDebt + opcoSellerNotes + opcoBankDebt;
              return (
                <div className="card bg-white/5">
                  <h4 className="font-bold mb-3">Debt Summary</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-text-muted">Holdco Debt</p>
                      <p className="font-mono font-bold text-lg">{formatMoney(totalDebt)}</p>
                      <p className="text-xs text-text-muted">Manual paydown</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Opco Seller Notes</p>
                      <p className="font-mono font-bold text-lg">{formatMoney(opcoSellerNotes)}</p>
                      <p className="text-xs text-text-muted">Auto-amortizing</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Opco Bank Debt</p>
                      <p className="font-mono font-bold text-lg">{formatMoney(opcoBankDebt)}</p>
                      <p className="text-xs text-text-muted">Paid on sale/wind-down</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Total Debt</p>
                      <p className="font-mono font-bold text-lg text-warning">{formatMoney(totalAllDebt)}</p>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-white/5 rounded text-xs text-text-muted">
                    <strong>How debt works:</strong> Holdco debt is paid manually here. Seller notes auto-amortize each year. Bank debt at opco level stays until you sell or wind down the business (proceeds net of debt).
                  </div>
                </div>
              );
            })()}

            {/* Cap Table / Equity Summary */}
            {(() => {
              const founderOwnership = founderShares / sharesOutstanding;
              const outsideShares = sharesOutstanding - founderShares;
              return (
                <div className="card bg-white/5">
                  <h4 className="font-bold mb-3">Cap Table & Equity</h4>

                  {/* Ownership bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-text-muted mb-1">
                      <span>You: {(founderOwnership * 100).toFixed(1)}%</span>
                      <span>Investors: {((1 - founderOwnership) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden flex">
                      <div
                        className={`h-full transition-all ${founderOwnership > 0.6 ? 'bg-accent' : founderOwnership > 0.51 ? 'bg-warning' : 'bg-danger'}`}
                        style={{ width: `${founderOwnership * 100}%` }}
                      />
                    </div>
                    {founderOwnership < 0.55 && (
                      <p className="text-xs text-warning mt-1">Control at risk — you must stay above 51%</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-text-muted">Your Shares</p>
                      <p className="font-mono font-bold text-lg">{founderShares.toFixed(0)}</p>
                      <p className="text-xs text-text-muted">Fixed — never diluted</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Outside Shares</p>
                      <p className="font-mono font-bold text-lg">{outsideShares.toFixed(0)}</p>
                      <p className="text-xs text-text-muted">
                        {outsideShares > STARTING_SHARES * 0.2
                          ? `+${(outsideShares - STARTING_SHARES * 0.2).toFixed(0)} since start`
                          : outsideShares < STARTING_SHARES * 0.2
                          ? `${(STARTING_SHARES * 0.2 - outsideShares).toFixed(0)} bought back`
                          : 'Initial 200 from raise'}
                      </p>
                    </div>
                    <div>
                      <p className="text-text-muted">Total Outstanding</p>
                      <p className="font-mono font-bold text-lg">{sharesOutstanding.toFixed(0)}</p>
                      <p className={`text-xs ${sharesOutstanding > STARTING_SHARES ? 'text-warning' : sharesOutstanding < STARTING_SHARES ? 'text-accent' : 'text-text-muted'}`}>
                        {sharesOutstanding > STARTING_SHARES
                          ? `+${((sharesOutstanding / STARTING_SHARES - 1) * 100).toFixed(0)}% since start`
                          : sharesOutstanding < STARTING_SHARES
                          ? `-${((1 - sharesOutstanding / STARTING_SHARES) * 100).toFixed(0)}% accretive`
                          : 'No change'}
                      </p>
                    </div>
                    <div>
                      <p className="text-text-muted">Value/Share</p>
                      <p className="font-mono font-bold text-lg">{formatMoney(intrinsicValuePerShare)}</p>
                      <p className="text-xs text-text-muted">Intrinsic value</p>
                    </div>
                  </div>

                  <div className="mt-4 p-3 bg-white/5 rounded text-xs text-text-muted">
                    <strong>How equity works:</strong> You started with 1,000 total shares — 800 yours (80%), 200 sold to investors for {formatMoney(20000)}.
                    Issuing new shares raises cash but dilutes your ownership %. Buybacks retire outside shares, increasing your % back.
                    You must always hold &gt;51% to keep control.
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pay Down Holdco Debt */}
            <div className="card">
              <h4 className="font-bold mb-3">Pay Down Holdco Debt</h4>
              <p className="text-sm text-text-muted mb-4">
                Holdco debt: {formatMoney(totalDebt)} @ {formatPercent(interestRate)}
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={payDebtAmount}
                  onChange={(e) => setPayDebtAmount(e.target.value)}
                  placeholder="Amount"
                  className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm"
                />
                <button
                  onClick={() => {
                    const amount = parseInt(payDebtAmount);
                    if (amount > 0) {
                      onPayDebt(amount);
                      setPayDebtAmount('');
                    }
                  }}
                  disabled={!payDebtAmount || parseInt(payDebtAmount) <= 0 || totalDebt === 0}
                  className="btn-primary text-sm"
                >
                  Pay
                </button>
              </div>
              <p className="text-xs text-text-muted mt-2">Interest charged annually on remaining balance</p>
            </div>

            {/* Issue Equity */}
            <div className="card">
              <h4 className="font-bold mb-3">Issue Equity</h4>
              <p className="text-sm text-text-muted mb-2">
                Raise capital by selling new shares at {formatMoney(intrinsicValuePerShare)}/share. Enter dollar amount ($k) to raise.
              </p>
              <p className="text-xs text-text-muted mb-4">
                Your ownership: {(founderShares / sharesOutstanding * 100).toFixed(1)}% | {equityRaisesUsed} raise{equityRaisesUsed !== 1 ? 's' : ''} so far
              </p>
              <div className="flex gap-2">
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
                      onIssueEquity(amount);
                      setEquityAmount('');
                    }
                  }}
                  disabled={!equityAmount || parseInt(equityAmount) <= 0}
                  className="btn-primary text-sm"
                >
                  Issue
                </button>
              </div>
              {equityAmount && parseInt(equityAmount) > 0 && intrinsicValuePerShare > 0 && (() => {
                const amt = parseInt(equityAmount);
                const newShares = Math.round((amt / intrinsicValuePerShare) * 1000) / 1000;
                const newTotal = sharesOutstanding + newShares;
                const newOwnership = founderShares / newTotal * 100;
                return (
                  <div className="mt-3 p-3 bg-white/5 rounded text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-text-muted">New shares issued</span>
                      <span className="font-mono">{newShares.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">At price per share</span>
                      <span className="font-mono">{formatMoney(intrinsicValuePerShare)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Your new ownership</span>
                      <span className={`font-mono font-bold ${newOwnership < 51 ? 'text-danger' : newOwnership < 55 ? 'text-warning' : ''}`}>
                        {newOwnership.toFixed(1)}%
                      </span>
                    </div>
                    {newOwnership < 51 && (
                      <p className="text-danger mt-1">Below 51% — this raise would be blocked</p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Buyback Shares */}
            <div className="card">
              <h4 className="font-bold mb-3">Buyback Shares</h4>
              <p className="text-sm text-text-muted mb-2">
                Repurchase outside investor shares at {formatMoney(intrinsicValuePerShare)}/share. Enter dollar amount ($k) to spend.
              </p>
              <p className="text-xs text-text-muted mb-4">
                Outstanding: {sharesOutstanding.toFixed(0)} total | {(sharesOutstanding - founderShares).toFixed(0)} outside shares
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={buybackAmount}
                  onChange={(e) => setBuybackAmount(e.target.value)}
                  placeholder="$k to spend"
                  className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm"
                />
                <button
                  onClick={() => {
                    const amount = parseInt(buybackAmount);
                    if (amount > 0) {
                      onBuyback(amount);
                      setBuybackAmount('');
                    }
                  }}
                  disabled={!buybackAmount || parseInt(buybackAmount) <= 0 || parseInt(buybackAmount) > cash}
                  className="btn-primary text-sm"
                >
                  Buyback
                </button>
              </div>
              {buybackAmount && parseInt(buybackAmount) > 0 && intrinsicValuePerShare > 0 && (() => {
                const amt = parseInt(buybackAmount);
                const sharesRepurchased = Math.round((amt / intrinsicValuePerShare) * 1000) / 1000;
                const outsideShares = sharesOutstanding - founderShares;
                const newTotal = sharesOutstanding - Math.min(sharesRepurchased, outsideShares);
                const newOwnership = founderShares / newTotal * 100;
                return (
                  <div className="mt-3 p-3 bg-white/5 rounded text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Shares repurchased</span>
                      <span className="font-mono">{Math.min(sharesRepurchased, outsideShares).toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Your new ownership</span>
                      <span className="font-mono font-bold text-accent">{newOwnership.toFixed(1)}%</span>
                    </div>
                    {sharesRepurchased > outsideShares && (
                      <p className="text-warning mt-1">Exceeds outside shares — capped at {outsideShares.toFixed(0)}</p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Distribute */}
            <div className="card">
              <h4 className="font-bold mb-3">Distribute to Owners</h4>
              <p className="text-sm text-text-muted mb-2">
                Returns cash to shareholders. Distributed: {formatMoney(totalDistributions)}
              </p>
              <div className="flex gap-2 mb-3">
                <input
                  type="number"
                  value={distributeAmount}
                  onChange={(e) => setDistributeAmount(e.target.value)}
                  placeholder="Amount"
                  className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm"
                />
                <button
                  onClick={() => {
                    const amount = parseInt(distributeAmount);
                    if (amount > 0) {
                      onDistribute(amount);
                      setDistributeAmount('');
                    }
                  }}
                  disabled={!distributeAmount || parseInt(distributeAmount) <= 0 || parseInt(distributeAmount) > cash}
                  className="btn-primary text-sm"
                >
                  Distribute
                </button>
              </div>
              <p className="text-xs text-text-muted">
                <strong>Scoring:</strong> Distributing when ROIIC is low and leverage is healthy earns points. But distributing while ROIIC is high (should reinvest) or leverage is high (should deleverage) costs points. Hoarding excess cash also hurts. Follow the hierarchy: reinvest → deleverage → buyback → distribute.
              </p>
            </div>
          </div>
          </div>
        )}
      </div>

      {/* End Round Button */}
      <div className="flex justify-end">
        <button onClick={() => setShowEndTurnConfirm(true)} className="btn-primary text-lg px-8">
          End Year →
        </button>
      </div>

      {/* Deal Structuring Modal */}
      {selectedDeal && renderDealStructuring()}

      {/* Improvement Modal */}
      {selectedBusinessForImprovement && renderImprovementModal()}

      {/* Merge Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-bg-primary border border-white/10 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold">Merge Businesses</h3>
                <p className="text-text-muted">Combine two businesses in the same sector into a larger platform</p>
              </div>
              <button
                onClick={() => {
                  setShowMergeModal(false);
                  setMergeSelection({ first: null, second: null });
                  setMergeName('');
                }}
                className="text-text-muted hover:text-text-primary text-2xl"
              >
                ×
              </button>
            </div>

            {mergeableSectors.length === 0 ? (
              <div className="card text-center text-text-muted py-8">
                <p>No businesses eligible for merger.</p>
                <p className="text-sm mt-2">Need 2+ businesses in the same sector to merge.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm text-text-muted mb-2">First Business</label>
                    <select
                      value={mergeSelection.first?.id || ''}
                      onChange={(e) => {
                        const biz = activeBusinesses.find(b => b.id === e.target.value);
                        setMergeSelection(prev => ({
                          ...prev,
                          first: biz || null,
                          second: biz?.sectorId !== prev.second?.sectorId ? null : prev.second
                        }));
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                    >
                      <option value="">Select business...</option>
                      {activeBusinesses.filter(b => !b.parentPlatformId).map(biz => (
                        <option key={biz.id} value={biz.id}>
                          {SECTORS[biz.sectorId].emoji} {biz.name} ({formatMoney(biz.ebitda)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-text-muted mb-2">Second Business</label>
                    <select
                      value={mergeSelection.second?.id || ''}
                      onChange={(e) => {
                        const biz = activeBusinesses.find(b => b.id === e.target.value);
                        setMergeSelection(prev => ({ ...prev, second: biz || null }));
                      }}
                      disabled={!mergeSelection.first}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
                    >
                      <option value="">Select business...</option>
                      {mergeSelection.first && activeBusinesses
                        .filter(b => b.sectorId === mergeSelection.first?.sectorId && b.id !== mergeSelection.first?.id && !b.parentPlatformId)
                        .map(biz => (
                          <option key={biz.id} value={biz.id}>
                            {biz.name} ({formatMoney(biz.ebitda)})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {mergeSelection.first && mergeSelection.second && (
                  <>
                    <div className="card bg-white/5 mb-6">
                      <h4 className="font-bold mb-3">Merger Preview</h4>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-text-muted">Combined EBITDA</p>
                          <p className="font-mono font-bold text-lg text-accent">
                            {formatMoney(mergeSelection.first.ebitda + mergeSelection.second.ebitda)}
                          </p>
                          <p className="text-xs text-text-muted">+ potential synergies</p>
                        </div>
                        <div>
                          <p className="text-text-muted">Merge Cost</p>
                          <p className="font-mono font-bold text-lg">
                            {formatMoney(Math.round((mergeSelection.first.ebitda + mergeSelection.second.ebitda) * 0.1))}
                          </p>
                          <p className="text-xs text-text-muted">10% of combined EBITDA</p>
                        </div>
                        <div>
                          <p className="text-text-muted">Platform Scale</p>
                          <p className="font-mono font-bold text-lg">
                            {Math.min(3, Math.max(mergeSelection.first.platformScale || 0, mergeSelection.second.platformScale || 0) + 1)}/3
                          </p>
                          <p className="text-xs text-text-muted">Multiple expansion</p>
                        </div>
                      </div>
                    </div>

                    <div className="mb-6">
                      <label className="block text-sm text-text-muted mb-2">New Company Name</label>
                      <input
                        type="text"
                        value={mergeName}
                        onChange={(e) => setMergeName(e.target.value)}
                        placeholder="e.g., Combined Holdings"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                        maxLength={40}
                      />
                    </div>

                    <button
                      onClick={() => {
                        if (mergeSelection.first && mergeSelection.second && mergeName.trim()) {
                          onMergeBusinesses(mergeSelection.first.id, mergeSelection.second.id, mergeName.trim());
                          setShowMergeModal(false);
                          setMergeSelection({ first: null, second: null });
                          setMergeName('');
                        }
                      }}
                      disabled={!mergeName.trim() || cash < (mergeSelection.first.ebitda + mergeSelection.second.ebitda) * 0.1}
                      className="btn-primary w-full"
                    >
                      {cash < (mergeSelection.first.ebitda + mergeSelection.second.ebitda) * 0.1
                        ? 'Not Enough Cash'
                        : 'Complete Merger'}
                    </button>
                  </>
                )}

                <div className="mt-6 p-4 bg-white/5 rounded-lg text-sm text-text-muted">
                  <p className="font-medium text-text-secondary mb-1">Roll-Up Strategy Tip</p>
                  <p>Merging creates platform scale, which commands higher exit multiples. The best roll-ups combine businesses with complementary strengths and shared customers.</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Market Guide Modal */}
      {showMarketGuide && (
        <MarketGuideModal onClose={() => setShowMarketGuide(false)} />
      )}

      {/* Roll-Up Guide Modal */}
      {showRollUpGuide && (
        <RollUpGuideModal onClose={() => setShowRollUpGuide(false)} />
      )}

      {/* End Turn Confirmation Modal */}
      {showEndTurnConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-bg-primary border border-white/10 rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4">End Year {round}?</h3>
            <p className="text-text-secondary mb-2">
              Are you sure you want to end Year {round}?
            </p>
            <p className="text-sm text-text-muted mb-6">
              You have <span className="text-accent font-mono">{formatMoney(cash)}</span> unallocated cash.
              {dealPipeline.length > 0 && (
                <span className="text-warning"> {dealPipeline.length} deal{dealPipeline.length > 1 ? 's' : ''} will expire.</span>
              )}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowEndTurnConfirm(false)}
                className="btn-secondary px-6"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowEndTurnConfirm(false);
                  onEndRound();
                }}
                className="btn-primary px-6"
              >
                End Year
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
