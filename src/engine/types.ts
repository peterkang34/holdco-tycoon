// Core game types for Holdco Tycoon

export type SectorId =
  | 'agency'
  | 'saas'
  | 'homeServices'
  | 'consumer'
  | 'industrial'
  | 'b2bServices'
  | 'healthcare'
  | 'restaurant'
  | 'realEstate'
  | 'education'
  | 'insurance'
  | 'autoServices'
  | 'distribution'
  | 'wealthManagement'
  | 'environmental';

export type SectorFocusGroup = SectorId;

export type GameDifficulty = 'easy' | 'normal';
export type GameDuration = 'standard' | 'quick';  // 20 or 10 rounds

export type ConcentrationLevel = 'low' | 'medium' | 'high';

export type BuyerPoolTier = 'individual' | 'small_pe' | 'lower_middle_pe' | 'institutional_pe' | 'large_pe';
export type BuyerType = 'individual' | 'family_office' | 'small_pe' | 'lower_middle_pe' | 'institutional_pe' | 'large_pe' | 'strategic';

export interface BuyerProfile {
  name: string;
  type: BuyerType;
  fundSize?: string;
  investmentThesis: string;
  isStrategic: boolean;
  strategicPremium: number;
}

export interface ValuationCommentary {
  summary: string;
  factors: string[];
  buyerPoolDescription: string;
}

export interface SectorDefinition {
  id: SectorId;
  name: string;
  emoji: string;
  color: string;
  baseEbitda: [number, number]; // [min, max] in $k
  acquisitionMultiple: [number, number]; // [min, max]
  volatility: number; // 0-0.25
  capexRate: number; // % of EBITDA
  organicGrowthRange: [number, number]; // annual [min, max]
  reinvestmentEfficiency: number; // 0.5-1.5x
  clientConcentration: ConcentrationLevel;
  talentDependency: ConcentrationLevel;
  recessionSensitivity: number; // multiplier
  sharedServicesBenefit: number; // 0.5-1.5x
  sectorFocusGroup: SectorFocusGroup[];
  subTypes: string[];
  subTypeGroups: number[]; // Parallel to subTypes — same group number = operationally related
  baseRevenue: [number, number];        // [min, max] in $k
  baseMargin: [number, number];         // [min, max] as decimals (0.12 = 12%)
  marginDriftRange: [number, number];   // annual drift in ppt (negative = compression)
  marginVolatility: number;             // 0-0.05 — random annual margin noise
  subTypeMarginModifiers?: number[];   // parallel to subTypes, ppt offset at generation
  subTypeGrowthModifiers?: number[];   // parallel to subTypes, ppt offset at generation
}

// How closely related two sub-types are within a sector
export type SubTypeAffinity = 'match' | 'related' | 'distant';

export type DealHeat = 'cold' | 'warm' | 'hot' | 'contested';

export type BusinessStatus = 'active' | 'sold' | 'wound_down' | 'integrated' | 'merged'; // wound_down kept for save compat

export type QualityRating = 1 | 2 | 3 | 4 | 5;

export interface DueDiligenceSignals {
  revenueConcentration: 'low' | 'medium' | 'high';
  revenueConcentrationText: string;
  operatorQuality: 'strong' | 'moderate' | 'weak';
  operatorQualityText: string;
  trend: 'growing' | 'flat' | 'declining';
  trendText: string;
  customerRetention: number; // 0-100%
  customerRetentionText: string;
  competitivePosition: 'leader' | 'competitive' | 'commoditized';
  competitivePositionText: string;
}

export interface Business {
  id: string;
  name: string;
  sectorId: SectorId;
  subType: string;
  ebitda: number; // annual in $k
  peakEbitda: number; // highest EBITDA achieved
  acquisitionEbitda: number; // EBITDA at acquisition
  acquisitionPrice: number;
  acquisitionRound: number;
  acquisitionMultiple: number;
  acquisitionSizeTierPremium: number; // size-tier premium at time of acquisition (nets out day-1 paper gains)
  organicGrowthRate: number;
  revenue: number;              // annual revenue in $k
  ebitdaMargin: number;         // 0-1 (e.g. 0.22 = 22%)
  acquisitionRevenue: number;   // revenue at time of acquisition
  acquisitionMargin: number;    // margin at time of acquisition
  peakRevenue: number;          // highest revenue achieved
  revenueGrowthRate: number;    // annual revenue growth rate
  marginDriftRate: number;      // annual margin drift (negative = compression)
  qualityRating: QualityRating;
  dueDiligence: DueDiligenceSignals;
  integrationRoundsRemaining: number;
  improvements: OperationalImprovement[];
  sellerNoteBalance: number;
  sellerNoteRate: number;
  sellerNoteRoundsRemaining: number;
  bankDebtBalance: number;
  bankDebtRate: number;
  bankDebtRoundsRemaining: number;
  earnoutRemaining: number;
  earnoutTarget: number;
  status: BusinessStatus;
  exitPrice?: number;
  exitRound?: number;

