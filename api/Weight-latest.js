const weights = [];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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

    weights.unshift(entry);
    if (weights.length > 30) weights.pop();

    return res.status(200).json({ success: true, entry });
  }

  if (req.method === 'GET') {
    if (weights.length === 0) return res.status(404).json({ error: 'No weight data yet' });
    return res.status(200).json(weights[0]);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
