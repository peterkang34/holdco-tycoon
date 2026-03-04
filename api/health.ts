import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const checks = {
    supabaseAdmin: supabaseAdmin !== null,
    kv: false,
  };

  try {
    await kv.ping();
    checks.kv = true;
  } catch { /* KV unreachable */ }

  const ok = checks.supabaseAdmin && checks.kv;
  return res.status(ok ? 200 : 503).json({ ok, checks });
}
