// ─── CONFIG ───────────────────────────────────────────────────────────────────
const STRAVA_CLIENT_ID = '214744';
const REDIRECT_URI = window.location.origin + window.location.pathname;

const ATHLETE_PROFILE = {
  weightLbs: 200, heightIn: 75, age: 47,
  goalWeightLbs: 190, goalDate: '2026-06-20',
  sport: 'road cycling', trainingDays: 5
};

// ─── STATE ────────────────────────────────────────────────────────────────────
const ATHLETE_CONFIG = {
  currentFTP: 268,
  targetFTP: 325,
  tripDate: '2026-06-27',
  tripName: 'Alps 2026',
  tripDescription: 'Multi-day Alpine cycling trip. Key climbs: Col de Finestre (18.5km, 9.1%), Col du Galibier (8.6km, 6.9%), Colle del Nivolet (64km, 2350m), Col Agnel (2200m), Col de la Madeleine (19.5km, 8%). Goal: move from back to front of group on long climbs.',
  weightLbs: 200,
  targetWeightLbs: 190,
  targetDate: '2026-06-20'
};

let state = {
  accessToken: localStorage.getItem('strava_token'),
  athlete: JSON.parse(localStorage.getItem('strava_athlete') || 'null'),
  activities: JSON.parse(localStorage.getItem('strava_activities') || '[]'),
  trainingPlan: JSON.parse(localStorage.getItem('training_plan') || '[]'),
  meals: JSON.parse(localStorage.getItem('meals_today') || '[]'),
  weightLog: JSON.parse(localStorage.getItem('weight_log') || '[]'),
  currentWeight: parseFloat(localStorage.getItem('current_weight') || '200'),
  currentFTP: parseFloat(localStorage.getItem('current_ftp') || '268'),
  b64Image: null,
  pendingMeal: null,
  weightChart: null,
  trainingChart: null,
  ftpChart: null
};

// ─── INIT ─────────────────────────────────────────────────────────────────────
window.addEventListener('load', async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');

  if (code) {
    window.history.replaceState({}, '', window.location.pathname);
    await exchangeCode(code);
  } else if (state.accessToken) {
    showDashboard();
    await loadActivities();
  } else {
    showConnect();
  }
  updateDaysLeft();
  checkForWebhookWeight();
  await loadTrainingPlan();
});

// ─── STRAVA OAUTH ─────────────────────────────────────────────────────────────
function connectStrava() {
  const scope = 'read,activity:read_all';
  const url = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;
  window.location.href = url;
}

async function exchangeCode(code) {
  try {
    const res = await fetch('/api/strava-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (data.access_token) {
      state.accessToken = data.access_token;
      state.athlete = data.athlete;
      localStorage.setItem('strava_token', data.access_token);
      localStorage.setItem('strava_athlete', JSON.stringify(data.athlete));
      showDashboard();
      await loadActivities();
    } else {
      alert('Could not connect to Strava. Please try again.');
      showConnect();
    }
  } catch (e) {
    console.error(e);
    showConnect();
  }
}

function disconnect() {
  localStorage.removeItem('strava_token');
  localStorage.removeItem('strava_athlete');
  localStorage.removeItem('strava_activities');
  state.accessToken = null; state.athlete = null; state.activities = [];
  showConnect();
}

// ─── SHOW/HIDE ─────────────────────────────────────────────────────────────────
function showConnect() {
  document.getElementById('connect-state').style.display = 'flex';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('connect-btn').style.display = 'flex';
  document.getElementById('disconnect-btn').style.display = 'none';
  document.getElementById('athlete-pill').style.display = 'none';
}

function showDashboard() {
  document.getElementById('connect-state').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('connect-btn').style.display = 'none';
  document.getElementById('disconnect-btn').style.display = 'block';
  if (state.athlete) {
    document.getElementById('athlete-pill').style.display = 'flex';
    document.getElementById('athlete-name').textContent = state.athlete.firstname + ' ' + state.athlete.lastname;
  }
  renderMacroBars();
  renderMealLog();
  renderWeightChart();
  updateTargets();
}

