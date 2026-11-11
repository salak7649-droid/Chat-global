const path = require('path');
const fs = require('fs');
require('dotenv').config();
const express = require('express');
const http = require('http');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT || 3000);
const OWNER_USERNAME = (process.env.OWNER_USERNAME || 'ikky00').trim().toLowerCase();
if (!process.env.OWNER_PASSWORD || !process.env.SESSION_SECRET) {
  console.error('Set OWNER_PASSWORD and SESSION_SECRET in your environment (.env).');
  process.exit(1);
}
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new sqlite3.Database(path.join(dataDir, 'chat.db'));
db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL');
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    recipient_id INTEGER REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run('CREATE INDEX IF NOT EXISTS messages_global_idx ON messages(recipient_id, id)');
  db.run('CREATE INDEX IF NOT EXISTS messages_dm_idx ON messages(sender_id, recipient_id, id)');
});

const app = express();
const server = http.createServer(app);
const sessionMiddleware = session({
  store: new SQLiteStore({ db: 'sessions.db', dir: dataDir }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 }
});
const io = new Server(server);
app.use(express.json({ limit: '16kb' }));
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role });
const requireAuth = (req, res, next) => req.session.userId ? next() : res.status(401).json({ error: 'Silakan masuk terlebih dahulu.' });

(async () => {
  const existing = await get('SELECT id FROM users WHERE username = ?', [OWNER_USERNAME]);
  if (!existing) {
    const passwordHash = await bcrypt.hash(process.env.OWNER_PASSWORD, 12);
    await run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [OWNER_USERNAME, passwordHash, 'owner']);
    console.log(`Owner account created: ${OWNER_USERNAME}`);
  }
})().catch((err) => { console.error('Could not initialize owner account:', err); process.exit(1); });

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Terlalu banyak percobaan. Coba lagi nanti.' } });
app.post('/api/register', authLimiter, async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: 'Username 3–20 karakter: huruf, angka, atau garis bawah.' });
    if (username === OWNER_USERNAME) return res.status(400).json({ error: 'Username tersebut tidak tersedia.' });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Kata sandi harus 8–72 karakter.' });
    const result = await run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, await bcrypt.hash(password, 12)]);
    req.session.userId = result.lastID;
    res.json({ user: { id: result.lastID, username, role: 'user' } });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Username sudah digunakan.' });
    console.error(err); res.status(500).json({ error: 'Tidak dapat membuat akun.' });
  }
});
app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const user = await get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) return res.status(401).json({ error: 'Username atau kata sandi salah.' });
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Tidak dapat membuat sesi.' });
      req.session.userId = user.id;
      res.json({ user: publicUser(user) });
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Gagal masuk.' }); }
});
app.post('/api/logout', requireAuth, (req, res) => req.session.destroy(() => { res.clearCookie('connect.sid'); res.json({ ok: true }); }));
app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = await get('SELECT id, username, role FROM users WHERE id = ?', [req.session.userId]);
  res.json({ user: user || null });
});
app.get('/api/users', requireAuth, async (req, res) => {
  const users = await all('SELECT id, username, role FROM users WHERE id != ? ORDER BY username LIMIT 200', [req.session.userId]);
  res.json({ users });
});
app.get('/api/messages', requireAuth, async (req, res) => {
  const peer = Number(req.query.with);
  let rows;
  if (Number.isInteger(peer) && peer > 0) {
    rows = await all(`SELECT m.id, m.body, m.created_at, m.sender_id, u.username AS sender
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE (m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)
      ORDER BY m.id DESC LIMIT 100`, [req.session.userId, peer, peer, req.session.userId]);
  } else {
    rows = await all(`SELECT m.id, m.body, m.created_at, m.sender_id, u.username AS sender
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.recipient_id IS NULL ORDER BY m.id DESC LIMIT 100`);
  }
  res.json({ messages: rows.reverse() });
});

io.use((socket, next) => {
  const userId = socket.request.session && socket.request.session.userId;
  if (!userId) return next(new Error('Silakan masuk terlebih dahulu.'));
  get('SELECT id, username, role FROM users WHERE id = ?', [userId]).then((user) => {
    if (!user) return next(new Error('Akun tidak ditemukan.'));
    socket.user = user; next();
  }).catch(next);
});
const online = new Map();
io.on('connection', (socket) => {
  const user = socket.user;
  online.set(user.id, (online.get(user.id) || 0) + 1);
  socket.join('global');
  io.emit('presence', { userId: user.id, online: true });
  socket.on('message:send', async (payload = {}, callback = () => {}) => {
    try {
      const body = String(payload.body || '').trim();
      const recipientId = payload.recipientId == null ? null : Number(payload.recipientId);
      if (!body || body.length > 2000) return callback({ error: 'Pesan harus berisi 1–2000 karakter.' });
      if (recipientId !== null) {
        if (!Number.isInteger(recipientId) || recipientId === user.id) return callback({ error: 'Penerima tidak valid.' });
        const recipient = await get('SELECT id FROM users WHERE id = ?', [recipientId]);
        if (!recipient) return callback({ error: 'Pengguna tidak ditemukan.' });
      }
      const result = await run('INSERT INTO messages (sender_id, recipient_id, body) VALUES (?, ?, ?)', [user.id, recipientId, body]);
      const message = { id: result.lastID, body, sender_id: user.id, sender: user.username, created_at: new Date().toISOString(), recipient_id: recipientId };
      if (recipientId === null) io.to('global').emit('message:new', message);
      else {
        const room = `dm:${[user.id, recipientId].sort((a, b) => a - b).join(':')}`;
        io.to(room).emit('message:new', message);
      }
      callback({ ok: true });
    } catch (err) { console.error(err); callback({ error: 'Pesan gagal dikirim.' }); }
  });
  socket.on('dm:join', async (rawPeerId, callback = () => {}) => {
    const peerId = Number(rawPeerId);
    if (!Number.isInteger(peerId) || peerId === user.id || !(await get('SELECT id FROM users WHERE id = ?', [peerId]))) return callback({ error: 'Pengguna tidak ditemukan.' });
    const room = `dm:${[user.id, peerId].sort((a, b) => a - b).join(':')}`;
    socket.join(room); callback({ ok: true });
  });
  socket.on('disconnect', () => {
    const count = (online.get(user.id) || 1) - 1;
    if (count <= 0) { online.delete(user.id); io.emit('presence', { userId: user.id, online: false }); }
    else online.set(user.id, count);
  });
});

server.listen(PORT, () => console.log(`Massage Global running at http://localhost:${PORT}`));
