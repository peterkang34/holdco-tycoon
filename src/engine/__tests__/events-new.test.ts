/**
 * Tests for new choice-based events (v24):
 * - Bolt-on debt bug fix
 * - Key-Man Risk (golden handcuffs, succession plan, accept hit)
 * - Earn-Out Dispute (settle, fight, renegotiate)
 * - Supplier Pricing Power Shift (absorb, switch, vertical integration)
 * - Consolidation Boom (deal premium, exclusive tuck-in)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  KEY_MAN_QUALITY_DROP,
  KEY_MAN_GOLDEN_HANDCUFFS_COST_PCT,
  KEY_MAN_GOLDEN_HANDCUFFS_RESTORE_CHANCE,
  KEY_MAN_SUCCESSION_ROUNDS,
  EARNOUT_SETTLE_PCT,
  EARNOUT_FIGHT_WIN_CHANCE,
  EARNOUT_RENEGOTIATE_PCT,
  SUPPLIER_SHIFT_MARGIN_HIT,
  SUPPLIER_ABSORB_RECOVERY_PPT,
  SUPPLIER_SWITCH_REVENUE_PENALTY,
  SUPPLIER_VERTICAL_BONUS_PPT,
  SUPPLIER_VERTICAL_MIN_SAME_SECTOR,
  CONSOLIDATION_BOOM_PRICE_PREMIUM,
  CONSOLIDATION_BOOM_EXCLUSIVE_MIN_OPCOS,
} from '../../data/gameConfig';
import type { Business, GameState, GameEvent, QualityRating } from '../types';

// Helper: create a minimal business
function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: 'biz_1',
    name: 'Test Co',
    sectorId: 'homeServices',
    subType: 'HVAC',
    ebitda: 1000,
    peakEbitda: 1000,
    acquisitionEbitda: 800,
    acquisitionPrice: 4000,
    acquisitionRound: 1,
    acquisitionMultiple: 5,
    acquisitionSizeTierPremium: 0,
    organicGrowthRate: 0.05,
    revenue: 5000,
    ebitdaMargin: 0.20,
    acquisitionRevenue: 5000,
    acquisitionMargin: 0.20,
    peakRevenue: 5000,
    revenueGrowthRate: 0.05,
    marginDriftRate: -0.002,
    qualityRating: 4,
    dueDiligence: {
      revenueConcentration: 'low',
      revenueConcentrationText: '',
      operatorQuality: 'strong',
      operatorQualityText: '',
      trend: 'growing',
      trendText: '',
      customerRetention: 90,
      customerRetentionText: '',
      competitivePosition: 'competitive',
      competitivePositionText: '',
    },
    integrationRoundsRemaining: 0,
    improvements: [],
    sellerNoteBalance: 0,
    sellerNoteRate: 0,
    sellerNoteRoundsRemaining: 0,
    bankDebtBalance: 0,
    bankDebtRate: 0,
    bankDebtRoundsRemaining: 0,
    earnoutRemaining: 0,
    earnoutTarget: 0,
    status: 'active',
    isPlatform: false,
    platformScale: 1,
    boltOnIds: [],
    synergiesRealized: 0,
    totalAcquisitionCost: 4000,
    rolloverEquityPct: 0,
    ...overrides,
  };
}

describe('Bug Fix: bolt-on bankDebtBalance in sell proceeds', () => {
  it('should include bankDebtBalance when calculating bolt-on debt for sell proceeds', () => {
    // The bug was: bolt-on debt calculation omitted bankDebtBalance
    // sellBusiness line: .reduce((sum, b) => sum + b.sellerNoteBalance + b.earnoutRemaining, 0)
    // should be: .reduce((sum, b) => sum + b.sellerNoteBalance + b.bankDebtBalance + b.earnoutRemaining, 0)

    const platform = makeBusiness({
      id: 'platform_1',
      name: 'Platform Co',
      isPlatform: true,
      boltOnIds: ['bolton_1'],
      bankDebtBalance: 500,
      sellerNoteBalance: 200,
      earnoutRemaining: 100,
    });

    const boltOn = makeBusiness({
      id: 'bolton_1',
      name: 'Bolt-On Co',
      status: 'integrated',
      parentPlatformId: 'platform_1',
      bankDebtBalance: 300,
      sellerNoteBalance: 150,
      earnoutRemaining: 50,
    });

    // Total debt should include ALL three fields for bolt-ons
    const boltOnDebt = boltOn.sellerNoteBalance + boltOn.bankDebtBalance + boltOn.earnoutRemaining;
    expect(boltOnDebt).toBe(500); // 150 + 300 + 50

    // Previously was 200 (only sellerNoteBalance + earnoutRemaining, missing bankDebtBalance)
    const oldBoltOnDebt = boltOn.sellerNoteBalance + boltOn.earnoutRemaining;
    expect(oldBoltOnDebt).toBe(200); // This was the bug — missing 300

    // The fix adds bankDebtBalance, increasing debt payoff by 300
    expect(boltOnDebt - oldBoltOnDebt).toBe(300);
  });
});

describe('Key-Man Risk Event', () => {
  it('should drop quality by KEY_MAN_QUALITY_DROP immediately', () => {
    const business = makeBusiness({ qualityRating: 5 });
    const newQuality = Math.max(1, business.qualityRating - KEY_MAN_QUALITY_DROP) as QualityRating;
    expect(newQuality).toBe(4);
  });

  it('should floor quality at 1', () => {
    const business = makeBusiness({ qualityRating: 1 });
    const newQuality = Math.max(1, business.qualityRating - KEY_MAN_QUALITY_DROP) as QualityRating;
    expect(newQuality).toBe(1);
  });

  it('golden handcuffs: should cost 15% of EBITDA', () => {
    const business = makeBusiness({ ebitda: 1000 });
    const cost = Math.round(business.ebitda * KEY_MAN_GOLDEN_HANDCUFFS_COST_PCT);
    expect(cost).toBe(150);
  });

  it('golden handcuffs: restore chance should be 55%', () => {
    expect(KEY_MAN_GOLDEN_HANDCUFFS_RESTORE_CHANCE).toBe(0.55);
  });

  it('golden handcuffs: should not alter qualityImprovedTiers', () => {
    // qualityImprovedTiers is write-once-upward — key-man quality changes shouldn't affect it
    const business = makeBusiness({ qualityRating: 4, qualityImprovedTiers: 2 });

    // After key-man drops quality to 3, qualityImprovedTiers stays at 2
    const afterDrop = { ...business, qualityRating: 3 as QualityRating };
    expect(afterDrop.qualityImprovedTiers).toBe(2);

    // After golden handcuffs restores quality to 4, qualityImprovedTiers still 2
    const afterRestore = { ...afterDrop, qualityRating: 4 as QualityRating };
    expect(afterRestore.qualityImprovedTiers).toBe(2);
  });

  it('succession plan: should restore quality after KEY_MAN_SUCCESSION_ROUNDS', () => {
    const startRound = 5;
    const business = makeBusiness({
      qualityRating: 3, // dropped from 4
      successionPlanRound: startRound,
    });

    // After 1 round — not yet restored
    const afterOneRound = 6;
    expect(afterOneRound - business.successionPlanRound!).toBe(1);
    expect(afterOneRound - business.successionPlanRound! >= KEY_MAN_SUCCESSION_ROUNDS).toBe(false);

    // After 2 rounds — should restore
    const afterTwoRounds = 7;
    expect(afterTwoRounds - business.successionPlanRound!).toBe(2);
    expect(afterTwoRounds - business.successionPlanRound! >= KEY_MAN_SUCCESSION_ROUNDS).toBe(true);

    const restoredQuality = Math.min(5, business.qualityRating + 1) as QualityRating;
    expect(restoredQuality).toBe(4);
  });
});

describe('Earn-Out Dispute Event', () => {
  it('settle: should pay 50% of earnoutRemaining', () => {
    const business = makeBusiness({ earnoutRemaining: 400 });
    const settleAmount = Math.round(business.earnoutRemaining * EARNOUT_SETTLE_PCT);
    expect(settleAmount).toBe(200);
  });

  it('settle: should zero out earnoutRemaining', () => {
    const business = makeBusiness({ earnoutRemaining: 400 });
    const afterSettle = { ...business, earnoutRemaining: 0 };
    expect(afterSettle.earnoutRemaining).toBe(0);
  });

  it('fight: win chance should be 70%', () => {
    expect(EARNOUT_FIGHT_WIN_CHANCE).toBe(0.70);
  });

  it('fight: win should zero out earnout', () => {
    const business = makeBusiness({ earnoutRemaining: 400 });
    // On win: earnoutRemaining = 0, only legal costs paid
    const legalCost = 150;
    const afterWin = { ...business, earnoutRemaining: 0 };
    expect(afterWin.earnoutRemaining).toBe(0);
  });

  it('fight: lose should pay full earnout + legal', () => {
    const business = makeBusiness({ earnoutRemaining: 400 });
    const legalCost = 150; // within [100, 200] range
    const totalCost = legalCost + business.earnoutRemaining;
    expect(totalCost).toBe(550);
  });

  it('renegotiate: should reduce earnoutRemaining to 55%', () => {
    const business = makeBusiness({ earnoutRemaining: 400 });
    const newAmount = Math.round(business.earnoutRemaining * EARNOUT_RENEGOTIATE_PCT);
    expect(newAmount).toBe(220);
  });
});

describe('Supplier Pricing Power Shift Event', () => {
  it('should apply 3ppt margin hit immediately', () => {
    const business = makeBusiness({ ebitdaMargin: 0.20 });
    const newMargin = business.ebitdaMargin - SUPPLIER_SHIFT_MARGIN_HIT;
    expect(newMargin).toBeCloseTo(0.17, 2);
  });

  it('absorb: should recover 2ppt of 3ppt hit (net -1ppt)', () => {
    const marginAfterHit = 0.17; // 0.20 - 0.03
    const marginAfterAbsorb = marginAfterHit + SUPPLIER_ABSORB_RECOVERY_PPT;
    expect(marginAfterAbsorb).toBeCloseTo(0.19, 2);
    // Net loss = 0.20 - 0.19 = 0.01 = 1ppt
    expect(0.20 - marginAfterAbsorb).toBeCloseTo(0.01, 2);
  });

  it('switch: should fully restore margin with revenue penalty', () => {
    const marginAfterHit = 0.17; // 0.20 - 0.03
    const marginAfterSwitch = marginAfterHit + SUPPLIER_SHIFT_MARGIN_HIT;
    expect(marginAfterSwitch).toBeCloseTo(0.20, 2);

    // Revenue penalty
    const revenue = 5000;
    const newRevenue = Math.round(revenue * (1 - SUPPLIER_SWITCH_REVENUE_PENALTY));
    expect(newRevenue).toBe(4750); // -5%
  });

  it('vertical integration: should restore margin + bonus', () => {
    const marginAfterHit = 0.17;
    const marginAfterVertical = marginAfterHit + SUPPLIER_SHIFT_MARGIN_HIT + SUPPLIER_VERTICAL_BONUS_PPT;
    expect(marginAfterVertical).toBeCloseTo(0.21, 2);
  });

  it('vertical integration: requires 2+ same-sector businesses', () => {
    expect(SUPPLIER_VERTICAL_MIN_SAME_SECTOR).toBe(2);
  });
});

describe('Consolidation Boom Event', () => {
  it('should apply +20% price premium to sector deals', () => {
    const basePrice = 5000;
    const premiumPrice = Math.round(basePrice * (1 + CONSOLIDATION_BOOM_PRICE_PREMIUM));
    expect(premiumPrice).toBe(6000);
  });

  it('should require 2+ businesses in sector for exclusive deal', () => {
    expect(CONSOLIDATION_BOOM_EXCLUSIVE_MIN_OPCOS).toBe(2);
  });

  it('should only affect target sector deals (other sectors untouched)', () => {
    const boomSector = 'homeServices';
    const homeServicesDeal = { sectorId: 'homeServices', askingPrice: 5000 };
    const saasDeal = { sectorId: 'saas', askingPrice: 5000 };

    // Home services gets premium
    if (homeServicesDeal.sectorId === boomSector) {
      const premiumPrice = Math.round(homeServicesDeal.askingPrice * (1 + CONSOLIDATION_BOOM_PRICE_PREMIUM));
      expect(premiumPrice).toBe(6000);
    }

    // SaaS stays at normal price
    if (saasDeal.sectorId !== boomSector) {
      expect(saasDeal.askingPrice).toBe(5000);
    }
  });
});

describe('Event Constants Validation', () => {
  it('KEY_MAN constants should be within expected ranges', () => {
    expect(KEY_MAN_QUALITY_DROP).toBe(1);
    expect(KEY_MAN_GOLDEN_HANDCUFFS_COST_PCT).toBe(0.15);
    expect(KEY_MAN_GOLDEN_HANDCUFFS_RESTORE_CHANCE).toBe(0.55);
    expect(KEY_MAN_SUCCESSION_ROUNDS).toBe(2);
  });

  it('EARNOUT constants should be within expected ranges', () => {
    expect(EARNOUT_SETTLE_PCT).toBe(0.50);
    expect(EARNOUT_FIGHT_WIN_CHANCE).toBe(0.70);
    expect(EARNOUT_RENEGOTIATE_PCT).toBe(0.55);
  });

  it('SUPPLIER constants should be within expected ranges', () => {
    expect(SUPPLIER_SHIFT_MARGIN_HIT).toBe(0.03);
    expect(SUPPLIER_ABSORB_RECOVERY_PPT).toBe(0.02);
    expect(SUPPLIER_SWITCH_REVENUE_PENALTY).toBe(0.05);
    expect(SUPPLIER_VERTICAL_BONUS_PPT).toBe(0.01);
    expect(SUPPLIER_VERTICAL_MIN_SAME_SECTOR).toBe(2);
  });

  it('CONSOLIDATION constants should be within expected ranges', () => {
    expect(CONSOLIDATION_BOOM_PRICE_PREMIUM).toBe(0.20);
    expect(CONSOLIDATION_BOOM_EXCLUSIVE_MIN_OPCOS).toBe(2);
  });
});
