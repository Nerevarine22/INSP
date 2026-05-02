import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const newData = req.body;
      const record = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        source: 'vercel-kv',
        ...newData
      };

      // Push to a list named 'calibration_data'
      await kv.lpush('calibration_data', record);
      
      // Limit to last 1000 records to avoid blowing up memory
      await kv.ltrim('calibration_data', 0, 999);

      return res.status(200).json({ success: true, count: await kv.llen('calibration_data') });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
