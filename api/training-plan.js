export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const icalUrl = process.env.TRAININGPEAKS_ICAL_URL;
    if (!icalUrl) return res.status(500).json({ error: 'iCal URL not configured' });

    const response = await fetch(icalUrl.replace('webcal://', 'https://'));
    if (!response.ok) return res.status(502).json({ error: 'Could not fetch TrainingPeaks calendar' });

    const text = await response.text();
    const events = parseICal(text);

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate');
    return res.status(200).json({ events });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}

function parseICal(text) {
  const events = [];
  const blocks = text.split('BEGIN:VEVENT');
  blocks.shift();

  for (const block of blocks) {
    const get = (key) => {
      const patterns = [
        new RegExp(`${key};[^:]*:([^\\r\\n]+)`),
        new RegExp(`${key}:([^\\r\\n]+)`)
      ];
      for (const p of patterns) {
        const m = block.match(p);
        if (m) return m[1].trim();
      }
      return null;
    };

    const dtstart = get('DTSTART');
    const summary = get('SUMMARY');
    const description = get('DESCRIPTION');
    const uid = get('UID');

    if (!dtstart || !summary) continue;

    const date = parseICalDate(dtstart);
    if (!date) continue;

    const workout = {
      uid,
      date,
      title: decodeICal(summary),
      description: description ? decodeICal(description).substring(0, 500) : '',
      type: detectWorkoutType(summary, description),
      tss: extractTSS(description),
      duration: extractDuration(description),
      completed: false
    };

    events.push(workout);
  }

  return events.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function parseICalDate(str) {
  if (!str) return null;
  const clean = str.replace(/[TZ]/g, '').substring(0, 8);
  if (clean.length < 8) return null;
  return `${clean.substring(0,4)}-${clean.substring(4,6)}-${clean.substring(6,8)}`;
}

function decodeICal(str) {
  return str
    .replace(/\\n/g, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .replace(/\r/g, '')
    .trim();
}

function detectWorkoutType(summary, description) {
  const text = ((summary || '') + ' ' + (description || '')).toLowerCase();
  if (text.includes('strength') || text.includes('weight') || text.includes('gym')) return 'strength';
  if (text.includes('rest') || text.includes('recovery') || text.includes('off')) return 'rest';
  if (text.includes('interval') || text.includes('vo2') || text.includes('threshold')) return 'intervals';
  if (text.includes('endurance') || text.includes('z2') || text.includes('base')) return 'endurance';
  if (text.includes('tempo')) return 'tempo';
  if (text.includes('test') || text.includes('ftp')) return 'test';
  return 'ride';
}

function extractTSS(description) {
  if (!description) return null;
  const m = description.match(/TSS[:\s]*(\d+)/i);
  return m ? parseInt(m[1]) : null;
}

function extractDuration(description) {
  if (!description) return null;
  const m = description.match(/(\d+\.?\d*)\s*(?:hr|hour|h\b)/i) ||
            description.match(/(\d+)\s*(?:min|minute)/i);
  if (!m) return null;
  return description.match(/min/i) ? Math.round(parseInt(m[1]) / 60 * 10) / 10 : parseFloat(m[1]);
}
