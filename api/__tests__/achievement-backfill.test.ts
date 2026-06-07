import { describe, it, expect } from 'vitest';
import { computePlayerAchievements } from '../_lib/achievementBackfill.js';
import { createGameHistoryRow } from './helpers.js';

/**
 * Scenario Challenges are a sealed sandbox: they must never contribute to a player's
 * GLOBAL achievements. This guards the server-side backdoor — a rigged scenario
 * (admin-set starting economy + suspended sector unlock gates) could otherwise farm
 * the column-derived achievements (s_tier, portfolio_builder, value_creation_machine)
 * that gate sectors in normal play. Mirrors the client-side shouldEarnAchievements().
 */
describe('computePlayerAchievements — scenario sandbox exclusion', () => {
  // A high-performing game row that WOULD earn several column-derived achievements.
  const winningOverrides = {
    grade: 'S',          // s_tier
    difficulty: 'normal', // hard_mode_hero (with S)
    duration: 'quick',    // speed_run (with S/A/B)
    business_count: 6,    // first_acquisition + portfolio_builder
    founder_equity_value: 500000, // value_creation_machine (>= 10x initial)
  };

  it('grants column-derived achievements for a NORMAL game', () => {
    const games = [createGameHistoryRow(winningOverrides)];
    const earned = computePlayerAchievements(games);
    expect(earned).toContain('s_tier');
    expect(earned).toContain('portfolio_builder');
    expect(earned).toContain('first_acquisition');
  });

  it('grants NOTHING for the same game tagged as a scenario challenge', () => {
    const games = [createGameHistoryRow({ ...winningOverrides, scenario_challenge_id: 'recession-gauntlet' })];
    expect(computePlayerAchievements(games)).toEqual([]);
  });

  it('ignores legacy stored earnedAchievementIds on a scenario row', () => {
    // Even if a pre-fix scenario row persisted earnedAchievementIds, the chokepoint
    // early-returns before merging them.
    const games = [createGameHistoryRow({
      scenario_challenge_id: 'recession-gauntlet',
      strategy: { earnedAchievementIds: ['s_tier', 'trophy_hunter'] },
    })];
    expect(computePlayerAchievements(games)).toEqual([]);
  });

  it('counts only the non-scenario games when history mixes both', () => {
    const games = [
      createGameHistoryRow({ id: 'g1', ...winningOverrides }), // normal → earns
      createGameHistoryRow({ id: 'g2', ...winningOverrides, scenario_challenge_id: 'sc-1' }), // scenario → ignored
    ];
    const earned = computePlayerAchievements(games);
    expect(earned).toContain('s_tier');
    expect(earned.length).toBeGreaterThan(0);
  });
});
