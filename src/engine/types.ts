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
  | 'education';

export type SectorFocusGroup =
  | 'agency'
  | 'saas'
  | 'homeServices'
  | 'consumer'
  | 'industrial'
  | 'b2bServices'
  | 'healthcare'
  | 'restaurant'
  | 'realEstate'
  | 'education';

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
}

export type BusinessStatus = 'active' | 'sold' | 'wound_down' | 'integrated';

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
  organicGrowthRate: number;
  qualityRating: QualityRating;
  dueDiligence: DueDiligenceSignals;
  integrationRoundsRemaining: number;
  improvements: OperationalImprovement[];
  sellerNoteBalance: number;
  sellerNoteRate: number;
  sellerNoteRoundsRemaining: number;
  bankDebtBalance: number;
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
  | 'fix_underperformance';

export interface OperationalImprovement {
  type: OperationalImprovementType;
  appliedRound: number;
  effect: number;
}

// Acquisition types for M&A strategy
export type AcquisitionType = 'standalone' | 'tuck_in' | 'platform';

// Integration outcomes for post-acquisition performance
export type IntegrationOutcome = 'success' | 'partial' | 'failure';

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
  source: 'inbound' | 'brokered' | 'sourced';
  acquisitionType: AcquisitionType; // standalone, tuck-in, or platform opportunity
  tuckInDiscount?: number; // discount % if this is a tuck-in (0.1 = 10% off)
  aiContent?: AIGeneratedContent; // Rich AI-generated content (optional)
}

export type DealStructureType = 'all_cash' | 'seller_note' | 'bank_debt' | 'earnout' | 'seller_note_bank_debt';

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

export interface SectorFocusBonus {
  focusGroup: SectorFocusGroup;
  tier: SectorFocusTier;
  opcoCount: number;
}

export type DistressLevel = 'comfortable' | 'elevated' | 'stressed' | 'breach';

export type GamePhase = 'collect' | 'event' | 'allocate' | 'restructure';

export type DealSizePreference = 'small' | 'medium' | 'large' | 'any';

export interface MAFocus {
  sectorId: SectorId | null; // null = any sector
  sizePreference: DealSizePreference;
}

export type EventType =
  | 'global_bull_market'
  | 'global_recession'
  | 'global_interest_hike'
  | 'global_interest_cut'
  | 'global_inflation'
  | 'global_credit_tightening'
  | 'global_quiet'
  | 'portfolio_star_joins'
  | 'portfolio_talent_leaves'
  | 'portfolio_client_signs'
  | 'portfolio_client_churns'
  | 'portfolio_breakthrough'
  | 'portfolio_compliance'
  | 'unsolicited_offer'
  | 'sector_event';

// Tracks the actual impact of an event for display
export interface EventImpact {
  businessId?: string;
  businessName?: string;
  metric: 'ebitda' | 'interestRate' | 'cash' | 'growthRate';
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

  // Shared Services
  sharedServices: SharedService[];

  // Deal Pipeline
  dealPipeline: Deal[];
  maFocus: MAFocus; // M&A sector and size focus

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

  // Holdco debt amortization
  holdcoDebtStartRound: number; // round when first holdco bank debt was taken (0 = never)
  holdcoAmortizationThisRound?: number; // amount of mandatory amortization paid this round

  // Financial distress
  requiresRestructuring: boolean;
  covenantBreachRounds: number; // consecutive rounds in breach
  hasRestructured: boolean; // one-time flag — second insolvency = game over
  bankruptRound?: number; // if set, game ended via bankruptcy
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
  | 'wind_down'
  | 'accept_offer'
  | 'decline_offer'
  | 'source_deals'; // Hire investment banker for additional deal flow

export interface GameAction {
  type: GameActionType;
  round: number;
  details: Record<string, unknown>;
}

export interface ScoreBreakdown {
  fcfShareGrowth: number; // max 25
  portfolioRoic: number; // max 20
  capitalDeployment: number; // max 20
  balanceSheetHealth: number; // max 15
  strategicDiscipline: number; // max 20
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
}

// Utility types
export type Range = [number, number];

export function randomInRange(range: Range): number {
  return range[0] + Math.random() * (range[1] - range[0]);
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pickRandom<T>(array: T[]): T {
  if (array.length === 0) return undefined as T;
  return array[Math.floor(Math.random() * array.length)];
}

// All internal values are stored in thousands (e.g., 1000 = $1M, 16000 = $16M)
export function formatMoney(amountInThousands: number): string {
  const amount = amountInThousands * 1000; // Convert to actual dollars
  if (Math.abs(amount) >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(amount) >= 1000) {
    return `$${(amount / 1000).toFixed(0)}k`;
  }
  return `$${amount.toFixed(0)}`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatMultiple(value: number): string {
  return `${value.toFixed(1)}x`;
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
  deRiskingPremium: number;
  buyerPoolTier: BuyerPoolTier;
  totalMultiple: number;
  exitPrice: number;
  netProceeds: number; // after debt payoff
  ebitdaGrowth: number;
  yearsHeld: number;
  buyerProfile?: BuyerProfile;
  commentary?: ValuationCommentary;
}
