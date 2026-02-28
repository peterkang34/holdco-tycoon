/**
 * Save-version migrations for Holdco Tycoon.
 *
 * Each migration function reads the old localStorage key, transforms the data,
 * writes it under the new key, and deletes the old key. They are idempotent —
 * if the target key already exists, the migration is a no-op.
 *
 * Called once at module load time (before the Zustand store is created).
 */

import { SECTORS } from '../data/sectors';
import { SHARED_SERVICES_CONFIG } from '../data/sharedServices';

// --- v9 → v10: adds maSourcing + maFocus.subType ---

export function migrateV9ToV10(): void {
  try {
    const v10Key = 'holdco-tycoon-save-v10';
    const v9Key = 'holdco-tycoon-save-v9';
    if (localStorage.getItem(v10Key)) return;
    const v9Raw = localStorage.getItem(v9Key);
    if (!v9Raw) return;
    const v9Data = JSON.parse(v9Raw);
    if (!v9Data?.state) return;
    if (!v9Data.state.maSourcing) {
      v9Data.state.maSourcing = { tier: 0, active: false, unlockedRound: 0, lastUpgradeRound: 0 };
    }
    if (v9Data.state.maFocus && v9Data.state.maFocus.subType === undefined) {
      v9Data.state.maFocus.subType = null;
    }
    localStorage.setItem(v10Key, JSON.stringify(v9Data));
    localStorage.removeItem(v9Key);
  } catch (e) {
    console.error('v9→v10 migration failed:', e);
  }
}

// --- v10 → v11: adds deal heat + acquisition limits ---

export function migrateV10ToV11(): void {
  try {
    const v11Key = 'holdco-tycoon-save-v12';
    const v10Key = 'holdco-tycoon-save-v10';
    if (localStorage.getItem(v11Key)) return;
    const v10Raw = localStorage.getItem(v10Key);
    if (!v10Raw) return;
    const v10Data = JSON.parse(v10Raw);
    if (!v10Data?.state) return;
    // Add deal heat fields to state
    v10Data.state.acquisitionsThisRound = 0;
    const tier = v10Data.state.maSourcing?.tier ?? 0;
    v10Data.state.maxAcquisitionsPerRound = tier >= 2 ? 4 : tier >= 1 ? 3 : 2;
    v10Data.state.lastAcquisitionResult = null;
    // Add heat + effectivePrice to existing pipeline deals
    if (Array.isArray(v10Data.state.dealPipeline)) {
      v10Data.state.dealPipeline = v10Data.state.dealPipeline.map((d: any) => ({
        ...d,
        heat: d.heat ?? 'warm',
        effectivePrice: d.effectivePrice ?? d.askingPrice,
      }));
    }
    localStorage.setItem(v11Key, JSON.stringify(v10Data));
    localStorage.removeItem(v10Key);
  } catch (e) {
    console.error('v10→v11 migration failed:', e);
  }
}

// --- v11 → v12: adds revenue/margin decomposition ---

export function migrateV11ToV12(): void {
  try {
    const v12Key = 'holdco-tycoon-save-v12';
    const v11Key = 'holdco-tycoon-save-v11';
    if (localStorage.getItem(v12Key)) return;
    const v11Raw = localStorage.getItem(v11Key);
    if (!v11Raw) return;
    const v11Data = JSON.parse(v11Raw);
    if (!v11Data?.state) return;

    // Helper: back-compute revenue/margin from EBITDA using sector midpoint margin
    const addRevenueMargin = (b: any) => {
      if (b.revenue !== undefined && b.revenue > 0) return b; // Already has fields
      const sectorDef = SECTORS[b.sectorId];
      if (!sectorDef) return b;
      const midMargin = (sectorDef.baseMargin[0] + sectorDef.baseMargin[1]) / 2;
      const midDrift = (sectorDef.marginDriftRange[0] + sectorDef.marginDriftRange[1]) / 2;
      return {
        ...b,
        ebitdaMargin: midMargin,
        revenue: Math.round(Math.abs(b.ebitda) / midMargin) || 1000,
        acquisitionRevenue: Math.round(Math.abs(b.acquisitionEbitda || b.ebitda) / midMargin) || 1000,
        acquisitionMargin: midMargin,
        peakRevenue: Math.round(Math.abs(b.peakEbitda || b.ebitda) / midMargin) || 1000,
        revenueGrowthRate: b.organicGrowthRate || 0.05,
        marginDriftRate: midDrift,
      };
    };

    // Migrate businesses
    if (Array.isArray(v11Data.state.businesses)) {
      v11Data.state.businesses = v11Data.state.businesses.map(addRevenueMargin);
    }
    if (Array.isArray(v11Data.state.exitedBusinesses)) {
      v11Data.state.exitedBusinesses = v11Data.state.exitedBusinesses.map(addRevenueMargin);
    }

    // Migrate pipeline deals
    if (Array.isArray(v11Data.state.dealPipeline)) {
      v11Data.state.dealPipeline = v11Data.state.dealPipeline.map((d: any) => ({
        ...d,
        business: addRevenueMargin(d.business),
      }));
    }

    localStorage.setItem(v12Key, JSON.stringify(v11Data));
    localStorage.removeItem(v11Key);
  } catch (e) {
    console.error('v11→v12 migration failed:', e);
  }
}

