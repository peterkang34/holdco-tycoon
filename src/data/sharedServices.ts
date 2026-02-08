import { SharedService, SharedServiceType } from '../engine/types';

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
