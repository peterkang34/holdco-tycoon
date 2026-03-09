import type { SeededRng } from '../engine/rng';

export type LPSpeaker = 'edna' | 'chip';

export type LPTriggerId =
  | 'year_1_start'
  | 'no_distributions_y3'
  | 'no_distributions_y5'
  | 'no_distributions_y7'
  | 'no_distributions_y9'
  | 'distribution_made'
  | 'large_distribution'
  | 'dpi_half'
  | 'dpi_full'
  | 'large_cash_reserve'
  | 'over_deployed'
  | 'business_distress'
  | 'strong_exit'
  | 'weak_exit'
  | 'harvest_period'
  | 'late_acquisition'
  | 'recession'
  | 'exceptional_growth'
  | 'mgmt_fee_shortfall'
  | 'earnout_skipped'
  | 'final_year'
  | 'termination_threat'
  | 'lpac_approved'
  | 'lpac_denied'
  | 'zero_businesses_extended'
  // Event reactions
  | 'event_recession'
  | 'event_boom'
  | 'event_negative'
  | 'event_positive'
  // Deal reactions
  | 'deal_expensive'
  | 'deal_leveraged'
  | 'deal_good_value'
  | 'deal_first'
  | 'deal_harvest_period';

/** LP quotes: 3 variants per trigger/speaker for seeded RNG variety */
const lpQuotes: Record<string, Partial<Record<LPSpeaker, string[]>>> = {
  year_1_start: {
    chip: [
      '$100M to deploy, let\'s get to work.',
      'Fresh capital, clean slate. Time to find some deals.',
      'The fund is open. Show me what you can do with $100M.',
    ],
  },
  no_distributions_y3: {
    edna: [
      'My board has started asking about distributions.',
      'Three years in. My board would like to see some capital returned.',
      'I\'ll need something to report on distributions at our next meeting.',
    ],
  },
  no_distributions_y5: {
    edna: [
      'Five years. No distributions. I need something to show my board.',
      'We\'re halfway through. Zero DPI is becoming difficult to defend.',
      'My board is asking pointed questions about when they\'ll see returns.',
    ],
  },
  no_distributions_y7: {
    edna: [
      'At this point, I\'m defending your fee arrangement in every meeting.',
      'Seven years of management fees and zero distributions. This is untenable.',
      'My board has formally questioned the fee structure given zero DPI.',
    ],
  },
  no_distributions_y9: {
    edna: [
      'I cannot in good conscience recommend re-upping with this fund.',
      'Nine years. I have nothing positive to report to my beneficiaries.',
      'Fund II is off the table. My board has made that clear.',
    ],
  },
  distribution_made: {
    edna: [
      'Noted. This will be well received by my board.',
      'Good. Distributions demonstrate discipline.',
      'I\'ll report this at our next meeting. Appreciated.',
    ],
    chip: [
      'Cash back already? I was hoping you\'d reinvest that.',
      'Fair enough — LPs like to see some return of capital.',
      'I get it, but don\'t leave returns on the table.',
    ],
  },
  large_distribution: {
    edna: [
      'This is exactly what we invested for. Well done.',
      'Substantial. My board will be very pleased with this return.',
      'This kind of capital return builds trust for the next fund.',
    ],
    chip: [
      'Big distribution. Are you sure you don\'t need that dry powder?',
      'Impressive return of capital. I hope you\'ve kept enough for follow-ons.',
      'That\'s real money back. Mixed feelings — but my accountant\'s happy.',
    ],
  },
  dpi_half: {
    edna: [
      'Half our capital returned. This is meaningful progress.',
      '0.5x DPI. We\'re on the right track.',
      'Halfway back. My board acknowledges the progress.',
    ],
  },
  dpi_full: {
    edna: [
      'Capital returned in full. Everything from here is profit.',
      '1.0x DPI. My board is satisfied. Now let\'s see what carry looks like.',
      'We\'ve been made whole. This is what institutional investing should look like.',
    ],
  },
  large_cash_reserve: {
    chip: [
      'That\'s a lot of cash sitting idle. Put it to work.',
      'You\'re paying management fees on uninvested capital. Find deals.',
      'I didn\'t commit to a money market fund. Deploy that capital.',
    ],
  },
  over_deployed: {
    edna: [
      'Over 90% deployed already? Where are our reserves?',
      'You\'ve deployed too aggressively. What happens if a deal goes sideways?',
      'I\'m concerned about the pace. We need reserves for follow-on support.',
    ],
  },
  business_distress: {
    edna: [
      'This covenant breach is deeply concerning. What\'s the recovery plan?',
      'A distressed portfolio company this early is not reassuring.',
      'My board will want a detailed write-up on this situation.',
    ],
    chip: [
      'Distressed asset? Could be an opportunity to buy in cheap.',
      'Rough patch. These things happen. Fix it or sell it.',
      'Every portfolio has a problem child. How you handle it matters.',
    ],
  },
  strong_exit: {
    edna: [
      'A strong exit. This is the kind of result we expect.',
      'Excellent realization. I hope the proceeds are distributed promptly.',
      'Well-timed exit. My board will be pleased.',
    ],
    chip: [
      'Great exit! That\'s why we\'re in this game.',
      'Love to see a big win. This is what PE is about.',
      'Beautiful multiple on that one. More of this, please.',
    ],
  },
  weak_exit: {
    edna: [
      'Selling at a loss is difficult to explain to my beneficiaries.',
      'This realization falls well below our expectations.',
      'A loss-making exit. I trust you\'ve learned from this.',
    ],
    chip: [
      'Sometimes you have to cut your losses. On to the next one.',
      'Not every deal works out. The portfolio matters, not one position.',
      'Tough break. I hope the rest of the portfolio offsets this.',
    ],
  },
  harvest_period: {
    edna: [
      'Year 6. The investment period is closed. I expect harvest discipline.',
      'We\'re now in the harvest period. Exits and distributions should be the focus.',
      'Time to start realizing value. My board expects meaningful DPI from here.',
    ],
    chip: [
      'Harvest time. Let\'s see what this portfolio is really worth.',
      'Investment period\'s done. Now the fun part — exits and carry.',
      'Year 6 already. I\'m expecting some fireworks from here.',
    ],
  },
  late_acquisition: {
    edna: [
      'New platform investment in the harvest period? My board expected exits by now.',
      'A new standalone this late? This is highly unusual.',
      'Deploying new capital this late concerns me. Focus on existing positions.',
    ],
    chip: [
      'If the deal is right, the deal is right. Timing be damned.',
      'Late-stage acquisition? Bold move. I respect the conviction.',
      'Breaking convention, but I\'ve seen it work. Make it count.',
    ],
  },
  recession: {
    edna: [
      'Recession conditions require conservative portfolio management.',
      'This downturn is concerning. Protect cash flow above all else.',
      'My board is watching closely. No heroics during a recession.',
    ],
    chip: [
      'Recession means bargains. This is when the best deals get done.',
      'Downturns create opportunity. I hope you have dry powder.',
      'Blood in the streets. Time to get greedy.',
    ],
  },
  exceptional_growth: {
    chip: [
      'Portfolio is humming. This is top-quartile performance.',
      'That EBITDA growth is exceptional. Keep the operational pressure on.',
      '20%+ growth across the portfolio? Outstanding execution.',
    ],
  },
  mgmt_fee_shortfall: {
    edna: [
      'You cannot cover the management fee. This is an operational failure.',
      'A GP who can\'t fund basic operations raises serious governance questions.',
      'Fee shortfall noted. I\'ve flagged this with outside counsel.',
    ],
  },
  earnout_skipped: {
    edna: [
      'Not a position a reputable GP should be in.',
      'Failing to honor earn-out obligations damages our reputation.',
      'Skipping earn-outs is a red flag in any LP due diligence.',
    ],
  },
  final_year: {
    edna: [
      'Year 10. Let\'s see where we land.',
      'The fund is closing. I expect a full accounting.',
      'Final year. My board is awaiting the carry waterfall.',
    ],
    chip: [
      'End of the road. Let\'s hope the carry check is worth it.',
      'Year 10. Time to tally up and see what we built.',
      'Last year. Whatever we\'ve got, we\'ve got. Let\'s close this out.',
    ],
  },
  termination_threat: {
    edna: [
      'I\'ve consulted outside counsel about our termination provisions.',
      'My board is reviewing the no-fault termination clause.',
      'We\'re evaluating all options, including early fund termination.',
    ],
  },
  lpac_approved: {
    edna: [
      'Noted. Proceed.',
      'We\'ll allow it, but I want quarterly updates on this position.',
      'Approved. Don\'t make me regret this.',
    ],
    chip: [
      'Go for it. Big bets, big returns.',
      'Approved. I like the conviction.',
      'Green light. Make it count.',
    ],
  },
  lpac_denied: {
    edna: [
      'The concentration risk is unacceptable given current portfolio performance.',
      'I have serious reservations about this concentration level.',
      'We cannot support further concentrated risk in this fund.',
    ],
  },
  zero_businesses_extended: {
    edna: [
      'There\'s nothing left to manage. We\'re counting the days until this fund expires.',
      'An empty portfolio with fees still accruing. My board is furious.',
      'No portfolio companies for over a year. What are we paying management fees for?',
    ],
  },
  // ── Event Reactions ──
  event_recession: {
    edna: [
      'Recession conditions. I trust you\'re stress-testing the portfolio.',
      'My board is watching closely. Protect value above all.',
      'Downturns separate the disciplined managers from the reckless ones.',
    ],
    chip: [
      'Recession means bargains. I hope you have dry powder ready.',
      'This is when the best vintage years are made. Stay aggressive.',
      'Blood in the streets. Time to deploy.',
    ],
  },
  event_boom: {
    edna: [
      'Strong tailwinds. Don\'t let the good times mask operational weakness.',
      'Rising tides lift all boats — my board wants to see alpha, not beta.',
      'Use this window to realize exits. Cycles don\'t last forever.',
    ],
    chip: [
      'Everything\'s running hot. Love to see it.',
      'Great environment for exits. Don\'t get greedy — take some chips off the table.',
      'Enjoy the boom, but remember what comes after.',
    ],
  },
  event_negative: {
    edna: [
      'Noted. I expect a plan for how you\'re managing through this.',
      'Headwinds are part of the business. Show me you can navigate them.',
      'My board will want an update on portfolio exposure to this.',
    ],
    chip: [
      'Bumps in the road. That\'s why we have a diversified portfolio.',
      'Not ideal, but these things happen. Stay the course.',
      'I\'ve seen worse. Keep your head down and execute.',
    ],
  },
  event_positive: {
    edna: [
      'Favorable conditions. Make the most of this window.',
      'Good news for the portfolio. I\'ll note this in my quarterly report.',
      'Helpful tailwind. Don\'t waste it.',
    ],
    chip: [
      'Nice break for the portfolio. Let\'s capitalize.',
      'Good timing. Markets are giving us a gift.',
      'Tailwinds! This is when you press the advantage.',
    ],
  },
  // ── Deal Reactions ──
  deal_expensive: {
    edna: [
      'That\'s a full price. I hope the growth thesis is airtight.',
      'Premium valuation. My board tracks entry multiples closely.',
      'I\'ll need to see operational improvement to justify that entry point.',
    ],
    chip: [
      'Paying up for quality? I can live with that — if you can grow into it.',
      'Not cheap. But sometimes you get what you pay for.',
      'Rich price. Make sure the value creation plan is real.',
    ],
  },
  deal_leveraged: {
    edna: [
      'That\'s significant leverage for one position. Monitor the covenants.',
      'A lot of debt on this deal. I hope the cash flow supports it.',
      'Leveraged entry noted. My risk committee will want an update.',
    ],
    chip: [
      'Heavy leverage — that\'s PE. Just make sure the business can service it.',
      'Bold structure. High risk, high reward.',
      'I like the leverage if the thesis is right. Big if.',
    ],
  },
  deal_good_value: {
    edna: [
      'Reasonable entry multiple. This is disciplined capital deployment.',
      'Fair value. The kind of deal that makes a good fund great.',
      'A sensible price. I appreciate the discipline.',
    ],
    chip: [
      'Nice entry point. This is why I back this fund.',
      'Good price for a solid business. Well done.',
      'That\'s the kind of value we should be finding. More of this.',
    ],
  },
  deal_first: {
    chip: [
      'First deal in the portfolio. The journey begins.',
      'Deal one. Let\'s see what you can build from here.',
      'First acquisition closed. Now show me what you can do with it.',
    ],
  },
  deal_harvest_period: {
    edna: [
      'A new acquisition in the harvest period. Unusual — explain the thesis.',
      'We\'re supposed to be exiting, not buying. This needs justification.',
      'My board expected distributions by now, not new deployments.',
    ],
  },
};

