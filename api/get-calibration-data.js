import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const hasUrl = !!process.env.KV_REST_API_URL;
  const hasToken = !!process.env.KV_REST_API_TOKEN;

  if (!hasUrl || !hasToken) {
    return res.status(500).json({ error: 'KV Environment variables missing', details: { hasUrl, hasToken } });
  }

  try {
    // Get all records from the list
    const data = await kv.lrange('calibration_data', 0, -1);
    
    // Set cache control so we don't spam KV unnecessarily
    res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate');
    return res.status(200).json(data || []);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
