let root = null;
let pollTimer = null;
let lastIds = new Set();

async function api(method = 'GET', body) {
  const response = await fetch('/api/notifications', {
    method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 401) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function relative(value) {
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms)) return '';
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

function maybeDesktopNotify(items) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  for (const item of items) {
    if (item.read || lastIds.has(item.id)) continue;
    try { new Notification(item.title, { body: item.message, icon: '/logo.svg', tag: `attozap-${item.id}` }); } catch {}
  }
}

function render(data) {
  if (!root) return;
  const unread = Number(data?.unread || 0);
  const items = Array.isArray(data?.notifications) ? data.notifications : [];
  maybeDesktopNotify(items);
  lastIds = new Set(items.map(item => item.id));
  const badge = root.querySelector('[data-notification-badge]');
  if (badge) { badge.textContent = unread > 99 ? '99+' : String(unread); badge.hidden = unread < 1; }
  const list = root.querySelector('[data-notification-list]');
  if (!list) return;
  list.innerHTML = items.length ? items.map(item => `
    <button class="notification-item ${item.read ? 'read' : 'unread'}" data-notification-id="${escapeHtml(item.id)}">
      <span class="notification-dot type-${escapeHtml(item.type)}"></span>
      <span class="notification-copy"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.message)}</small><em>${escapeHtml(relative(item.createdAt))}</em></span>
    </button>`).join('') : '<div class="notification-empty">Nenhuma notificação ainda.</div>';
  list.querySelectorAll('[data-notification-id]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.notificationId;
    if (id) await api('POST', { action: 'markRead', id }).catch(() => {});
    button.classList.remove('unread'); button.classList.add('read');
    await load();
  }));
}

async function load() {
  try { const data = await api(); if (data) render(data); } catch (error) { console.error('[notifications]', error); }
}

function mount() {
  if (root || !location.pathname.startsWith('/portal') && !location.pathname.startsWith('/admin')) return;
  const header = document.querySelector('.portal-header');
  if (!header) return;
  root = document.createElement('div');
  root.className = 'notification-center';
  root.innerHTML = `
    <button class="notification-trigger" type="button" aria-label="Notificações">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span data-notification-badge hidden>0</span>
    </button>
    <section class="notification-popover" hidden>
      <header><div><small>ATTOZAP</small><b>Notificações</b></div><button type="button" data-mark-all>Marcar lidas</button></header>
      <div class="notification-list" data-notification-list><div class="notification-empty">Carregando…</div></div>
      <footer>${'Notification' in window && Notification.permission !== 'granted' ? '<button type="button" data-browser-notifications>Ativar notificações do navegador</button>' : '<span>Alertas em tempo real</span>'}</footer>
    </section>`;
  const user = header.querySelector('.header-user');
  header.insertBefore(root, user || null);
  const trigger = root.querySelector('.notification-trigger');
  const popover = root.querySelector('.notification-popover');
  trigger.addEventListener('click', () => { popover.hidden = !popover.hidden; if (!popover.hidden) void load(); });
  root.querySelector('[data-mark-all]')?.addEventListener('click', async () => { await api('POST', { action: 'markAllRead' }).catch(() => {}); await load(); });
  root.querySelector('[data-browser-notifications]')?.addEventListener('click', async event => {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    event.currentTarget.textContent = permission === 'granted' ? 'Notificações ativadas' : 'Permissão não concedida';
  });
  document.addEventListener('click', event => { if (root && !root.contains(event.target)) popover.hidden = true; });
  void load();
  pollTimer = setInterval(load, 30000);
}

export function initNotifications() {
  if (!location.pathname.startsWith('/portal') && !location.pathname.startsWith('/admin')) return;
  const observer = new MutationObserver(() => { if (!root) mount(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  mount();
  window.addEventListener('beforeunload', () => { if (pollTimer) clearInterval(pollTimer); });
}