  // Platform/Roll-up mechanics
  isPlatform: boolean; // Is this a platform company that can receive bolt-ons?
  platformScale: number; // 1-3: 1=small platform, 3=large platform (affects multiple expansion)
  boltOnIds: string[]; // IDs of businesses that have been tucked into this platform
  parentPlatformId?: string; // If this was a tuck-in, the ID of the platform it was merged into
  integrationOutcome?: IntegrationOutcome; // How well the integration went
  synergiesRealized: number; // EBITDA boost from successful integration (in $k)
  totalAcquisitionCost: number; // Sum of this business + all bolt-ons acquired

  // Merger tracking
  wasMerged?: boolean; // Was this entity created from a merger?
  mergerBalanceRatio?: number; // larger/smaller EBITDA at merge time

  integratedPlatformId?: string; // ID of the integrated platform this business belongs to

  qualityImprovedTiers?: number; // tracks total quality improvement for exit premium
  rolloverEquityPct: number; // 0-1 — seller's retained equity share (0 = no rollover)

  // Event-driven tracking
  successionPlanRound?: number;   // Key-Man succession plan countdown start
  earnoutDisputeRound?: number;   // Cooldown: last earn-out dispute round

  // Dynamic narratives
  storyBeats?: StoryBeat[]; // Narrative events that happened to this business
}

export interface StoryBeat {
  round: number;
  narrative: string;
  type: 'milestone' | 'challenge' | 'opportunity' | 'update';
}

export type OperationalImprovementType =
  | 'operating_playbook'
  | 'pricing_model'
  | 'service_expansion'
  | 'fix_underperformance'
  | 'recurring_revenue_conversion'
  | 'management_professionalization'
  | 'digital_transformation';

export interface OperationalImprovement {
  type: OperationalImprovementType;
  appliedRound: number;
  effect: number;
}

// Acquisition types for M&A strategy
export type AcquisitionType = 'standalone' | 'tuck_in' | 'platform';

// Integration outcomes for post-acquisition performance
export type IntegrationOutcome = 'success' | 'partial' | 'failure';

// Size ratio tier for bolt-on acquisitions (bolt-on EBITDA / platform EBITDA)
export type SizeRatioTier = 'ideal' | 'stretch' | 'strained' | 'overreach';

// AI-generated rich content for deals
export interface AIGeneratedContent {
  backstory: string; // Company history and founding story
  sellerMotivation: string; // Why the owner is selling
  quirks: string[]; // Unique/interesting details about the business
  redFlags?: string[]; // Hidden concerns (revealed through due diligence)
  opportunities?: string[]; // Upside potential
}

export interface Deal {
  id: string;
  business: Omit<Business, 'id' | 'acquisitionRound' | 'improvements' | 'status'>;
  askingPrice: number;
  freshness: number; // rounds remaining before deal expires (1-3)
  roundAppeared: number;
  source: 'inbound' | 'brokered' | 'sourced' | 'proprietary';
  acquisitionType: AcquisitionType; // standalone, tuck-in, or platform opportunity
  tuckInDiscount?: number; // discount % if this is a tuck-in (0.1 = 10% off)
  aiContent?: AIGeneratedContent; // Rich AI-generated content (optional)
  heat: DealHeat; // Competitive heat level
  effectivePrice: number; // askingPrice * heat premium
  sellerArchetype?: SellerArchetype; // Seller motivation archetype
}

export type SellerArchetype = 'retiring_founder' | 'burnt_out_operator' | 'accidental_holdco'
  | 'distressed_seller' | 'mbo_candidate' | 'franchise_breakaway';

export type DealStructureType = 'all_cash' | 'seller_note' | 'bank_debt' | 'earnout' | 'seller_note_bank_debt' | 'rollover_equity';

export interface DealStructure {
  type: DealStructureType;
  cashRequired: number;
  sellerNote?: {
    amount: number;
    rate: number;
    termRounds: number; // in years
  };
  bankDebt?: {
    amount: number;
    rate: number;
    termRounds: number; // in years
  };
  earnout?: {
    amount: number;
    targetEbitdaGrowth: number;
  };
  rolloverEquityPct?: number;
  leverage: number;
  risk: 'low' | 'medium' | 'high';
}