// --- v12 → v13: adds seller archetypes to pipeline deals ---

export function migrateV12ToV13(): void {
  try {
    const v13Key = 'holdco-tycoon-save-v13';
    const v12Key = 'holdco-tycoon-save-v12';
    if (localStorage.getItem(v13Key)) return;
    const v12Raw = localStorage.getItem(v12Key);
    if (!v12Raw) return;
    const v12Data = JSON.parse(v12Raw);
    if (!v12Data?.state) return;

    // Pipeline deals get sellerArchetype: undefined (backwards compatible)
    if (Array.isArray(v12Data.state.dealPipeline)) {
      v12Data.state.dealPipeline = v12Data.state.dealPipeline.map((d: any) => ({
        ...d,
        sellerArchetype: d.sellerArchetype ?? undefined,
      }));
    }

    localStorage.setItem(v13Key, JSON.stringify(v12Data));
    localStorage.removeItem(v12Key);
  } catch (e) {
    console.error('v12→v13 migration failed:', e);
  }
}

// --- v13 → v14: adds game modes + founder tracking ---

export function migrateV13ToV14(): void {
  try {
    const v14Key = 'holdco-tycoon-save-v14';
    const v13Key = 'holdco-tycoon-save-v13';
    if (localStorage.getItem(v14Key)) return;
    const v13Raw = localStorage.getItem(v13Key);
    if (!v13Raw) return;
    const v13Data = JSON.parse(v13Raw);
    if (!v13Data?.state) return;

    // Add new fields with defaults (existing saves are Easy/20yr)
    v13Data.state.difficulty = 'easy';
    v13Data.state.duration = 'standard';
    v13Data.state.maxRounds = 20;
    v13Data.state.founderDistributionsReceived = Math.round(
      (v13Data.state.totalDistributions || 0) *
      (v13Data.state.founderShares / (v13Data.state.sharesOutstanding || 1))
    );

    localStorage.setItem(v14Key, JSON.stringify(v13Data));
    localStorage.removeItem(v13Key);
  } catch (e) {
    console.error('v13→v14 migration failed:', e);
  }
}

// --- v14 → v15: adds acquisitionSizeTierPremium + wasMerged ---

// Inline lerp matching buyers.ts calculateSizeTierPremium
function computeSizeTierPremium(ebitda: number): number {
  if (ebitda < 2000) return 0.0;
  if (ebitda < 5000) return 0.5 + ((ebitda - 2000) / (5000 - 2000)) * (1.0 - 0.5);
  if (ebitda < 10000) return 1.0 + ((ebitda - 5000) / (10000 - 5000)) * (2.0 - 1.0);
  if (ebitda < 20000) return 2.0 + ((ebitda - 10000) / (20000 - 10000)) * (3.5 - 2.0);
  const capped = Math.min(ebitda, 30000);
  return 3.5 + ((capped - 20000) / (30000 - 20000)) * (5.0 - 3.5);
}

