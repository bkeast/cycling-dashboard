import { put, get } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { weight_lbs, weight_kg, date, token } = req.body;

    if (token !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let lbs = weight_lbs;
    if (!lbs && weight_kg) lbs = (parseFloat(weight_kg) * 2.20462).toFixed(1);
    if (!lbs || isNaN(parseFloat(lbs))) {
      return res.status(400).json({ error: 'Invalid weight value' });
    }

    const entry = {
      weight_lbs: parseFloat(lbs).toFixed(1),
      date: date || new Date().toISOString().split('T')[0],
      recorded_at: new Date().toISOString()
    };

    // Load existing log
    let log = [];
    try {
      const existing = await get('weight-log.json');
      if (existing) {
        const text = await existing.text();
        log = JSON.parse(text);
      }
    } catch(e) {}

    // Upsert by date
    const idx = log.findIndex(e => e.date === entry.date);
    if (idx >= 0) log[idx] = entry;
    else log.unshift(entry);
    if (log.length > 90) log = log.slice(0, 90);

    await put('weight-log.json', JSON.stringify(log), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false
    });

    return res.status(200).json({ success: true, entry });
  }

  if (req.method === 'GET') {
    try {
      const blob = await get('weight-log.json');
      if (!blob) return res.status(404).json({ error: 'No weight data yet' });
      const text = await blob.text();
      const log = JSON.parse(text);
      const date = req.query && req.query.date;
      if (date) {
        const entry = log.find(e => e.date === date);
        if (!entry) return res.status(404).json({ error: 'No weight for ' + date });
        return res.status(200).json(entry);
      }
      return res.status(200).json(log[0]);
    } catch(e) {
      return res.status(404).json({ error: 'No weight data yet' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
