/**
 * Validates that the Road to Carry preset scenarios all pass
 * `validateScenarioConfig` cleanly — guards against drift if someone tweaks
 * the validator or the preset configs.
 */
import { describe, it, expect } from 'vitest';
import { buildRoadToCarryPresets } from './roadToCarry';
import { validateScenarioConfig } from '../scenarioChallenges';

describe('Road to Carry preset scenarios', () => {
  const presets = buildRoadToCarryPresets();

  it('produces 5 scenarios with unique ids', () => {
    expect(presets).toHaveLength(5);
    const ids = presets.map(p => p.id);
    expect(new Set(ids).size).toBe(5);
  });

  it.each(buildRoadToCarryPresets().map(p => [p.id, p]))(
    '%s validates without errors',
    (_id, config) => {
      const { errors } = validateScenarioConfig(config);
      expect(errors, `${config.id} validation errors: ${errors.join('; ')}`).toEqual([]);
    },
  );

  it('all scenarios have triggers with applyFevMultiplier (Phase 5 milestones)', () => {
    for (const preset of presets) {
      const hasMultiplierTrigger = (preset.triggers ?? []).some(t =>
        t.actions.some(a => a.type === 'applyFevMultiplier'),
      );
      expect(hasMultiplierTrigger, `${preset.id} should define at least one milestone`).toBe(true);
    }
  });

  it('all scenarios start isActive: false + isFeatured: false (admin reviews before activating)', () => {
    for (const preset of presets) {
      expect(preset.isActive).toBe(false);
      expect(preset.isFeatured).toBe(false);
    }
  });

  it('all scenarios have non-empty narrative on every trigger (player-facing toast copy)', () => {
    for (const preset of presets) {
      for (const t of preset.triggers ?? []) {
        expect(t.narrative.title.length, `${preset.id}/${t.id}.title`).toBeGreaterThan(0);
        expect(t.narrative.detail.length, `${preset.id}/${t.id}.detail`).toBeGreaterThan(0);
      }
    }
  });
});
