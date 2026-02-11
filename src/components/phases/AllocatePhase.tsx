import { useState, useRef } from 'react';
import {
  Business,
  Deal,
  DealStructure,
  SharedService,
  SharedServiceType,
  OperationalImprovementType,
  GameAction,
  MAFocus,
  SectorId,
  DealSizePreference,
  DistressLevel,
  MASourcingState,
  formatMoney,
  formatPercent,
} from '../../engine/types';
import { getDistressRestrictions, getDistressLabel, getDistressDescription } from '../../engine/distress';
import { SECTOR_LIST } from '../../data/sectors';
import { BusinessCard } from '../cards/BusinessCard';
import { DealCard } from '../cards/DealCard';
import { generateDealStructures, getStructureLabel, getStructureDescription } from '../../engine/deals';
import { calculateExitValuation } from '../../engine/simulation';
import { getSubTypeAffinity } from '../../engine/businesses';
import { SECTORS } from '../../data/sectors';
import { MIN_OPCOS_FOR_SHARED_SERVICES, MAX_ACTIVE_SHARED_SERVICES, MA_SOURCING_CONFIG, getMASourcingUpgradeCost, getMASourcingAnnualCost } from '../../data/sharedServices';
import { MarketGuideModal } from '../ui/MarketGuideModal';
import { RollUpGuideModal } from '../ui/RollUpGuideModal';
import { isAIEnabled } from '../../services/aiGeneration';

const STARTING_SHARES = 1000;

const DEAL_SOURCING_COST_BASE = 500; // $500k
const DEAL_SOURCING_COST_TIER1 = 300; // $300k with MA Sourcing Tier 1+
const PROACTIVE_OUTREACH_COST = 400; // $400k (Tier 3 only)

interface AllocatePhaseProps {
  businesses: Business[];
  allBusinesses: Business[]; // Includes integrated bolt-ons for debt lookups
  cash: number;
  totalDebt: number;
  interestRate: number;
  creditTightening: boolean;
  distressLevel: DistressLevel;
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
  onSetMAFocus: (sectorId: SectorId | null, sizePreference: DealSizePreference, subType?: string | null) => void;
  actionsThisRound?: GameAction[];
  maSourcing: MASourcingState;
  onUpgradeMASourcing: () => void;
  onToggleMASourcing: () => void;
  onProactiveOutreach: () => void;
  acquisitionsThisRound: number;
  maxAcquisitionsPerRound: number;
  lastAcquisitionResult: 'success' | 'snatched' | null;
}

type AllocateTab = 'portfolio' | 'deals' | 'shared_services' | 'capital';