export type SharedServiceType =
  | 'finance_reporting'
  | 'recruiting_hr'
  | 'procurement'
  | 'marketing_brand'
  | 'technology_systems';

export interface SharedService {
  type: SharedServiceType;
  name: string;
  unlockCost: number;
  annualCost: number;
  description: string;
  effect: string;
  unlockedRound?: number;
  active: boolean;
}

export type SectorFocusTier = 0 | 1 | 2 | 3;

export type TurnaroundTier = 0 | 1 | 2 | 3;

export interface TurnaroundProgram {
  id: string;
  displayName: string;
  tierId: 1 | 2 | 3;
  sourceQuality: QualityRating;
  targetQuality: QualityRating;
  durationStandard: number; // rounds in standard (20yr) mode
  durationQuick: number;    // rounds in quick (10yr) mode
  successRate: number;      // 0-1
  partialRate: number;      // 0-1
  failureRate: number;      // 0-1
  ebitdaBoostOnSuccess: number;   // fraction, e.g. 0.07 = +7%
  ebitdaBoostOnPartial: number;
  ebitdaDamageOnFailure: number;  // positive number, applied as negative
  upfrontCostFraction: number;    // fraction of EBITDA, e.g. 0.10 = 10%
  annualCost: number;             // in $k
}

export type TurnaroundStatus = 'active' | 'completed' | 'partial' | 'failed';

export interface ActiveTurnaround {
  id: string;
  businessId: string;
  programId: string;
  startRound: number;
  endRound: number;
  status: TurnaroundStatus;
}

export interface SectorFocusBonus {
  focusGroup: SectorFocusGroup;
  tier: SectorFocusTier;
  opcoCount: number;
}

export type MASourcingTier = 0 | 1 | 2 | 3;

export interface MASourcingState {
  tier: MASourcingTier;
  active: boolean;
  unlockedRound: number; // 0 = never unlocked
  lastUpgradeRound: number; // 0 = never upgraded
}

export type DistressLevel = 'comfortable' | 'elevated' | 'stressed' | 'breach';

export type GamePhase = 'collect' | 'event' | 'allocate' | 'restructure';

export type DealSizePreference = 'small' | 'medium' | 'large' | 'any';

export interface MAFocus {
  sectorId: SectorId | null; // null = any sector
  sizePreference: DealSizePreference;
  subType: string | null; // null = any sub-type (requires MA Sourcing Tier 2+)
}

export type EventType =
  | 'global_bull_market'
  | 'global_recession'
  | 'global_interest_hike'
  | 'global_interest_cut'
  | 'global_inflation'
  | 'global_credit_tightening'
  | 'global_financial_crisis'
  | 'global_quiet'
  | 'portfolio_star_joins'
  | 'portfolio_talent_leaves'
  | 'portfolio_client_signs'
  | 'portfolio_client_churns'
  | 'portfolio_breakthrough'
  | 'portfolio_compliance'
  | 'portfolio_referral_deal'
  | 'portfolio_equity_demand'
  | 'portfolio_seller_note_renego'
  | 'mbo_proposal'
  | 'unsolicited_offer'
  | 'sector_event'
  | 'portfolio_key_man_risk'
  | 'portfolio_earnout_dispute'
  | 'portfolio_supplier_shift'
  | 'sector_consolidation_boom';

export interface EventChoice {
  label: string;
  description: string;
  action: string;
  variant: 'positive' | 'negative' | 'neutral';
  cost?: number; // pre-computed cost in $K for store actions to consume (avoids parsing from label)
}

// Tracks the actual impact of an event for display
export interface EventImpact {
  businessId?: string;
  businessName?: string;
  metric: 'ebitda' | 'revenue' | 'margin' | 'interestRate' | 'cash' | 'growthRate' | 'bankDebtRate';
  before: number;
  after: number;
  delta: number;
  deltaPercent?: number;
}

export interface GameEvent {
  id: string;
  type: EventType;
  title: string;
  description: string;
  effect: string;
  tip?: string;
  tipSource?: string;
  affectedBusinessId?: string;
  offerAmount?: number; // for unsolicited offers
  offerMultiple?: number; // for unsolicited offers
  impacts?: EventImpact[]; // actual measured impacts from the event
  narrative?: string; // AI-generated narrative context
  buyerProfile?: BuyerProfile; // buyer profile for unsolicited offers
  choices?: EventChoice[]; // player choices (e.g., accept/decline for offers, equity demands, etc.)
  consolidationSectorId?: SectorId; // which sector the boom targets
}

