/**
 * Every starter template must compile to a validator-clean, immediately-playable config —
 * an admin should never load a template that opens in an error state.
 */
import { describe, it, expect } from 'vitest';
import { SCENARIO_TEMPLATES } from '../templates';
import { compileScenarioDraft, decompileConfig } from '../compileDraft';
import { validateScenarioConfig } from '../../scenarioChallenges';

const NOW = new Date('2026-06-06T00:00:00Z');

describe('scenario builder templates', () => {
  it('ships the 4 planned templates', () => {
    expect(SCENARIO_TEMPLATES.map((t) => t.id).sort()).toEqual(
      ['high-rate', 'pe-fund', 'permanent-capital', 'search-fund'],
    );
  });

  for (const t of SCENARIO_TEMPLATES) {
    it(`"${t.label}" compiles to a validator-clean config`, () => {
      const cfg = compileScenarioDraft(t.build(NOW));
      expect(validateScenarioConfig(cfg).errors).toEqual([]);
    });

    it(`"${t.label}" round-trips losslessly through the builder`, () => {
      const cfg = compileScenarioDraft(t.build(NOW));
      const recompiled = compileScenarioDraft(decompileConfig(cfg));
      expect(recompiled).toEqual(cfg);
    });
  }

  it('the PE Fund template is the only PE-mode template', () => {
    const peTemplates = SCENARIO_TEMPLATES.filter((t) => !!t.build(NOW).fundStructure);
    expect(peTemplates.map((t) => t.id)).toEqual(['pe-fund']);
    expect(compileScenarioDraft(SCENARIO_TEMPLATES.find((t) => t.id === 'pe-fund')!.build(NOW)).rankingMetric).not.toBe('fev');
  });
});
