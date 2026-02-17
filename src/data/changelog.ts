export interface ChangelogSection {
  heading: string;
  items: string[];
}

export interface ChangelogEntry {
  date: string;
  title: string;
  sections: ChangelogSection[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: 'February 16, 2025',
    title: 'Bug Fixes & Action Feedback',
    sections: [
      {
        heading: 'Fixes',
        items: [
          'Fixed holdco loan state (balance, rate, rounds remaining) not persisting across page refreshes — loan payments could silently stop after reloading.',
          'Merge, improvement, and platform integration actions now show specific error toasts when they fail instead of silently doing nothing.',
        ],
      },
    ],
  },
  {
    date: 'February 16, 2025',
    title: 'Financial Crisis Event',
    sections: [
      {
        heading: 'New Global Event',
        items: [
          'Financial Crisis (~2% probability) — a rare, devastating event modeled after the 2008 GFC. Five simultaneous effects: exit multiples -1.0x, interest rate +2%, existing bank debt rates +1.5%, credit tightening for 2 rounds, and 3-4 distressed deals at 30-50% off.',
          'Distressed deals bypass the normal pipeline cap — the crisis floods the market with fire-sale opportunities for cash-rich allocators.',
          'The ultimate "did you keep powder dry?" test. Devastating for leveraged players, but a gift for disciplined capital allocators.',
        ],
      },
    ],
  },
  {
    date: 'February 16, 2025',
    title: 'Balance Tuning: Difficulty & Shared Services',
    sections: [
      {
        heading: 'Balance Changes',
        items: [
          'Easy mode leaderboard multiplier reduced from 1.0x to 0.9x — the capital advantage now carries a cost on the overall leaderboard. Hard mode keeps its 1.35x reward.',
          'Shared services costs increased ~18% across the board — unlocking shared services is no longer a trivial decision. The effects remain unchanged.',
          'API multiplier for Normal mode fixed to 1.35x (was incorrectly 1.15x server-side).',
        ],
      },
      {
        heading: 'Grandfathering',
        items: [
          'Existing leaderboard entries keep their original multiplier. Only new submissions use the updated values.',
        ],
      },
    ],
  },
  {
    date: 'February 16, 2025',
    title: 'Management Buyout Event',
    sections: [
      {
        heading: 'New Event',
        items: [
          'Management Buyout Proposal — your CEO may offer to buy the business at 85-90% of fair value. Accept for instant liquidity, or decline and risk the CEO leaving (quality -1) or staying resentful (-2% growth).',
        ],
      },
    ],
  },
  {
    date: 'February 16, 2025',
    title: 'Balance & Polish Update',
    sections: [
      {
        heading: 'Exit Valuation',
        items: [
          'Aggregate premium cap — total positive exit premiums now capped at the higher of 10x or 1.5x the base multiple. Prevents runaway valuations on stacked portfolios.',
          'Contested deal heat range tightened from 1.30-1.50x to 1.20-1.35x — still a meaningful auction premium, but less punishing.',
        ],
      },
      {
        heading: 'Deal Flow',
        items: [
          'Credit tightening now reduces deal heat by 1 tier — fewer competing buyers when bank financing is frozen.',
          'Earn-outs now expire after 4 years. Unpaid earn-outs are removed automatically, and a countdown shows on each business card.',
          '3 new platform recipes: B2B Back-Office Platform, Commercial RE Platform, Full-Service Dining Group (38 total, up from 35).',
        ],
      },
      {
        heading: 'Turnarounds',
        items: [
          'Scaled turnaround failure rates — bigger quality jumps now carry real risk. T3 programs can fail 10-15% of the time instead of a flat 5%.',
          'Healthcare and Wealth Management sectors now have a Q4 quality ceiling, joining SaaS and Industrial.',
        ],
      },
      {
        heading: 'Quality of Life',
        items: [
          'Turnaround programs now have descriptive names (Operational Cleanup, Full Restructuring, 100-Day Blitz, etc.).',
          'Platform sale bonus increased from 0.5x to 0.8x — selling a complete platform is now properly rewarded.',
          'User Manual corrections: leaderboard multiplier, quality ceilings, wind-down references cleaned up.',
        ],
      },
      {
        heading: 'By the Numbers',
        items: [
          '694 automated tests (up from 679)',
          '128 display-proofreader checks ensuring every number in the UI matches the engine',
        ],
      },
    ],
  },
  {
    date: 'February 16, 2025',
    title: 'Scoring Rebalance',
    sections: [
      {
        heading: 'Balance Changes',
        items: [
          'Hard mode leaderboard multiplier increased from 1.15x to 1.35x — better rewards the 4x capital disadvantage.',
          'FCF/Share Growth target raised from 300% to 400% (Standard) and 150% to 200% (Quick) — now requires real margin improvement, not just portfolio building.',
          'Quick Play ROIC target lowered from 25% to 20% — accounts for half the compounding runway.',
        ],
      },
    ],
  },
  {
    date: 'February 16, 2025',
    title: 'User Manual on Start Screen',
    sections: [
      {
        heading: 'Quality of Life',
        items: [
          'Added a User Manual link to the start screen — browse all game mechanics before starting a new run.',
        ],
      },
    ],
  },
  {
    date: 'February 16, 2025',
    title: 'Cleaner Allocate Screen',
    sections: [
      {
        heading: 'UI Cleanup',
        items: [
          'Moved leverage warning banners and covenant proximity gauge into the Leverage drilldown modal — tap the Leverage metric card to see all debt details, warnings, and covenant status in one place.',
          'Allocate phase is now less cluttered with more room for portfolio management.',
        ],
      },
    ],
  },
  {
    date: 'February 16, 2025',
    title: 'Covenant Proximity Warnings',
    sections: [
      {
        heading: 'Financial Visibility',
        items: [
          'New leverage gauge bar during Capital Allocation — see exactly how close you are to the 4.5x covenant breach threshold before spending cash.',
          'Cash headroom indicator shows how much you can safely spend before breaching covenants.',
          'Next-year debt service estimate (holdco + bank debt P&I) visible at a glance.',
          'End Year confirmation now includes a Year-End Forecast with leverage, debt service, and projected cash — with warnings if cash may go negative or you\'re near breach.',
        ],
      },
    ],
  },
  {
    date: 'February 16, 2025',
    title: 'Bankruptcy Detection Overhaul',
    sections: [
      {
        heading: 'Tighter Post-Restructuring Rules',
        items: [
          'Post-restructuring covenant breaches now accumulate — exiting breach no longer resets the counter. Any 2 breach years (even non-consecutive) after restructuring triggers bankruptcy.',
          'New insolvency check: if your equity value is completely wiped out after restructuring, the game ends immediately.',
          'Empty portfolio insolvency: no active businesses + no cash after restructuring = automatic dissolution.',
          'Breach description and User Manual updated to explain cumulative post-restructuring rules.',
        ],
      },
    ],
  },
  {
    date: 'February 15, 2025',
    title: 'Credit Tightening Balance',
    sections: [
      {
        heading: 'Game Balance',
        items: [
          'Credit tightening now lasts 1 round in Quick Play (10-year) games instead of 2 — a full credit freeze was too punishing for shorter games.',
        ],
      },
    ],
  },
  {
    date: 'February 15, 2025',
    title: 'Platform Sale Celebration',
    sections: [
      {
        heading: 'Exit Feedback',
        items: [
          'Selling an integrated platform now triggers a celebration overlay when MOIC is 1.5x or higher — same "Solid / Great / Incredible Exit" fanfare as regular business sales.',
        ],
      },
    ],
  },
  {
    date: 'February 15, 2025',
    title: 'M&A Infrastructure Copy Update',
    sections: [
      {
        heading: 'Clearer M&A Descriptions',
        items: [
          'M&A Infrastructure descriptions now highlight acquisition capacity unlocks alongside deal sourcing — no longer misleadingly sourcing-only.',
        ],
      },
    ],
  },
  {
    date: 'February 15, 2025',
    title: 'Integration Outcome Labels',
    sections: [
      {
        heading: 'Clearer Integration Feedback',
        items: [
          'Integration outcomes reworked — "Seamless," "Rocky," and "Troubled" replace the old binary pass/fail labels.',
          'Rocky integrations (partial outcomes) now surface with an amber notification card and toast — no longer invisible.',
          'Troubled integrations use the new label instead of the misleading "Integration Failed" text.',
        ],
      },
    ],
  },
  {
    date: 'February 15, 2025',
    title: 'Contested Deal Notification Fix',
    sections: [
      {
        heading: 'Clearer Outbid Feedback',
        items: [
          'Fixed conflicting notifications when outbid on a contested deal. You\'ll now see a clear red "Outbid" toast instead of a false "Acquired" success message.',
        ],
      },
    ],
  },
  {
    date: 'February 15, 2025',
    title: 'Platform Integrity Fix',
    sections: [
      {
        heading: 'Integrated Platforms Now Stay Tight',
        items: [
          'Merging two businesses no longer breaks their Integrated Platform membership. The merged company inherits platform bonuses and stays in the constituent list.',
          'New: Add businesses to existing platforms post-forge. Acquired a new MSP after forging your platform? You can now integrate it directly from the platform card.',
          'Platform dissolution now triggers properly after merges if sub-type diversity drops below the recipe minimum.',
          'Fixed orphaned platforms that couldn\'t be sold after all members were merged away.',
        ],
      },
    ],
  },
  {
    date: 'February 15, 2025',
    title: 'M&A Sourcing Clarity',
    sections: [
      {
        heading: 'Acquisition Capacity Now Visible',
        items: [
          'M&A Sourcing tier effects now show how many acquisitions you can attempt per year (Tier 1: 3/year, Tier 2+: 4/year, baseline: 2/year).',
          'User Manual updated with acquisition capacity per tier and baseline note.',
        ],
      },
    ],
  },
  {
    date: 'February 15, 2025',
    title: 'The "No More Free Lunches" Update',
    sections: [
      {
        heading: 'Restructuring Has Teeth Now',
        items: [
          '-20% FEV Penalty — Entering restructuring permanently reduces your final Founder Equity Value by 20%. Shows up on Game Over and leaderboard with an (R) badge.',
          'You must actually fix the problem — Must resolve the breach (get ND/E below 4.5x) before you can proceed. No more hand-waving.',
          'One-time lifeline, for real — If you\'ve already restructured and breach again, it\'s game over. The infinite restructuring loop is closed.',
        ],
      },
      {
        heading: 'Bank Debt Overhaul',
        items: [
          'Per-business bank debt — Bank debt is now tracked at the individual business level, not as a vague holdco pool.',
          'Pay down bank debt voluntarily — New option in the Capital tab lets you pay down bank debt on any specific business.',
          'Proper amortization — Bank debt now amortizes principal + interest correctly. The old interest-only exploit is gone.',
        ],
      },
      {
        heading: 'Wind Down Removed',
        items: [
          'Removed the Wind Down action entirely. Selling is strictly better in every scenario — EBITDA floors at 30%, exit multiples floor at 2.0x.',
        ],
      },
      {
        heading: 'Accuracy & Polish',
        items: [
          'Scoring table fixed — Manual now matches the actual engine scoring breakdown.',
          'Tuck-in discount corrected — Now shows 5-25% based on quality (was incorrectly showing flat 10%).',
          'Equity raise description corrected — Removed incorrect "Maximum 3 raises" language.',
          'Leaderboard FEV consistency — Adjusted FEV now displays consistently across all 6 tabs.',
          'Equity issuance feedback — 51% ownership floor now shows a clear warning instead of silent failure.',
          'Restructuring guards — Can no longer acquire businesses or raise equity while in active restructuring.',
        ],
      },
      {
        heading: 'By the Numbers',
        items: [
          '641 automated tests (up from 529)',
          '93 display-proofreader checks ensuring every number in the UI matches the engine',
        ],
      },
    ],
  },
  {
    date: 'February 14, 2025',
    title: 'The "Everything" Update',
    sections: [
      {
        heading: 'New: Integrated Platforms',
        items: [
          '35 platform recipes across all 15 sectors, modeled after real PE platforms.',
          '6 cross-sector recipes for ambitious builders: Financial Services, Tech-Enabled Services, Property Services, and more.',
          'Forge bonuses are permanent: +3-5ppt margin, +1-4% growth, +1-2x exit multiple expansion, and 15-25% recession resistance.',
          'Sell entire platforms at once with a +0.5x multiple bonus per constituent business.',
          'Thresholds scale by mode — Quick Play and Normal mode have lower EBITDA requirements.',
        ],
      },
      {
        heading: 'New: Turnaround Programs',
        items: [
          '3-tier unlock system: Portfolio Operations → Transformation Office → Interim Management.',
          '7 programs ranging from modest Q1→Q2 fixes to ambitious Q1→Q4 transformations.',
          'Real PE mechanics: 60-73% success rates, 22-35% partial outcomes, duration scaling by game mode.',
          'Portfolio fatigue — running 4+ turnarounds simultaneously costs -10ppt success rate.',
          'Exit premium — businesses that improve 2+ quality tiers earn a +0.25x exit multiple bonus.',
        ],
      },
      {
        heading: 'New: 6-Tab Leaderboard',
        items: [
          '6 tabs: Overall (adjusted FEV), Hard/20yr, Hard/10yr, Easy/20yr, Easy/10yr, and Distributions.',
          'Ghost row shows where your current run would land before you finish.',
          '500 entries stored, 50 displayed per tab.',
          'Fair comparison — mode-specific tabs use raw FEV; Overall tab applies difficulty multipliers.',
        ],
      },
      {
        heading: 'New: In-Game Manual',
        items: [
          '15 tabbed sections covering every system in the game.',
          'Searchable with sidebar navigation and prev/next buttons.',
          'Book icon in the game header — always one click away.',
        ],
      },
      {
        heading: 'Deal Flow UX Overhaul',
        items: [
          'Cash impact preview — every deal structure card shows color-coded "Cash After" so you know the impact instantly.',
          'Review unaffordable deals — can\'t afford it? You can still click "Review" to see structures.',
          'Inline equity raise — raise capital directly inside the deal modal without backing out.',
        ],
      },
      {
        heading: 'Mobile: Actually Playable Now',
        items: [
          '44px minimum touch targets everywhere — no more fat-finger misclicks.',
          'Responsive layouts — metrics stack into 2-col grids, modals resize properly, text scales.',
          'iOS zoom fix — inputs use 16px base font so Safari stops auto-zooming.',
          '~60 issues fixed across 17 files.',
        ],
      },
      {
        heading: 'Equity System Redesign',
        items: [
          'Escalating dilution — each raise discounts your share price by 10% more.',
          'Raise/buyback cooldown — 2-year gap required between raises and buybacks.',
          'No hard cap — the math punishes serial raises naturally. The 51% ownership floor is your natural limit.',
        ],
      },
      {
        heading: 'Balance & Exploit Closures',
        items: [
          'Last-round buying exploit closed — new seasoning multiplier scales exit premiums by hold time.',
          'Buyback arbitrage closed — pricing now uses full exit valuation.',
          'Quality valuation arbitrage closed — portfolio valuation now applies quality adjustments.',
          'Day-1 multiple expansion closed — acquisition size tier premiums netted out of exit valuation.',
          'Improvement cost floor — $200K minimum, plus quality-scaled multiplier.',
          'Scoring rebalanced — new "Value Creation" category (20pts). All categories rescaled.',
          'Sector data validated — 6 sub-sector overlaps resolved, 7 new sub-types added.',
        ],
      },
      {
        heading: 'Bug Fixes',
        items: [
          'EBITDA column on Game Over screen shows actual EBITDA instead of exit price for sold businesses.',
          'Equity issuance rounding fixed. DSCR calculation no longer includes earn-outs.',
          'Holdco interest display now includes distress penalty. Tax calculation now deducts M&A sourcing costs.',
          'Tuck-in earn-outs now actually get paid (previously skipped in the debt loop).',
          'Platform tuck-ins now work for forged integrated platforms.',
        ],
      },
      {
        heading: 'By the Numbers',
        items: [
          '529 automated tests (up from 347).',
          '16 development sessions. 5 save format migrations (v14 → v18).',
          'Tested across all 4 game modes with automated playtesting swarms.',
        ],
      },
    ],
  },
];
