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

    const improvements: {
      type: OperationalImprovementType;
      name: string;
      description: string;
      costPercent: number;
      effect: string;
      available: boolean;
    }[] = [
      {
        type: 'operating_playbook',
        name: 'Install Operating Playbook',
        description: 'Implement standardized processes and KPIs from your holdco playbook.',
        costPercent: 0.15,
        effect: '+8% EBITDA, reduced volatility',
        available: true,
      },
      {
        type: 'pricing_model',
        name: 'Upgrade Pricing Model',
        description: 'Optimize pricing strategy to capture more value from customers.',
        costPercent: 0.10,
        effect: '+5-12% EBITDA, +1% growth rate',
        available: true,
      },
      {
        type: 'service_expansion',
        name: 'Expand Service Line',
        description: 'Add complementary services to grow wallet share with existing customers.',
        costPercent: 0.20,
        effect: '+10-18% EBITDA (takes time to ramp)',
        available: true,
      },
      {
        type: 'fix_underperformance',
        name: 'Fix Underperformance',
        description: 'Address operational issues dragging down performance.',
        costPercent: 0.12,
        effect: 'Restore EBITDA to 80% of peak',
        available: business.ebitda < business.peakEbitda * 0.8,
      },
    ];

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
              <p className="text-text-muted text-sm">Peak EBITDA</p>
              <p className="text-2xl font-bold font-mono">{formatMoney(business.peakEbitda)}</p>
            </div>
            <div className="card text-center">
              <p className="text-text-muted text-sm">Improvements Made</p>
              <p className="text-2xl font-bold font-mono">{business.improvements.length}</p>
            </div>
          </div>

          <h4 className="font-bold mb-4">Choose Improvement</h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {improvements.map((improvement) => {
              const cost = Math.round(business.ebitda * improvement.costPercent);
              const canAfford = cash >= cost;
              const disabled = !improvement.available || !canAfford;

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
                        {formatMoney(cost)} ({formatPercent(improvement.costPercent)} of EBITDA)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Effect</span>
                      <span className="font-mono text-accent">{improvement.effect}</span>
                    </div>
                  </div>

                  <button
                    className={`w-full mt-4 text-sm ${disabled ? 'btn-secondary opacity-50 cursor-not-allowed' : 'btn-primary'}`}
                    disabled={disabled}
                  >
                    {!improvement.available
                      ? 'Not Needed'
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
            <p>Danaher's DBS proves that operational improvement is a form of reinvestment. Great holdcos compound returns by continuously improving their portfolio companies.</p>
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
            </div>

            {/* Deals Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dealPipeline.map(deal => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  onSelect={() => setSelectedDeal(deal)}
                  disabled={cash < deal.askingPrice * 0.15}
                  availablePlatforms={getPlatformsForSector(deal.business.sectorId)}
                />
              ))}
              {dealPipeline.length === 0 && (
                <div className="col-span-full card text-center text-text-muted py-12">
                  <p>No deals available this year.</p>
                  <p className="text-sm mt-2">New opportunities will appear next year.</p>
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
            <div className="card bg-white/5">
              <h4 className="font-bold mb-3">Cap Table & Equity</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div>
                  <p className="text-text-muted">Starting Shares</p>
                  <p className="font-mono font-bold text-lg">{STARTING_SHARES}</p>
                </div>
                <div>
                  <p className="text-text-muted">Shares Issued</p>
                  <p className="font-mono font-bold text-lg text-warning">
                    +{Math.max(0, sharesOutstanding - STARTING_SHARES + (totalBuybacks / intrinsicValuePerShare)).toFixed(0)}
                  </p>
                  <p className="text-xs text-text-muted">{equityRaisesUsed}/3 raises used</p>
                </div>
                <div>
                  <p className="text-text-muted">Shares Bought Back</p>
                  <p className="font-mono font-bold text-lg text-accent">
                    -{(totalBuybacks / Math.max(1, intrinsicValuePerShare)).toFixed(0)}
                  </p>
                  <p className="text-xs text-text-muted">{formatMoney(totalBuybacks)} spent</p>
                </div>
                <div>
                  <p className="text-text-muted">Outstanding</p>
                  <p className="font-mono font-bold text-lg">{sharesOutstanding.toFixed(0)}</p>
                  <p className={`text-xs ${sharesOutstanding > STARTING_SHARES ? 'text-warning' : sharesOutstanding < STARTING_SHARES ? 'text-accent' : 'text-text-muted'}`}>
                    {sharesOutstanding > STARTING_SHARES
                      ? `+${((sharesOutstanding / STARTING_SHARES - 1) * 100).toFixed(0)}% dilution`
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
                <strong>Equity mechanics:</strong> Issuing shares raises cash but dilutes FCF/share. Buybacks use cash but increase FCF/share.
                Distributions return cash to owners without affecting share count. Berkshire has never diluted for acquisitions.
              </div>
            </div>

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
              <p className="text-sm text-text-muted mb-4">
                Raises used: {equityRaisesUsed}/3 | Value/share: {formatMoney(intrinsicValuePerShare)}
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={equityAmount}
                  onChange={(e) => setEquityAmount(e.target.value)}
                  placeholder="Amount"
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
                  disabled={!equityAmount || parseInt(equityAmount) <= 0 || round <= 3 || equityRaisesUsed >= 3}
                  className="btn-primary text-sm"
                >
                  Issue
                </button>
              </div>
              {round <= 3 && <p className="text-xs text-warning mt-2">Available after Year 3</p>}
            </div>

            {/* Buyback Shares */}
            <div className="card">
              <h4 className="font-bold mb-3">Buyback Shares</h4>
              <p className="text-sm text-text-muted mb-4">
                Shares outstanding: {sharesOutstanding.toFixed(0)}
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={buybackAmount}
                  onChange={(e) => setBuybackAmount(e.target.value)}
                  placeholder="Amount"
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
                <strong>Scoring:</strong> Distributions are penalized if ROIIC is high (should reinvest) or if leverage is high (should deleverage first). Follow the hierarchy: reinvest → deleverage → buyback → distribute.
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