// ─── STRAVA ACTIVITIES ────────────────────────────────────────────────────────
async function loadActivities() {
  if (!state.accessToken) return;
  try {
    const after = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=30&after=${after}`, {
      headers: { 'Authorization': `Bearer ${state.accessToken}` }
    });
    if (res.status === 401) { disconnect(); return; }
    const acts = await res.json();
    state.activities = acts.filter(a => a.type === 'Ride' || a.sport_type === 'Ride' || a.type === 'VirtualRide');
    localStorage.setItem('strava_activities', JSON.stringify(state.activities));
    renderActivities();
    updateOverviewMetrics();
    updateTargets();
    renderTrainingChart();
  } catch (e) {
    console.error('Strava fetch error:', e);
  }
}

function renderActivities() {
  const sorted = [...state.activities].sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local));
  const recent = sorted.slice(0, 5);
  const all = sorted.slice(0, 15);

  const buildItem = a => {
    const dist = (a.distance / 1609.34).toFixed(1);
    const elev = Math.round(a.total_elevation_gain * 3.28084);
    const [_dp, _] = a.start_date_local.split('T'); const [_yr, _mo, _dy] = _dp.split('-').map(Number); const date = new Date(_yr, _mo - 1, _dy).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dur = formatDuration(a.moving_time);
    const power = a.average_watts ? `${Math.round(a.average_watts)}w avg` : '';
    return `<div class="ride-item">
      <div>
        <div class="ride-name">${a.name}</div>
        <div class="ride-meta">${date} · ${dur}${power ? ' · ' + power : ''}</div>
      </div>
      <div class="ride-stats">
        <div class="ride-dist">${dist} mi</div>
        <div class="ride-elev">+${elev.toLocaleString()} ft</div>
      </div>
    </div>`;
  };

  const recentEl = document.getElementById('recent-rides-list');
  const allEl = document.getElementById('all-rides-list');
  if (recent.length === 0) {
    recentEl.innerHTML = '<div class="empty-msg">No rides in the last 30 days.</div>';
    allEl.innerHTML = '<div class="empty-msg">No rides found.</div>';
  } else {
    recentEl.innerHTML = recent.map(buildItem).join('');
    allEl.innerHTML = all.map(buildItem).join('');
  }
}

function updateOverviewMetrics() {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = state.activities.filter(a => new Date(a.start_date_local).getTime() > weekAgo);
  const totalDist = thisWeek.reduce((s, a) => s + a.distance, 0);
  const totalElev = thisWeek.reduce((s, a) => s + a.total_elevation_gain, 0);

  document.getElementById('ov-rides').textContent = thisWeek.length;
  document.getElementById('ov-distance').textContent = (totalDist / 1609.34).toFixed(0);
  document.getElementById('ov-elevation').textContent = Math.round(totalElev * 3.28084).toLocaleString();
  document.getElementById('ov-weight').innerHTML = state.currentWeight.toFixed(1) + '<span class="metric-unit">lbs</span>';
  const lost = Math.max(0, 200 - state.currentWeight);
  document.getElementById('ov-to-goal').innerHTML = (10 - lost).toFixed(1) + '<span class="metric-unit">lbs</span>';
}

function localDateStr(d) {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${dy}`;
}

function updateTargets() {
  const today = new Date();
  const todayStr = localDateStr(today);
  const todayRide = state.activities.find(a => a.start_date_local.startsWith(todayStr));
  const yesterdayStr = localDateStr(new Date(today - 86400000));
  const yesterdayRide = state.activities.find(a => a.start_date_local.startsWith(yesterdayStr));
  const activeRide = todayRide || yesterdayRide;

  let cal, protein, carbs, fat, rideType;

  if (activeRide) {
    const dist = activeRide.distance / 1609.34;
    if (dist > 60) {
      cal = 3200; protein = 175; carbs = 420; fat = 70;
      rideType = `Long ride (${dist.toFixed(0)} mi)`;
    } else if (dist > 30) {
      cal = 2880; protein = 175; carbs = 330; fat = 70;
      rideType = `Training ride (${dist.toFixed(0)} mi)`;
    } else {
      cal = 2680; protein = 175; carbs = 295; fat = 65;
      rideType = `Easy ride (${dist.toFixed(0)} mi)`;
    }
  } else {
    cal = 2200; protein = 175; carbs = 200; fat = 65;
    rideType = 'Rest / recovery day';
  }

  window._targets = { cal, protein, carbs, fat };

  document.getElementById('t-cal').textContent = cal.toLocaleString() + ' kcal';
  document.getElementById('t-protein').textContent = protein + 'g';
  document.getElementById('t-carbs').textContent = carbs + 'g';
  document.getElementById('t-fat').textContent = fat + 'g';
  document.getElementById('t-ridetype').textContent = rideType;
  renderMacroBars();
}

function renderTrainingChart() {
  const days = [];
  const distances = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = localDateStr(d);
    days.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
    const dayRides = state.activities.filter(a => a.start_date_local.startsWith(ds));
    distances.push(+(dayRides.reduce((s, a) => s + a.distance / 1609.34, 0)).toFixed(1));
  }

  const ctx = document.getElementById('trainingChart').getContext('2d');
  if (state.trainingChart) state.trainingChart.destroy();
  state.trainingChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [{
        label: 'Miles',
        data: distances,
        backgroundColor: 'rgba(232,255,71,0.7)',
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { color: '#5a5955', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        x: { ticks: { color: '#5a5955', font: { size: 11 } }, grid: { display: false } }
      }
    }
  });
}

