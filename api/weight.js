export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { weight_lbs, date, token } = req.body;

    if (token !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!weight_lbs || isNaN(parseFloat(weight_lbs))) {
      return res.status(400).json({ error: 'Invalid weight value' });
    }

    const entry = {
      weight_lbs: parseFloat(weight_lbs).toFixed(1),
      date: date || new Date().toISOString().split('T')[0],
      recorded_at: new Date().toISOString()
    };

    return res.status(200).json({ success: true, entry });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'Weight endpoint active' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