export function AllocatePhase({
  businesses,
  allBusinesses,
  cash,
  totalDebt,
  interestRate,
  creditTightening,
  distressLevel,
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
  actionsThisRound = [],
  maSourcing,
  onUpgradeMASourcing,
  onToggleMASourcing,
  onProactiveOutreach,
  acquisitionsThisRound,
  maxAcquisitionsPerRound,
  lastAcquisitionResult,
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
  const acquiringRef = useRef(false);
  const [showRollUpGuide, setShowRollUpGuide] = useState(false);
  const [sellConfirmBusiness, setSellConfirmBusiness] = useState<Business | null>(null);
  const [sellCelebration, setSellCelebration] = useState<{ name: string; moic: number } | null>(null);
  const [windDownConfirmBusiness, setWindDownConfirmBusiness] = useState<Business | null>(null);

  const activeBusinesses = businesses.filter(b => b.status === 'active');
  const distressRestrictions = getDistressRestrictions(distressLevel);
  const dealSourcingCost = (maSourcing.active && maSourcing.tier >= 1) ? DEAL_SOURCING_COST_TIER1 : DEAL_SOURCING_COST_BASE;
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

    const structures = generateDealStructures(selectedDeal, cash, interestRate, creditTightening || !distressRestrictions.canTakeDebt);
    const availablePlatformsForDeal = getPlatformsForSector(selectedDeal.business.sectorId);
    const canTuckIn = availablePlatformsForDeal.length > 0;

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
        <div className="bg-bg-primary border border-white/10 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold">{selectedDeal.business.name}</h3>
              <p className="text-text-muted">
                {SECTORS[selectedDeal.business.sectorId].emoji} {selectedDeal.business.subType}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="relative group/modalheat">
                  <span className={`text-xs px-2 py-1 rounded inline-block cursor-help ${
                    selectedDeal.heat === 'cold' ? 'bg-blue-500/20 text-blue-400' :
                    selectedDeal.heat === 'warm' ? 'bg-yellow-500/20 text-yellow-400' :
                    selectedDeal.heat === 'hot' ? 'bg-orange-500/20 text-orange-400' :
                    'bg-red-500/20 text-red-400 animate-pulse'
                  }`}>
                    {selectedDeal.heat.charAt(0).toUpperCase() + selectedDeal.heat.slice(1)}
                  </span>
                  <span className="absolute left-0 top-full mt-1 w-56 p-2 bg-bg-primary border border-white/20 rounded-lg shadow-xl text-xs text-text-secondary opacity-0 invisible group-hover/modalheat:opacity-100 group-hover/modalheat:visible transition-all z-50">
                    {selectedDeal.heat === 'cold' && 'Low buyer interest. No premium over base price.'}
                    {selectedDeal.heat === 'warm' && 'Moderate competition. 10-15% premium over base.'}
                    {selectedDeal.heat === 'hot' && 'Multiple competing offers. 20-30% premium.'}
                    {selectedDeal.heat === 'contested' && 'Bidding war. 30-50% premium and 40% chance a rival snatches it.'}
                  </span>
                </span>
                <span className={`text-xs px-2 py-1 rounded inline-block ${
                  selectedDeal.acquisitionType === 'tuck_in' ? 'bg-accent-secondary/20 text-accent-secondary' :
                  selectedDeal.acquisitionType === 'platform' ? 'bg-accent/20 text-accent' :
                  'bg-white/10 text-text-muted'
                }`}>
                  {selectedDeal.acquisitionType === 'tuck_in' ? 'Tuck-In Opportunity' :
                   selectedDeal.acquisitionType === 'platform' ? 'Platform Opportunity' : 'Standalone'}
                </span>
              </div>
              {selectedDeal.effectivePrice > selectedDeal.askingPrice && (
                <p className="text-xs text-text-muted mt-1">
                  Base price {formatMoney(selectedDeal.askingPrice)} + {Math.round(((selectedDeal.effectivePrice / selectedDeal.askingPrice) - 1) * 100)}% competitive premium = <span className="font-bold text-text-primary">{formatMoney(selectedDeal.effectivePrice)}</span>
                </p>
              )}
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

          {/* Tuck-in / Platform Integration Selection */}
          {canTuckIn && (
            <div className="bg-accent-secondary/10 border border-accent-secondary/30 rounded-lg p-4 mb-6">
              <h4 className="font-bold text-accent-secondary mb-2">
                {selectedDeal.acquisitionType === 'tuck_in' ? 'Tuck-In Acquisition' : 'Platform Integration'}
              </h4>
              <p className="text-sm text-text-secondary mb-3">
                {selectedDeal.acquisitionType === 'tuck_in'
                  ? 'This business can be tucked into an existing platform for synergies and multiple expansion.'
                  : 'This business can be integrated into an existing platform in the same sector for synergies and multiple expansion.'}
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
                    {platform.name} (Scale {platform.platformScale}, EBITDA: {formatMoney(platform.ebitda)})
                  </option>
                ))}
              </select>
              {selectedTuckInPlatform && (() => {
                const platform = availablePlatformsForDeal.find(p => p.id === selectedTuckInPlatform);
                const affinity = platform ? getSubTypeAffinity(platform.sectorId, platform.subType, selectedDeal.business.subType) : 'distant';
                return (
                  <div className="mt-2 space-y-1">
                    {affinity === 'match' ? (
                      <p className="text-xs text-green-400 flex items-center gap-1">
                        <span>&#10003;</span> Same sub-type ({selectedDeal.business.subType}) — full synergies expected
                      </p>
                    ) : affinity === 'related' ? (
                      <p className="text-xs text-blue-400 flex items-center gap-1">
                        <span>&#8776;</span> Related sub-types ({platform?.subType} + {selectedDeal.business.subType}) — 75% synergies
                      </p>
                    ) : (
                      <p className="text-xs text-yellow-400 flex items-center gap-1">
                        <span>&#9888;</span> Distant sub-types ({platform?.subType} + {selectedDeal.business.subType}) — 45% synergies
                      </p>
                    )}
                    <p className="text-xs text-accent">
                      Synergies and multiple expansion will be calculated upon acquisition.
                    </p>
                  </div>
                );
              })()}
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
                    if (acquiringRef.current) return;
                    acquiringRef.current = true;
                    if (selectedTuckInPlatform) {
                      onAcquireTuckIn(selectedDeal, structure, selectedTuckInPlatform);
                    } else {
                      onAcquire(selectedDeal, structure);
                    }
                    setSelectedDeal(null);
                    setSelectedTuckInPlatform(null);
                    setTimeout(() => { acquiringRef.current = false; }, 300);
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
                        <span className="text-text-muted">Earnout (if {Math.round(structure.earnout.targetEbitdaGrowth * 100)}%+ growth)</span>
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
      {
        type: 'recurring_revenue_conversion',
        name: 'Convert to Recurring Revenue',
        description: 'Shift business model toward recurring/subscription revenue streams.',
        costPercent: 0.25,
        ebitdaBoostMin: 0,
        ebitdaBoostMax: 0,
        growthBoost: 0.03,
        extraBenefit: '-2ppt margin now, +0.50x exit premium',
        available: !appliedTypes.has('recurring_revenue_conversion'),
        unavailableReason: 'Already applied',
      },
      {
        type: 'management_professionalization',
        name: 'Professionalize Management',
        description: 'Install professional management layer with executive coaching and governance.',
        costPercent: 0.18,
        ebitdaBoostMin: 0.03,
        ebitdaBoostMax: 0.06,
        growthBoost: 0.01,
        extraBenefit: 'Upgrades operator quality, +0.30x exit premium',
        available: !appliedTypes.has('management_professionalization'),
        unavailableReason: 'Already applied',
      },
      {
        type: 'digital_transformation',
        name: 'Digital Transformation',
        description: 'Modernize operations with digital tools, automation, and data analytics.',
        costPercent: 0.22,
        ebitdaBoostMin: 0.04,
        ebitdaBoostMax: 0.08,
        growthBoost: 0.02,
        extraBenefit: 'Defends margins against drift',
        available: !appliedTypes.has('digital_transformation'),
        unavailableReason: 'Already applied',
      },
    ];

    // Per-type improvement exit premiums (matches simulation.ts)
    const IMPROVEMENT_EXIT_PREMIUMS: Record<string, number> = {
      operating_playbook: 0.15,
      pricing_model: 0.15,
      service_expansion: 0.15,
      fix_underperformance: 0.15,
      recurring_revenue_conversion: 0.50,
      management_professionalization: 0.30,
      digital_transformation: 0.15,
    };
    const currentImprovementMultiple = Math.min(
      1.0,
      business.improvements.reduce((sum, imp) => sum + (IMPROVEMENT_EXIT_PREMIUMS[imp.type] || 0.15), 0)
    );
    const hasDeRiskingBonus = business.improvements.length >= 2;
    const totalImprovementTypes = improvements.length;

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
        <div className="bg-bg-primary border border-white/10 rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
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
              <p className="text-2xl font-bold font-mono">{business.improvements.length}/{totalImprovementTypes}</p>
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
                <p>Variable exit premium per improvement (0.15x-0.50x, max 1.0x total). At 2+ improvements, an additional +0.2x de-risking premium kicks in.</p>
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
                    {{ operating_playbook: 'Operating Playbook', pricing_model: 'Pricing Model', service_expansion: 'Service Expansion', fix_underperformance: 'Fix Underperformance', recurring_revenue_conversion: 'Recurring Revenue', management_professionalization: 'Professionalize Mgmt', digital_transformation: 'Digital Transformation' }[imp.type] || imp.type}
                    <span className="text-accent/60 ml-1">(Year {imp.appliedRound}, +{(imp.effect * 100).toFixed(0)}%)</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <h4 className="font-bold mb-4">Choose Improvement</h4>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {improvements.map((improvement) => {
              const cost = Math.round(business.ebitda * improvement.costPercent);
              const canAfford = cash >= cost;
              const disabled = !improvement.available || !canAfford;

              // ROI calculations
              const avgBoost = (improvement.ebitdaBoostMin + improvement.ebitdaBoostMax) / 2;
              const ebitdaGainPerYear = Math.round(business.ebitda * avgBoost);
              const boostIsRange = improvement.ebitdaBoostMin !== improvement.ebitdaBoostMax;
              const paybackYears = ebitdaGainPerYear > 0 ? cost / ebitdaGainPerYear : Infinity;

              // Exit value impact: per-type premium, plus potential de-risking bonus
              const nextImprovementCount = business.improvements.length + 1;
              const typePremium = IMPROVEMENT_EXIT_PREMIUMS[improvement.type] || 0.15;
              const exitMultipleGain = Math.min(typePremium, 1.0 - currentImprovementMultiple) + (nextImprovementCount === 2 ? 0.2 : 0);
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
    <div className="px-4 sm:px-6 py-6 pb-8">
      {/* Distress Warning Banner */}
      {distressLevel === 'stressed' && (
        <div className="bg-orange-900/30 border border-orange-500/40 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="font-bold text-orange-400">{getDistressLabel(distressLevel)}</h3>
              <p className="text-sm text-text-secondary">{getDistressDescription(distressLevel)}</p>
            </div>
          </div>
        </div>
      )}
      {distressLevel === 'breach' && (
        <div className="bg-red-900/30 border-2 border-red-500/50 rounded-xl p-4 mb-6 animate-pulse">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🚨</span>
            <div>
              <h3 className="font-bold text-red-400">{getDistressLabel(distressLevel)}</h3>
              <p className="text-sm text-red-300">{getDistressDescription(distressLevel)}</p>
            </div>
          </div>
        </div>
      )}

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
                          {SECTORS[p.sectorId].emoji} {p.name} (Scale {p.platformScale}, {p.boltOnIds.length} bolt-ons)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Failed integration warnings */}
            {actionsThisRound
              .filter(a =>
                (a.type === 'acquire_tuck_in' || a.type === 'merge_businesses') &&
                a.details?.integrationOutcome === 'failure'
              )
              .map((a, i) => {
                const d = a.details;
                const cost = d.restructuringCost as number;
                const drag = Math.abs(d.growthDragPenalty as number) * 100;
                let description: string;
                if (a.type === 'acquire_tuck_in') {
                  const platform = businesses.find(b => b.id === d.platformId);
                  const boltOn = businesses.find(b => b.id === d.businessId);
                  description = `Tuck-in of ${boltOn?.name ?? 'bolt-on'} into ${platform?.name ?? 'platform'} failed. ${formatMoney(cost)} restructuring cost deducted and ${platform?.name ?? 'platform'}'s growth permanently reduced by ${drag.toFixed(1)}%.`;
                } else {
                  description = `Merger into ${d.newName as string} failed. ${formatMoney(cost)} restructuring cost deducted and growth permanently reduced by ${drag.toFixed(1)}%.`;
                }
                return (
                  <div key={i} className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <span className="text-lg">⚠️</span>
                      <div>
                        <h4 className="font-bold text-red-400 text-sm">Integration Failed</h4>
                        <p className="text-xs text-text-secondary mt-1">{description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeBusinesses.filter(b => !b.parentPlatformId).map(business => (
                <BusinessCard
                  key={business.id}
                  business={business}
                  onSell={() => setSellConfirmBusiness(business)}
                  onImprove={() => setSelectedBusinessForImprovement(business)}
                  onDesignatePlatform={!business.isPlatform ? () => onDesignatePlatform(business.id) : undefined}
                  onWindDown={() => setWindDownConfirmBusiness(business)}
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
              {/* Sub-type targeting (Tier 2+, active, sector selected) */}
              {maSourcing.active && maSourcing.tier >= 2 && maFocus.sectorId && (
                <div className="mt-4">
                  <label className="block text-sm text-text-muted mb-2">Target Sub-Type</label>
                  <select
                    value={maFocus.subType || ''}
                    onChange={(e) => onSetMAFocus(
                      maFocus.sectorId,
                      maFocus.sizePreference,
                      e.target.value || null
                    )}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="">Any Sub-Type</option>
                    {SECTORS[maFocus.sectorId].subTypes.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                  <p className="text-xs text-accent mt-1">
                    Industry Specialists will source {maFocus.subType ? `"${maFocus.subType}"` : 'targeted'} deals each round
                  </p>
                </div>
              )}

              {maFocus.sectorId && !maSourcing.active && (
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
                      {maSourcing.active && maSourcing.tier >= 1 && ' — discounted rate'}
                    </p>
                  </div>
                  <button
                    onClick={onSourceDeals}
                    disabled={cash < dealSourcingCost}
                    className={`btn-secondary text-sm whitespace-nowrap ${
                      cash >= dealSourcingCost ? 'border-accent' : ''
                    }`}
                  >
                    Source Deals ({formatMoney(dealSourcingCost)})
                  </button>
                </div>

                {/* Proactive Outreach (Tier 3 only) */}
                {maSourcing.active && maSourcing.tier >= 3 && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                    <div>
                      <p className="text-sm font-medium">Proactive Outreach</p>
                      <p className="text-xs text-text-muted">
                        2 targeted quality-3+ deals
                        {maFocus.subType && ` in ${maFocus.subType}`}
                      </p>
                    </div>
                    <button
                      onClick={onProactiveOutreach}
                      disabled={cash < PROACTIVE_OUTREACH_COST}
                      className={`btn-secondary text-sm whitespace-nowrap ${
                        cash >= PROACTIVE_OUTREACH_COST ? 'border-purple-500' : ''
                      }`}
                    >
                      Outreach ({formatMoney(PROACTIVE_OUTREACH_COST)})
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Snatched banner */}
            {lastAcquisitionResult === 'snatched' && (
              <div className="bg-red-500/15 border border-red-500/30 rounded-lg p-3 mb-4 flex items-center justify-between">
                <p className="text-sm text-red-400 font-medium">
                  Another buyer outbid you! The deal is off the table.
                </p>
              </div>
            )}

            {/* Acquisition counter */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3 relative group/acqlimit">
                <span className={`text-sm font-medium cursor-help ${acquisitionsThisRound >= maxAcquisitionsPerRound ? 'text-warning' : 'text-text-secondary'}`}>
                  Acquisitions: {maxAcquisitionsPerRound - acquisitionsThisRound}/{maxAcquisitionsPerRound} remaining
                </span>
                {acquisitionsThisRound >= maxAcquisitionsPerRound && (
                  <span className="text-xs bg-warning/20 text-warning px-2 py-1 rounded">Limit reached</span>
                )}
                <div className="absolute left-0 top-full mt-1 w-64 p-3 bg-bg-primary border border-white/10 rounded-lg shadow-xl text-xs text-text-secondary opacity-0 invisible group-hover/acqlimit:opacity-100 group-hover/acqlimit:visible transition-all z-50">
                  <p className="font-medium text-text-primary mb-1">Acquisition Attempts</p>
                  <p>You can attempt {maxAcquisitionsPerRound} acquisitions per year{maSourcing.tier >= 1 ? ` (boosted by M&A Sourcing Tier ${maSourcing.tier})` : ''}. Tuck-ins count toward this limit. Contested deals may be snatched by competing buyers, consuming your attempt without spending cash.</p>
                </div>
              </div>
              {passedDealIds.size > 0 && (
                <button
                  onClick={() => setShowPassedDeals(!showPassedDeals)}
                  className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showPassedDeals ? 'Hide' : 'Show'} {passedDealIds.size} passed deal{passedDealIds.size !== 1 ? 's' : ''}
                </button>
              )}
            </div>

            {/* Deals Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dealPipeline
                .filter(deal => showPassedDeals || !passedDealIds.has(deal.id))
                .map(deal => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  onSelect={() => setSelectedDeal(deal)}
                  disabled={cash < deal.effectivePrice * 0.15 || !distressRestrictions.canAcquire || acquisitionsThisRound >= maxAcquisitionsPerRound}
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
          <div>
            {/* M&A Infrastructure (separate from operational shared services) */}
            <div className="card mb-6 border-purple-500/30 bg-purple-500/5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    M&A Infrastructure
                    <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">Separate from Shared Services</span>
                  </h3>
                  <p className="text-sm text-text-muted">
                    Build a dedicated deal sourcing capability for your holdco
                  </p>
                </div>
                {maSourcing.tier > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">Annual: {formatMoney(getMASourcingAnnualCost(maSourcing.tier))}</span>
                    <button
                      onClick={onToggleMASourcing}
                      className={`text-xs px-3 py-1 rounded transition-colors ${
                        maSourcing.active
                          ? 'bg-purple-500/20 text-purple-400 hover:bg-red-500/20 hover:text-red-400'
                          : 'bg-white/10 text-text-muted hover:bg-purple-500/20 hover:text-purple-400'
                      }`}
                    >
                      {maSourcing.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                )}
              </div>

              {/* Tier Progress */}
              <div className="flex items-center gap-3 mb-4">
                {[1, 2, 3].map(tier => {
                  const config = MA_SOURCING_CONFIG[tier as 1 | 2 | 3];
                  const isUnlocked = maSourcing.tier >= tier;
                  const isCurrent = maSourcing.tier === tier;
                  const isNext = maSourcing.tier === tier - 1;
                  return (
                    <div
                      key={tier}
                      className={`flex-1 rounded-lg p-3 border transition-colors ${
                        isUnlocked
                          ? isCurrent && maSourcing.active
                            ? 'border-purple-500/50 bg-purple-500/10'
                            : 'border-white/20 bg-white/5'
                          : isNext
                            ? 'border-dashed border-purple-500/30'
                            : 'border-white/5 opacity-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold">Tier {tier}</span>
                        {isUnlocked && (
                          <span className="text-xs text-purple-400">&#10003;</span>
                        )}
                      </div>
                      <p className="text-xs font-medium mb-1">{config.name}</p>
                      <p className="text-xs text-text-muted">{formatMoney(config.annualCost)}/yr</p>
                    </div>
                  );
                })}
              </div>

              {/* Current tier effects */}
              {maSourcing.tier > 0 && maSourcing.active && (
                <div className="bg-white/5 rounded-lg p-3 mb-4">
                  <p className="text-xs font-medium text-purple-400 mb-2">
                    Active: {MA_SOURCING_CONFIG[maSourcing.tier as 1 | 2 | 3].name}
                  </p>
                  <ul className="space-y-1">
                    {MA_SOURCING_CONFIG[maSourcing.tier as 1 | 2 | 3].effects.map((effect, i) => (
                      <li key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
                        <span className="text-purple-400 mt-0.5">&#8226;</span>
                        {effect}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Upgrade button */}
              {maSourcing.tier < 3 && (() => {
                const nextTier = (maSourcing.tier + 1) as 1 | 2 | 3;
                const config = MA_SOURCING_CONFIG[nextTier];
                const upgradeCost = getMASourcingUpgradeCost(maSourcing.tier);
                const opcoCount = activeBusinesses.length;
                const hasEnoughOpcos = opcoCount >= config.requiredOpcos;
                const canAffordUpgrade = cash >= upgradeCost;
                const disabled = !hasEnoughOpcos || !canAffordUpgrade;

                return (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {maSourcing.tier === 0 ? 'Build' : 'Upgrade to'} {config.name}
                      </p>
                      <p className="text-xs text-text-muted">
                        {!hasEnoughOpcos
                          ? `Requires ${config.requiredOpcos}+ opcos (you have ${opcoCount})`
                          : `${formatMoney(upgradeCost)} one-time + ${formatMoney(config.annualCost)}/yr`
                        }
                      </p>
                    </div>
                    <button
                      onClick={onUpgradeMASourcing}
                      disabled={disabled}
                      className={`btn-primary text-sm ${disabled ? 'opacity-50' : 'bg-purple-600 hover:bg-purple-500'}`}
                    >
                      {!hasEnoughOpcos
                        ? `Need ${config.requiredOpcos} Opcos`
                        : !canAffordUpgrade
                          ? 'Not Enough Cash'
                          : `${maSourcing.tier === 0 ? 'Build' : 'Upgrade'} (${formatMoney(upgradeCost)})`
                      }
                    </button>
                  </div>
                );
              })()}

              {maSourcing.tier >= 3 && (
                <p className="text-xs text-purple-400 text-center">Fully upgraded — Proprietary Network active</p>
              )}
            </div>

            {/* Operational Shared Services */}
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
                      <p className="text-xs text-text-muted">Auto-amortizes (10%/yr) + manual</p>
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
                    <strong>How debt works:</strong> Holdco debt has a 2-year grace period, then 10% of the balance amortizes automatically each year. You can also pay down extra here. Seller notes auto-amortize each year. Bank debt at opco level stays until you sell or wind down the business (proceeds net of debt).
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
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={payDebtAmount}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setPayDebtAmount(raw);
                    }}
                    placeholder="1,000,000"
                    className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-3 py-2 text-sm"
                  />
                </div>
                <button
                  onClick={() => {
                    const dollars = parseInt(payDebtAmount) || 0;
                    const internalAmount = Math.round(dollars / 1000);
                    if (internalAmount > 0) {
                      onPayDebt(internalAmount);
                      setPayDebtAmount('');
                    }
                  }}
                  disabled={!payDebtAmount || (parseInt(payDebtAmount) || 0) < 1000 || totalDebt === 0}
                  className="btn-primary text-sm"
                >
                  Pay
                </button>
              </div>
              {payDebtAmount && parseInt(payDebtAmount) >= 1000 && (
                <p className="text-xs text-text-muted mt-1">= {formatMoney(Math.round(parseInt(payDebtAmount) / 1000))}</p>
              )}
              <p className="text-xs text-text-muted mt-2">Interest charged annually on remaining balance</p>
            </div>

            {/* Issue Equity */}
            <div className="card">
              <h4 className="font-bold mb-3">Issue Equity</h4>
              <p className="text-sm text-text-muted mb-2">
                Raise capital by selling new shares at {formatMoney(intrinsicValuePerShare)}/share.
              </p>
              <p className="text-xs text-text-muted mb-4">
                Your ownership: {(founderShares / sharesOutstanding * 100).toFixed(1)}% | {equityRaisesUsed} raise{equityRaisesUsed !== 1 ? 's' : ''} so far
              </p>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={equityAmount}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setEquityAmount(raw);
                    }}
                    placeholder="5,000,000"
                    className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-3 py-2 text-sm"
                  />
                </div>
                <button
                  onClick={() => {
                    const dollars = parseInt(equityAmount) || 0;
                    const internalAmount = Math.round(dollars / 1000);
                    if (internalAmount > 0) {
                      onIssueEquity(internalAmount);
                      setEquityAmount('');
                    }
                  }}
                  disabled={!equityAmount || (parseInt(equityAmount) || 0) < 1000}
                  className="btn-primary text-sm"
                >
                  Issue
                </button>
              </div>
              {equityAmount && parseInt(equityAmount) >= 1000 && (
                <p className="text-xs text-text-muted mt-1">= {formatMoney(Math.round(parseInt(equityAmount) / 1000))}</p>
              )}
              {equityAmount && parseInt(equityAmount) >= 1000 && intrinsicValuePerShare > 0 && (() => {
                const amt = Math.round(parseInt(equityAmount) / 1000);
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
                Repurchase outside investor shares at {formatMoney(intrinsicValuePerShare)}/share.
              </p>
              <p className="text-xs text-text-muted mb-4">
                Outstanding: {sharesOutstanding.toFixed(0)} total | {(sharesOutstanding - founderShares).toFixed(0)} outside shares
              </p>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={buybackAmount}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setBuybackAmount(raw);
                    }}
                    placeholder="2,000,000"
                    className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-3 py-2 text-sm"
                  />
                </div>
                <button
                  onClick={() => {
                    const dollars = parseInt(buybackAmount) || 0;
                    const internalAmount = Math.round(dollars / 1000);
                    if (internalAmount > 0) {
                      onBuyback(internalAmount);
                      setBuybackAmount('');
                    }
                  }}
                  disabled={!buybackAmount || (parseInt(buybackAmount) || 0) < 1000 || Math.round((parseInt(buybackAmount) || 0) / 1000) > cash || !distressRestrictions.canBuyback}
                  className="btn-primary text-sm"
                >
                  {!distressRestrictions.canBuyback ? 'Blocked' : 'Buyback'}
                </button>
              </div>
              {buybackAmount && parseInt(buybackAmount) >= 1000 && (
                <p className="text-xs text-text-muted mt-1">= {formatMoney(Math.round(parseInt(buybackAmount) / 1000))}</p>
              )}
              {buybackAmount && parseInt(buybackAmount) >= 1000 && intrinsicValuePerShare > 0 && (() => {
                const amt = Math.round(parseInt(buybackAmount) / 1000);
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
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={distributeAmount}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setDistributeAmount(raw);
                    }}
                    placeholder="1,000,000"
                    className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-3 py-2 text-sm"
                  />
                </div>
                <button
                  onClick={() => {
                    const dollars = parseInt(distributeAmount) || 0;
                    const internalAmount = Math.round(dollars / 1000);
                    if (internalAmount > 0) {
                      onDistribute(internalAmount);
                      setDistributeAmount('');
                    }
                  }}
                  disabled={!distributeAmount || (parseInt(distributeAmount) || 0) < 1000 || Math.round((parseInt(distributeAmount) || 0) / 1000) > cash || !distressRestrictions.canDistribute}
                  className="btn-primary text-sm"
                >
                  {!distressRestrictions.canDistribute ? 'Blocked' : 'Distribute'}
                </button>
              </div>
              {distributeAmount && parseInt(distributeAmount) >= 1000 && (
                <p className="text-xs text-text-muted mt-1 mb-2">= {formatMoney(Math.round(parseInt(distributeAmount) / 1000))}</p>
              )}
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
          <div className="bg-bg-primary border border-white/10 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
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
                          {SECTORS[biz.sectorId].emoji} {biz.name} — {biz.subType} ({formatMoney(biz.ebitda)})
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
                            {biz.name} — {biz.subType} ({formatMoney(biz.ebitda)})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {mergeSelection.first && mergeSelection.second && (() => {
                  const mergeCost = Math.round(Math.min(mergeSelection.first.ebitda, mergeSelection.second.ebitda) * 0.15);
                  return (
                  <>
                    <div className="card bg-white/5 mb-6">
                      <h4 className="font-bold mb-3">Merger Preview</h4>

                      {/* Sub-type match indicator */}
                      {(() => {
                        const mergeAffinity = getSubTypeAffinity(mergeSelection.first.sectorId, mergeSelection.first.subType, mergeSelection.second.subType);
                        return mergeAffinity === 'match' ? (
                          <div className="bg-green-900/20 border border-green-500/30 rounded-lg px-3 py-2 mb-4 text-sm text-green-400 flex items-center gap-2">
                            <span>&#10003;</span> Same sub-type ({mergeSelection.first.subType}) — full synergies expected
                          </div>
                        ) : mergeAffinity === 'related' ? (
                          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg px-3 py-2 mb-4 text-sm text-blue-400 flex items-center gap-2">
                            <span>&#8776;</span> Related sub-types ({mergeSelection.first.subType} + {mergeSelection.second.subType}) — 75% synergies
                          </div>
                        ) : (
                          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg px-3 py-2 mb-4 text-sm text-yellow-400 flex items-center gap-2">
                            <span>&#9888;</span> Distant sub-types ({mergeSelection.first.subType} + {mergeSelection.second.subType}) — 45% synergies
                          </div>
                        );
                      })()}

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
                            {formatMoney(mergeCost)}
                          </p>
                          <p className="text-xs text-text-muted">15% of smaller business</p>
                        </div>
                        <div>
                          <p className="text-text-muted">Platform Scale</p>
                          <p className="font-mono font-bold text-lg">
                            {Math.max(mergeSelection.first.platformScale || 0, mergeSelection.second.platformScale || 0) + 1}
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
                      disabled={!mergeName.trim() || cash < mergeCost}
                      className="btn-primary w-full"
                    >
                      {cash < mergeCost
                        ? 'Not Enough Cash'
                        : 'Complete Merger'}
                    </button>
                  </>
                  );
                })()}

                <div className="mt-6 p-4 bg-white/5 rounded-lg text-sm text-text-muted">
                  <p className="font-medium text-text-secondary mb-1">Roll-Up Strategy Tip</p>
                  <p>Merging automatically creates a platform — no need to designate first. If one business is already a platform, the merged entity starts at a higher scale. Only designate separately if you plan to do tuck-in acquisitions before merging.</p>
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

      {/* Sell Confirmation Modal */}
      {sellConfirmBusiness && (() => {
        const biz = sellConfirmBusiness;
        const valuation = calculateExitValuation(biz, round, lastEventType);
        const totalInvested = biz.totalAcquisitionCost || biz.acquisitionPrice;
        const sellMoic = valuation.netProceeds / totalInvested;
        return (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-bg-primary border border-white/10 rounded-xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold mb-4">Confirm Sale</h3>
              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Business</span>
                  <span className="font-bold">{biz.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Est. Exit Price</span>
                  <span className="font-mono font-bold text-accent">{formatMoney(valuation.exitPrice)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Net Proceeds</span>
                  <span className="font-mono font-bold">{formatMoney(valuation.netProceeds)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-white/10 pt-2">
                  <span className="text-text-muted">Total Invested</span>
                  <span className="font-mono">{formatMoney(totalInvested)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">MOIC</span>
                  <span className={`font-mono font-bold ${sellMoic >= 2 ? 'text-accent' : sellMoic < 1 ? 'text-danger' : ''}`}>
                    {sellMoic.toFixed(1)}x
                  </span>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setSellConfirmBusiness(null)} className="btn-secondary px-6">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onSell(biz.id);
                    setSellConfirmBusiness(null);
                    if (sellMoic >= 1.5) {
                      setSellCelebration({ name: biz.name, moic: sellMoic });
                      setTimeout(() => setSellCelebration(null), 4000);
                    }
                  }}
                  className="btn-primary px-6"
                >
                  Sell
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Wind-Down Confirmation Modal */}
      {windDownConfirmBusiness && (() => {
        const biz = windDownConfirmBusiness;
        const boltOnCount = biz.boltOnIds?.length || 0;
        const boltOnDebt = allBusinesses
          .filter(b => biz.boltOnIds?.includes(b.id))
          .reduce((sum, b) => sum + b.sellerNoteBalance, 0);
        const totalCost = 250 + biz.sellerNoteBalance + boltOnDebt;
        return (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-bg-primary border border-white/10 rounded-xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold mb-4 text-danger">Confirm Wind-Down</h3>
              <p className="text-sm text-text-secondary mb-4">
                This will permanently shut down <span className="font-bold text-text-primary">{biz.name}</span>
                {boltOnCount > 0 && ` and its ${boltOnCount} bolt-on${boltOnCount > 1 ? 's' : ''}`}.
                You will not recover any invested capital.
              </p>
              <div className="space-y-2 mb-6 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Wind-down fee</span>
                  <span className="font-mono text-danger">-{formatMoney(250)}</span>
                </div>
                {biz.sellerNoteBalance > 0 && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">Seller note writeoff</span>
                    <span className="font-mono text-danger">-{formatMoney(biz.sellerNoteBalance)}</span>
                  </div>
                )}
                {boltOnDebt > 0 && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">Bolt-on debt writeoff</span>
                    <span className="font-mono text-danger">-{formatMoney(boltOnDebt)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-white/10 pt-2 font-bold">
                  <span>Total cost</span>
                  <span className="font-mono text-danger">-{formatMoney(totalCost)}</span>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setWindDownConfirmBusiness(null)} className="btn-secondary px-6">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onWindDown(biz.id);
                    setWindDownConfirmBusiness(null);
                  }}
                  className="bg-danger/80 hover:bg-danger text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Wind Down
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Sell Celebration Overlay */}
      {sellCelebration && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] pointer-events-none">
          <div className="text-center animate-bounce">
            <p className="text-6xl mb-4">
              {sellCelebration.moic >= 3 ? '🎆' : sellCelebration.moic >= 2 ? '🎉' : '✨'}
            </p>
            <p className="text-3xl font-bold text-accent mb-2">
              {sellCelebration.moic >= 3 ? 'Incredible Exit!' :
               sellCelebration.moic >= 2 ? 'Great Exit!' :
               'Solid Exit!'}
            </p>
            <p className="text-xl text-text-secondary">
              {sellCelebration.name} — {sellCelebration.moic.toFixed(1)}x MOIC
            </p>
          </div>
        </div>
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
              {(() => {
                const expiring = dealPipeline.filter(d => d.freshness === 1).length;
                const carrying = dealPipeline.filter(d => d.freshness > 1).length;
                return (
                  <>
                    {expiring > 0 && <span className="text-warning"> {expiring} deal{expiring > 1 ? 's' : ''} will expire.</span>}
                    {carrying > 0 && <span className="text-text-muted"> {carrying} will carry over.</span>}
                  </>
                );
              })()}
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