// ─── NUTRITION ────────────────────────────────────────────────────────────────
const DEFAULT_TARGETS = { cal: 2680, protein: 175, carbs: 295, fat: 65 };

function getTargets() {
  return window._targets || DEFAULT_TARGETS;
}

function renderMacroBars() {
  const t = getTargets();
  const totals = getMealTotals();
  const macros = [
    { name: 'Protein', key: 'protein', target: t.protein, color: '#4ade80', unit: 'g' },
    { name: 'Carbs', key: 'carbs', target: t.carbs, color: '#60a5fa', unit: 'g' },
    { name: 'Fat', key: 'fat', target: t.fat, color: '#fbbf24', unit: 'g' }
  ];
  document.getElementById('macro-bars').innerHTML = macros.map(m => {
    const pct = Math.min(100, Math.round((totals[m.key] / m.target) * 100));
    return `<div class="macro-bar-row">
      <div class="macro-bar-head">
        <span class="macro-bar-name">${m.name}</span>
        <span class="macro-bar-nums">${Math.round(totals[m.key])}${m.unit} / ${m.target}${m.unit}</span>
      </div>
      <div class="macro-track"><div class="macro-fill" style="width:${pct}%; background:${m.color}"></div></div>
    </div>`;
  }).join('');
  const remaining = Math.max(0, t.cal - Math.round(totals.cal));
  document.getElementById('logged-cals').textContent = Math.round(totals.cal).toLocaleString();
  document.getElementById('remaining-cals').textContent = remaining.toLocaleString();
}

function getMealTotals() {
  return state.meals.reduce((a, m) => ({
    cal: a.cal + m.cal, protein: a.protein + m.protein,
    carbs: a.carbs + m.carbs, fat: a.fat + m.fat
  }), { cal: 0, protein: 0, carbs: 0, fat: 0 });
}

function renderMealLog() {
  const el = document.getElementById('meal-log-list');
  if (state.meals.length === 0) {
    el.innerHTML = '<div class="empty-msg">No meals logged today.</div>'; return;
  }
  el.innerHTML = state.meals.map((m, i) => `
    <div class="meal-log-item">
      <div>
        <div class="meal-log-name">${m.name}</div>
        <div class="meal-log-macros">${Math.round(m.protein)}g P · ${Math.round(m.carbs)}g C · ${Math.round(m.fat)}g F</div>
      </div>
      <div style="display:flex; align-items:center; gap:4px;">
        <span class="meal-log-cals">${Math.round(m.cal)}</span>
        <button class="meal-remove-btn" onclick="removeMeal(${i})">✕</button>
      </div>
    </div>`).join('');
}

function removeMeal(i) {
  state.meals.splice(i, 1);
  localStorage.setItem('meals_today', JSON.stringify(state.meals));
  renderMealLog(); renderMacroBars();
}

