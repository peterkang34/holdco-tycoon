import { SharedService, SharedServiceType, MASourcingTier } from '../engine/types';

// All costs in thousands (750 = $750k, 320 = $320k annual)
export const SHARED_SERVICES_CONFIG: Record<SharedServiceType, Omit<SharedService, 'unlockedRound' | 'active'>> = {
  finance_reporting: {
    type: 'finance_reporting',
    name: 'Finance & Reporting',
    unlockCost: 560,
    annualCost: 250,
    description: 'Centralized financial reporting and controls',
    effect: 'Cash conversion +5% across portfolio; better visibility into opco metrics',
  },
  recruiting_hr: {
    type: 'recruiting_hr',
    name: 'Recruiting & HR',
    unlockCost: 750,
    annualCost: 320,
    description: 'Shared talent acquisition and retention programs',
    effect: 'Talent loss events 50% less likely; talent gain events 30% more likely',
  },
  procurement: {
    type: 'procurement',
    name: 'Procurement',
    unlockCost: 600,
    annualCost: 190,
    description: 'Centralized purchasing and vendor management',
    effect: 'Capex rate reduced by 15% across portfolio (bulk purchasing power)',
  },
  marketing_brand: {
    type: 'marketing_brand',
    name: 'Marketing & Brand',
    unlockCost: 675,
    annualCost: 250,
    description: 'Shared marketing resources and brand development',
    effect: 'Organic growth rate +1.5% for all opcos; agencies and consumer brands get +2.5%',
  },
  technology_systems: {
    type: 'technology_systems',
    name: 'Technology & Systems',
    unlockCost: 900,
    annualCost: 380,
    description: 'Shared IT infrastructure and operational systems',
    effect: 'Reinvestment efficiency +20% for all opcos; SaaS and B2B services get +30%',
  },
};

export function createSharedService(type: SharedServiceType): SharedService {
  const config = SHARED_SERVICES_CONFIG[type];
  return {
    ...config,
    active: false,
  };
}

export function initializeSharedServices(): SharedService[] {
  return Object.keys(SHARED_SERVICES_CONFIG).map(type =>
    createSharedService(type as SharedServiceType)
  );
}

export const MIN_OPCOS_FOR_SHARED_SERVICES = 3;
export const MAX_ACTIVE_SHARED_SERVICES = 3;

// M&A Sourcing Capability — separate from operational shared services
export interface MASourcingTierConfig {
  name: string;
  upgradeCost: number; // one-time cost to reach this tier (in $k)
  annualCost: number; // recurring annual cost (in $k)
  requiredOpcos: number;
  description: string;
  effects: string[];
}

export const MA_SOURCING_CONFIG: Record<1 | 2 | 3, MASourcingTierConfig> = {
  1: {
    name: 'Deal Sourcing Team',
    upgradeCost: 800,
    annualCost: 350,
    requiredOpcos: 2,
    description: 'A dedicated team to source proprietary deal flow',
    effects: [
      '+2 focus-sector deals per round',
      'Source Deals costs $300k (was $500k)',
      'Focus deals last 3 rounds (was 2)',
    ],
  },
  2: {
    name: 'Industry Specialists',
    upgradeCost: 1200,
    annualCost: 550,
    requiredOpcos: 3,
    description: 'Sector-specific deal sourcing with sub-type targeting',
    effects: [
      'Sub-type targeting unlocked',
      '1-2 sub-type matched deals per round',
      'Quality floor of 2 on sourced deals',
    ],
  },
  3: {
    name: 'Proprietary Network',
    upgradeCost: 1500,
    annualCost: 800,
    requiredOpcos: 4,
    description: 'Off-market deal access and proactive outreach',
    effects: [
      '1 off-market deal per round (15% discount)',
      '2-3 sub-type matched deals per round',
      'Quality floor of 3 on sourced deals',
      'Proactive Outreach: $400k for 2 targeted deals',
    ],
  },
};

export function getMASourcingUpgradeCost(currentTier: MASourcingTier): number {
  const nextTier = (currentTier + 1) as 1 | 2 | 3;
  if (nextTier > 3) return 0;
  return MA_SOURCING_CONFIG[nextTier].upgradeCost;
}

export function getMASourcingAnnualCost(tier: MASourcingTier): number {
  if (tier === 0) return 0;
  return MA_SOURCING_CONFIG[tier as 1 | 2 | 3].annualCost;
}
