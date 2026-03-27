import { describe, it, expect } from 'vitest';
import {
  createBSStartingBusinesses,
  createBSRound1Deals,
  createBSRound2Deals,
  createInitialChecklist,
  createInitialBSState,
  markChecklistItem,
  isChecklistComplete,
  BS_STARTING_CASH,
  BS_MAX_ROUNDS,
  BS_CHECKLIST_INFO,
  isBSBlocked,
} from '../../data/businessSchool';

describe('Business School Config', () => {
  it('constants are correct', () => {
    expect(BS_STARTING_CASH).toBe(6000);
    expect(BS_MAX_ROUNDS).toBe(2);
  });

  it('checklist info has 15 items', () => {
    expect(BS_CHECKLIST_INFO).toHaveLength(15);
    expect(BS_CHECKLIST_INFO.filter(i => i.year === 1)).toHaveLength(8);
    expect(BS_CHECKLIST_INFO.filter(i => i.year === 2)).toHaveLength(7);
  });

  it('each checklist item has title and subtitle', () => {
    for (const item of BS_CHECKLIST_INFO) {
      expect(item.title).toBeTruthy();
      expect(item.subtitle).toBeTruthy();
    }
  });
});

describe('Starting Businesses', () => {
  it('creates 3 businesses with correct sectors', () => {
    const businesses = createBSStartingBusinesses();
    expect(businesses).toHaveLength(3);

    const sectors = businesses.map(b => b.sectorId);
    expect(sectors).toContain('b2bServices');
    expect(sectors.filter(s => s === 'homeServices')).toHaveLength(2);
  });

  it('businesses have correct sub-types for platform recipe', () => {
    const businesses = createBSStartingBusinesses();
    const homeServicesSubs = businesses
      .filter(b => b.sectorId === 'homeServices')
      .map(b => b.subType);
    expect(homeServicesSubs).toContain('Plumbing Services');
    expect(homeServicesSubs).toContain('Electrical Services');
  });

  it('all businesses are Q3, active, round 0, no debt', () => {
    const businesses = createBSStartingBusinesses();
    for (const b of businesses) {
      expect(b.qualityRating).toBe(3);
      expect(b.status).toBe('active');
      expect(b.acquisitionRound).toBe(0);
      expect(b.sellerNoteBalance).toBe(0);
      expect(b.bankDebtBalance).toBe(0);
    }
  });

  it('total starting EBITDA is $3M', () => {
    const businesses = createBSStartingBusinesses();
    const totalEbitda = businesses.reduce((s, b) => s + b.ebitda, 0);
    expect(totalEbitda).toBe(3000); // 1000 + 1200 + 800
  });

  it('sell candidate (B2B) has correct EBITDA and multiple', () => {
    const businesses = createBSStartingBusinesses();
    const staffing = businesses.find(b => b.sectorId === 'b2bServices')!;
    expect(staffing.ebitda).toBe(1000);
    expect(staffing.acquisitionMultiple).toBe(4.0);
    expect(staffing.acquisitionPrice).toBe(4000);
  });
});

describe('Curated Deals', () => {
  it('Round 1 has 4 deals', () => {
    const deals = createBSRound1Deals();
    expect(deals).toHaveLength(4);
  });

  it('Round 2 has 3 deals', () => {
    const deals = createBSRound2Deals();
    expect(deals).toHaveLength(3);
  });

  it('R1 includes 2 HVAC deals for acquisitions', () => {
    const deals = createBSRound1Deals();
    const hvacDeals = deals.filter(d => d.business.subType === 'HVAC Services');
    expect(hvacDeals).toHaveLength(2);
    // Both should be cold/affordable
    for (const d of hvacDeals) {
      expect(d.heat).toBe('cold');
      expect(d.business.sectorId).toBe('homeServices');
    }
  });

  it('R1 includes an overpriced SaaS trap', () => {
    const deals = createBSRound1Deals();
    const saas = deals.find(d => d.business.sectorId === 'saas');
    expect(saas).toBeDefined();
    expect(saas!.heat).toBe('hot');
    expect(saas!.askingPrice).toBeGreaterThan(8000); // Very expensive
  });

  it('R2 includes a premium HVAC for LBO', () => {
    const deals = createBSRound2Deals();
    const hvac = deals.find(d => d.business.subType === 'HVAC Services');
    expect(hvac).toBeDefined();
    expect(hvac!.business.ebitda).toBe(1500);
    expect(hvac!.heat).toBe('cold');
  });

  it('R2 includes a weak restaurant pass', () => {
    const deals = createBSRound2Deals();
    const restaurant = deals.find(d => d.business.sectorId === 'restaurant');
    expect(restaurant).toBeDefined();
    expect(restaurant!.business.qualityRating).toBe(2);
  });

  it('all deals have required fields', () => {
    const allDeals = [...createBSRound1Deals(), ...createBSRound2Deals()];
    for (const deal of allDeals) {
      expect(deal.id).toBeTruthy();
      expect(deal.business.name).toBeTruthy();
      expect(deal.askingPrice).toBeGreaterThan(0);
      expect(deal.effectivePrice).toBeGreaterThan(0);
      expect(deal.freshness).toBe(3);
      expect(['cold', 'warm', 'hot', 'contested']).toContain(deal.heat);
    }
  });
});