// ─── MEAL PHOTO ANALYSIS ──────────────────────────────────────────────────────
function handleMealFile(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('meal-preview');
    img.src = e.target.result; img.style.display = 'block';
    state.b64Image = e.target.result.split(',')[1];
    document.getElementById('meal-notes').style.display = 'block';
    document.getElementById('analyze-btn').style.display = 'block';
    document.getElementById('meal-result').innerHTML = '';
  };
  reader.readAsDataURL(file);
}

async function analyzeMeal() {
  if (!state.b64Image) return;
  const notes = document.getElementById('meal-notes').value;
  const t = getTargets();
  document.getElementById('analyze-btn').style.display = 'none';
  document.getElementById('meal-loading').style.display = 'block';

  const prompt = `You are a sports nutrition expert for endurance athletes. Analyze this meal photo.

Athlete: 47yo male road cyclist, 200 lbs, 6'3". Goal: body recomposition (lose fat, gain muscle). Target 190 lbs by June 20 2026. Training 5-6 days/week.
Today's targets: ${t.cal} kcal, ${t.protein}g protein, ${t.carbs}g carbs, ${t.fat}g fat.
${notes ? 'User notes: ' + notes : ''}

Respond ONLY with valid JSON (no markdown, no explanation):
{"meal_name":"short name","calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"quality_score":number,"highlights":["positive 1","positive 2"],"improvements":["improvement 1","improvement 2"],"cycling_note":"one sentence on fit with training"}`;

  try {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: state.b64Image } },
          { type: 'text', text: prompt }
        ]}]
      })
    });
    const data = await res.json();
    const text = data.content.map(c => c.text || '').join('');
    const meal = JSON.parse(text.replace(/```json|```/g, '').trim());
    state.pendingMeal = meal;

    const scoreColor = meal.quality_score >= 7 ? '#4ade80' : meal.quality_score >= 5 ? '#fbbf24' : '#f87171';
    document.getElementById('meal-result').innerHTML = `
      <div class="meal-result-card">
        <div class="meal-result-head">
          <span class="meal-result-name">${meal.meal_name}</span>
          <span class="meal-score" style="color:${scoreColor}">${meal.quality_score}/10</span>
        </div>
        <div class="meal-macros-grid">
          <div class="mmg-cell"><div class="mmg-label">Calories</div><div class="mmg-val">${Math.round(meal.calories)}</div></div>
          <div class="mmg-cell"><div class="mmg-label">Protein</div><div class="mmg-val">${Math.round(meal.protein_g)}g</div></div>
          <div class="mmg-cell"><div class="mmg-label">Carbs</div><div class="mmg-val">${Math.round(meal.carbs_g)}g</div></div>
          <div class="mmg-cell"><div class="mmg-label">Fat</div><div class="mmg-val">${Math.round(meal.fat_g)}g</div></div>
        </div>
        <div class="meal-note">${meal.cycling_note}</div>
        <div class="feedback-row">
          <div class="feedback-pos">${meal.highlights.map(h => '+ ' + h).join('<br>')}</div>
          <div class="feedback-neg">${meal.improvements.map(i => '→ ' + i).join('<br>')}</div>
        </div>
        <button class="add-meal-btn" onclick="addMealToLog()">+ Add to today's log</button>
      </div>`;
  } catch(e) {
    document.getElementById('meal-result').innerHTML = '<div style="color:#f87171; font-size:13px; padding:8px 0;">Could not analyze meal. Please try again.</div>';
  }
  document.getElementById('meal-loading').style.display = 'none';
}

function addMealToLog() {
  if (!state.pendingMeal) return;
  const m = state.pendingMeal;
  state.meals.push({ name: m.meal_name, cal: m.calories, protein: m.protein_g, carbs: m.carbs_g, fat: m.fat_g });
  localStorage.setItem('meals_today', JSON.stringify(state.meals));
  state.pendingMeal = null; state.b64Image = null;
  document.getElementById('meal-preview').style.display = 'none';
  document.getElementById('meal-result').innerHTML = '';
  document.getElementById('analyze-btn').style.display = 'none';
  document.getElementById('meal-notes').style.display = 'none';
  document.getElementById('meal-notes').value = '';
  document.getElementById('meal-file').value = '';
  renderMealLog(); renderMacroBars();
}

