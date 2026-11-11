const $ = (selector) => document.querySelector(selector);
const authView = $('#auth-view'), chatView = $('#chat-view'), authForm = $('#auth-form');
let registerMode = false, currentUser = null, activePeer = null, socket = null, knownUsers = [], onlineIds = new Set();
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Terjadi kesalahan.');
  return data;
}
function showError(message) { $('#auth-error').textContent = message || ''; }
$('#switch-mode').addEventListener('click', () => {
  registerMode = !registerMode; showError();
  $('#auth-submit').innerHTML = registerMode ? 'Buat akun <span>→</span>' : 'Masuk ke Massage Global <span>→</span>';
  $('#switch-label').textContent = registerMode ? 'Sudah punya akun?' : 'Belum punya akun?';
  $('#switch-mode').textContent = registerMode ? 'Masuk' : 'Daftar';
  $('#password').autocomplete = registerMode ? 'new-password' : 'current-password';
});
authForm.addEventListener('submit', async (event) => {
  event.preventDefault(); showError();
  const button = $('#auth-submit'); button.disabled = true;
  try {
    const result = await api(registerMode ? '/api/register' : '/api/login', { method: 'POST', body: JSON.stringify({ username: $('#username').value, password: $('#password').value }) });
    startApp(result.user);
  } catch (error) { showError(error.message); }
  finally { button.disabled = false; }
});
$('#logout').addEventListener('click', async () => { try { await api('/api/logout', { method: 'POST' }); } finally { location.reload(); } });
$('#global-room').addEventListener('click', () => openRoom(null));
$('#refresh-users').addEventListener('click', loadUsers);
$('#dismiss-welcome').addEventListener('click', () => $('#welcome-banner').classList.add('hidden'));
$('#info-button').addEventListener('click', () => showToast('Massage Global — ruang obrolan global dan pesan pribadi.'));
$('#message-input').addEventListener('input', (e) => { const remaining = 2000 - e.target.value.length; $('#char-count').textContent = remaining < 100 ? remaining : ''; });
$('#composer').addEventListener('submit', (event) => {
  event.preventDefault(); const input = $('#message-input'), body = input.value.trim();
  if (!body || !socket) return;
  socket.emit('message:send', { body, recipientId: activePeer ? activePeer.id : null }, (result) => {
    if (result && result.error) showToast(result.error);
    else { input.value = ''; $('#char-count').textContent = ''; input.focus(); }
  });
});

function startApp(user) {
  currentUser = user; authView.classList.add('hidden'); chatView.classList.remove('hidden');
  $('#my-name').textContent = user.username; $('#my-avatar').textContent = user.username[0].toUpperCase();
  if (user.role === 'owner') $('#owner-badge').classList.remove('hidden');
  socket = io();
  socket.on('connect_error', (error) => showToast(error.message));
  socket.on('presence', ({ userId, online }) => { online ? onlineIds.add(userId) : onlineIds.delete(userId); renderUsers(); });
  socket.on('message:new', (message) => {
    const belongsToCurrentRoom = activePeer
      ? (message.sender_id === activePeer.id && message.recipient_id === currentUser.id) || (message.sender_id === currentUser.id && message.recipient_id === activePeer.id)
      : message.recipient_id === null;
    if (belongsToCurrentRoom) appendMessage(message);
    if (message.sender_id !== currentUser.id && !belongsToCurrentRoom) showToast(`Pesan baru dari ${message.sender}`);
  });
  loadUsers(); openRoom(null);
}
function renderUsers() {
  const list = $('#users-list');
  if (!knownUsers.length) { list.innerHTML = '<div class="empty-users">Belum ada pengguna lain.<br>Ajak temanmu bergabung!</div>'; return; }
  list.innerHTML = knownUsers.map((user) => `<button class="user-item ${activePeer && activePeer.id === user.id ? 'active' : ''}" data-id="${user.id}"><span class="avatar user-avatar">${esc(user.username[0].toUpperCase())}<i class="presence-dot ${onlineIds.has(user.id) ? 'is-online' : ''}"></i></span><span class="user-copy"><strong>${esc(user.username)}</strong><small>${onlineIds.has(user.id) ? 'Sedang online' : 'Mulai percakapan'}</small></span><span class="user-chevron">›</span></button>`).join('');
  list.querySelectorAll('.user-item').forEach((button) => button.addEventListener('click', () => { const user = knownUsers.find((item) => item.id === Number(button.dataset.id)); if (user) openRoom(user); }));
}
async function loadUsers() { try { knownUsers = (await api('/api/users')).users; renderUsers(); } catch (error) { showToast(error.message); } }
async function openRoom(peer) {
  activePeer = peer; $('#global-room').classList.toggle('selected', !peer); renderUsers();
  $('#messages').innerHTML = '<div class="date-divider"><span>AWAL PERCAKAPAN</span></div>';
  if (peer) {
    $('#chat-title').textContent = peer.username; $('#chat-subtitle').innerHTML = `<i class="online-dot ${onlineIds.has(peer.id) ? '' : 'offline'}"></i> ${onlineIds.has(peer.id) ? 'Pengguna aktif' : 'Percakapan pribadi'}`;
    $('#welcome-banner').classList.add('hidden');
    socket.emit('dm:join', peer.id, (result) => { if (result && result.error) showToast(result.error); });
  } else {
    $('#chat-title').textContent = 'Obrolan Global'; $('#chat-subtitle').innerHTML = '<i class="online-dot"></i> Tempat semua orang berkumpul';
    $('#welcome-banner').classList.remove('hidden');
  }
  try {
    const query = peer ? `?with=${encodeURIComponent(peer.id)}` : '';
    const data = await api(`/api/messages${query}`);
    if (activePeer !== peer) return;
    data.messages.forEach(appendMessage); scrollToBottom();
  } catch (error) { showToast(error.message); }
  $('#message-input').placeholder = peer ? `Kirim pesan ke ${peer.username}...` : 'Tulis pesan yang baik...';
}
function appendMessage(message) {
  if ($('#messages').querySelector(`[data-message-id="${message.id}"]`)) return;
  const mine = message.sender_id === currentUser.id;
  const item = document.createElement('article'); item.className = `message ${mine ? 'mine' : ''}`; item.dataset.messageId = message.id;
  const time = new Date(message.created_at.replace(' ', 'T') + (message.created_at.includes('Z') ? '' : 'Z')).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  item.innerHTML = `${mine ? '' : `<div class="message-avatar">${esc((message.sender || '?')[0].toUpperCase())}</div>`}<div class="message-content">${mine ? '' : `<span class="message-sender">${esc(message.sender)}</span>`}<div class="bubble">${esc(message.body).replace(/\n/g, '<br>')}</div><span class="message-time">${time}${mine ? ' · ✓' : ''}</span></div>`;
  $('#messages').appendChild(item); scrollToBottom();
}
function scrollToBottom() { const messages = $('#messages'); messages.scrollTop = messages.scrollHeight; }
let toastTimer;
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.add('hidden'), 3200); }
api('/api/me').then(({ user }) => { if (user) startApp(user); }).catch(() => {});
