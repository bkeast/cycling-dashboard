import { put, get } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { steps, active_calories, date, token } = req.body;

    if (token !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const entry = {
      steps: steps ? parseInt(steps) : 0,
      active_calories: active_calories ? parseInt(active_calories) : 0,
      date: date || new Date().toISOString().split('T')[0],
      recorded_at: new Date().toISOString()
    };

    // Load existing log
    let log = [];
    try {
      const existing = await get('activity-log.json');
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

    await put('activity-log.json', JSON.stringify(log), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false
    });

    return res.status(200).json({ success: true, entry });
  }

  if (req.method === 'GET') {
    try {
      const blob = await get('activity-log.json');
      if (!blob) return res.status(404).json({ error: 'No activity data yet' });
      const text = await blob.text();
      const log = JSON.parse(text);
      const date = req.query && req.query.date;
      if (date) {
        const entry = log.find(e => e.date === date);
        if (!entry) return res.status(404).json({ error: 'No activity for ' + date });
        return res.status(200).json(entry);
      }
      if (log.length === 0) return res.status(404).json({ error: 'No activity data yet' });
      return res.status(200).json(log[0]);
    } catch(e) {
      return res.status(404).json({ error: 'No activity data yet' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