// ─── WEIGHT LOG ───────────────────────────────────────────────────────────────
function applyWeight(val, dateStr) {
  state.currentWeight = val;
  localStorage.setItem('current_weight', val);
  const label = dateStr || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const existing = state.weightLog.findIndex(w => w.date === label);
  if (existing >= 0) state.weightLog[existing].weight = val;
  else state.weightLog.push({ date: label, weight: val });
  localStorage.setItem('weight_log', JSON.stringify(state.weightLog));
  const lost = Math.max(0, 200 - val);
  const pct = Math.min(100, (lost / 10) * 100);
  document.getElementById('prog-fill').style.width = pct + '%';
  document.getElementById('prog-label').textContent = lost.toFixed(1) + ' of 10 lbs lost (' + Math.round(pct) + '%)';
  updateOverviewMetrics();
  renderWeightChart();
}

function logWeight() {
  const val = parseFloat(document.getElementById('weight-input').value);
  if (isNaN(val) || val < 100 || val > 400) return;
  document.getElementById('weight-input').value = '';
  applyWeight(val, null);
}

async function checkForWebhookWeight() {
  const lastChecked = localStorage.getItem('weight_webhook_checked');
  const today = localDateStr(new Date());
  if (lastChecked === today) return;
  try {
    const res = await fetch('/api/weight-latest');
    if (!res.ok) return;
    const data = await res.json();
    if (data.weight_lbs && data.date) {
      const label = new Date(data.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      applyWeight(parseFloat(data.weight_lbs), label);
      localStorage.setItem('weight_webhook_checked', today);
      showWeightToast(data.weight_lbs, data.date);
    }
  } catch(e) { /* silent fail */ }
}

function showWeightToast(weight, date) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1e1f22;border:0.5px solid rgba(255,255,255,0.12);border-radius:10px;padding:12px 18px;font-size:13px;color:#f0f0ee;z-index:999;font-family:DM Sans,sans-serif;';
  toast.innerHTML = '<span style="color:#4ade80">⬡</span> Garmin scale synced — <strong>' + parseFloat(weight).toFixed(1) + ' lbs</strong> on ' + date;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function renderWeightChart() {
  const today = new Date();
  const labels = [], goalLine = [];
  for (let i = 0; i <= 13; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i * 7);
    labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    goalLine.push(+(200 - (10 / 13) * i).toFixed(1));
  }
  const actualData = [state.currentWeight, ...state.weightLog.slice(-12).map(w => w.weight)];

  const ctx = document.getElementById('weightChart').getContext('2d');
  if (state.weightChart) state.weightChart.destroy();
  state.weightChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Goal', data: goalLine, borderColor: '#e8ff47', borderDash: [4, 4], pointRadius: 0, borderWidth: 1.5, tension: 0 },
        { label: 'Actual', data: actualData, borderColor: '#60a5fa', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#60a5fa', tension: 0.3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 185, max: 205, ticks: { color: '#5a5955', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        x: { ticks: { color: '#5a5955', font: { size: 11 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 7 }, grid: { display: false } }
      }
    }
  });
}

// ─── AI INSIGHT ───────────────────────────────────────────────────────────────
async function getInsight() {
  document.getElementById('ai-insight-box').innerHTML = '<div class="loading-msg">Generating coaching insight...</div>';
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = state.activities.filter(a => new Date(a.start_date_local).getTime() > weekAgo);
  const totalMiles = (thisWeek.reduce((s, a) => s + a.distance, 0) / 1609.34).toFixed(0);
  const totalElev = Math.round(thisWeek.reduce((s, a) => s + a.total_elevation_gain, 0) * 3.28084);
  const avgPower = thisWeek.filter(a => a.average_watts).reduce((s, a, _, arr) => s + a.average_watts / arr.length, 0);
  const t = getTargets();
  const totals = getMealTotals();

  const prompt = `You are a cycling coach and sports nutritionist. Give a concise, practical daily coaching insight (3-4 sentences max).

Athlete: 47yo male road cyclist, ${state.currentWeight} lbs (goal: 190 lbs by Jun 20, 2026). Body recomposition goal.
This week: ${thisWeek.length} rides, ${totalMiles} miles, ${totalElev.toLocaleString()} ft elevation${avgPower > 0 ? ', avg power ' + Math.round(avgPower) + 'w' : ''}.
Today's nutrition target: ${t.cal} kcal, ${t.protein}g protein, ${t.carbs}g carbs.
Today's logged: ${Math.round(totals.cal)} kcal, ${Math.round(totals.protein)}g protein so far.

Give one specific, actionable insight for today based on this data. Be direct and practical, like a real coach.`;

  try {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    const text = data.content.map(c => c.text || '').join('');
    document.getElementById('ai-insight-box').innerHTML = `<div class="insight-text">${text}</div>
      <button class="insight-btn" style="margin-top:12px" onclick="getInsight()">Refresh ↗</button>`;
  } catch(e) {
    document.getElementById('ai-insight-box').innerHTML = '<button class="insight-btn" onclick="getInsight()">Generate today\'s coaching insight ↗</button>';
  }
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  btn.classList.add('active');
}