export function migrateV14ToV15(): void {
  try {
    const v15Key = 'holdco-tycoon-save-v15';
    const v14Key = 'holdco-tycoon-save-v14';
    if (localStorage.getItem(v15Key)) return;
    const v14Raw = localStorage.getItem(v14Key);
    if (!v14Raw) return;
    const v14Data = JSON.parse(v14Raw);
    if (!v14Data?.state) return;

    const backfill = (b: any) => ({
      ...b,
      acquisitionSizeTierPremium: b.acquisitionSizeTierPremium ?? computeSizeTierPremium(b.acquisitionEbitda || b.ebitda || 0),
      wasMerged: b.wasMerged ?? false,
    });

    if (Array.isArray(v14Data.state.businesses)) {
      v14Data.state.businesses = v14Data.state.businesses.map(backfill);
    }
    if (Array.isArray(v14Data.state.exitedBusinesses)) {
      v14Data.state.exitedBusinesses = v14Data.state.exitedBusinesses.map(backfill);
    }
    // Pipeline deal businesses
    if (Array.isArray(v14Data.state.dealPipeline)) {
      v14Data.state.dealPipeline = v14Data.state.dealPipeline.map((d: any) => ({
        ...d,
        business: d.business ? backfill(d.business) : d.business,
      }));
    }

    localStorage.setItem(v15Key, JSON.stringify(v14Data));
    localStorage.removeItem(v14Key);
  } catch (e) {
    console.error('v14→v15 migration failed:', e);
  }
}

// --- v15 → v16: adds integratedPlatforms ---

export function migrateV15ToV16(): void {
  try {
    const v16Key = 'holdco-tycoon-save-v16';
    const v15Key = 'holdco-tycoon-save-v15';
    if (localStorage.getItem(v16Key)) return;
    const v15Raw = localStorage.getItem(v15Key);
    if (!v15Raw) return;
    const v15Data = JSON.parse(v15Raw);
    if (!v15Data?.state) return;

    if (!v15Data.state.integratedPlatforms) {
      v15Data.state.integratedPlatforms = [];
    }

    localStorage.setItem(v16Key, JSON.stringify(v15Data));
    localStorage.removeItem(v15Key);
  } catch (e) {
    console.error('v15→v16 migration failed:', e);
  }
}

// --- v16 → v17: adds turnaround capability ---

export function migrateV16ToV17(): void {
  try {
    const v17Key = 'holdco-tycoon-save-v17';
    const v16Key = 'holdco-tycoon-save-v16';
    if (localStorage.getItem(v17Key)) return;
    const v16Raw = localStorage.getItem(v16Key);
    if (!v16Raw) return;
    const v16Data = JSON.parse(v16Raw);
    if (!v16Data?.state) return;

    // Add turnaround state
    if (v16Data.state.turnaroundTier === undefined) {
      v16Data.state.turnaroundTier = 0;
    }
    if (!v16Data.state.activeTurnarounds) {
      v16Data.state.activeTurnarounds = [];
    }

    // Backfill qualityImprovedTiers on all businesses
    const backfillBusiness = (b: any) => ({
      ...b,
      qualityImprovedTiers: b.qualityImprovedTiers ?? 0,
    });

    if (Array.isArray(v16Data.state.businesses)) {
      v16Data.state.businesses = v16Data.state.businesses.map(backfillBusiness);
    }
    if (Array.isArray(v16Data.state.exitedBusinesses)) {
      v16Data.state.exitedBusinesses = v16Data.state.exitedBusinesses.map(backfillBusiness);
    }

    localStorage.setItem(v17Key, JSON.stringify(v16Data));
    localStorage.removeItem(v16Key);
  } catch (e) {
    console.error('v16→v17 migration failed:', e);
  }
}

// --- v17 → v18: escalating dilution + raise/buyback cooldown ---

export function migrateV17ToV18(): void {
  try {
    const v18Key = 'holdco-tycoon-save-v18';
    const v17Key = 'holdco-tycoon-save-v17';
    if (localStorage.getItem(v18Key)) return;
    const v17Raw = localStorage.getItem(v17Key);
    if (!v17Raw) return;
    const v17Data = JSON.parse(v17Raw);
    if (!v17Data?.state) return;

    // Backfill cooldown tracking fields
    if (v17Data.state.lastEquityRaiseRound === undefined) {
      v17Data.state.lastEquityRaiseRound = 0;
    }
    if (v17Data.state.lastBuybackRound === undefined) {
      v17Data.state.lastBuybackRound = 0;
    }

    localStorage.setItem(v18Key, JSON.stringify(v17Data));
    localStorage.removeItem(v17Key);
  } catch (e) {
    console.error('v17→v18 migration failed:', e);
  }
}

// --- v18 → v19: per-business bank debt + holdco loan ---

