import https from 'https';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const icalUrl = process.env.TRAININGPEAKS_ICAL_URL;
    if (!icalUrl) {
      return res.status(500).json({ error: 'TRAININGPEAKS_ICAL_URL not set' });
    }

    const fetchUrl = icalUrl.replace('webcal://', 'https://');

    const text = await fetchUrl_(fetchUrl);

    if (!text || text.length < 50) {
      return res.status(502).json({ error: 'Empty iCal response', length: text ? text.length : 0 });
    }

    const events = parseICal(text);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      events,
      total: events.length,
      debug_dates: events.map(e => e.date)
    });

  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}

function fetchUrl_(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (resp) => {
      if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        return fetchUrl_(resp.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => resolve(data));
      resp.on('error', reject);
    }).on('error', reject);
  });
}

function parseICal(text) {
  const events = [];
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const blocks = unfolded.split('BEGIN:VEVENT');
  blocks.shift();

  for (const block of blocks) {
    const dtstart = getField(block, 'DTSTART');
    const summary = getField(block, 'SUMMARY');
    const description = getField(block, 'DESCRIPTION');
    const uid = getField(block, 'UID');

    if (!dtstart || !summary) continue;
    const date = parseICalDate(dtstart);
    if (!date) continue;

    events.push({
      uid,
      date,
      title: decodeICal(summary),
      description: description ? decodeICal(description).substring(0, 500) : '',
      type: detectWorkoutType(summary, description),
      tss: extractTSS(description),
      duration: extractDuration(description),
      completed: false
    });
  }

  return events.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}

function getField(block, key) {
  const m = block.match(new RegExp(key + ';[^:]*:([^\r\n]+)')) ||
            block.match(new RegExp(key + ':([^\r\n]+)'));
  return m ? m[1].trim() : null;
}

function parseICalDate(str) {
  if (!str) return null;
  const clean = str.replace(/[TZ]/g, '').substring(0, 8);
  if (clean.length < 8) return null;
  return clean.substring(0,4) + '-' + clean.substring(4,6) + '-' + clean.substring(6,8);
}

function decodeICal(str) {
  return str.replace(/\\n/g, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').replace(/\r/g, '').trim();
}

function detectWorkoutType(summary, description) {
  const text = ((summary || '') + ' ' + (description || '')).toLowerCase();
  if (text.includes('strength') || text.includes('weight') || text.includes('gym')) return 'strength';
  if (text.includes('rest') || text.includes('day off')) return 'rest';
  if (text.includes('interval') || text.includes('vo2') || text.includes('threshold')) return 'intervals';
  if (text.includes('endurance') || text.includes('z2') || text.includes('base')) return 'endurance';
  if (text.includes('tempo')) return 'tempo';
  if (text.includes('test') || text.includes('ftp') || text.includes('ramp') || text.includes('monty')) return 'test';
  return 'ride';
}

function extractTSS(description) {
  if (!description) return null;
  const m = description.match(/TSS[:\s]*(\d+)/i);
  return m ? parseInt(m[1]) : null;
}

function extractDuration(description) {
  if (!description) return null;
  const mh = description.match(/(\d+\.?\d*)\s*(?:hr|hour|h\b)/i);
  if (mh) return parseFloat(mh[1]);
  const mm = description.match(/(\d+)\s*(?:min|minute)/i);
  if (mm) return Math.round(parseInt(mm[1]) / 60 * 10) / 10;
  return null;
}