/**
 * Select an LP quote for a given trigger, using seeded RNG for deterministic variety.
 * Returns null if no quote exists for the trigger/speaker combination.
 */
export function selectLPQuote(
  triggerId: LPTriggerId,
  speaker: LPSpeaker,
  rng: SeededRng,
): string | null {
  const variants = lpQuotes[triggerId]?.[speaker];
  if (!variants || variants.length === 0) return null;
  const idx = Math.floor(rng.next() * variants.length);
  return variants[idx];
}

// ── Outcome-based LP reactions for carry waterfall (game over) ──

type OutcomeTier = 'legendary' | 'exceptional' | 'strong' | 'solid' | 'mediocre' | 'poor' | 'loss';

const outcomeQuotes: Record<OutcomeTier, { edna: string[]; chip: string[] }> = {
  legendary: {
    edna: [
      'This is the best fund I\'ve ever been part of. My board is already asking about Fund II.',
      'Extraordinary returns. You\'ve earned every cent of that carry.',
      'I\'ve been in this business 30 years. This is a top-decile result.',
    ],
    chip: [
      'Unbelievable. I\'m doubling my commitment to your next fund.',
      'That carry check is well deserved. What a ride.',
      'This is why I invest in PE. Legendary returns.',
    ],
  },
  exceptional: {
    edna: [
      'An exceptional result. My board is very pleased with the returns.',
      'Top-quartile performance across every metric. Well done.',
      'This is what institutional capital deserves. Outstanding fund management.',
    ],
    chip: [
      'Hell of a fund. I\'m in for the next one, no question.',
      'These are the kind of returns that make careers. Impressive.',
      'Excellent execution from start to finish. Count me in for Fund II.',
    ],
  },
  strong: {
    edna: [
      'A strong result. My board is satisfied and would consider a re-up.',
      'Above our expectations. This demonstrates real value creation.',
      'Solid above-hurdle returns. I\'ll recommend continued allocation.',
    ],
    chip: [
      'Good fund. Not spectacular, but definitely above average.',
      'Strong returns. I\'d back you again.',
      'Respectable carry. You did what you said you\'d do.',
    ],
  },
  solid: {
    edna: [
      'You cleared the hurdle. Adequate, if not exceptional.',
      'A satisfactory result. My board will want to see improvement in Fund II.',
      'Returns met the minimum threshold. There\'s room for growth.',
    ],
    chip: [
      'Cleared the hurdle. Not bad, not great. Middle of the pack.',
      'Decent result. I\'d consider another fund, depending on terms.',
      'You did okay. Not going to lie, I was hoping for more.',
    ],
  },
  mediocre: {
    edna: [
      'Below the hurdle. My board is disappointed.',
      'We didn\'t get our preferred return. A difficult conversation awaits.',
      'Subpar performance. I cannot recommend re-allocation.',
    ],
    chip: [
      'Under the hurdle? That\'s tough. At least we got capital back.',
      'No carry earned. I expected better, honestly.',
      'Disappointing. The deals were there — the execution wasn\'t.',
    ],
  },
  poor: {
    edna: [
      'A significant loss of value. My board is furious.',
      'This is the worst performing fund in our portfolio. Unacceptable.',
      'I will be recommending we never allocate to this team again.',
    ],
    chip: [
      'We lost money. There\'s really no way to spin this.',
      'Brutal result. I\'ve learned an expensive lesson here.',
      'I trusted you with my capital and this is what I got. Painful.',
    ],
  },
  loss: {
    edna: [
      'A catastrophic outcome. My beneficiaries have been materially harmed.',
      'Total failure. I\'ve initiated a review with outside counsel.',
      'This fund will be studied as a cautionary tale.',
    ],
    chip: [
      'I can\'t believe how badly this went. Just... wow.',
      'A complete disaster. I should have stuck with index funds.',
      'This is the kind of loss that ends careers. And partnerships.',
    ],
  },
};

