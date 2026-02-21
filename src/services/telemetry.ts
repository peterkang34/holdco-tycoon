import { getDeviceType, getPlayerId, getGameNumber } from '../utils/device';

const TELEMETRY_ENDPOINT = '/api/telemetry/event';
const SESSION_ID_KEY = 'holdco-tycoon-session-id';
const SESSION_META_KEY = 'holdco-tycoon-session-meta';

interface SessionMeta {
  sessionId: string;
  difficulty: string;
  duration: string;
  sector: string;
  round: number;
  maxRounds: number;
  startedAt: number;
  isChallenge: boolean;
}

function saveSessionMeta(meta: SessionMeta): void {
  try { localStorage.setItem(SESSION_META_KEY, JSON.stringify(meta)); } catch {}
}

function getSessionMeta(): SessionMeta | null {
  try {
    const raw = localStorage.getItem(SESSION_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearSessionMeta(): void {
  try { localStorage.removeItem(SESSION_META_KEY); } catch {}
}

function sendEvent(payload: Record<string, unknown>): void {
  try {
    fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

function sendBeaconEvent(payload: Record<string, unknown>): void {
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    navigator.sendBeacon(TELEMETRY_ENDPOINT, blob);
  } catch {}
}

let beforeUnloadHandler: (() => void) | null = null;
let _pageViewSent = false;

// Dedup set for feature_used events (per session)
const _featuresTracked = new Set<string>();

export function trackGameStart(difficulty: string, duration: string, sector: string, maxRounds: number, isChallenge: boolean): void {
  // Check if there's an uncompleted previous session
  const prevMeta = getSessionMeta();
  if (prevMeta) {
    // Send abandon for previous session
    sendEvent({
      event: 'game_abandon',
      sessionId: prevMeta.sessionId,
      difficulty: prevMeta.difficulty,
      duration: prevMeta.duration,
      sector: prevMeta.sector,
      round: prevMeta.round,
      maxRounds: prevMeta.maxRounds,
      playerId: getPlayerId(),
      device: getDeviceType(),
      isChallenge: prevMeta.isChallenge,
      sessionDurationMs: Date.now() - prevMeta.startedAt,
    });
  }

  // Create new session
  const sessionId = crypto.randomUUID();
  localStorage.setItem(SESSION_ID_KEY, sessionId);

  const gameNumber = getGameNumber();
  const startedAt = Date.now();
  const meta: SessionMeta = { sessionId, difficulty, duration, sector, round: 1, maxRounds, startedAt, isChallenge };
  saveSessionMeta(meta);

  // Reset per-session dedup
  _featuresTracked.clear();

  // Fire game_start event
  sendEvent({
    event: 'game_start',
    sessionId,
    difficulty,
    duration,
    sector,
    maxRounds,
    playerId: getPlayerId(),
    gameNumber,
    isChallenge,
    device: getDeviceType(),
    referrer: document.referrer || undefined,
  });

  // Register beforeunload for abandon detection
  if (beforeUnloadHandler) {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
  }
  beforeUnloadHandler = () => {
    const currentMeta = getSessionMeta();
    if (currentMeta) {
      sendBeaconEvent({
        event: 'game_abandon',
        sessionId: currentMeta.sessionId,
        difficulty: currentMeta.difficulty,
        duration: currentMeta.duration,
        sector: currentMeta.sector,
        round: currentMeta.round,
        maxRounds: currentMeta.maxRounds,
        playerId: getPlayerId(),
        device: getDeviceType(),
        isChallenge: currentMeta.isChallenge,
        sessionDurationMs: Date.now() - currentMeta.startedAt,
      });
      clearSessionMeta();
    }
  };
  window.addEventListener('beforeunload', beforeUnloadHandler);
}

export interface GameCompleteSnapshot {
  round: number;
  maxRounds: number;
  difficulty: string;
  duration: string;
  sector: string;
  grade: string;
  fev: number;
  isChallenge: boolean;
  // Phase 2 snapshot fields
  score?: number;
  scoreBreakdown?: Record<string, number>;
  businessCount?: number;
  totalAcquisitions?: number;
  totalSells?: number;
  totalDistributions?: number;
  totalBuybacks?: number;
  equityRaisesUsed?: number;
  peakLeverage?: number;
  hasRestructured?: boolean;
  peakDistressLevel?: number;
  platformsForged?: number;
  turnaroundsStarted?: number;
  turnaroundsSucceeded?: number;
  turnaroundsFailed?: number;
  sharedServicesActive?: number;
  maSourcingTier?: number;
  sectorIds?: string[];
  dealStructureTypes?: Record<string, number>;
  rolloverEquityCount?: number;
  strategyArchetype?: string;
  antiPatterns?: string[];
  sophisticationScore?: number;
}

export function trackGameComplete(snapshot: GameCompleteSnapshot): void {
  const sessionId = localStorage.getItem(SESSION_ID_KEY) || '';
  const meta = getSessionMeta();

  sendEvent({
    event: 'game_complete',
    sessionId,
    ...snapshot,
    playerId: getPlayerId(),
    device: getDeviceType(),
    gameNumber: undefined, // Not re-incremented; already tracked on start
    sessionDurationMs: meta ? Date.now() - meta.startedAt : undefined,
  });

  // Clean up
  clearSessionMeta();
  if (beforeUnloadHandler) {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    beforeUnloadHandler = null;
  }
}

export function trackGameAbandon(round: number, maxRounds: number, difficulty: string, duration: string, sector: string, isChallenge: boolean): void {
  const sessionId = localStorage.getItem(SESSION_ID_KEY) || '';
  const meta = getSessionMeta();

  sendBeaconEvent({
    event: 'game_abandon',
    sessionId,
    round,
    maxRounds,
    difficulty,
    duration,
    sector,
    playerId: getPlayerId(),
    device: getDeviceType(),
    isChallenge,
    sessionDurationMs: meta ? Date.now() - meta.startedAt : undefined,
  });

  clearSessionMeta();
  if (beforeUnloadHandler) {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    beforeUnloadHandler = null;
  }
}

export function updateSessionRound(round: number): void {
  try {
    const meta = getSessionMeta();
    if (meta) {
      meta.round = round;
      saveSessionMeta(meta);
    }
  } catch {}
}

/** Page view — fires once per page load */
export function trackPageView(): void {
  if (_pageViewSent) return;
  _pageViewSent = true;

  const search = window.location.search;
  const isChallenge = search.includes('c=');
  const isScoreboard = search.includes('s=');

  sendEvent({
    event: 'page_view',
    playerId: getPlayerId(),
    device: getDeviceType(),
    referrer: document.referrer || undefined,
    isChallenge,
    isScoreboard,
  });
}

/** Challenge mode events */
export function trackChallengeCreate(code: string): void {
  sendEvent({
    event: 'challenge_create',
    playerId: getPlayerId(),
    device: getDeviceType(),
    challengeCode: code,
  });
}

export function trackChallengeShare(code: string, method: 'clipboard' | 'native_share'): void {
  sendEvent({
    event: 'challenge_share',
    playerId: getPlayerId(),
    device: getDeviceType(),
    challengeCode: code,
    shareMethod: method,
  });
}

export function trackScoreboardView(code: string): void {
  sendEvent({
    event: 'scoreboard_view',
    playerId: getPlayerId(),
    device: getDeviceType(),
    challengeCode: code,
  });
}

/** Feature adoption — fires once per feature per session */
export function trackFeatureUsed(feature: string, round: number): void {
  if (_featuresTracked.has(feature)) return;
  _featuresTracked.add(feature);

  sendEvent({
    event: 'feature_used',
    playerId: getPlayerId(),
    device: getDeviceType(),
    feature,
    round,
  });
}

/** Event choice tracking */
export function trackEventChoice(eventType: string, choiceAction: string, round: number): void {
  sendEvent({
    event: 'event_choice',
    playerId: getPlayerId(),
    device: getDeviceType(),
    eventType,
    choiceAction,
    round,
  });
}