export interface Metrics {
  cash: number;
  totalDebt: number;
  totalEbitda: number;
  totalFcf: number;
  fcfPerShare: number;
  portfolioRoic: number;
  roiic: number;
  portfolioMoic: number;
  netDebtToEbitda: number;
  distressLevel: DistressLevel;
  cashConversion: number;
  interestRate: number;
  sharesOutstanding: number;
  intrinsicValuePerShare: number;
  totalInvestedCapital: number;
  totalDistributions: number;
  totalBuybacks: number;
  totalExitProceeds: number;
  totalRevenue: number;         // sum of active business revenue
  avgEbitdaMargin: number;      // weighted avg: totalEbitda / totalRevenue
}

export interface HistoricalMetrics {
  round: number;
  metrics: Metrics;
  fcf: number;
  nopat: number;
  investedCapital: number;
}

export interface RoundHistoryEntry {
  round: number;
  actions: GameAction[];
  chronicle: string | null;
  event: { type: EventType; title: string; description: string } | null;
  metrics: Metrics;
  businessCount: number;
  cash: number;
  totalDebt: number;
}

export interface GameState {
  // Meta
  holdcoName: string;
  round: number;
  phase: GamePhase;
  gameOver: boolean;
  difficulty: GameDifficulty;
  duration: GameDuration;
  maxRounds: number; // 20 or 10

  // Portfolio
  businesses: Business[];
  exitedBusinesses: Business[];

  // Financials
  cash: number;
  totalDebt: number; // holdco-level debt
  interestRate: number;
  sharesOutstanding: number;

  // Cap Table
  founderShares: number; // shares owned by founder (you)
  initialRaiseAmount: number; // how much was raised initially
  initialOwnershipPct: number; // ownership % after initial raise (e.g., 0.80 = 80%)

  // Tracking
  totalInvestedCapital: number;
  totalDistributions: number;
  totalBuybacks: number;
  totalExitProceeds: number;
  equityRaisesUsed: number;
  lastEquityRaiseRound: number; // 0 = never raised; cooldown sentinel
  lastBuybackRound: number;     // 0 = never bought back; cooldown sentinel

  // Shared Services
  sharedServices: SharedService[];

  // Deal Pipeline
  dealPipeline: Deal[];
  maFocus: MAFocus; // M&A sector and size focus
  maSourcing: MASourcingState; // M&A Sourcing capability tier

  // Integrated Platforms
  integratedPlatforms: IntegratedPlatform[];

  // Turnarounds
  turnaroundTier: TurnaroundTier;
  activeTurnarounds: ActiveTurnaround[];

  // Events
  currentEvent: GameEvent | null;
  eventHistory: GameEvent[];
  creditTighteningRoundsRemaining: number;
  inflationRoundsRemaining: number;

  // History
  metricsHistory: HistoricalMetrics[];
  roundHistory: RoundHistoryEntry[];

  // Scoring
  actionsThisRound: GameAction[];

  // Debt payment tracking (between years)
  debtPaymentThisRound?: number;
  cashBeforeDebtPayments?: number;

  // Holdco loan (replaces old pool-based holdco debt)
  holdcoLoanBalance: number;          // remaining holdco loan principal
  holdcoLoanRate: number;             // interest rate on holdco loan
  holdcoLoanRoundsRemaining: number;  // amortization years remaining

  // Legacy holdco debt fields (kept for migration compatibility)
  holdcoDebtStartRound: number; // round when first holdco bank debt was taken (0 = never)
  holdcoAmortizationThisRound?: number; // amount of mandatory amortization paid this round

  // Financial distress
  requiresRestructuring: boolean;
  covenantBreachRounds: number; // consecutive rounds in breach
  hasRestructured: boolean; // one-time flag — second insolvency = game over
  bankruptRound?: number; // if set, game ended via bankruptcy

  // Exit multiple penalty (Financial Crisis)
  exitMultiplePenalty: number;

  // Consolidation boom — set by event, consumed by deal generation
  consolidationBoomSectorId?: SectorId;

  // Deal heat / acquisition limits
  acquisitionsThisRound: number;
  maxAcquisitionsPerRound: number;
  lastAcquisitionResult: 'success' | 'snatched' | null;
  lastIntegrationOutcome: IntegrationOutcome | null;

  // Founder tracking
  founderDistributionsReceived: number; // cumulative founder's share of distributions
}

