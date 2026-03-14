/**
 * Server-side achievement evaluator for game_history rows.
 * Evaluates which achievements a player has earned across ALL their games,
 * using both top-level columns (works for legacy games) and strategy JSON.
 *
 * This is the single source of truth for server-side achievement computation.
 */

/** Initial capital by difficulty (mirrors DIFFICULTY_CONFIG) */
const INITIAL_CAPITAL: Record<string, number> = {
  easy: 20000,
  normal: 5000,
};

/**
 * Evaluate achievements from a single game_history row.
 * Returns the set of achievement IDs provably earned from this game.
 */
function evaluateGameAchievements(game: Record<string, unknown>): string[] {
  const earned: string[] = [];

  const grade = game.grade as string | undefined;
  const difficulty = game.difficulty as string | undefined;
  const duration = game.duration as string | undefined;
  const businessCount = (game.business_count as number) ?? 0;
  const founderEquityValue = (game.founder_equity_value as number) ?? 0;
  const initialCapital = INITIAL_CAPITAL[difficulty ?? ''] ?? 20000;

  // Strategy JSON (may be null for legacy games)
  const strategy = game.strategy as Record<string, unknown> | null;

  // Score breakdown (from top-level columns or strategy)
  const scoreValueCreation = (game.score_value_creation as number) ?? (strategy?.scoreBreakdown as Record<string, number> | undefined)?.valueCreation ?? 0;
  const scoreFcfShareGrowth = (game.score_fcf_share_growth as number) ?? (strategy?.scoreBreakdown as Record<string, number> | undefined)?.fcfShareGrowth ?? 0;
  const scorePortfolioRoic = (game.score_portfolio_roic as number) ?? (strategy?.scoreBreakdown as Record<string, number> | undefined)?.portfolioRoic ?? 0;
  const scoreCapitalDeployment = (game.score_capital_deployment as number) ?? (strategy?.scoreBreakdown as Record<string, number> | undefined)?.capitalDeployment ?? 0;
  const scoreBalanceSheet = (game.score_balance_sheet as number) ?? (strategy?.scoreBreakdown as Record<string, number> | undefined)?.balanceSheetHealth ?? 0;
  const scoreStrategicDiscipline = (game.score_strategic_discipline as number) ?? (strategy?.scoreBreakdown as Record<string, number> | undefined)?.strategicDiscipline ?? 0;

  // ── Achievements evaluable from top-level columns (works for ALL games) ──

  // first_acquisition: if you have businesses, you acquired at least one
  if (businessCount >= 1) earned.push('first_acquisition');

  // portfolio_builder: 5+ active businesses
  if (businessCount >= 5) earned.push('portfolio_builder');

  // s_tier: S grade
  if (grade === 'S') earned.push('s_tier');

  // hard_mode_hero: A or S on Hard (difficulty='normal')
  if (difficulty === 'normal' && (grade === 'S' || grade === 'A')) earned.push('hard_mode_hero');

  // speed_run: B+ on Quick Play
  if (duration === 'quick' && ['S', 'A', 'B'].includes(grade ?? '')) earned.push('speed_run');

  // value_creation_machine: FEV >= 10x initial capital
  if (initialCapital > 0 && founderEquityValue >= initialCapital * 10) earned.push('value_creation_machine');

  // the_contrarian: 3+ acquisitions and B+ grade (from top-level if businessCount >= 3)
  if (businessCount >= 3 && ['S', 'A', 'B'].includes(grade ?? '')) earned.push('the_contrarian');

  // ── Achievements from score breakdown columns (works for games with score data) ──

  // the_compounder: Portfolio ROIC >= 12
  if (scorePortfolioRoic >= 12) earned.push('the_compounder');

  // balanced_allocator: all 6 dimensions >= 10
  if (scoreValueCreation >= 10 && scoreFcfShareGrowth >= 10 && scorePortfolioRoic >= 10 &&
      scoreCapitalDeployment >= 10 && scoreBalanceSheet >= 10 && scoreStrategicDiscipline >= 10) {
    earned.push('balanced_allocator');
  }

  // ── Achievements from strategy JSON (only for games with strategy data) ──

  if (strategy) {
    const totalAcquisitions = (strategy.totalAcquisitions as number) ?? 0;
    const totalSells = (strategy.totalSells as number) ?? 0;
    const platformsForged = (strategy.platformsForged as number) ?? 0;
    const turnaroundsStarted = (strategy.turnaroundsStarted as number) ?? 0;
    const totalDistributions = (strategy.totalDistributions as number) ?? 0;
    const antiPatterns = strategy.antiPatterns as string[] | undefined;
    const dealStructureTypes = strategy.dealStructureTypes as Record<string, number> | undefined;
    const sectorIds = strategy.sectorIds as string[] | undefined;
    const isFundManager = strategy.isFundManager === true;
    const carryEarned = (strategy.carryEarned as number) ?? 0;

    // More precise first_acquisition from strategy
    if (totalAcquisitions >= 1 && !earned.includes('first_acquisition')) earned.push('first_acquisition');

    // exit_strategist: sold at least one business
    if (totalSells >= 1) earned.push('exit_strategist');

    // platform_architect: built at least one platform
    if (platformsForged >= 1) earned.push('platform_architect');

    // roll_up_machine: 3+ platforms
    if (platformsForged >= 3) earned.push('roll_up_machine');

    // turnaround_artist: 3+ turnarounds started
    if (turnaroundsStarted >= 3) earned.push('turnaround_artist');

    // first_distribution: returned cash to shareholders
    if (totalDistributions > 0) earned.push('first_distribution');

    // deal_architect: 4+ unique deal structure types
    if (dealStructureTypes && Object.keys(dealStructureTypes).length >= 4) earned.push('deal_architect');

    // sector_specialist: 3+ active businesses all in same sector
    if (sectorIds && sectorIds.length === 1 && businessCount >= 3) earned.push('sector_specialist');

    // More precise the_contrarian from strategy
    if (totalAcquisitions >= 3 && ['S', 'A', 'B'].includes(grade ?? '') && !earned.includes('the_contrarian')) {
      earned.push('the_contrarian');
    }

    // clean_sheet: zero anti-patterns + B+ grade
    if (antiPatterns && antiPatterns.length === 0 && ['S', 'A', 'B'].includes(grade ?? '')) {
      earned.push('clean_sheet');
    }

    // carry_king: $20M+ carry in PE mode
    if (isFundManager && carryEarned >= 20_000) earned.push('carry_king');

    // lp_whisperer: 90%+ LP satisfaction (not stored in game_history — skip for backfill)
    // This can only be tracked via earnedAchievementIds on new games

    // If the game already has earnedAchievementIds, include them directly
    const storedIds = strategy.earnedAchievementIds as string[] | undefined;
    if (Array.isArray(storedIds)) {
      for (const id of storedIds) {
        if (typeof id === 'string' && !earned.includes(id)) {
          earned.push(id);
        }
      }
    }
  }

  return earned;
}

/**
 * Compute all earned achievement IDs across a player's entire game history.
 * Returns a deduplicated array of achievement IDs.
 */
export function computePlayerAchievements(games: Record<string, unknown>[]): string[] {
  const allEarned = new Set<string>();

  for (const game of games) {
    const gameAchievements = evaluateGameAchievements(game);
    for (const id of gameAchievements) {
      allEarned.add(id);
    }
  }

  return [...allEarned].sort();
}
