// Shajara AI — loyiha egasi uchun admin panel
const $ = (s) => document.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tg = window.Telegram?.WebApp;
tg?.ready?.();
tg?.expand?.();
document.documentElement.dataset.theme = tg?.colorScheme === 'dark' || matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

let KEY = sessionStorage.getItem('adm_key') || '';

function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  setTimeout(() => (t.className = ''), 2600);
}

async function api(path, body) {
  const r = await fetch('/api/admin/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-admin-key': KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Xatolik'), { status: r.status });
  return j;
}

function login(msg) {
  app.innerHTML = `<h1>🔐 Shajara — Admin</h1>
    <form class="card" style="padding:18px;max-width:420px" id="lf">
      <div class="field"><label>Admin kaliti</label><input class="input" type="password" id="k" autocomplete="current-password" required></div>
      <button class="btn btn-primary btn-block">Kirish</button>
      ${msg ? `<div class="hint" style="color:var(--danger);margin-top:10px">${esc(msg)}</div>` : ''}
    </form>`;
  $('#lf').onsubmit = (e) => {
    e.preventDefault();
    KEY = $('#k').value.trim();
    sessionStorage.setItem('adm_key', KEY);
    load();
  };
}

const d = (iso) => (iso ? iso.slice(0, 10) : '—');

async function load() {
  if (!KEY) return login();
  app.innerHTML = '<div class="empty"><span class="spin"></span></div>';
  let o;
  try { o = await api('overview'); } catch (e) {
    if (e.status === 401) { sessionStorage.removeItem('adm_key'); KEY = ''; return login(e.message); }
    app.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  const sum = (k) => o.trees.reduce((a, x) => a + (x[k] || 0), 0);
  const prem = o.trees.filter((x) => x.premiumUntil && new Date(x.premiumUntil) > new Date()).length;
  o.trees.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  app.innerHTML = `<div class="row"><h1 class="grow">🌳 Shajara — Admin</h1><button class="btn btn-ghost btn-sm" id="out">Chiqish</button></div>
    <div class="kpis">
      <div class="card kpi"><b>${o.trees.length}</b><span>shajara</span></div>
      <div class="card kpi"><b>${o.users}</b><span>bot foydalanuvchisi</span></div>
      <div class="card kpi"><b>${sum('persons')}</b><span>kishi jami</span></div>
      <div class="card kpi"><b>${sum('members')}</b><span>a’zo (kirganlar)</span></div>
      <div class="card kpi"><b>${sum('album')}</b><span>albom fayli</span></div>
      <div class="card kpi"><b>${prem}</b><span>Premium faol</span></div>
      <div class="card kpi"><b>⭐ ${sum('stars')}</b><span>to‘lovlar (Stars)</span></div>
      <div class="card kpi"><b>${o.paywall ? 'Yoqiq' : 'O‘chiq'}</b><span>Pullik rejim · ⭐${o.prices.month}/${o.prices.year}</span></div>
    </div>
    <section><h3 class="h3" style="margin-bottom:8px">Shajaralar</h3><div class="card tbl"><table>
      <tr><th>Nomi</th><th>Kishi</th><th>A’zo</th><th>Albom</th><th>Guruh</th><th>Kanal</th><th>Egasi</th><th>Yaratilgan</th><th>Premium</th><th></th></tr>
      ${o.trees.map((x) => `<tr><td class="t">${esc(x.title)}<div class="small muted">${x.id}</div></td><td>${x.persons}</td><td>${x.members}</td><td>${x.album}</td><td>${x.groups}</td>
        <td>${x.channel ? '✅' : '—'}</td><td>${esc(x.owner || '—')}</td><td>${d(x.createdAt)}</td><td>${x.premiumUntil && new Date(x.premiumUntil) > new Date() ? '⭐ ' + d(x.premiumUntil) : '—'}</td>
        <td><div class="row-actions"><button class="btn btn-soft btn-sm" data-p="${x.id}" data-days="30">+30 kun</button><button class="btn btn-soft btn-sm" data-p="${x.id}" data-days="365">+1 yil</button><button class="btn btn-ghost btn-sm" data-p="${x.id}" data-days="0">Bekor</button></div></td></tr>`).join('')}
    </table></div></section>
    <section><h3 class="h3" style="margin-bottom:8px">Barcha foydalanuvchilarga xabar</h3>
      <form class="card" style="padding:14px" id="bf"><textarea class="input" id="bt" placeholder="Matn (HTML: <b>, <i>, <a href>)" required></textarea>
      <button class="btn btn-primary" style="margin-top:10px">Yuborish</button></form></section>`;
  $('#out').onclick = () => { sessionStorage.removeItem('adm_key'); KEY = ''; login(); };
  document.querySelectorAll('[data-p]').forEach((b) => (b.onclick = async () => {
    try { await api('premium', { treeId: b.dataset.p, days: Number(b.dataset.days) }); toast('Saqlandi ✓'); load(); } catch (e) { toast(e.message, true); }
  }));
  $('#bf').onsubmit = async (e) => {
    e.preventDefault();
    if (!confirm(`${o.users} foydalanuvchiga yuborilsinmi?`)) return;
    try { const r = await api('broadcast', { text: $('#bt').value }); toast(`Yuborildi: ${r.sent}/${r.total}`); $('#bt').value = ''; } catch (e) { toast(e.message, true); }
  };
}

load();
