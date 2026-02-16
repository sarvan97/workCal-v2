const authCard = document.getElementById('auth-card');
const dashboard = document.getElementById('dashboard');
const authForm = document.getElementById('auth-form');
const authSubmit = document.getElementById('auth-submit');
const statusEl = document.getElementById('status');
const calendarEl = document.getElementById('calendar');
const logTextEl = document.getElementById('log-text');
const entryDateEl = document.getElementById('entry-date');

let mode = 'login';
let logs = [];

entryDateEl.valueAsDate = new Date();

document.getElementById('tab-login').addEventListener('click', () => switchMode('login'));
document.getElementById('tab-register').addEventListener('click', () => switchMode('register'));
document.getElementById('logout-btn').addEventListener('click', logout);
document.getElementById('parse-save-btn').addEventListener('click', saveLog);

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const endpoint = mode === 'login' ? '/api/login' : '/api/register';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    statusEl.textContent = data.error || 'Authentication failed';
    return;
  }

  statusEl.textContent = 'Authenticated.';
  await showDashboard();
});

function switchMode(next) {
  mode = next;
  document.getElementById('tab-login').classList.toggle('active', next === 'login');
  document.getElementById('tab-register').classList.toggle('active', next === 'register');
  authSubmit.textContent = next === 'login' ? 'Login' : 'Register';
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  authCard.classList.remove('hidden');
  dashboard.classList.add('hidden');
}

async function showDashboard() {
  authCard.classList.add('hidden');
  dashboard.classList.remove('hidden');
  await refreshCalendar();
}

async function refreshCalendar() {
  const res = await fetch('/api/calendar');
  if (!res.ok) return;

  const data = await res.json();
  logs = data.logs;
  renderCalendar(logs, entryDateEl.value);
}

function classifyWorkoutType(log) {
  const eventText = (log.parsed?.events || [])
    .map((event) => `${event.title || ''} ${event.sourceText || ''}`)
    .join(' ');
  const text = `${eventText} ${log.raw_text || ''}`.toLowerCase();

  if (/strength|lift|squat|deadlift|bench|press|row/.test(text)) {
    return { key: 'strength', badge: 'S' };
  }
  if (/cardio|run|jog|hiit|interval/.test(text)) {
    return { key: 'cardio', badge: 'C' };
  }
  if (/cycle|bike|cycling|biking|spin/.test(text)) {
    return { key: 'cycle', badge: 'B' };
  }
  if (/mobility|yoga|stretch|recovery|foam\s*roll/.test(text)) {
    return { key: 'mobility', badge: 'M' };
  }
  if (/walk|hike|walking|hiking/.test(text)) {
    return { key: 'walk', badge: 'W' };
  }
  if (/workout|training|exercise|gym/.test(text)) {
    return { key: 'workout', badge: 'W' };
  }

  return { key: 'event', badge: '•' };
}

function renderCalendar(logsList, selectedDate) {
  const logMap = new Map();
  logsList.forEach((log) => {
    logMap.set(log.entry_date, log);
  });

  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  calendarEl.innerHTML = '';
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const fullLog = logMap.get(date);
    const eventCount = fullLog?.parsed?.events?.length || 0;

    const dayEl = document.createElement('div');
    dayEl.className = 'day';

    if (selectedDate === date) {
      dayEl.classList.add('selected');
    }

    dayEl.innerHTML = `
      <div class="day-top">
        <div class="day-num">${day}</div>
        <div class="day-badges"></div>
      </div>
      <div class="day-sub"></div>
    `;

    const dayBadgesEl = dayEl.querySelector('.day-badges');
    const daySubEl = dayEl.querySelector('.day-sub');

    if (fullLog) {
      dayEl.classList.add('has-log');
      const workoutType = classifyWorkoutType(fullLog);
      dayEl.classList.add(`type-${workoutType.key}`);

      const badgeEl = document.createElement('div');
      badgeEl.className = 'badge';
      badgeEl.textContent = workoutType.badge;
      dayBadgesEl.appendChild(badgeEl);

      daySubEl.textContent = eventCount === 1 ? '1 item' : `${eventCount} items`;
    } else {
      daySubEl.textContent = '';
    }

    dayEl.addEventListener('click', () => {
      entryDateEl.value = date;
      if (fullLog) {
        logTextEl.value = fullLog.raw_text;
        statusEl.textContent = fullLog.parsed?.summary || '';
      } else {
        logTextEl.value = '';
        statusEl.textContent = '';
      }

      renderCalendar(logs, date);
    });

    calendarEl.appendChild(dayEl);
  }
}

async function saveLog() {
  const rawText = logTextEl.value.trim();
  const entryDate = entryDateEl.value;

  const res = await fetch('/api/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText, entryDate }),
  });

  const data = await res.json();
  if (!res.ok) {
    statusEl.textContent = data.error || 'Failed to save log';
    return;
  }

  statusEl.textContent = data.parsed.summary;
  await refreshCalendar();
}

(async function boot() {
  const res = await fetch('/api/me');
  if (res.ok) {
    await showDashboard();
  }
})();
