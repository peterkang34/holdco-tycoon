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
}