export function migrateV18ToV19(): void {
  try {
    const v19Key = 'holdco-tycoon-save-v19';
    const v18Key = 'holdco-tycoon-save-v18';
    if (localStorage.getItem(v19Key)) return;
    const v18Raw = localStorage.getItem(v18Key);
    if (!v18Raw) return;
    const v18Data = JSON.parse(v18Raw);
    if (!v18Data?.state) return;

    // Holdco loan: migrate pool debt to structured holdco loan
    const totalDebt = v18Data.state.totalDebt ?? 0;
    const interestRate = v18Data.state.interestRate ?? 0.07;
    const maxRounds = v18Data.state.maxRounds ?? 20;
    const currentRound = v18Data.state.round ?? 1;
    v18Data.state.holdcoLoanBalance = totalDebt;
    v18Data.state.holdcoLoanRate = interestRate;
    v18Data.state.holdcoLoanRoundsRemaining = Math.max(1, Math.ceil((maxRounds - currentRound) * 0.5));

    // Backfill per-business bank debt fields
    const backfillBusiness = (b: any) => ({
      ...b,
      bankDebtRate: b.bankDebtRate ?? 0,
      bankDebtRoundsRemaining: b.bankDebtRoundsRemaining ?? 0,
    });

    if (Array.isArray(v18Data.state.businesses)) {
      v18Data.state.businesses = v18Data.state.businesses.map(backfillBusiness);
    }
    if (Array.isArray(v18Data.state.exitedBusinesses)) {
      v18Data.state.exitedBusinesses = v18Data.state.exitedBusinesses.map(backfillBusiness);
    }

    localStorage.setItem(v19Key, JSON.stringify(v18Data));
    localStorage.removeItem(v18Key);
  } catch (e) {
    console.error('v18→v19 migration failed:', e);
  }
}

// --- v19 → v20: shared services cost increase ~18% ---

export function migrateV19ToV20(): void {
  try {
    const v20Key = 'holdco-tycoon-save-v20';
    const v19Key = 'holdco-tycoon-save-v19';
    if (localStorage.getItem(v20Key)) return;
    const v19Raw = localStorage.getItem(v19Key);
    if (!v19Raw) return;
    const v19Data = JSON.parse(v19Raw);
    if (!v19Data?.state) return;

    // Update shared services costs to new config values
    if (Array.isArray(v19Data.state.sharedServices)) {
      v19Data.state.sharedServices = v19Data.state.sharedServices.map((s: any) => {
        const config = SHARED_SERVICES_CONFIG[s.type as keyof typeof SHARED_SERVICES_CONFIG];
        if (config) {
          return { ...s, unlockCost: config.unlockCost, annualCost: config.annualCost };
        }
        return s;
      });
    }

    localStorage.setItem(v20Key, JSON.stringify(v19Data));
    localStorage.removeItem(v19Key);
  } catch (e) {
    console.error('v19→v20 migration failed:', e);
  }
}

// --- v20 → v21: Financial Crisis event + exitMultiplePenalty ---

export function migrateV20ToV21(): void {
  try {
    const v21Key = 'holdco-tycoon-save-v21';
    const v20Key = 'holdco-tycoon-save-v20';
    if (localStorage.getItem(v21Key)) return;
    const v20Raw = localStorage.getItem(v20Key);
    if (!v20Raw) return;
    const v20Data = JSON.parse(v20Raw);
    if (!v20Data?.state) return;

    // Backfill exitMultiplePenalty
    if (v20Data.state.exitMultiplePenalty === undefined) {
      v20Data.state.exitMultiplePenalty = 0;
    }

    localStorage.setItem(v21Key, JSON.stringify(v20Data));
    localStorage.removeItem(v20Key);
  } catch (e) {
    console.error('v20→v21 migration failed:', e);
  }
}

// --- v21 → v22: persist holdco loan fields (were missing from partialize) ---

