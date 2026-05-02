import { kv } from '@vercel/kv';
import Redis from 'ioredis';

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
    return res.status(500).json({ error: 'No Redis configuration found' });
  }

  try {
    let data;
    if (process.env.KV_REST_API_URL) {
      data = await kv.lrange('calibration_data', 0, -1);
    } else {
      const rawData = await client.lrange('calibration_data', 0, -1);
      data = rawData.map(item => JSON.parse(item));
    }
    
    res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate');
    return res.status(200).json(data || []);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