describe('Checklist', () => {
  it('initial checklist has all 15 items false', () => {
    const checklist = createInitialChecklist();
    expect(checklist.completedCount).toBe(0);
    expect(Object.values(checklist.items).every(v => v === false)).toBe(true);
    expect(Object.keys(checklist.items)).toHaveLength(15);
  });

  it('markChecklistItem marks an item and increments count', () => {
    const r1Deals = createBSRound1Deals();
    const r2Deals = createBSRound2Deals();
    const state = createInitialBSState(r1Deals, r2Deals);

    const updated = markChecklistItem(state, 'bs_collect_1');
    expect(updated).not.toBeNull();
    expect(updated!.checklist.items.bs_collect_1).toBe(true);
    expect(updated!.checklist.completedCount).toBe(1);
  });

  it('markChecklistItem returns null for already-completed item', () => {
    const r1Deals = createBSRound1Deals();
    const r2Deals = createBSRound2Deals();
    const state = createInitialBSState(r1Deals, r2Deals);

    const updated1 = markChecklistItem(state, 'bs_collect_1')!;
    const updated2 = markChecklistItem(updated1, 'bs_collect_1');
    expect(updated2).toBeNull();
  });

  it('isChecklistComplete returns true when all 15 items done', () => {
    const checklist = createInitialChecklist();
    expect(isChecklistComplete(checklist)).toBe(false);

    // Mark all items
    const allItems = Object.keys(checklist.items) as Array<keyof typeof checklist.items>;
    const completed = {
      items: Object.fromEntries(allItems.map(k => [k, true])) as typeof checklist.items,
      completedCount: 15,
    };
    expect(isChecklistComplete(completed)).toBe(true);
  });
});

describe('Feature Gating', () => {
  it('blocks tuck-ins, mergers, turnarounds, IPO, buybacks', () => {
    expect(isBSBlocked('acquire_tuck_in')).toBe(true);
    expect(isBSBlocked('merge_businesses')).toBe(true);
    expect(isBSBlocked('unlock_turnaround_tier')).toBe(true);
    expect(isBSBlocked('ipo')).toBe(true);
    expect(isBSBlocked('buyback')).toBe(true);
  });

  it('allows core actions including M&A sourcing, shared services, distribute, sell_platform', () => {
    expect(isBSBlocked('acquire')).toBe(false);
    expect(isBSBlocked('improve')).toBe(false);
    expect(isBSBlocked('sell')).toBe(false);
    expect(isBSBlocked('issue_equity')).toBe(false);
    expect(isBSBlocked('forge_integrated_platform')).toBe(false);
    expect(isBSBlocked('distribute')).toBe(false);
    expect(isBSBlocked('sell_platform')).toBe(false);
    expect(isBSBlocked('upgrade_ma_sourcing')).toBe(false);
    expect(isBSBlocked('unlock_shared_service')).toBe(false);
  });
});

describe('Economy Sanity Checks', () => {
  it('starting cash + portfolio value gives reasonable starting FEV', () => {
    const businesses = createBSStartingBusinesses();
    const portfolioEV = businesses.reduce((s, b) => s + b.ebitda * b.acquisitionMultiple, 0);
    const startingFEV = BS_STARTING_CASH + portfolioEV; // 100% ownership, no debt
    // Should be around $16-17K ($16,600 per spec)
    expect(startingFEV).toBeGreaterThan(15000);
    expect(startingFEV).toBeLessThan(18000);
  });

  it('R1 HVAC deals are affordable with starting cash + FCF', () => {
    const deals = createBSRound1Deals();
    const hvacDeals = deals.filter(d => d.business.subType === 'HVAC Services');
    // After R1 collect (~$1.9M FCF) + starting cash ($6M) - improve ($0.2M) + sell ($4M) = ~$11.7M
    // Each HVAC deal costs 40-50% cash = $1.4-2.5M. Should be affordable.
    for (const d of hvacDeals) {
      const sellerNoteCash = Math.round(d.effectivePrice * 0.40);
      expect(sellerNoteCash).toBeLessThan(8000); // Affordable
    }
  });

  it('R2 LBO deal is affordable after equity raise', () => {
    const deals = createBSRound2Deals();
    const lboDeal = deals.find(d => d.business.subType === 'HVAC Services')!;
    // LBO = 25% cash. Player should have ~$3.6K cash + $2M equity = $5.6K
    const lboCash = Math.round(lboDeal.effectivePrice * 0.25);
    expect(lboCash).toBeLessThan(5000); // Affordable with equity raise
  });

  it('home services EBITDA clears platform threshold after R2 LBO', () => {
    const startBiz = createBSStartingBusinesses();
    const r1Deals = createBSRound1Deals();
    const r2Deals = createBSRound2Deals();

    // Home services starting EBITDA
    const hsStart = startBiz
      .filter(b => b.sectorId === 'homeServices')
      .reduce((s, b) => s + b.ebitda, 0); // 1200 + 800 = 2000

    // Add R1 HVAC deals
    const r1Hvac = r1Deals
      .filter(d => d.business.subType === 'HVAC Services')
      .reduce((s, d) => s + d.business.ebitda, 0); // 1200 + 1000 = 2200

    // Add R2 LBO HVAC
    const r2Hvac = r2Deals
      .find(d => d.business.subType === 'HVAC Services')!.business.ebitda; // 1500

    const totalHsEbitda = hsStart + r1Hvac + r2Hvac; // 5700
    const threshold = 5000 * 0.7; // Easy-Quick threshold = 3500
    expect(totalHsEbitda).toBeGreaterThan(threshold);
  });
});
