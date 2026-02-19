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
    date: 'February 19, 2025',
    title: 'Challenger Mode Fix',
    sections: [
      {
        heading: 'Bug Fix',
        items: [
          'Fixed a bug where challenge scores from players on the same WiFi network would silently fail to submit. All players on shared networks can now submit their scores reliably.',
          'Score submission now retries automatically if the server is temporarily unavailable, and a manual Retry button is shown if all retries fail.',
        ],
      },
    ],
  },
  {
    date: 'February 19, 2025',
    title: 'Integrated Platform Exit Valuation Fix',
    sections: [
      {
        heading: 'Balance Fix',
        items: [
          'Fixed a bug where a star performer inside an integrated platform could sell for more individually than as part of a platform sale. The integrated platform premium (from forging) now stacks on top of the earned premium cap instead of competing with it — so forging a platform always adds its full multiple expansion benefit.',
        ],
      },
    ],
  },
  {
    date: 'February 18, 2025',
    title: 'Shared Services Description Accuracy',
    sections: [
      {
        heading: 'UI Fix',
        items: [
          'Fixed shared service effect descriptions to accurately reflect what each service does mechanically. Finance, Recruiting, Procurement, and Technology all defend margins — this was happening in-game but not shown in descriptions.',
          'Removed misleading "reinvestment efficiency" language from Technology & Systems — the actual effect is organic growth +0.5% and margin defense.',
        ],
      },
    ],
  },
  {
    date: 'February 18, 2025',
    title: 'Merge Staging & Multiple Transparency',
    sections: [
      {
        heading: 'Balance',
        items: [
          'Merging two standalone companies now creates a Scale 2 platform (was Scale 1). Merges are now more impactful than simply designating a platform — reflecting the greater complexity of combining two businesses.',
          'Platform exit premium now caps at Scale 5 (+1.0x max) to prevent runaway values from chain merges.',
        ],
      },
      {
        heading: 'UI',
        items: [
          'The merge confirmation preview now shows the blended acquisition multiple of both companies, so you can see the implied valuation before committing.',
          'Fixed incorrect merge cost in Roll-Up Guide (was "10% of combined EBITDA", now correctly shows "15% of smaller business EBITDA").',
          'Fixed Scale 3 multiple expansion bonus in Roll-Up Guide (was +0.9x, now correctly shows +1.0x).',
        ],
      },
    ],
  },
  {
    date: 'February 18, 2025',
    title: 'Covenant Breach Fix: Sell-All Death Spiral',
    sections: [
      {
        heading: 'Balance Fix',
        items: [
          'Selling your last business with holdco debt no longer traps you in permanent covenant breach. If you have enough cash to cover your debt, you enter Covenant Watch instead — you can still make all-cash acquisitions to rebuild your portfolio.',
          'Updated the game manual to explain the zero-EBITDA solvency check and recovery path.',
        ],
      },
    ],
  },
  {
    date: 'February 18, 2025',
    title: 'Challenge Scoreboard Persists on Refresh',
    sections: [
      {
        heading: 'Fix',
        items: [
          'Fixed a bug where refreshing the browser after finishing a challenge game would hide the scoreboard — challenge status now persists across page reloads.',
        ],
      },
    ],
  },
  {
    date: 'February 18, 2025',
    title: 'Challenge Mode Fixes & Persistent Scoreboard',
    sections: [
      {
        heading: 'Fixes',
        items: [
          'Challenge difficulty and duration now apply correctly to all players — previously recipients always got Easy mode regardless of the creator\'s settings.',
          'Seeded RNG fully wired up — all players now get identical starting businesses, market events, organic growth, turnaround outcomes, and deal flow. Every source of randomness is now deterministic from the shared seed.',
          'Fixed 13 remaining unseeded random calls in player-action handlers (sell, improve, acquire, source deals) — outcomes are now consistent across players.',
        ],
      },
      {
        heading: 'New',
        items: [
          'Persistent Scoreboard Link — bookmark or share a link to your challenge results. Come back anytime within 30 days to check scores, no need to keep the tab open.',
          'Scoreboard results now kept for 30 days (previously 7).',
        ],
      },
    ],
  },
  {
    date: 'February 18, 2025',
    title: 'Cash Forecast Accuracy',
    sections: [
      {
        heading: 'Fixes',
        items: [
          'Year-End Forecast now accounts for seller note principal, MA sourcing costs, turnaround costs, and earnout payments — previously only holdco P&I and bank debt P&I were included, making the projection consistently too optimistic.',
          'Fixed holdco interest being double-counted in the forecast (subtracted twice).',
          'Net FCF and FCF/Share drilldowns now use correct holdco loan balance instead of total debt for interest calculations.',
          'Tax shield calculations now include the distress interest penalty across all views.',
        ],
      },
    ],
  },
  {
    date: 'February 18, 2025',
    title: 'Live Challenge Scoreboard',
    sections: [
      {
        heading: 'New',
        items: [
          'Live Challenge Scoreboard — when you finish a challenge, your result auto-submits to a shared scoreboard. See who has finished (scores stay hidden) and wait for the big reveal.',
          'Host Reveal — the challenge creator controls when scores are unveiled. Hit "Reveal Scores" for the dramatic moment.',
          'Automatic fallback — if the server is unreachable, you\'ll seamlessly fall back to manual result code comparison.',
        ],
      },
    ],
  },
  {
    date: 'February 18, 2025',
    title: 'Challenge Friends Mode',
    sections: [
      {
        heading: 'New',
        items: [
          'Challenge Friends — share a link so friends play the same seed with identical deals, events, and market conditions. Compare results side-by-side when everyone finishes.',
          'Seeded deterministic RNG — every game now has a unique seed. Same seed guarantees identical game conditions for fair competition.',
          'Result comparison — paste up to 3 opponent result codes to see who built the best holdco on the same seed.',
          'Create challenges from the intro screen — generate and share a challenge link, then jump straight into the game.',
          'Challenge mode banner — see a persistent indicator during gameplay when playing a challenge, with a "Copy Link" button to easily share the challenge URL with friends mid-game.',
        ],
      },
    ],
  },
  {
    date: 'February 17, 2025',
    title: 'Next Year Cash Forecast',
    sections: [
      {
        heading: 'New',
        items: [
          'Added a "Next Year Forecast" summary card above the End Year button during the Allocate phase — see your current cash, estimated FCF, debt service, and projected year-end cash at a glance without opening the End Year confirmation.',
        ],
      },
    ],
  },
  {
    date: 'February 17, 2025',
    title: 'Cash Flow & Restart Fixes',
    sections: [
      {
        heading: 'Fixes',
        items: [
          'Fixed false bankruptcy on game restart — starting a new game after a bankruptcy no longer carries over the old bankrupt status.',
          'Cash flow estimates in the Collection phase are now much more accurate — turnaround costs, cash conversion bonuses, and earn-out expirations are now properly reflected in projections.',
        ],
      },
    ],
  },
  {
    date: 'February 17, 2025',
    title: '4 New Choice-Based Events',
    sections: [
      {
        heading: 'New Events',
        items: [
          'Key-Man Risk — your star operator gets poached. Pay golden handcuffs (15% EBITDA, 55% chance they stay), invest in a succession plan (quality restores after 2 years), or accept the quality hit.',
          'Earn-Out Dispute — when a business underperforms its earn-out targets, the seller comes knocking. Settle at 50%, fight in court (70% win chance), or renegotiate to 55%.',
          'Supplier Pricing Power Shift — a key supplier raises prices, compressing margins by 3ppt. Absorb the hit (recover 2ppt), switch suppliers (full recovery but -5% revenue), or vertically integrate (+1ppt bonus, requires 2+ same-sector businesses).',
          'Industry Consolidation Boom — a sector heats up with +20% deal price premiums. If you own 2+ businesses in the booming sector, you get access to an exclusive tuck-in deal at normal pricing.',
        ],
      },
      {
        heading: 'Fixes',
        items: [
          'Fixed bolt-on bank debt not being deducted from sale proceeds — selling platforms with leveraged bolt-ons now correctly accounts for all outstanding debt.',
          'Sold businesses now properly zero out earn-out obligations.',
        ],
      },
    ],
  },
  {
    date: 'February 17, 2025',
    title: 'Dashboard Stats Fix',
    sections: [
      {
        heading: 'Fix',
        items: [
          'Fixed a bug where refreshing the browser would momentarily zero out all dashboard stats (EBITDA, Net FCF, ROIC, ROIIC, etc.) before restoring them.',
        ],
      },
    ],
  },
  {
    date: 'February 17, 2025',
    title: 'Turnaround UI Redesign',
    sections: [
      {
        heading: 'UX Overhaul',
        items: [
          'Turnaround tier unlock and upgrade moved to the Shared Services tab — an amber-themed card alongside M&A Infrastructure, so all capability investments live in one place.',
          'Start turnarounds directly from business cards — each eligible business now shows a "Turnaround" button that opens a dedicated program selection modal.',
          'Active turnaround progress badges appear on each business card, showing program name, quality target, and a progress bar.',
          'Collapsible "Active Turnarounds" summary card at the top of the Portfolio tab gives you a quick portfolio-wide view without the clutter.',
          'Portfolio tab is significantly decluttered — turnaround numbers only appear where they\'re relevant.',
        ],
      },
    ],
  },
  {
    date: 'February 17, 2025',
    title: 'Leverage & Debt Display Fixes',
    sections: [
      {
        heading: 'Fixes',
        items: [
          'Fixed holdco name from a previous game bleeding into the inter-year chronicle card when starting a new game.',
          'Leverage modal now correctly breaks out Holdco Loan vs Opco Bank Debt instead of lumping all bank debt under one misleading label.',
          'Debt totals in the Leverage modal now include tuck-in (integrated) business obligations — previously only counted standalone businesses.',
          'Cash headroom calculation now accounts for all debt types including seller notes, preventing inflated headroom numbers.',
        ],
      },
    ],
  },
  {
    date: 'February 16, 2025',
    title: 'Better Cash Projections',
    sections: [
      {
        heading: 'UX Improvement',
        items: [
          'Year-end cash projections now include estimated net free cash flow from your portfolio — no longer shows misleadingly negative numbers when you have profitable businesses.',
          'Covenant headroom modal and Allocate Phase both show projected yr-end cash that accounts for business FCF minus taxes, interest, and shared services.',
        ],
      },
    ],
  },
  {
    date: 'February 16, 2025',
    title: 'Rollover Equity',
    sections: [
      {
        heading: 'New Deal Structure',
        items: [
          'Rollover Equity — the most common PE acquisition structure in the lower-middle-market. The seller reinvests ~25% as equity, reducing your cash outlay and keeping them aligned.',
          'Standard mode: 65% cash / 25% rollover / 10% seller note. Quick mode: 70% / 20% / 10%. Both include growth and margin bonuses from an aligned seller.',
          'Requires M&A Sourcing Tier 2+ and Quality 3+. Not available for distressed sellers or burnt-out operators.',
          'At exit, seller receives their rollover share of net proceeds. Merging two businesses with different rollover creates a weighted average.',
          'Game-end FEV correctly deducts rollover claims from portfolio value. MOIC uses gross proceeds — measures deal quality, not ownership structure.',
        ],
      },
    ],
  },
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