export function migrateV21ToV22(): void {
  try {
    const v22Key = 'holdco-tycoon-save-v22';
    const v21Key = 'holdco-tycoon-save-v21';
    if (localStorage.getItem(v22Key)) return;
    const v21Raw = localStorage.getItem(v21Key);
    if (!v21Raw) return;
    const v21Data = JSON.parse(v21Raw);
    if (!v21Data?.state) return;

    // Holdco loan fields were missing from partialize — backfill defaults
    if (v21Data.state.holdcoLoanBalance === undefined) {
      v21Data.state.holdcoLoanBalance = 0;
    }
    if (v21Data.state.holdcoLoanRate === undefined) {
      v21Data.state.holdcoLoanRate = v21Data.state.interestRate ?? 0.07;
    }
    if (v21Data.state.holdcoLoanRoundsRemaining === undefined) {
      v21Data.state.holdcoLoanRoundsRemaining = 0;
    }

    localStorage.setItem(v22Key, JSON.stringify(v21Data));
    localStorage.removeItem(v21Key);
  } catch (e) {
    console.error('v21→v22 migration failed:', e);
  }
}

// --- v22 → v23: rollover equity ---

export function migrateV22ToV23(): void {
  try {
    const v23Key = 'holdco-tycoon-save-v23';
    const v22Key = 'holdco-tycoon-save-v22';
    if (localStorage.getItem(v23Key)) return;
    const v22Raw = localStorage.getItem(v22Key);
    if (!v22Raw) return;
    const v22Data = JSON.parse(v22Raw);
    if (!v22Data?.state) return;

    // Backfill rolloverEquityPct on all businesses
    const backfillBusiness = (b: any) => ({
      ...b,
      rolloverEquityPct: b.rolloverEquityPct ?? 0,
    });

    if (Array.isArray(v22Data.state.businesses)) {
      v22Data.state.businesses = v22Data.state.businesses.map(backfillBusiness);
    }
    if (Array.isArray(v22Data.state.exitedBusinesses)) {
      v22Data.state.exitedBusinesses = v22Data.state.exitedBusinesses.map(backfillBusiness);
    }

    localStorage.setItem(v23Key, JSON.stringify(v22Data));
    localStorage.removeItem(v22Key);
  } catch (e) {
    console.error('v22→v23 migration failed:', e);
  }
}

// --- v23 → v24: new choice-based events (key-man, earn-out dispute, supplier shift, consolidation boom) ---

export function migrateV23ToV24(): void {
  try {
    const v24Key = 'holdco-tycoon-save-v24';
    const v23Key = 'holdco-tycoon-save-v23';
    if (localStorage.getItem(v24Key)) return;
    const v23Raw = localStorage.getItem(v23Key);
    if (!v23Raw) return;
    const v23Data = JSON.parse(v23Raw);
    if (!v23Data?.state) return;

    // New optional fields default to undefined — no backfill needed
    // successionPlanRound, supplierSwitchRound on businesses
    // consolidationBoomSectorId on state

    localStorage.setItem(v24Key, JSON.stringify(v23Data));
    localStorage.removeItem(v23Key);
  } catch (e) {
    console.error('v23→v24 migration failed:', e);
  }
}

// --- v24 → v25: seeded RNG for challenge mode ---

export function migrateV24ToV25(): void {
  try {
    const v25Key = 'holdco-tycoon-save-v25';
    const v24Key = 'holdco-tycoon-save-v24';
    if (localStorage.getItem(v25Key)) return;
    const v24Raw = localStorage.getItem(v24Key);
    if (!v24Raw) return;
    const v24Data = JSON.parse(v24Raw);
    if (!v24Data?.state) return;

    // Backfill seed with a random value for existing saves
    if (v24Data.state.seed === undefined) {
      v24Data.state.seed = (Math.random() * 0x7fffffff) | 0;
    }

    localStorage.setItem(v25Key, JSON.stringify(v24Data));
    localStorage.removeItem(v24Key);
  } catch (e) {
    console.error('v24→v25 migration failed:', e);
  }
}

// --- v25 → v26: proportional decaying integration growth drag ---

export function migrateV25ToV26(): void {
  try {
    const v26Key = 'holdco-tycoon-save-v26';
    const v25Key = 'holdco-tycoon-save-v25';
    if (localStorage.getItem(v26Key)) return;
    const v25Raw = localStorage.getItem(v25Key);
    if (!v25Raw) return;
    const v25Data = JSON.parse(v25Raw);
    if (!v25Data?.state) return;

    // Backfill integrationGrowthDrag on all businesses
    const backfillBusiness = (b: any) => ({
      ...b,
      integrationGrowthDrag: b.integrationGrowthDrag ?? 0,
    });

    if (Array.isArray(v25Data.state.businesses)) {
      v25Data.state.businesses = v25Data.state.businesses.map(backfillBusiness);
    }
    if (Array.isArray(v25Data.state.exitedBusinesses)) {
      v25Data.state.exitedBusinesses = v25Data.state.exitedBusinesses.map(backfillBusiness);
    }

    localStorage.setItem(v26Key, JSON.stringify(v25Data));
    localStorage.removeItem(v25Key);
  } catch (e) {
    console.error('v25→v26 migration failed:', e);
  }
}

