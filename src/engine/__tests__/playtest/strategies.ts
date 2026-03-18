/**
 * Pluggable Strategy Interface + 6 Built-in Strategies
 *
 * Each strategy makes deterministic decisions based on state (no Math.random).
 * Strategies that don't care about a feature return sensible defaults.
 */

import type {
  GameState,
  Deal,
  DealStructure,
  Business,
  GameEvent,
  SectorId,
} from '../../types';
import { generateDealStructures } from '../../deals';
import { getEligiblePrograms, calculateTurnaroundCost } from '../../turnarounds';
import type { PlaytestCoverage, FeatureKey } from './coverage';

// Improvement types as arrays for deterministic iteration
const STABILIZATION_LIST = ['fix_underperformance', 'management_professionalization', 'operating_playbook'];
const GROWTH_LIST = ['pricing_model', 'digital_transformation', 'service_expansion', 'recurring_revenue_conversion'];

// ── Strategy Interface ──

export interface AllocateDecisions {
  /** Deals to acquire: [deal, preferredStructureType] pairs */
  acquisitions: { deal: Deal; structurePreference: string }[];
  /** Businesses to designate as platforms */
  platformDesignations: string[];
  /** Tuck-in pairs: [deal, platformId] */
  tuckIns: { deal: Deal; platformId: string }[];
  /** Whether to raise equity this round */
  raiseEquity: boolean;
  /** Whether to do buybacks this round */
  doBuyback: boolean;
  /** Distribution amount (0 = none) */
  distributionAmount: number;
  /** Whether to unlock next turnaround tier */
  unlockTurnaroundTier: boolean;
  /** Businesses to start turnarounds on: [businessId, programId] */
  turnarounds: { businessId: string; programId: string }[];
  /** Whether to upgrade MA sourcing */
  upgradeMASourcing: boolean;
  /** Shared services to unlock */
  sharedServicesToUnlock: string[];
  /** Forge integrated platforms */
  forgePlatforms: boolean;
  /** Operational improvements: [businessId, improvementType] */
  improvements: { businessId: string; improvementType: string }[];
  /** Whether to sell any businesses */
  businessesToSell: string[];
}

export interface EventDecision {
  /** Choice index for choice-based events (0-indexed) */
  choiceIndex: number;
}

export interface PlaytestStrategy {
  name: string;
  /** If true, strategy needs 20yr mode */
  requires20yr: boolean;
  /** Primary features this strategy aims to exercise */
  expectedFeatures: FeatureKey[];

  /** Decide what to do in the allocate phase */
  decideAllocations(state: GameState, deals: Deal[], coverage: PlaytestCoverage): AllocateDecisions;

  /** Decide how to respond to a choice event (return null to skip/auto) */
  decideEvent(state: GameState, event: GameEvent): EventDecision | null;
}

// ── Helper Functions ──

function getAffordableStructures(
  deal: Deal,
  state: GameState,
  preferType?: string
): DealStructure[] {
  const structures = generateDealStructures(
    deal,
    state.cash,
    state.interestRate,
    state.creditTighteningRoundsRemaining > 0,
    state.maxRounds,
    state.requiresRestructuring || state.covenantBreachRounds >= 1,
    state.maSourcing.tier,
    state.duration,
    deal.sellerArchetype,
    state.ipoState ?? undefined,
  );
  if (preferType) {
    const preferred = structures.find(s => s.type === preferType);
    if (preferred && state.cash >= preferred.cashRequired) return [preferred];
  }
  return structures.filter(s => state.cash >= s.cashRequired);
}

function getActiveBusinesses(state: GameState): Business[] {
  return state.businesses.filter(b => b.status === 'active');
}

