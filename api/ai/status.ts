import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const isEnabled = !!process.env.ANTHROPIC_API_KEY;

  return res.status(200).json({
    enabled: isEnabled,
  });
}