export type GameActionType =
  | 'acquire'
  | 'acquire_tuck_in' // Tuck-in acquisition into existing platform
  | 'merge_businesses' // Merge two owned businesses
  | 'designate_platform' // Designate a business as a platform
  | 'reinvest'
  | 'improve'
  | 'unlock_shared_service'
  | 'deactivate_shared_service'
  | 'pay_debt'
  | 'issue_equity'
  | 'buyback'
  | 'distribute'
  | 'sell'
  | 'accept_offer'
  | 'decline_offer'
  | 'source_deals' // Hire investment banker for additional deal flow
  | 'upgrade_ma_sourcing'
  | 'toggle_ma_sourcing'
  | 'proactive_outreach'
  | 'forge_integrated_platform'
  | 'add_to_integrated_platform'
  | 'sell_platform'
  | 'unlock_turnaround_tier'
  | 'start_turnaround'
  | 'turnaround_resolved';

export interface GameAction {
  type: GameActionType;
  round: number;
  details: Record<string, unknown>;
}

export interface ScoreBreakdown {
  valueCreation: number; // max 20
  fcfShareGrowth: number; // max 20
  portfolioRoic: number; // max 15
  capitalDeployment: number; // max 15
  balanceSheetHealth: number; // max 15
  strategicDiscipline: number; // max 15
  total: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  title: string;
}

export interface PostGameInsight {
  pattern: string;
  insight: string;
  bookReference?: string;
}

export interface LeaderboardEntry {
  id: string;
  holdcoName: string;
  initials: string;
  enterpriseValue: number;
  score: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  businessCount: number;
  date: string;
  // Optional enriched fields (global leaderboard)
  totalRevenue?: number;
  avgEbitdaMargin?: number;
  // Game mode fields
  difficulty?: GameDifficulty;
  duration?: GameDuration;
  founderEquityValue?: number;
  founderPersonalWealth?: number;
  hasRestructured?: boolean;
  submittedMultiplier?: number;
}

// Utility types
export type Range = [number, number];

export { randomInRange, randomInt, formatMoney, formatPercent, formatMultiple } from './utils';

export function pickRandom<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  return array[Math.floor(Math.random() * array.length)];
}

// Exit valuation breakdown for transparency
export interface ExitValuation {
  baseMultiple: number;
  growthPremium: number;
  qualityPremium: number;
  platformPremium: number;
  holdPremium: number;
  improvementsPremium: number;
  marketModifier: number;
  sizeTierPremium: number;
  acquisitionSizeTierPremium: number; // baseline premium at acquisition (netted out)
  mergerPremium: number; // exit premium for well-balanced mergers
  integratedPlatformPremium: number; // exit premium for being part of an integrated platform
  turnaroundPremium: number; // exit premium for businesses that improved 2+ quality tiers
  deRiskingPremium: number;
  ruleOf40Premium: number;
  marginExpansionPremium: number;
  buyerPoolTier: BuyerPoolTier;
  totalMultiple: number;
  exitPrice: number;
  netProceeds: number; // after debt payoff
  ebitdaGrowth: number;
  yearsHeld: number;
  buyerProfile?: BuyerProfile;
  commentary?: ValuationCommentary;
}

// ── Integrated Platform Mechanic ──

export interface PlatformBonuses {
  marginBoost: number;       // ppt added to EBITDA margin (e.g., 0.04 = +4ppt)
  growthBoost: number;       // added to revenue growth rate (e.g., 0.03 = +3%)
  multipleExpansion: number; // absolute multiple premium on exit (e.g., 1.5 = +1.5x)
  recessionResistanceReduction: number; // multiplied against recessionSensitivity (e.g., 0.8 = 20% less sensitive)
}

export interface PlatformRecipe {
  id: string;
  name: string;
  sectorId: SectorId | null;          // null = cross-sector
  crossSectorIds?: SectorId[];        // for cross-sector recipes
  requiredSubTypes: string[];         // sub-types that qualify
  minSubTypes: number;                // minimum distinct sub-types player must own
  baseEbitdaThreshold: number;        // in $k — scaled by difficulty/duration
  bonuses: PlatformBonuses;
  integrationCostFraction: number;    // fraction of combined EBITDA (e.g., 0.20 = 20%)
  description: string;
  realWorldExample?: string;
}

export interface IntegratedPlatform {
  id: string;
  recipeId: string;
  name: string;
  sectorIds: SectorId[];
  constituentBusinessIds: string[];
  forgedInRound: number;
  bonuses: PlatformBonuses;
}
