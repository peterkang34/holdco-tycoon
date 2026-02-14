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

export function trackGameStart(difficulty: string, duration: string, sector: string, maxRounds: number): void {
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
    });
  }

  // Create new session
  const sessionId = crypto.randomUUID();
  localStorage.setItem(SESSION_ID_KEY, sessionId);

  const meta: SessionMeta = { sessionId, difficulty, duration, sector, round: 1, maxRounds };
  saveSessionMeta(meta);

  // Fire game_start event
  sendEvent({
    event: 'game_start',
    sessionId,
    difficulty,
    duration,
    sector,
    maxRounds,
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
      });
      clearSessionMeta();
    }
  };
  window.addEventListener('beforeunload', beforeUnloadHandler);
}

export function trackGameComplete(round: number, maxRounds: number, difficulty: string, duration: string, sector: string, grade: string, fev: number): void {
  const sessionId = localStorage.getItem(SESSION_ID_KEY) || '';

  sendEvent({
    event: 'game_complete',
    sessionId,
    round,
    maxRounds,
    difficulty,
    duration,
    sector,
    grade,
    fev: Math.round(fev),
  });

  // Clean up
  clearSessionMeta();
  if (beforeUnloadHandler) {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    beforeUnloadHandler = null;
  }
}

export function trackGameAbandon(round: number, maxRounds: number, difficulty: string, duration: string, sector: string): void {
  const sessionId = localStorage.getItem(SESSION_ID_KEY) || '';

  sendBeaconEvent({
    event: 'game_abandon',
    sessionId,
    round,
    maxRounds,
    difficulty,
    duration,
    sector,
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
