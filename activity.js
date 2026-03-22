const activityData = [];

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

    const existing = activityData.findIndex(e => e.date === entry.date);
    if (existing >= 0) activityData[existing] = entry;
    else activityData.unshift(entry);
    if (activityData.length > 30) activityData.pop();

    return res.status(200).json({ success: true, entry });
  }

  if (req.method === 'GET') {
    const date = req.query && req.query.date;
    if (date) {
      const entry = activityData.find(e => e.date === date);
      if (!entry) return res.status(404).json({ error: 'No data for ' + date });
      return res.status(200).json(entry);
    }
    if (activityData.length === 0) return res.status(404).json({ error: 'No activity data yet' });
    return res.status(200).json(activityData[0]);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
