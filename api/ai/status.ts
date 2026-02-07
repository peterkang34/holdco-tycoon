import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Check if API key is configured
  const isEnabled = !!process.env.ANTHROPIC_API_KEY;

  return res.status(200).json({
    enabled: isEnabled,
  });
}