function updateDaysLeft() {
  const days = Math.max(0, Math.ceil((new Date('2026-06-20') - new Date()) / 86400000));
  document.getElementById('ov-days').innerHTML = days + '<span class="metric-unit">days</span>';
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── TRAINING PLAN ────────────────────────────────────────────────────────────
async function loadTrainingPlan() {
  try {
    const res = await fetch('/api/training-plan');
    if (!res.ok) return;
    const data = await res.json();
    if (data.events) {
      state.trainingPlan = data.events;
      localStorage.setItem('training_plan', JSON.stringify(data.events));
      renderTrainingPlan();
      updateTargetsFromPlan();
    }
  } catch(e) { console.error('Training plan fetch error:', e); }
}

function getTodayStr() { return localDateStr(new Date()); }
function getTomorrowStr() { const d = new Date(); d.setDate(d.getDate()+1); return localDateStr(d); }

function getWorkoutsForDate(dateStr) {
  return state.trainingPlan.filter(w => w.date === dateStr);
}

function isMissed(workout) {
  const today = getTodayStr();
  if (workout.date >= today) return false;
  const completed = state.activities.some(a => {
    const aDate = a.start_date_local.split('T')[0];
    return aDate === workout.date && (workout.type === 'strength' || a.distance > 1000);
  });
  return !completed;
}

function updateTargetsFromPlan() {
  const tomorrow = getWorkoutsForDate(getTomorrowStr());
  const today = getWorkoutsForDate(getTodayStr());
  const relevant = tomorrow.length > 0 ? tomorrow : today;

  if (relevant.length === 0) return;
  const workout = relevant[0];

  let cal, protein, carbs, fat, rideType;
  const tss = workout.tss || 0;

  if (workout.type === 'rest') {
    cal = 2200; protein = 175; carbs = 180; fat = 65;
    rideType = 'Rest day';
  } else if (workout.type === 'strength') {
    cal = 2400; protein = 195; carbs = 220; fat = 70;
    rideType = 'Strength training';
  } else if (workout.type === 'intervals' || tss > 80) {
    cal = 2950; protein = 175; carbs = 370; fat = 70;
    rideType = `Hard intervals${tss ? ' (TSS ~' + tss + ')' : ''}`;
  } else if (workout.type === 'tempo' || tss > 50) {
    cal = 2750; protein = 175; carbs = 310; fat = 68;
    rideType = `Tempo ride${tss ? ' (TSS ~' + tss + ')' : ''}`;
  } else {
    cal = 2580; protein = 175; carbs = 280; fat = 65;
    rideType = `Endurance ride${tss ? ' (TSS ~' + tss + ')' : ''}`;
  }

  window._targets = { cal, protein, carbs, fat };
  document.getElementById('t-cal').textContent = cal.toLocaleString() + ' kcal';
  document.getElementById('t-protein').textContent = protein + 'g';
  document.getElementById('t-carbs').textContent = carbs + 'g';
  document.getElementById('t-fat').textContent = fat + 'g';
  document.getElementById('t-ridetype').textContent = (tomorrow.length > 0 ? 'Tomorrow: ' : 'Today: ') + rideType;
  renderMacroBars();
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0) ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function renderTrainingPlan() {
  const el = document.getElementById('training-plan-panel');
  if (!el) return;

  const today = getTodayStr();

  const weekStarts = [];
  const thisMonday = getWeekStart(new Date());
  for (let w = -1; w <= 3; w++) {
    const d = new Date(thisMonday);
    d.setDate(d.getDate() + w * 7);
    weekStarts.push(d);
  }

  const days = [];
  for (const weekStart of weekStarts) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + d);
      week.push(localDateStr(day));
    }
    days.push(week);
  }

  const missed = state.trainingPlan.filter(w => isMissed(w));

  let html = '';

  if (missed.length > 0) {
    html += `<div class="missed-banner">
      <span style="color:#fbbf24; font-weight:500;">⚠ ${missed.length} missed workout${missed.length>1?'s':''} detected</span>
      <button class="insight-btn" style="margin-left:12px; font-size:11px; padding:4px 10px;" onclick="getMissedWorkoutAdvice()">Get adjustment advice ↗</button>
    </div>`;
  }

  const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  for (const week of days) {
    const weekStart = new Date(week[0] + 'T12:00:00');
    const weekEnd = new Date(week[6] + 'T12:00:00');
    const wLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' – ' + weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    html += '<div class="plan-week-label">' + wLabel + '</div>';
    html += '<div class="plan-calendar">';
    for (let i = 0; i < 7; i++) {
      const dateStr = week[i];
      const workouts = getWorkoutsForDate(dateStr);
      const isToday = dateStr === today;
      const isPast = dateStr < today;
      const d = new Date(dateStr + 'T12:00:00');
      const dayNum = d.getDate();
      const completedOnDay = state.activities.some(a => a.start_date_local.startsWith(dateStr));
      html += '<div class="plan-day' + (isToday ? ' plan-day-today' : '') + (isPast ? ' plan-day-past' : '') + '">';
      html += '<div class="plan-day-label">' + (isToday ? 'TODAY' : DAY_HEADERS[i] + ' ' + dayNum) + '</div>';
      if (workouts.length === 0) {
        html += '<div class="plan-workout plan-rest">Rest</div>';
      } else {
        for (const w of workouts) {
          const wasMissed = isMissed(w);
          const done = isPast && completedOnDay;
          const typeColors = { intervals:'#e8ff47', tempo:'#60a5fa', endurance:'#4ade80', strength:'#f87171', rest:'#5a5955', ride:'#4ade80', test:'#fbbf24' };
          const tc = typeColors[w.type] || '#9a9994';
          let whtml = '<div class="plan-workout" style="border-left: 2px solid ' + tc + '; ' + (wasMissed ? 'opacity:0.5' : '') + '">';
          whtml += '<div style="font-size:12px; font-weight:500; color:' + tc + ';">' + w.type.toUpperCase() + (done ? ' ✓' : wasMissed ? ' ✗' : '') + '</div>';
          whtml += '<div style="font-size:12px; color:#f0f0ee; margin-top:2px;">' + w.title + '</div>';
          if (w.tss) whtml += '<div style="font-size:11px; color:#5a5955; margin-top:2px;">TSS ~' + w.tss + '</div>';
          if (w.duration) whtml += '<div style="font-size:11px; color:#5a5955;">' + w.duration + 'hr</div>';
          whtml += '</div>';
          html += whtml;
        }
      }
      html += '</div>';
    }
    html += '</div>';
  }

  html += `<div style="margin-top:16px;">
    <div class="section-head">FTP progression</div>
    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:16px;">
      <div class="metric" style="background:var(--bg3)">
        <div class="metric-label">Current FTP</div>
        <div style="font-size:22px; font-weight:300;">${state.currentFTP}<span style="font-size:12px; color:#5a5955;"> W</span></div>
      </div>
      <div class="metric" style="background:var(--bg3)">
        <div class="metric-label">Target FTP</div>
        <div style="font-size:22px; font-weight:300;">325<span style="font-size:12px; color:#5a5955;"> W</span></div>
      </div>
      <div class="metric" style="background:var(--bg3)">
        <div class="metric-label">W/kg now → goal</div>
        <div style="font-size:22px; font-weight:300;">${(state.currentFTP/90.7).toFixed(2)}<span style="font-size:12px; color:#5a5955;"> → 3.77</span></div>
      </div>
    </div>
    <div style="margin-bottom:8px;">
      <div style="display:flex; justify-content:space-between; font-size:11px; color:#5a5955; font-family:DM Mono,monospace; margin-bottom:4px;">
        <span>260W (start)</span><span>325W (Alps goal)</span>
      </div>
      <div style="height:6px; background:var(--bg3); border-radius:3px; overflow:hidden;">
        <div style="height:100%; border-radius:3px; background:#e8ff47; width:${Math.min(100,Math.round(((state.currentFTP-260)/(325-260))*100))}%; transition:width 0.5s;"></div>
      </div>
      <div style="font-size:11px; color:#5a5955; margin-top:4px; font-family:DM Mono,monospace;">${Math.round(state.currentFTP-260)} of 65W gained · ${Math.round(325-state.currentFTP)}W to go</div>
    </div>
    <div style="display:flex; gap:8px; align-items:center; margin-top:12px;">
      <input type="number" id="ftp-input" placeholder="Log new FTP (W)" min="100" max="500" style="flex:1; background:var(--bg3); color:var(--text); border:0.5px solid rgba(255,255,255,0.12); border-radius:6px; padding:8px 12px; font-size:13px; font-family:DM Sans,sans-serif;">
      <button class="action-btn" style="width:auto;" onclick="logFTP()">Log FTP</button>
    </div>
  </div>`;

  el.innerHTML = html;
}

