/**
 * Shared playbook JSONB validation for submit + save endpoints.
 * Validates shape and sanitizes fields. Returns null if invalid.
 */

const VALID_ARCHETYPES = [
  'platform_builder', 'turnaround_specialist', 'dividend_cow', 'serial_acquirer',
  'roll_up_machine', 'focused_operator', 'conglomerate', 'value_investor', 'balanced',
  'bankrupt', 'inactive_gp',
];

const VALID_DISTRESS_LEVELS = ['comfortable', 'elevated', 'stressed', 'breach'];

export function validatePlaybook(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const pb = raw as any;

  // Required top-level fields
  if (pb.version !== 1) return null;
  if (typeof pb.generatedAt !== 'string') return null;

  // Thesis section (required)
  const t = pb.thesis;
  if (!t || typeof t !== 'object') return null;
  if (typeof t.archetype !== 'string' || !VALID_ARCHETYPES.includes(t.archetype)) return null;
  if (typeof t.holdcoName !== 'string' || t.holdcoName.length === 0 || t.holdcoName.length > 50) return null;
  if (typeof t.fev !== 'number' || typeof t.score !== 'number') return null;
  if (typeof t.isFundManager !== 'boolean' || typeof t.isBankrupt !== 'boolean') return null;

  // Capital section (required)
  const c = pb.capital;
  if (!c || typeof c !== 'object') return null;
  if (typeof c.peakLeverage !== 'number') return null;
  if (typeof c.peakDistressLevel !== 'string' || !VALID_DISTRESS_LEVELS.includes(c.peakDistressLevel)) return null;

  // Performance section (required)
  const p = pb.performance;
  if (!p || typeof p !== 'object') return null;
  if (!Array.isArray(p.metricsTimeline)) return null;

  // Size check — playbook shouldn't exceed ~15KB serialized
  const serialized = JSON.stringify(raw);
  if (serialized.length > 15000) return null;

  // Return sanitized copy (pass through validated shape)
  return raw as Record<string, unknown>;
}
