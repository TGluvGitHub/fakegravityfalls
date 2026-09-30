require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const ADMIN_CODE = process.env.ADMIN_CODE;
if (!ADMIN_CODE || ADMIN_CODE === 'change-me-to-a-long-random-secret') {
  console.error('Set a real ADMIN_CODE in your .env file before starting the server.');
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(express.static('public'));

// --- tiny in-memory session store for the admin panel ---
const sessions = new Map(); // token -> expiresAt
const SESSION_TTL_MS = 30 * 60 * 1000;

function issueSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const expiresAt = token && sessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ error: 'Not authorized.' });
  }
  sessions.set(token, Date.now() + SESSION_TTL_MS); // sliding expiry
  next();
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // still run a comparison of equal length to avoid leaking length via timing
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// --- basic rate limiting on the redeem endpoint to slow down guessing ---
const attempts = new Map(); // ip -> { count, windowStart }
const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 20;

function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const entry = attempts.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  attempts.set(ip, entry);
  if (entry.count > MAX_ATTEMPTS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many attempts. Slow down.' });
  }
  next();
}

// --- public: redeem a code typed into the textbox ---
app.post('/api/redeem', rateLimit, (req, res) => {
  const raw = (req.body && req.body.code) || '';
  const code = String(raw).trim();
  if (!code) return res.status(400).json({ error: 'Enter a code.' });

  if (timingSafeEqual(code, ADMIN_CODE)) {
    const token = issueSession();
    return res.json({ admin: true, token });
  }

  const row = db.prepare('SELECT content FROM codes WHERE code = ?').get(code);
  if (row) {
    return res.json({ admin: false, found: true, content: row.content });
  }
  return res.json({ admin: false, found: false });
});

// --- admin: manage codes ---
app.get('/api/admin/codes', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, code, content, created_at FROM codes ORDER BY id DESC').all();
  res.json({ codes: rows });
});

app.post('/api/admin/codes', requireAdmin, (req, res) => {
  const code = String((req.body && req.body.code) || '').trim();
  const content = String((req.body && req.body.content) || '').trim();
  if (!code || !content) return res.status(400).json({ error: 'code and content are required.' });
  if (timingSafeEqual(code, ADMIN_CODE)) {
    return res.status(400).json({ error: 'That code is reserved.' });
  }
  try {
    db.prepare('INSERT INTO codes (code, content) VALUES (?, ?)').run(code, content);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'That code already exists.' });
    }
    throw err;
  }
  res.status(201).json({ ok: true });
});

app.delete('/api/admin/codes/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id.' });
  db.prepare('DELETE FROM codes WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`thisisawebsitedotcom running on http://localhost:${PORT}`);
});
