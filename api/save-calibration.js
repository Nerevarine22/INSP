import { kv } from '@vercel/kv';
import Redis from 'ioredis';

// Singleton for ioredis to prevent connection leaks
let redisClient = null;
function getRedis() {
  if (process.env.KV_REST_API_URL) return kv;
  if (!redisClient && process.env.REDIS_URL) {
    redisClient = new Redis(process.env.REDIS_URL);
  }
  return redisClient;
}

export default async function handler(req, res) {
  const client = getRedis();

  if (!client) {
    return res.status(500).json({ 
      error: 'No Redis configuration found', 
      note: 'Please ensure either KV_REST_API_URL or REDIS_URL is set in environment variables.' 
    });
  }

  if (req.method === 'POST') {
    try {
      const newData = req.body;
      const record = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        source: process.env.KV_REST_API_URL ? 'vercel-kv' : 'direct-redis',
        ...newData
      };

      if (process.env.KV_REST_API_URL) {
        // Use @vercel/kv (REST)
        await kv.lpush('calibration_data', record);
        await kv.ltrim('calibration_data', 0, 999);
      } else {
        // Use ioredis (Direct)
        await client.lpush('calibration_data', JSON.stringify(record));
        await client.ltrim('calibration_data', 0, 999);
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