// --- v26 → v27: 20-year mode upgrade (deal inflation, succession, IPO, family office) ---

export function migrateV26ToV27(): void {
  try {
    const v27Key = 'holdco-tycoon-save-v27';
    const v26Key = 'holdco-tycoon-save-v26';
    if (localStorage.getItem(v27Key)) return;
    const v26Raw = localStorage.getItem(v26Key);
    if (!v26Raw) return;
    const v26Data = JSON.parse(v26Raw);
    if (!v26Data?.state) return;

    // New GameState fields
    if (v26Data.state.dealInflationState === undefined) {
      v26Data.state.dealInflationState = { crisisResetRoundsRemaining: 0 };
    }
    if (v26Data.state.ipoState === undefined) {
      v26Data.state.ipoState = null;
    }
    if (v26Data.state.ipoState && v26Data.state.ipoState.shareFundedDealsThisRound === undefined) {
      v26Data.state.ipoState.shareFundedDealsThisRound = 0;
    }
    if (v26Data.state.familyOfficeState === undefined) {
      v26Data.state.familyOfficeState = null;
    }

    // Backfill successionResolved on all businesses
    const backfillBusiness = (b: any) => ({
      ...b,
      successionResolved: b.successionResolved ?? false,
    });

    if (Array.isArray(v26Data.state.businesses)) {
      v26Data.state.businesses = v26Data.state.businesses.map(backfillBusiness);
    }
    if (Array.isArray(v26Data.state.exitedBusinesses)) {
      v26Data.state.exitedBusinesses = v26Data.state.exitedBusinesses.map(backfillBusiness);
    }

    localStorage.setItem(v27Key, JSON.stringify(v26Data));
    localStorage.removeItem(v26Key);
  } catch (e) {
    console.error('v26→v27 migration failed:', e);
  }
}

/**
 * v27→v28: 7-tier EBITDA system
 * Map old sizePreference values to new DealSizeTier values:
 *   'small' → 'micro' (old small was $500K-$1.5M = new micro)
 *   'medium' → 'small' (old medium was $1.5M-$3M ≈ new small)
 *   'large' → 'mid_market' (old large was $3M+ ≈ new mid_market)
 *   'any' → 'any' (unchanged)
 */
function migrateV27ToV28(): void {
  const v27Key = 'holdco-tycoon-save-v27';
  const v28Key = 'holdco-tycoon-save-v28';
  if (localStorage.getItem(v28Key)) return;
  try {
    const raw = localStorage.getItem(v27Key);
    if (!raw) return;
    const v27Data = JSON.parse(raw);

    // Map sizePreference in maFocus (handles null/undefined/missing gracefully)
    if (v27Data.state?.maFocus) {
      const sizeMap: Record<string, string> = {
        small: 'micro',
        medium: 'small',
        large: 'mid_market',
        any: 'any',
      };
      const oldPref = v27Data.state.maFocus.sizePreference;
      v27Data.state.maFocus.sizePreference = sizeMap[oldPref] ?? 'any';
    }

    localStorage.setItem(v28Key, JSON.stringify(v27Data));
    localStorage.removeItem(v27Key);
  } catch (e) {
    console.error('v27→v28 migration failed:', e);
  }
}

/**
 * Run all migrations in chronological order.
 * Safe to call multiple times — each migration is idempotent.
 */
export function runAllMigrations(): void {
  migrateV9ToV10();
  migrateV10ToV11();
  migrateV11ToV12();
  migrateV12ToV13();
  migrateV13ToV14();
  migrateV14ToV15();
  migrateV15ToV16();
  migrateV16ToV17();
  migrateV17ToV18();
  migrateV18ToV19();
  migrateV19ToV20();
  migrateV20ToV21();
  migrateV21ToV22();
  migrateV22ToV23();
  migrateV23ToV24();
  migrateV24ToV25();
  migrateV25ToV26();
  migrateV26ToV27();
  migrateV27ToV28();
}