/**
 * Determine outcome tier from carry waterfall results.
 */
function getOutcomeTier(grossMoic: number, hurdleCleared: boolean, netIrr: number): OutcomeTier {
  if (grossMoic < 0.7) return 'loss';
  if (grossMoic < 1.0) return 'poor';
  if (!hurdleCleared) return 'mediocre';
  if (netIrr >= 0.25) return 'legendary';
  if (netIrr >= 0.20) return 'exceptional';
  if (netIrr >= 0.15) return 'strong';
  return 'solid';
}

/**
 * Generate outcome-based LP reactions for the carry waterfall game-over screen.
 * Returns one Edna quote and one Chip quote based on actual fund performance.
 */
export function getOutcomeReactions(
  grossMoic: number,
  hurdleCleared: boolean,
  netIrr: number,
  rng: SeededRng,
): { speaker: LPSpeaker; text: string }[] {
  const tier = getOutcomeTier(grossMoic, hurdleCleared, netIrr);
  const quotes = outcomeQuotes[tier];
  const ednaIdx = Math.floor(rng.next() * quotes.edna.length);
  const chipIdx = Math.floor(rng.next() * quotes.chip.length);
  return [
    { speaker: 'edna', text: quotes.edna[ednaIdx] },
    { speaker: 'chip', text: quotes.chip[chipIdx] },
  ];
}

/**
 * Get all available speakers for a trigger.
 */
export function getTriggerSpeakers(triggerId: LPTriggerId): LPSpeaker[] {
  const entry = lpQuotes[triggerId];
  if (!entry) return [];
  return Object.keys(entry) as LPSpeaker[];
}
