const STORAGE_KEY = 'holdco-nudges-seen-v1';

function getSeenNudges(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function hasSeenNudge(id: string): boolean {
  return getSeenNudges()[id] === true;
}

export function dismissNudge(id: string): void {
  const seen = getSeenNudges();
  seen[id] = true;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
}
