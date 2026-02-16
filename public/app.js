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
  renderCalendar(logs);
}

function renderCalendar(logsList) {
  const eventMap = new Map();
  logsList.forEach((log) => {
    eventMap.set(log.entry_date, log.parsed.events || []);
  });

  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  calendarEl.innerHTML = '';
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(y, m, day).toISOString().slice(0, 10);
    const events = eventMap.get(date) || [];

    const dayEl = document.createElement('div');
    dayEl.className = 'day';
    dayEl.innerHTML = `<strong>${day}</strong><div class="count">${events.length} event(s)</div>`;
    dayEl.addEventListener('click', () => {
      const fullLog = logs.find((l) => l.entry_date === date);
      if (fullLog) {
        entryDateEl.value = date;
        logTextEl.value = fullLog.raw_text;
        statusEl.textContent = fullLog.parsed.summary;
      }
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
