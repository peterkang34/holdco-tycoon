import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createAdminToken } from '../_lib/adminAuth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const password = req.headers.authorization?.replace('Bearer ', '');
  if (!password || password !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const token = await createAdminToken();
    return res.status(200).json({ token });
  } catch {
    return res.status(500).json({ error: 'Failed to create session' });
  }
}