function logFTP() {
  const val = parseFloat(document.getElementById('ftp-input').value);
  if (isNaN(val) || val < 100 || val > 500) return;
  state.currentFTP = val;
  localStorage.setItem('current_ftp', val);
  document.getElementById('ftp-input').value = '';
  renderTrainingPlan();
}

async function getMissedWorkoutAdvice() {
  const missed = state.trainingPlan.filter(w => isMissed(w));
  const upcoming = state.trainingPlan.filter(w => w.date >= getTodayStr()).slice(0, 7);
  const weekAgo = Date.now() - 7*24*60*60*1000;
  const recentRides = state.activities.filter(a => new Date(a.start_date_local).getTime() > weekAgo);
  const daysToTrip = Math.ceil((new Date(ATHLETE_CONFIG.tripDate) - new Date()) / 86400000);

  const prompt = `You are an expert cycling coach. An athlete has missed some planned workouts and needs schedule adjustment advice.

Athlete profile:
- 47yo male road cyclist, ${state.currentWeight} lbs (goal 190 lbs)
- Current FTP: ${state.currentFTP}W, target: 325W by June 27
- Trip: ${ATHLETE_CONFIG.tripName} in ${daysToTrip} days — ${ATHLETE_CONFIG.tripDescription}
- Training availability: Mon rest, Tue/Fri weights, Wed/Thu 1.5hr morning rides, Sat/Sun longer rides
- Weekly hours: 6-12hrs

Missed workouts (${missed.length}):
${missed.map(w => `- ${w.date}: ${w.title} (${w.type}${w.tss ? ', TSS '+w.tss : ''})`).join('\n')}

Recent completed rides this week:
${recentRides.map(a => `- ${a.start_date_local.split('T')[0]}: ${a.name}, ${(a.distance/1609.34).toFixed(1)}mi${a.average_watts ? ', '+Math.round(a.average_watts)+'W avg' : ''}`).join('\n')}

Upcoming planned workouts (next 7 days):
${upcoming.map(w => `- ${w.date}: ${w.title} (${w.type}${w.tss ? ', TSS '+w.tss : ''})`).join('\n')}

Give specific, practical advice in 4-6 sentences:
1. Whether to try to make up the missed sessions or skip them
2. Any adjustments to the upcoming week
3. How this affects the FTP target timeline
Be direct and coach-like. Don't sugarcoat.`;

  const btn = event.target;
  btn.textContent = 'Analyzing...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    const text = data.content.map(c => c.text || '').join('');

    const banner = document.querySelector('.missed-banner');
    if (banner) {
      banner.insertAdjacentHTML('afterend', `<div class="section-card" style="margin-bottom:16px; border-color:rgba(251,191,36,0.3);">
        <div class="section-head" style="color:#fbbf24;">Schedule adjustment advice</div>
        <div class="insight-text">${text}</div>
      </div>`);
    }
  } catch(e) { console.error(e); }
  btn.textContent = 'Get adjustment advice ↗';
  btn.disabled = false;
}