function defaultDecisions(): AllocateDecisions {
  return {
    acquisitions: [],
    platformDesignations: [],
    tuckIns: [],
    raiseEquity: false,
    doBuyback: false,
    distributionAmount: 0,
    unlockTurnaroundTier: false,
    turnarounds: [],
    upgradeMASourcing: false,
    sharedServicesToUnlock: [],
    forgePlatforms: false,
    improvements: [],
    businessesToSell: [],
  };
}

// ── Strategy 1: Aggressive Acquirer ──

export const AggressiveAcquirer: PlaytestStrategy = {
  name: 'AggressiveAcquirer',
  requires20yr: false,
  expectedFeatures: [
    'acquisition_cash', 'acquisition_leveraged', 'acquisition_seller_note',
    'acquisition_earnout', 'collect_phase', 'event_phase', 'allocate_phase',
    'end_round', 'scoring_completed', 'margin_drift', 'complexity_cost_triggered',
  ],

  decideAllocations(state: GameState, deals: Deal[], _coverage: PlaytestCoverage): AllocateDecisions {
    const decisions = defaultDecisions();
    const active = getActiveBusinesses(state);

    // Unlock shared services early (finance first for cash conversion)
    if (active.length >= 3) {
      const inactiveServices = state.sharedServices.filter(s => !s.active);
      if (inactiveServices.length > 0 && state.cash > inactiveServices[0].unlockCost + 5000) {
        decisions.sharedServicesToUnlock.push(inactiveServices[0].type);
      }
    }

    // Upgrade MA sourcing when affordable
    if (state.maSourcing.tier < 2 && state.cash > 3000) {
      decisions.upgradeMASourcing = true;
    }

    // Acquire aggressively — try every deal, preferring leveraged structures
    if (active.length < 12) {
      const structurePrefs = ['bank_debt', 'seller_note_bank_debt', 'seller_note', 'earnout', 'all_cash'];
      for (const deal of deals.slice(0, 4)) {
        // Skip if we can't afford anything
        if (state.cash < 1000) break;
        for (const pref of structurePrefs) {
          const structs = getAffordableStructures(deal, state, pref);
          if (structs.length > 0) {
            decisions.acquisitions.push({ deal, structurePreference: pref });
            break;
          }
        }
      }
    }

    // Raise equity if cash is low and we want to keep acquiring
    if (state.cash < 3000 && active.length < 8 && state.equityRaisesUsed < 3) {
      decisions.raiseEquity = true;
    }

    return decisions;
  },

  decideEvent(_state: GameState, event: GameEvent): EventDecision | null {
    // Accept offers, decline risky choices
    if (event.choices && event.choices.length > 0) {
      // Pick the first non-negative choice, or the first if all are negative
      const positiveIdx = event.choices.findIndex(c => c.variant !== 'negative');
      return { choiceIndex: positiveIdx >= 0 ? positiveIdx : 0 };
    }
    return null;
  },
};

// ── Strategy 2: Platform Builder ──

