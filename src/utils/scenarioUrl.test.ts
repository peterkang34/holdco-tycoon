/**
 * Tests for src/utils/scenarioUrl — URL param parsing + builders.
 * Phase 3C (player entry UI).
 */

import { describe, it, expect } from 'vitest';
import {
  parseScenarioUrl,
  buildScenarioPlayUrl,
  buildScenarioLeaderboardUrl,
} from './scenarioUrl';

describe('parseScenarioUrl', () => {
  it('returns null when no scenario params present', () => {
    expect(parseScenarioUrl('')).toBeNull();
    expect(parseScenarioUrl('?foo=bar')).toBeNull();
  });

  it('parses ?se={id} as play intent', () => {
    expect(parseScenarioUrl('?se=recession-gauntlet')).toEqual({
      intent: 'play',
      scenarioId: 'recession-gauntlet',
    });
  });

  it('parses ?se={id}&preview=1 as preview intent', () => {
    expect(parseScenarioUrl('?se=recession-gauntlet&preview=1')).toEqual({
      intent: 'preview',
      scenarioId: 'recession-gauntlet',
    });
  });

  it('parses ?tab=scenarios as leaderboard intent with no focus', () => {
    expect(parseScenarioUrl('?tab=scenarios')).toEqual({
      intent: 'leaderboard',
      scenarioId: null,
    });
  });

  it('parses ?tab=scenarios&scenario={id} as leaderboard with focus', () => {
    expect(parseScenarioUrl('?tab=scenarios&scenario=healthcare-empire')).toEqual({
      intent: 'leaderboard',
      scenarioId: 'healthcare-empire',
    });
  });

  it('rejects invalid slug format (path traversal)', () => {
    expect(parseScenarioUrl('?se=../evil')).toBeNull();
    expect(parseScenarioUrl('?tab=scenarios&scenario=../../etc')).toEqual({
      intent: 'leaderboard',
      scenarioId: null, // slug validation drops the invalid scenario
    });
  });

  it('rejects uppercase slug (KV keys are case-sensitive)', () => {
    expect(parseScenarioUrl('?se=My-Scenario')).toBeNull();
  });

  it('rejects slug longer than 60 chars', () => {
    expect(parseScenarioUrl(`?se=${'a'.repeat(61)}`)).toBeNull();
  });

  it('se takes precedence over tab when both present', () => {
    // ?se=x&tab=scenarios — se wins; this is a play intent, not a leaderboard intent.
    expect(parseScenarioUrl('?se=recession-gauntlet&tab=scenarios')).toEqual({
      intent: 'play',
      scenarioId: 'recession-gauntlet',
    });
  });

  it('accepts URLSearchParams directly', () => {
    const params = new URLSearchParams('?se=saas-or-bust');
    expect(parseScenarioUrl(params)).toEqual({
      intent: 'play',
      scenarioId: 'saas-or-bust',
    });
  });

  it('preview=0 or missing does not trigger preview intent', () => {
    expect(parseScenarioUrl('?se=x&preview=0')).toEqual({
      intent: 'play',
      scenarioId: 'x',
    });
    expect(parseScenarioUrl('?se=x&preview=yes')).toEqual({
      intent: 'play',
      scenarioId: 'x',
    });
  });
});

describe('buildScenarioPlayUrl', () => {
  it('produces a URL with ?se={id}', () => {
    expect(buildScenarioPlayUrl('recession-gauntlet', 'https://game.holdcoguide.com'))
      .toBe('https://game.holdcoguide.com/?se=recession-gauntlet');
  });

  it('URL-encodes the id', () => {
    // Slugs shouldn't contain special chars, but defensively the builder encodes.
    expect(buildScenarioPlayUrl('a-b-c', 'https://example.com'))
      .toBe('https://example.com/?se=a-b-c');
  });
});

describe('buildScenarioLeaderboardUrl', () => {
  it('produces ?tab=scenarios when no id', () => {
    expect(buildScenarioLeaderboardUrl(null, 'https://example.com'))
      .toBe('https://example.com/?tab=scenarios');
  });

  it('produces ?tab=scenarios&scenario={id} when id provided', () => {
    expect(buildScenarioLeaderboardUrl('recession-gauntlet', 'https://example.com'))
      .toBe('https://example.com/?tab=scenarios&scenario=recession-gauntlet');
  });
});

describe('round-trip: build → parse', () => {
  it('parseScenarioUrl can read what buildScenarioPlayUrl produces', () => {
    const url = new URL(buildScenarioPlayUrl('test-scenario', 'https://example.com'));
    expect(parseScenarioUrl(url.search)).toEqual({
      intent: 'play',
      scenarioId: 'test-scenario',
    });
  });

  it('parseScenarioUrl can read what buildScenarioLeaderboardUrl produces', () => {
    const url = new URL(buildScenarioLeaderboardUrl('test-scenario', 'https://example.com'));
    expect(parseScenarioUrl(url.search)).toEqual({
      intent: 'leaderboard',
      scenarioId: 'test-scenario',
    });
  });
});
