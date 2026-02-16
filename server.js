const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_NAME = 'workcal_token';

if (isProduction && !JWT_SECRET) {
  throw new Error('JWT_SECRET is required when NODE_ENV=production');
}

if (!isProduction && !JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET is not set. Using development-only fallback secret.');
}

const RESOLVED_JWT_SECRET = JWT_SECRET || 'development-only-fallback-secret';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  path: '/',
};

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

let db;

async function initDb() {
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      entry_date TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      parsed_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date
      ON daily_logs(user_id, entry_date);
  `);
}

function createToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, RESOLVED_JWT_SECRET, { expiresIn: '7d' });
}

function authRequired(req, res, next) {
  const token = req.cookies[TOKEN_NAME];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    req.user = jwt.verify(token, RESOLVED_JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function normalizeDate(input) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseLogToCalendar(rawText, entryDate) {
  const lines = rawText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const timePattern = /(\b\d{1,2}:\d{2}\s?(?:am|pm)?\b|\b\d{1,2}\s?(?:am|pm)\b)/i;
  const events = [];

  let inferredHour = 9;

  for (const line of lines) {
    const timeMatch = line.match(timePattern);
    let startTime;

    if (timeMatch) {
      let raw = timeMatch[0].toLowerCase().replace(/\s+/g, '');
      if (/^\d{1,2}(am|pm)$/.test(raw)) raw = `${raw.slice(0, -2)}:00${raw.slice(-2)}`;
      if (/^\d{1,2}:\d{2}$/.test(raw)) raw = `${raw}am`;

      const m = raw.match(/(\d{1,2}):(\d{2})(am|pm)/);
      if (m) {
        let h = Number(m[1]);
        const min = Number(m[2]);
        if (m[3] === 'pm' && h < 12) h += 12;
        if (m[3] === 'am' && h === 12) h = 0;
        inferredHour = h;
        startTime = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      }
    }

    if (!startTime) {
      startTime = `${String(inferredHour).padStart(2, '0')}:00`;
      inferredHour = Math.min(22, inferredHour + 1);
    }

    const title = line.replace(timePattern, '').replace(/^[-*\d.)\s]+/, '').trim() || 'Work item';

    events.push({
      title,
      date: entryDate,
      startTime,
      sourceText: line,
    });
  }

  return {
    summary: `Parsed ${events.length} item(s) from today's log.`,
    events,
  };
}

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || password.length < 8) {
    return res.status(400).json({ error: 'Email and a password (8+ chars) are required.' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await db.run(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      email.toLowerCase().trim(),
      hash
    );

    const user = { id: result.lastID, email: email.toLowerCase().trim() };
    const token = createToken(user);

    res.cookie(TOKEN_NAME, token, COOKIE_OPTIONS);

    return res.json({ user });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Account already exists for this email.' });
    }
    return res.status(500).json({ error: 'Failed to create account.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = await db.get('SELECT * FROM users WHERE email = ?', email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

  const token = createToken(user);
  res.cookie(TOKEN_NAME, token, COOKIE_OPTIONS);

  return res.json({ user: { id: user.id, email: user.email } });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(TOKEN_NAME, CLEAR_COOKIE_OPTIONS);
  res.json({ ok: true });
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

app.get('/api/me', authRequired, async (req, res) => {
  const user = await db.get('SELECT id, email, created_at FROM users WHERE id = ?', req.user.id);
  return res.json({ user });
});

app.get('/api/calendar', authRequired, async (req, res) => {
  const logs = await db.all(
    'SELECT id, entry_date, raw_text, parsed_json, updated_at FROM daily_logs WHERE user_id = ? ORDER BY entry_date DESC',
    req.user.id
  );

  return res.json({
    logs: logs.map((row) => ({
      ...row,
      parsed: safeJsonParse(row.parsed_json, {
        summary: 'Stored log could not be parsed; showing raw entry only.',
        events: [],
      }),
    })),
  });
});

app.post('/api/logs', authRequired, async (req, res) => {
  const entryDate = normalizeDate(req.body.entryDate || new Date().toISOString());
  const rawText = String(req.body.rawText || '').trim();

  if (!entryDate || !rawText) {
    return res.status(400).json({ error: 'entryDate and rawText are required.' });
  }

  const parsed = parseLogToCalendar(rawText, entryDate);

  const existing = await db.get(
    'SELECT id FROM daily_logs WHERE user_id = ? AND entry_date = ?',
    req.user.id,
    entryDate
  );

  if (existing) {
    await db.run(
      `UPDATE daily_logs SET raw_text = ?, parsed_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      rawText,
      JSON.stringify(parsed),
      existing.id
    );
  } else {
    await db.run(
      'INSERT INTO daily_logs (user_id, entry_date, raw_text, parsed_json) VALUES (?, ?, ?, ?)',
      req.user.id,
      entryDate,
      rawText,
      JSON.stringify(parsed)
    );
  }

  return res.json({ entryDate, parsed });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`WorkCal listening on http://localhost:${PORT}`);
  });
});