export const PlatformBuilder: PlaytestStrategy = {
  name: 'PlatformBuilder',
  requires20yr: false,
  expectedFeatures: [
    'platform_designation', 'tuck_in', 'forge_platform',
    'shared_service_unlocked', 'ma_sourcing_upgraded', 'integration_drag',
    'collect_phase', 'event_phase', 'allocate_phase', 'end_round',
    'scoring_completed', 'margin_drift', 'operational_improvement',
  ],

  decideAllocations(state: GameState, deals: Deal[], _coverage: PlaytestCoverage): AllocateDecisions {
    const decisions = defaultDecisions();
    const active = getActiveBusinesses(state);

    // Focus on one sector for platform building
    const sectorCounts = new Map<SectorId, number>();
    for (const b of active) {
      sectorCounts.set(b.sectorId, (sectorCounts.get(b.sectorId) || 0) + 1);
    }
    const bestSector = [...sectorCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'agency';

    // Designate largest business as platform if none exists
    const platforms = active.filter(b => b.isPlatform);
    if (platforms.length === 0 && active.length >= 1) {
      const biggest = [...active].sort((a, b) => b.ebitda - a.ebitda)[0];
      decisions.platformDesignations.push(biggest.id);
    }

    // Unlock shared services aggressively (all of them)
    if (active.length >= 3) {
      for (const svc of state.sharedServices) {
        if (!svc.active && state.cash > svc.unlockCost + 3000) {
          decisions.sharedServicesToUnlock.push(svc.type);
          break; // One per round
        }
      }
    }

    // Upgrade MA sourcing
    if (state.maSourcing.tier < 3 && state.cash > 2000) {
      decisions.upgradeMASourcing = true;
    }

    // Stabilization on Q1/Q2 businesses to unblock platform forging (Q3+ required)
    for (const b of active) {
      if (b.qualityRating <= 2) {
        for (const impType of STABILIZATION_LIST) {
          if (!b.improvements.some(i => i.type === impType)) {
            const absEbitda = Math.abs(b.ebitda) || 1;
            const estCost = Math.max(200, Math.round(absEbitda * 0.15));
            if (state.cash > estCost + 2000) {
              decisions.improvements.push({ businessId: b.id, improvementType: impType });
              break;
            }
          }
        }
      }
    }

    // Growth improvements on Q3+ businesses for EBITDA build toward platform threshold
    for (const b of active) {
      if (b.qualityRating >= 3) {
        for (const impType of GROWTH_LIST) {
          if (!b.improvements.some(i => i.type === impType)) {
            const absEbitda = Math.abs(b.ebitda) || 1;
            const estCost = Math.max(200, Math.round(absEbitda * 0.15));
            if (state.cash > estCost + 2000) {
              decisions.improvements.push({ businessId: b.id, improvementType: impType });
              break;
            }
          }
        }
      }
    }

    // Buy businesses in the focus sector, prefer as tuck-ins
    const platform = active.find(b => b.isPlatform && b.sectorId === bestSector);
    for (const deal of deals.slice(0, 3)) {
      if (state.cash < 2000) break;
      const structs = getAffordableStructures(deal, state);
      if (structs.length === 0) continue;

      if (platform && deal.business.sectorId === bestSector) {
        decisions.tuckIns.push({ deal, platformId: platform.id });
      } else {
        decisions.acquisitions.push({ deal, structurePreference: structs[0].type });
      }
    }

    // Unlock turnaround tiers for quality improvement (helps Q1/Q2 reach Q3+ for platforms)
    if (state.turnaroundTier < 2 && active.length >= 2 && state.cash > 2000) {
      decisions.unlockTurnaroundTier = true;
    }

    // Start turnarounds on Q1/Q2 businesses to bring them into platform territory
    if (state.turnaroundTier > 0) {
      for (const b of active) {
        if (b.qualityRating <= 2) {
          const programs = getEligiblePrograms(b, state.turnaroundTier, state.activeTurnarounds);
          if (programs.length > 0) {
            const cost = calculateTurnaroundCost(programs[0], b);
            if (state.cash > cost + 2000) {
              decisions.turnarounds.push({ businessId: b.id, programId: programs[0].id });
            }
          }
        }
      }
    }

    // Try to forge integrated platform
    if (active.length >= 3) {
      decisions.forgePlatforms = true;
    }

    return decisions;
  },

  decideEvent(_state: GameState, event: GameEvent): EventDecision | null {
    if (event.choices && event.choices.length > 0) {
      return { choiceIndex: 0 };
    }
    return null;
  },
};

// ── Strategy 3: Value Investor ──

export const ValueInvestor: PlaytestStrategy = {
  name: 'ValueInvestor',
  requires20yr: false,
  expectedFeatures: [
    'distribution', 'buyback', 'acquisition_cash',
    'quality_improvement', 'scoring_completed',
    'collect_phase', 'event_phase', 'allocate_phase', 'end_round',
    'margin_drift', 'operational_improvement',
  ],

  decideAllocations(state: GameState, deals: Deal[], _coverage: PlaytestCoverage): AllocateDecisions {
    const decisions = defaultDecisions();
    const active = getActiveBusinesses(state);

    // Only buy high-quality businesses at reasonable prices
    for (const deal of deals.slice(0, 3)) {
      if (state.cash < 5000) break;
      if (deal.business.qualityRating < 3) continue;
      if (deal.business.acquisitionMultiple > 6) continue;

      const structs = getAffordableStructures(deal, state, 'all_cash');
      if (structs.length > 0) {
        decisions.acquisitions.push({ deal, structurePreference: 'all_cash' });
        break; // Only one per round for discipline
      }
    }

    // Apply growth improvements on Q3+ businesses (core value creation)
    for (const b of active) {
      if (b.qualityRating >= 3) {
        for (const impType of GROWTH_LIST) {
          if (!b.improvements.some(i => i.type === impType)) {
            const absEbitda = Math.abs(b.ebitda) || 1;
            const estCost = Math.max(200, Math.round(absEbitda * 0.15));
            if (state.cash > estCost + 3000) {
              decisions.improvements.push({ businessId: b.id, improvementType: impType });
              break;
            }
          }
        }
      } else if (b.qualityRating <= 2) {
        // Stabilization for degraded businesses
        for (const impType of STABILIZATION_LIST) {
          if (!b.improvements.some(i => i.type === impType)) {
            const absEbitda = Math.abs(b.ebitda) || 1;
            const estCost = Math.max(200, Math.round(absEbitda * 0.15));
            if (state.cash > estCost + 3000) {
              decisions.improvements.push({ businessId: b.id, improvementType: impType });
              break;
            }
          }
        }
      }
    }

    // Distribute cash to shareholders when flush (lower threshold for earlier trigger)
    if (state.cash > 6000 && active.length >= 2 && state.round >= 3) {
      decisions.distributionAmount = Math.round(state.cash * 0.3);
    }

    // Do buybacks when equity is undervalued (lower threshold for earlier trigger)
    if (state.cash > 5000 && state.equityRaisesUsed > 0 && state.round > 3) {
      decisions.doBuyback = true;
    }

    // Sell low-quality businesses
    for (const b of active) {
      if (b.qualityRating <= 1 && state.round - b.acquisitionRound >= 3) {
        decisions.businessesToSell.push(b.id);
      }
    }

    return decisions;
  },

  decideEvent(_state: GameState, event: GameEvent): EventDecision | null {
    if (event.type === 'unsolicited_offer') {
      // Accept good offers (first choice is usually accept)
      return { choiceIndex: 0 };
    }
    if (event.choices && event.choices.length > 0) {
      // Pick the neutral or positive option
      const idx = event.choices.findIndex(c => c.variant === 'positive');
      return { choiceIndex: idx >= 0 ? idx : 0 };
    }
    return null;
  },
};

// ── Strategy 4: Turnaround Artist ──

export const TurnaroundArtist: PlaytestStrategy = {
  name: 'TurnaroundArtist',
  requires20yr: false,
  expectedFeatures: [
    'turnaround_started', 'turnaround_resolved',
    'acquisition_cash', 'acquisition_leveraged',
    'collect_phase', 'event_phase', 'allocate_phase', 'end_round',
    'scoring_completed', 'margin_drift', 'quality_improvement',
    'operational_improvement', 'stabilization_improvement',
    'ceiling_mastery_bonus', 'turnaround_exit_premium',
  ],

  decideAllocations(state: GameState, deals: Deal[], _coverage: PlaytestCoverage): AllocateDecisions {
    const decisions = defaultDecisions();
    const active = getActiveBusinesses(state);

    // Unlock turnaround tiers aggressively
    if (state.turnaroundTier < 3 && active.length >= 2 && state.cash > 2000) {
      decisions.unlockTurnaroundTier = true;
    }

    // Buy cheap Q1/Q2 businesses to turnaround (tighter filter than before)
    for (const deal of deals.slice(0, 3)) {
      if (state.cash < 2000) break;
      if (active.length >= 8) break;
      // Only target Q1/Q2 — true turnaround candidates
      if (deal.business.qualityRating > 2) continue;

      const structs = getAffordableStructures(deal, state);
      if (structs.length > 0) {
        decisions.acquisitions.push({ deal, structurePreference: structs[0].type });
      }
    }

    // Also buy Q3 deals if portfolio is small (need volume for shared services)
    if (active.length < 3) {
      for (const deal of deals.slice(0, 3)) {
        if (state.cash < 2000) break;
        if (deal.business.qualityRating > 3) continue;
        // Skip if already in acquisitions
        if (decisions.acquisitions.some(a => a.deal.id === deal.id)) continue;
        const structs = getAffordableStructures(deal, state);
        if (structs.length > 0) {
          decisions.acquisitions.push({ deal, structurePreference: structs[0].type });
          break;
        }
      }
    }

    // Apply stabilization improvements on Q1/Q2 businesses
    for (const b of active) {
      if (b.qualityRating <= 2) {
        for (const impType of STABILIZATION_LIST) {
          if (!b.improvements.some(i => i.type === impType)) {
            const absEbitda = Math.abs(b.ebitda) || 1;
            const estCost = Math.max(200, Math.round(absEbitda * 0.15));
            if (state.cash > estCost + 1000) {
              decisions.improvements.push({ businessId: b.id, improvementType: impType });
              break; // One improvement per business per round
            }
          }
        }
      }
    }

    // Apply growth improvements on Q3+ businesses
    for (const b of active) {
      if (b.qualityRating >= 3) {
        for (const impType of GROWTH_LIST) {
          if (!b.improvements.some(i => i.type === impType)) {
            const absEbitda = Math.abs(b.ebitda) || 1;
            const estCost = Math.max(200, Math.round(absEbitda * 0.15));
            if (state.cash > estCost + 1000) {
              decisions.improvements.push({ businessId: b.id, improvementType: impType });
              break;
            }
          }
        }
      }
    }

    // Start turnarounds on low-quality businesses
    if (state.turnaroundTier > 0) {
      for (const b of active) {
        if (b.qualityRating <= 2) {
          const programs = getEligiblePrograms(b, state.turnaroundTier, state.activeTurnarounds);
          if (programs.length > 0) {
            const prog = programs[0];
            const cost = calculateTurnaroundCost(prog, b);
            if (state.cash > cost + 1000) {
              decisions.turnarounds.push({ businessId: b.id, programId: prog.id });
            }
          }
        }
      }
    }

    // Sell turnaround-improved businesses (Q3+ with tiers improved) for exit premium
    if (state.round >= 6) {
      for (const b of active) {
        if ((b.qualityImprovedTiers ?? 0) >= 2 && b.qualityRating >= 3 && state.round - b.acquisitionRound >= 3) {
          decisions.businessesToSell.push(b.id);
          break; // One per round
        }
      }
    }

    // Shared services for operational improvement
    if (active.length >= 3) {
      for (const svc of state.sharedServices) {
        if (!svc.active && state.cash > svc.unlockCost + 2000) {
          decisions.sharedServicesToUnlock.push(svc.type);
          break;
        }
      }
    }

    // Designate largest Q3+ business as platform (turnaround-improved businesses become platforms)
    const platforms = active.filter(b => b.isPlatform);
    if (platforms.length === 0 && active.length >= 2) {
      const q3Plus = active.filter(b => b.qualityRating >= 3);
      if (q3Plus.length > 0) {
        const biggest = [...q3Plus].sort((a, b) => b.ebitda - a.ebitda)[0];
        decisions.platformDesignations.push(biggest.id);
      }
    }

    // Forge integrated platforms when eligible
    if (active.length >= 3) {
      decisions.forgePlatforms = true;
    }

    return decisions;
  },

  decideEvent(_state: GameState, event: GameEvent): EventDecision | null {
    if (event.choices && event.choices.length > 0) {
      // Invest in recovery options when available
      const investIdx = event.choices.findIndex(c =>
        c.label.toLowerCase().includes('invest') || c.variant === 'positive'
      );
      return { choiceIndex: investIdx >= 0 ? investIdx : 0 };
    }
    return null;
  },
};

// ── Strategy 5: IPO Pathway (20yr only) ──

export const IPOPathway: PlaytestStrategy = {
  name: 'IPOPathway',
  requires20yr: true,
  expectedFeatures: [
    'ipo_executed', 'earnings_beat',
    'acquisition_cash', 'acquisition_leveraged',
    'equity_raise', 'shared_service_unlocked',
    'collect_phase', 'event_phase', 'allocate_phase', 'end_round',
    'scoring_completed', 'margin_drift', 'deal_inflation',
  ],

  decideAllocations(state: GameState, deals: Deal[], _coverage: PlaytestCoverage): AllocateDecisions {
    const decisions = defaultDecisions();
    const active = getActiveBusinesses(state);
    const totalEbitda = active.reduce((sum, b) => sum + b.ebitda, 0);

    // Phase 1 (rounds 1-8): Aggressive growth to build scale for IPO
    // Phase 2 (rounds 9+): IPO and public company management

    // Shared services and MA sourcing
    if (active.length >= 3) {
      for (const svc of state.sharedServices) {
        if (!svc.active && state.cash > svc.unlockCost + 3000) {
          decisions.sharedServicesToUnlock.push(svc.type);
          break;
        }
      }
    }
    if (state.maSourcing.tier < 2 && state.cash > 2000) {
      decisions.upgradeMASourcing = true;
    }

    // Designate platforms early
    if (active.filter(b => b.isPlatform).length === 0 && active.length >= 1) {
      const biggest = [...active].sort((a, b) => b.ebitda - a.ebitda)[0];
      decisions.platformDesignations.push(biggest.id);
    }

    // Forge platforms when eligible
    if (active.length >= 3) {
      decisions.forgePlatforms = true;
    }

    // Acquire to build portfolio EBITDA toward IPO threshold ($75M)
    if (totalEbitda < 100000 || active.length < 6) {
      for (const deal of deals.slice(0, 3)) {
        if (state.cash < 2000) break;
        const structs = getAffordableStructures(deal, state);
        if (structs.length > 0) {
          decisions.acquisitions.push({ deal, structurePreference: structs[0].type });
        }
      }
    }

    // Raise equity if needed to fund growth
    if (state.cash < 3000 && state.round < 10) {
      decisions.raiseEquity = true;
    }

    return decisions;
  },

  decideEvent(_state: GameState, event: GameEvent): EventDecision | null {
    if (event.choices && event.choices.length > 0) {
      return { choiceIndex: 0 };
    }
    return null;
  },
};

// ── Strategy 6: Family Office Endgame (20yr only) ──

export const FamilyOfficeEndgame: PlaytestStrategy = {
  name: 'FamilyOfficeEndgame',
  requires20yr: true,
  expectedFeatures: [
    'distribution', 'acquisition_cash',
    'quality_improvement', 'shared_service_unlocked',
    'collect_phase', 'event_phase', 'allocate_phase', 'end_round',
    'scoring_completed', 'margin_drift', 'operational_improvement',
  ],

  decideAllocations(state: GameState, deals: Deal[], _coverage: PlaytestCoverage): AllocateDecisions {
    const decisions = defaultDecisions();
    const active = getActiveBusinesses(state);

    // Strategy: Build a stable, high-quality portfolio and distribute heavily
    // to reach the $1B distribution threshold for Family Office eligibility

    // Shared services for stability
    if (active.length >= 3) {
      for (const svc of state.sharedServices) {
        if (!svc.active && state.cash > svc.unlockCost + 3000) {
          decisions.sharedServicesToUnlock.push(svc.type);
          break;
        }
      }
    }

    // Buy high-quality businesses
    for (const deal of deals.slice(0, 2)) {
      if (state.cash < 5000) break;
      if (active.length >= 6) break;
      if (deal.business.qualityRating < 3) continue;

      const structs = getAffordableStructures(deal, state, 'all_cash');
      if (structs.length > 0) {
        decisions.acquisitions.push({ deal, structurePreference: 'all_cash' });
      }
    }

    // Improvements: stabilization on Q1/Q2, growth on Q3+
    for (const b of active) {
      if (b.qualityRating <= 2) {
        for (const impType of STABILIZATION_LIST) {
          if (!b.improvements.some(i => i.type === impType)) {
            const absEbitda = Math.abs(b.ebitda) || 1;
            const estCost = Math.max(200, Math.round(absEbitda * 0.15));
            if (state.cash > estCost + 3000) {
              decisions.improvements.push({ businessId: b.id, improvementType: impType });
              break;
            }
          }
        }
      } else if (b.qualityRating >= 3) {
        for (const impType of GROWTH_LIST) {
          if (!b.improvements.some(i => i.type === impType)) {
            const absEbitda = Math.abs(b.ebitda) || 1;
            const estCost = Math.max(200, Math.round(absEbitda * 0.15));
            if (state.cash > estCost + 3000) {
              decisions.improvements.push({ businessId: b.id, improvementType: impType });
              break;
            }
          }
        }
      }
    }

    // Distribute cash heavily to build toward $1B threshold
    if (state.cash > 5000 && active.length >= 2) {
      decisions.distributionAmount = Math.round(state.cash * 0.5);
    }

    // Designate platforms and forge for stability
    if (active.filter(b => b.isPlatform).length === 0 && active.length >= 1) {
      const biggest = [...active].sort((a, b) => b.ebitda - a.ebitda)[0];
      decisions.platformDesignations.push(biggest.id);
    }
    if (active.length >= 3) {
      decisions.forgePlatforms = true;
    }

    // Turnarounds to improve quality
    if (state.turnaroundTier < 2 && active.length >= 2 && state.cash > 2000) {
      decisions.unlockTurnaroundTier = true;
    }
    if (state.turnaroundTier > 0) {
      for (const b of active) {
        if (b.qualityRating <= 2) {
          const programs = getEligiblePrograms(b, state.turnaroundTier, state.activeTurnarounds);
          if (programs.length > 0) {
            const cost = calculateTurnaroundCost(programs[0], b);
            if (state.cash > cost + 3000) {
              decisions.turnarounds.push({ businessId: b.id, programId: programs[0].id });
            }
          }
        }
      }
    }

    return decisions;
  },

  decideEvent(_state: GameState, event: GameEvent): EventDecision | null {
    if (event.choices && event.choices.length > 0) {
      // Conservative — pick positive or neutral options
      const idx = event.choices.findIndex(c => c.variant === 'positive' || c.variant === 'neutral');
      return { choiceIndex: idx >= 0 ? idx : 0 };
    }
    return null;
  },
};

// ── Strategy 7: PE Fund Manager ──

export const PEFundManager: PlaytestStrategy = {
  name: 'PEFundManager',
  requires20yr: false,
  expectedFeatures: [
    'fund_mode_started', 'management_fee_deducted', 'lp_distribution',
    'forced_liquidation', 'carry_earned', 'pe_scoring_completed',
    'acquisition_cash', 'acquisition_leveraged',
    'collect_phase', 'event_phase', 'allocate_phase', 'end_round',
    'scoring_completed', 'margin_drift', 'operational_improvement',
  ],

  decideAllocations(state: GameState, deals: Deal[], _coverage: PlaytestCoverage): AllocateDecisions {
    const decisions = defaultDecisions();
    const active = getActiveBusinesses(state);

    // PE Fund: deploy capital aggressively in first 5 years (investment period)
    const isInvestmentPeriod = state.round <= 5;

    // Upgrade MA sourcing early (fund starts at tier 1)
    if (state.maSourcing.tier < 2 && state.cash > 5000) {
      decisions.upgradeMASourcing = true;
    }

    // Shared services when portfolio is large enough
    if (active.length >= 3) {
      for (const svc of state.sharedServices) {
        if (!svc.active && state.cash > svc.unlockCost + 5000) {
          decisions.sharedServicesToUnlock.push(svc.type);
          break;
        }
      }
    }

    // Acquire during investment period
    if (isInvestmentPeriod && active.length < 8) {
      for (const deal of deals.slice(0, 3)) {
        if (state.cash < 5000) break;
        const structurePrefs = ['bank_debt', 'seller_note_bank_debt', 'all_cash'];
        for (const pref of structurePrefs) {
          const structs = getAffordableStructures(deal, state, pref);
          if (structs.length > 0) {
            decisions.acquisitions.push({ deal, structurePreference: pref });
            break;
          }
        }
      }
    }

    // Apply improvements to build value
    for (const b of active) {
      if (b.qualityRating >= 3) {
        for (const impType of GROWTH_LIST) {
          if (!b.improvements.some(i => i.type === impType)) {
            const absEbitda = Math.abs(b.ebitda) || 1;
            const estCost = Math.max(200, Math.round(absEbitda * 0.15));
            if (state.cash > estCost + 5000) {
              decisions.improvements.push({ businessId: b.id, improvementType: impType });
              break;
            }
          }
        }
      } else {
        for (const impType of STABILIZATION_LIST) {
          if (!b.improvements.some(i => i.type === impType)) {
            const absEbitda = Math.abs(b.ebitda) || 1;
            const estCost = Math.max(200, Math.round(absEbitda * 0.15));
            if (state.cash > estCost + 5000) {
              decisions.improvements.push({ businessId: b.id, improvementType: impType });
              break;
            }
          }
        }
      }
    }

    // Sell mature businesses in harvest period (years 6-9) for LP distributions
    if (!isInvestmentPeriod && state.round < 10) {
      for (const b of active) {
        if (state.round - b.acquisitionRound >= 3 && b.qualityRating >= 3) {
          decisions.businessesToSell.push(b.id);
          break; // One per round
        }
      }
    }

    // Designate platforms for value creation
    if (active.filter(b => b.isPlatform).length === 0 && active.length >= 1) {
      const biggest = [...active].sort((a, b) => b.ebitda - a.ebitda)[0];
      decisions.platformDesignations.push(biggest.id);
    }

    // Forge when eligible
    if (active.length >= 3) {
      decisions.forgePlatforms = true;
    }

    return decisions;
  },

  decideEvent(_state: GameState, event: GameEvent): EventDecision | null {
    if (event.choices && event.choices.length > 0) {
      const idx = event.choices.findIndex(c => c.variant === 'positive');
      return { choiceIndex: idx >= 0 ? idx : 0 };
    }
    return null;
  },
};

// ── Exports ──

export const ALL_STRATEGIES: PlaytestStrategy[] = [
  AggressiveAcquirer,
  PlatformBuilder,
  ValueInvestor,
  TurnaroundArtist,
  IPOPathway,
  FamilyOfficeEndgame,
];

/** PE Fund Manager is separate — it requires isFundManagerMode in the simulator */
export const PE_FUND_STRATEGY = PEFundManager;

export function getStrategiesForMode(duration: 'quick' | 'standard'): PlaytestStrategy[] {
  if (duration === 'quick') {
    return ALL_STRATEGIES.filter(s => !s.requires20yr);
  }
  return ALL_STRATEGIES;
}
