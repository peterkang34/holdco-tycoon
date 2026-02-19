import { SharedService, SharedServiceType, MASourcingTier } from '../engine/types';

// All costs in thousands (750 = $750k, 320 = $320k annual)
export const SHARED_SERVICES_CONFIG: Record<SharedServiceType, Omit<SharedService, 'unlockedRound' | 'active'>> = {
  finance_reporting: {
    type: 'finance_reporting',
    name: 'Finance & Reporting',
    unlockCost: 660,
    annualCost: 295,
    description: 'Centralized financial reporting and controls',
    effect: 'Cash conversion +5% across portfolio; margin erosion slowed ~0.1 ppt/yr',
  },
  recruiting_hr: {
    type: 'recruiting_hr',
    name: 'Recruiting & HR',
    unlockCost: 885,
    annualCost: 378,
    description: 'Shared talent acquisition and retention programs',
    effect: 'Talent loss events 50% less likely; talent gain events 30% more likely; margin erosion slowed ~0.15 ppt/yr',
  },
  procurement: {
    type: 'procurement',
    name: 'Procurement',
    unlockCost: 710,
    annualCost: 224,
    description: 'Centralized purchasing and vendor management',
    effect: 'Capex rate reduced by 15% across portfolio; margin erosion slowed ~0.25 ppt/yr',
  },
  marketing_brand: {
    type: 'marketing_brand',
    name: 'Marketing & Brand',
    unlockCost: 800,
    annualCost: 295,
    description: 'Shared marketing resources and brand development',
    effect: 'Organic growth rate +1.5% for all opcos; agencies and consumer brands get +2.5%',
  },
  technology_systems: {
    type: 'technology_systems',
    name: 'Technology & Systems',
    unlockCost: 1060,
    annualCost: 450,
    description: 'Shared IT infrastructure and operational systems',
    effect: 'Organic growth +0.5% and margin erosion slowed by ~0.2 ppt/yr across portfolio',
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
    description: 'Extra acquisition capacity and dedicated deal sourcing',
    effects: [
      '+2 focus-sector deals per round',
      'Source Deals costs $300k (was $500k)',
      'Focus deals last 3 rounds (was 2)',
      'Acquisition capacity: 3/year (was 2)',
    ],
  },
  2: {
    name: 'Industry Specialists',
    upgradeCost: 1200,
    annualCost: 550,
    requiredOpcos: 3,
    description: 'More acquisition capacity and sector-specific deal targeting',
    effects: [
      'Sub-type targeting unlocked',
      '1-2 sub-type matched deals per round',
      'Quality floor of 2 on sourced deals',
      'Acquisition capacity: 4/year (was 3)',
    ],
  },
  3: {
    name: 'Proprietary Network',
    upgradeCost: 1500,
    annualCost: 800,
    requiredOpcos: 4,
    description: 'Off-market deal access, proactive outreach, and max acquisition capacity',
    effects: [
      '2 off-market deals per round (15% discount)',
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
