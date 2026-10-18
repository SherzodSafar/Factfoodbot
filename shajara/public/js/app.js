// Shajara iBot — Mini App
import { I } from './icons.js';
import { quoteOfDay, randomQuote } from './quotes.js';
import { TreeView, esc } from './tree-view.js';
import {
  Family, fmtDate, yearsLabel, age, initials, parseDateInput, dateToInput, upcomingBirthdays, monthShort, kinship,
} from './family.js';

const tg = window.Telegram?.WebApp;
const inTelegram = !!tg?.initData;
const BOT = 'Shajara_iBot';
const $app = document.getElementById('app');
const $sheets = document.getElementById('sheet-root');

// ------------------------------------------------------------ Holat --------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const S = {
  tree: null,
  fam: null,
  token: null,      // joriy token (view yoki edit)
  viewToken: null,
  tab: 'tree',
  listFilter: 'all',
  listQuery: '',
  treeView: null,
  kinA: null,
  kinB: null,
};

// ------------------------------------------------------------ Telegram -----
function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  try { tg.disableVerticalSwipes?.(); } catch {}
  try { tg.setHeaderColor?.('bg_color'); } catch {}
  applyTheme();
  tg.onEvent?.('themeChanged', applyTheme);
  tg.BackButton?.onClick(() => goBack());
}
function applyTheme() {
  const dark = tg?.colorScheme ? tg.colorScheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  try { tg?.setBackgroundColor?.(bg); tg?.setHeaderColor?.(bg); tg?.setBottomBarColor?.(bg); } catch {}
}
function haptic(type = 'light') {
  try {
    if (['success', 'error', 'warning'].includes(type)) tg?.HapticFeedback?.notificationOccurred(type);
    else tg?.HapticFeedback?.impactOccurred(type);
  } catch {}
}
function updateBackButton() {
  if (!tg?.BackButton) return;
  const show = $sheets.children.length > 0 || !!document.querySelector('.screen[data-back]');
  show ? tg.BackButton.show() : tg.BackButton.hide();
}
function goBack() {
  if (closeTopSheet()) return;
  const back = document.querySelector('.screen[data-back]');
  if (back) back.dispatchEvent(new CustomEvent('back'));
}
async function confirmBox(text) {
  if (tg?.showConfirm && inTelegram) return new Promise((r) => tg.showConfirm(text, r));
  return confirm(text);
}

// ------------------------------------------------------------ API ----------
async function api(path, { method = 'GET', body, token = S.token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  if (tg?.initData) headers['x-init-data'] = tg.initData;
  let r;
  try {
    r = await fetch('/api/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw Object.assign(new Error("Internet aloqasini tekshiring"), { status: 0 });
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Xatolik yuz berdi'), { status: r.status });
  return j;
}

function photoUrl(p) {
  if (!p?.photo || !S.tree) return null;
  return `/api/photo/${S.tree.id}/${p.photo}?t=${encodeURIComponent(S.viewToken || S.token)}`;
}

// ------------------------------------------------------------ Toast --------
let toastT;
function toast(msg, err = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  haptic(err ? 'error' : 'success');
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.className = ''), 2600);
}

// ------------------------------------------------------------ Saqlangan shajaralar --
function savedTrees() { return store.get('sh_trees', []); }
function saveTreeLocal(patch) {
  const list = savedTrees().filter((t) => t.id !== patch.id);
  const prev = savedTrees().find((t) => t.id === patch.id) || {};
  list.unshift({ ...prev, ...patch, at: Date.now() });
  store.set('sh_trees', list.slice(0, 8));
  store.set('sh_last', patch.id);
}
function forgetTree(id) {
  store.set('sh_trees', savedTrees().filter((t) => t.id !== id));
  if (store.get('sh_last') === id) store.set('sh_last', null);
}

// =================================================================== ONBOARDING
const ART = {
  tree: `<svg viewBox="0 0 300 300" class="grow-in"><defs><radialGradient id="g1" cx="50%" cy="40%"><stop offset="0" stop-color="#f6e7c4"/><stop offset="1" stop-color="#f6e7c4" stop-opacity="0"/></radialGradient><linearGradient id="lf" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#3db183"/><stop offset="1" stop-color="#1f6b4f"/></linearGradient></defs>
    <circle cx="150" cy="140" r="140" fill="url(#g1)"/>
    <path d="M150 270 C148 220 150 190 150 160 M150 200 C130 185 110 180 95 160 M150 190 C170 175 190 172 205 150 M150 165 C140 140 120 130 105 110 M150 160 C160 135 180 125 195 105" stroke="#8a5a2b" stroke-width="9" stroke-linecap="round" fill="none"/>
    <g class="float"><circle cx="150" cy="95" r="58" fill="url(#lf)"/><circle cx="92" cy="128" r="42" fill="url(#lf)" opacity=".92"/><circle cx="208" cy="125" r="44" fill="url(#lf)" opacity=".92"/><circle cx="120" cy="70" r="30" fill="#56c697" opacity=".7"/>
    <g fill="#fffdf8" stroke="#b9862a" stroke-width="3"><circle cx="150" cy="80" r="14"/><circle cx="100" cy="125" r="12"/><circle cx="205" cy="120" r="12"/><circle cx="150" cy="128" r="11"/><circle cx="178" cy="78" r="9"/><circle cx="122" cy="82" r="9"/></g></g>
    <path d="M60 272 Q150 255 240 272" stroke="#b9862a" stroke-width="3" fill="none" opacity=".5"/></svg>`,
  people: `<svg viewBox="0 0 300 300" class="grow-in"><circle cx="150" cy="150" r="135" fill="#dcefe5" opacity=".6"/>
    <g class="float"><rect x="62" y="70" width="176" height="64" rx="18" fill="#fffdf8" stroke="#e4d9c4" stroke-width="2"/><circle cx="96" cy="102" r="20" fill="#3b6ea8"/><rect x="126" y="90" width="86" height="10" rx="5" fill="#1d2721" opacity=".8"/><rect x="126" y="108" width="54" height="8" rx="4" fill="#7b847d" opacity=".6"/>
    <rect x="62" y="146" width="176" height="64" rx="18" fill="#fffdf8" stroke="#e4d9c4" stroke-width="2"/><circle cx="96" cy="178" r="20" fill="#b04f78"/><rect x="126" y="166" width="70" height="10" rx="5" fill="#1d2721" opacity=".8"/><rect x="126" y="184" width="64" height="8" rx="4" fill="#7b847d" opacity=".6"/>
    <rect x="62" y="222" width="176" height="40" rx="14" fill="#fffdf8" stroke="#e4d9c4" stroke-width="2" opacity=".7"/></g>
    <circle cx="232" cy="74" r="26" fill="#b9862a"/><path d="M222 74h20M232 64v20" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>`,
  lock: `<svg viewBox="0 0 300 300" class="grow-in"><circle cx="150" cy="150" r="135" fill="#f6e7c4" opacity=".7"/>
    <g class="float"><rect x="88" y="132" width="124" height="104" rx="24" fill="#1f6b4f"/><path d="M114 132v-26a36 36 0 0 1 72 0v26" stroke="#1f6b4f" stroke-width="16" fill="none" stroke-linecap="round"/>
    <circle cx="150" cy="176" r="14" fill="#f6e7c4"/><rect x="144" y="182" width="12" height="28" rx="6" fill="#f6e7c4"/></g>
    <g fill="#b9862a"><circle cx="70" cy="96" r="7"/><circle cx="236" cy="210" r="9"/><circle cx="240" cy="92" r="5"/></g>
    <text x="150" y="276" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="18" fill="#b9862a" letter-spacing="6">• • • • • •</text></svg>`,
  heart: `<svg viewBox="0 0 300 300" class="grow-in"><circle cx="150" cy="150" r="135" fill="#f9e4ec" opacity=".7"/>
    <g class="float"><path d="M150 236s-84-48-84-108a46 46 0 0 1 84-26 46 46 0 0 1 84 26c0 60-84 108-84 108z" fill="#b04f78"/>
    <path d="M150 210V130M150 160l-24-22M150 150l26-24" stroke="#fffdf8" stroke-width="7" stroke-linecap="round" fill="none"/></g>
    <g font-size="28"><text x="54" y="80">🎂</text><text x="222" y="86">🕯</text><text x="232" y="250">🤲</text></g></svg>`,
};

const SLIDES = [
  { art: 'tree', h: 'Ildizingizni bilib oling', p: 'Ota-bobolaringizdan boshlab bugungi nevaralargacha — butun urug‘ingiz bitta jonli daraxtda.' },
  { art: 'people', h: 'Har bir inson — alohida sahifa', p: 'Surat, tug‘ilgan sana, ota-ona, farzandlar va nasl yo‘li. Qidiring, ro‘yxatni ko‘ring, kim kimga kimligini aniqlang.' },
  { art: 'lock', h: 'Ikki xil maxfiy kod', p: 'Kirish kodi bilan qarindoshlar shajarani ko‘radi. Tahrir kodi bilan esa faqat ishonchli kishilar yangilik kiritadi.' },
  { art: 'heart', h: 'Silai rahmni unutmang', p: 'Tug‘ilgan kunlar va xotira kunlarida eslataman. «Qarindoshlik rishtasini bog‘lagan — umri va rizqi baraka topadi».' },
];

function renderOnboarding(done) {
  let i = 0;
  $app.innerHTML = `<div class="screen onb pattern">
    <button class="onb-skip">O‘tkazib yuborish</button>
    <div class="onb-track">${SLIDES.map((s) => `<div class="onb-slide"><div class="onb-art">${ART[s.art]}</div><h2>${s.h}</h2><p>${s.p}</p></div>`).join('')}</div>
    <div class="onb-foot"><div class="dots">${SLIDES.map((_, j) => `<i class="${j ? '' : 'on'}"></i>`).join('')}</div>
    <button class="btn btn-primary btn-block" id="onb-next">Keyingi</button></div></div>`;
  const track = $app.querySelector('.onb-track');
  const dots = [...$app.querySelectorAll('.dots i')];
  const next = $app.querySelector('#onb-next');
  const go = (n) => {
    i = Math.max(0, Math.min(SLIDES.length - 1, n));
    track.style.transform = `translateX(${-i * 100}%)`;
    dots.forEach((d, j) => d.classList.toggle('on', j === i));
    next.textContent = i === SLIDES.length - 1 ? 'Boshlash 🌱' : 'Keyingi';
    // har slaydda animatsiyani qayta boshlash
    const art = track.children[i].querySelector('svg');
    art.classList.remove('grow-in'); void art.getBoundingClientRect(); art.classList.add('grow-in');
    haptic('light');
  };
  const finish = () => { store.set('sh_onb', 1); haptic('success'); done(); };
  next.onclick = () => (i === SLIDES.length - 1 ? finish() : go(i + 1));
  $app.querySelector('.onb-skip').onclick = finish;
  let sx = null;
  track.addEventListener('touchstart', (e) => (sx = e.touches[0].clientX), { passive: true });
  track.addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
    sx = null;
  });
}

// =================================================================== KIRISH (GATE)
const LOGO = `<svg viewBox="0 0 64 64" fill="none"><path d="M32 58V36" stroke="#f6e7c4" stroke-width="4" stroke-linecap="round"/><path d="M32 44 22 36M32 40l10-8" stroke="#f6e7c4" stroke-width="3.5" stroke-linecap="round"/><circle cx="32" cy="22" r="14" fill="#56c697"/><circle cx="19" cy="30" r="9" fill="#3db183"/><circle cx="45" cy="30" r="9" fill="#3db183"/><circle cx="32" cy="20" r="4" fill="#f6e7c4"/><circle cx="20" cy="30" r="3" fill="#f6e7c4"/><circle cx="44" cy="30" r="3" fill="#f6e7c4"/></svg>`;

function renderGate(prefill = '') {
  S.tree = null;
  const recent = savedTrees();
  let q = randomQuote();
  $app.innerHTML = `<div class="screen pattern"><div class="scroll">
    <div class="gate-hero"><div class="logo">${LOGO}</div>
      <h1 class="h1">Shajara</h1>
      <div class="muted" style="margin-top:6px;font-weight:600">Urug‘ingiz tarixi — bir joyda, abadiy</div></div>
    <div class="quote-card"><q id="gq">${esc(q.t)}</q><div class="by" id="gqa">${esc(q.a)}</div></div>
    <form class="card code-box" id="code-form" autocomplete="off">
      <div class="h3" style="margin-bottom:10px">Mavjud shajaraga kirish</div>
      <input class="input code-input" id="code" placeholder="shajara kodi" value="${esc(prefill)}" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" />
      <button class="btn btn-primary btn-block" style="margin-top:12px" id="enter">Kirish</button>
      <div class="hint" style="text-align:center;margin-top:10px">Kodni shajara egasidan so‘rang</div>
    </form>
    <div class="divider">yoki</div>
    <div style="padding:0 16px"><button class="btn btn-gold btn-block" id="create">🌱 Yangi shajara yaratish</button></div>
    ${recent.length ? `<div class="recent"><div class="h3" style="margin-top:22px">Oxirgi kirilganlar</div>
      ${recent.map((t) => `<button class="card recent-item" data-id="${t.id}" style="width:100%;text-align:left"><div class="tree-ic">🌳</div>
        <div class="grow"><div style="font-weight:800" class="ellipsis">${esc(t.title)}</div><div class="small muted">${t.count || 0} kishi · ${t.editToken ? 'tahrirchi' : 'ko‘ruvchi'}</div></div>${I.chev}</button>`).join('')}</div>` : '<div style="height:28px"></div>'}
  </div></div>`;
  updateBackButton();
  const form = $app.querySelector('#code-form');
  const input = $app.querySelector('#code');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const code = input.value.trim();
    if (!code) return input.focus();
    const btn = $app.querySelector('#enter');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>';
    try {
      const r = await api('open', { method: 'POST', body: { code }, token: null });
      input.blur();
      openTree(r.tree, { viewToken: r.token, viewCode: code });
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = 'Kirish';
    }
  };
  $app.querySelector('#create').onclick = () => renderCreate();
  if (prefill) setTimeout(() => form.requestSubmit(), 150);
  $app.querySelectorAll('.recent-item').forEach((b) => (b.onclick = () => resumeTree(b.dataset.id)));
  const timer = setInterval(() => {
    const el = document.getElementById('gq');
    if (!el) return clearInterval(timer);
    q = randomQuote(q);
    el.textContent = q.t;
    document.getElementById('gqa').textContent = q.a;
    el.parentElement.classList.remove('quote-fade'); void el.offsetWidth; el.parentElement.classList.add('quote-fade');
  }, 7000);
}

async function resumeTree(id) {
  const saved = savedTrees().find((t) => t.id === id);
  if (!saved) return renderGate();
  showLoader();
  try {
    const r = await api('tree', { token: saved.editToken || saved.viewToken });
    openTree(r.tree, { viewToken: saved.viewToken || saved.editToken, editToken: r.tree.role === 'edit' ? saved.editToken : null });
  } catch (err) {
    if (err.status === 401 || err.status === 404) {
      forgetTree(id);
      toast(err.message, true);
    } else toast(err.message, true);
    renderGate();
  }
}

function showLoader() {
  $app.innerHTML = `<div class="loader pattern"><div style="text-align:center"><div class="logo" style="animation:float 2s ease-in-out infinite">${LOGO}</div><div class="muted" style="font-weight:700">Shajara ochilmoqda…</div></div></div>`;
}

// =================================================================== YARATISH
function renderCreate() {
  const suggested = 'oila' + Math.floor(1000 + Math.random() * 9000);
  $app.innerHTML = `<div class="screen" data-back><div class="topbar"><button class="icon-btn" id="back">${I.back}</button><div class="grow"><div class="title">Yangi shajara</div><div class="sub">Bir daqiqada tayyor</div></div></div>
    <div class="scroll pad"><form id="cf" autocomplete="off">
      <div class="field"><label>Shajara nomi</label><input class="input" name="title" placeholder="Masalan: Saparboyevlar shajarasi" maxlength="80" required></div>
      <div class="field"><label>Qisqacha tavsif (ixtiyoriy)</label><input class="input" name="description" placeholder="Qayerdan, qaysi urug‘dan…" maxlength="300"></div>
      <div class="h3" style="margin:22px 0 12px">Eng katta ajdod</div>
      <div class="field"><label>Ismi</label><input class="input" name="name" placeholder="Masalan: Hasan bobo" maxlength="80" required></div>
      <div class="field"><label>Jinsi</label><div class="seg" data-seg="gender"><button type="button" class="on" data-v="m">👨 Erkak</button><button type="button" data-v="f">👩 Ayol</button></div></div>
      <div class="field"><label>Tug‘ilgan yili yoki sanasi</label><input class="input" name="birth" placeholder="1857 yoki 20.03.1958" inputmode="numeric"></div>
      <div class="h3" style="margin:22px 0 12px">Maxfiy kodlar</div>
      <div class="field"><label>🔑 Kirish kodi — qarindoshlar shu bilan ko‘radi</label><input class="input" name="viewCode" value="${suggested}" autocapitalize="off" minlength="4" required><div class="hint">Noyob bo‘lishi kerak. Kamida 4 belgi.</div></div>
      <div class="field"><label>✏️ Tahrir kodi — faqat ishonchli kishilar uchun</label><input class="input" name="editCode" placeholder="boshqa, maxfiyroq kod" autocapitalize="off" minlength="4" required><div class="hint">Bu kod bilan odam qo‘shish, surat qo‘yish va o‘zgartirish mumkin. Uni yo‘qotmang!</div></div>
      <button class="btn btn-primary btn-block" style="margin-top:10px">Shajarani yaratish</button>
      <div style="height:30px"></div>
    </form></div></div>`;
  const scr = $app.querySelector('.screen');
  scr.addEventListener('back', () => renderGate());
  $app.querySelector('#back').onclick = () => renderGate();
  updateBackButton();
  bindSeg($app);
  $app.querySelector('#cf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const birth = parseDateInput(f.get('birth'));
    if (birth === undefined) return toast('Sana formati noto‘g‘ri. Masalan: 1958 yoki 20.03.1958', true);
    const btn = e.target.querySelector('button:not([type])');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>';
    try {
      const r = await api('create', {
        method: 'POST',
        token: null,
        body: {
          title: f.get('title'), description: f.get('description'), viewCode: f.get('viewCode'), editCode: f.get('editCode'),
          root: { name: f.get('name'), gender: segVal($app, 'gender'), birth },
        },
      });
      toast('Tabriklaymiz! Shajarangiz yaratildi 🌱');
      openTree(r.tree, { viewToken: r.token, editToken: r.token, viewCode: f.get('viewCode').trim().toLowerCase() });
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = 'Shajarani yaratish';
    }
  };
}

function bindSeg(root) {
  root.querySelectorAll('.seg').forEach((seg) => seg.querySelectorAll('button').forEach((b) => (b.onclick = () => {
    seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    haptic('light');
    seg.dispatchEvent(new Event('change'));
  })));
}
function segVal(root, name) { return root.querySelector(`[data-seg="${name}"] .on`)?.dataset.v; }

// =================================================================== ASOSIY ILOVA
function openTree(tree, { viewToken, editToken, viewCode } = {}) {
  S.viewToken = viewToken || S.viewToken;
  S.editToken = editToken ?? (tree.role === 'edit' ? viewToken : null);
  S.token = S.editToken || S.viewToken;
  setTree(tree);
  const saved = savedTrees().find((t) => t.id === tree.id) || {};
  saveTreeLocal({
    id: tree.id, title: tree.title, count: tree.persons.length, viewToken: S.viewToken,
    editToken: S.editToken || null, viewCode: viewCode || saved.viewCode || null,
  });
  renderMain();
}

function setTree(tree) {
  S.tree = tree;
  S.fam = new Family(tree.persons);
  const saved = savedTrees().find((t) => t.id === tree.id);
  if (saved) saveTreeLocal({ ...saved, title: tree.title, count: tree.persons.length });
}

const isEdit = () => S.tree?.role === 'edit';

function renderMain() {
  const t = S.tree;
  $app.innerHTML = `<div class="screen">
    <div class="topbar"><button class="icon-btn" id="home" aria-label="Shajaralar">${LOGO.replace('viewBox', 'style="width:26px;height:26px;background:var(--primary);border-radius:8px;padding:2px" viewBox')}</button>
      <div class="grow"><div class="title ellipsis" id="t-title">${esc(t.title)}</div><div class="sub" id="t-sub"></div></div>
      <button class="lock-btn" id="lock"></button></div>
    <div class="views">
      <section class="view" data-view="tree"></section>
      <section class="view" data-view="list"></section>
      <section class="view" data-view="stats"></section>
      <section class="view" data-view="more"></section>
    </div>
    <nav class="tabbar">
      ${[['tree', I.tree, 'Daraxt'], ['list', I.list, 'Ro‘yxat'], ['stats', I.chart, 'Tahlil'], ['more', I.menu, 'Ko‘proq']]
        .map(([k, ic, l]) => `<button class="tab" data-tab="${k}">${ic}<span>${l}</span></button>`).join('')}
    </nav></div>`;
  $app.querySelector('#home').onclick = () => renderGate();
  $app.querySelector('#lock').onclick = () => (isEdit() ? lockSheet() : unlockSheet());
  $app.querySelectorAll('.tab').forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));
  S.treeView = null;
  refreshChrome();
  switchTab(S.tab || 'tree', true);
  updateBackButton();
}

function refreshChrome() {
  const t = S.tree;
  const gens = S.fam.maxGen - S.fam.minGen + 1;
  document.getElementById('t-title').textContent = t.title;
  document.getElementById('t-sub').textContent = `${t.persons.length} kishi · ${gens} avlod`;
  const lock = document.getElementById('lock');
  lock.className = 'lock-btn' + (isEdit() ? ' edit' : '');
  lock.innerHTML = isEdit() ? `${I.unlock}<span>Tahrir</span>` : `${I.lock}<span>Ko‘rish</span>`;
}

function switchTab(tab, force) {
  if (S.tab === tab && !force) {
    if (tab === 'tree') S.treeView?.showRoot();
    return;
  }
  S.tab = tab;
  haptic('light');
  $app.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $app.querySelectorAll('.view').forEach((v) => (v.style.display = v.dataset.view === tab ? '' : 'none'));
  renderTab(tab);
}

function renderTab(tab) {
  const el = $app.querySelector(`[data-view="${tab}"]`);
  if (!el) return;
  if (tab === 'tree') renderTreeTab(el);
  if (tab === 'list') renderListTab(el);
  if (tab === 'stats') renderStatsTab(el);
  if (tab === 'more') renderMoreTab(el);
}

/** Ma'lumot o'zgargach hamma narsani yangilash. */
function onTreeChanged(tree) {
  setTree(tree);
  refreshChrome();
  if (S.treeView) S.treeView.setData(S.fam, S.tree.rootId);
  for (const tab of ['list', 'stats', 'more']) {
    const el = $app.querySelector(`[data-view="${tab}"]`);
    if (el && (S.tab === tab || el.innerHTML)) renderTab(tab);
  }
}

// ------------------------------------------------------------ Daraxt tab ---
function renderTreeTab(el) {
  if (S.treeView) return;
  el.innerHTML = `<div class="tree-host" style="position:absolute;inset:0"></div>
    <div class="tree-search"><div style="position:relative">${I.search}<input class="input" id="ts" placeholder="Daraxtdan qidirish…" autocomplete="off"></div><div class="card suggest hidden" id="sg"></div></div>
    <div class="tree-tools">
      <button class="icon-btn" data-z="in" aria-label="Kattalashtirish">${I.plus}</button>
      <button class="icon-btn" data-z="out" aria-label="Kichiklashtirish">${I.minus}</button>
      <button class="icon-btn" data-z="fit" aria-label="Hammasini ko'rsatish">${I.fit}</button>
      <button class="icon-btn" data-z="root" aria-label="Ildizga qaytish">${I.target}</button>
      <button class="icon-btn" data-z="fold" aria-label="Shoxlarni yig'ish">${I.layers}</button>
    </div>
    <div class="card legend"><span><i style="background:var(--male)"></i>Erkak</span><span><i style="background:var(--female)"></i>Ayol</span><span><i style="border:1.5px dashed var(--muted)"></i>Kelin/kuyov</span></div>`;
  const tv = new TreeView(el.querySelector('.tree-host'), { onOpen: (id) => personSheet(id), photoUrl });
  S.treeView = tv;
  tv.setData(S.fam, S.tree.rootId);
  requestAnimationFrame(() => tv.showRoot());
  let folded = false;
  el.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => {
    haptic('light');
    const z = b.dataset.z;
    if (z === 'in') tv.zoom(1.35);
    if (z === 'out') tv.zoom(1 / 1.35);
    if (z === 'fit') tv.fit();
    if (z === 'root') tv.showRoot();
    if (z === 'fold') {
      folded = !folded;
      if (folded) tv.collapseFrom(Math.max(2, Math.min(4, S.fam.maxGen - S.fam.minGen)));
      else { tv.collapsed.clear(); tv.render(); }
      tv.showRoot();
      toast(folded ? 'Shoxlar yig‘ildi — ochish uchun raqamni bosing' : 'Barcha shoxlar ochildi');
    }
  }));
  const input = el.querySelector('#ts');
  const sg = el.querySelector('#sg');
  input.oninput = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) return sg.classList.add('hidden');
    const res = S.tree.persons.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
    sg.classList.toggle('hidden', !res.length);
    sg.innerHTML = res.map((p) => `<button data-id="${p.id}">${avatar(p, 34)}<div class="grow"><div style="font-weight:800">${esc(p.name)}</div><div class="small muted">${esc(subline(p))}</div></div></button>`).join('');
    sg.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      sg.classList.add('hidden');
      input.value = '';
      input.blur();
      tv.focus(b.dataset.id, { k: 1 });
    }));
  };
}

// ------------------------------------------------------------ Ro'yxat tab --
const FILTERS = [
  ['all', 'Hammasi'], ['blood', '🩸 Qon qarindosh'], ['inlaw', '💍 Kelin-kuyov'], ['alive', 'Hayot'], ['dec', 'Marhum'], ['m', 'Erkaklar'], ['f', 'Ayollar'], ['photo', '📸 Suratli'],
];
function renderListTab(el) {
  el.innerHTML = `<div class="search-bar" style="padding-top:8px">${I.search}<input class="input" id="lq" placeholder="Ism bo‘yicha qidirish" value="${esc(S.listQuery)}" autocomplete="off"></div>
    <div class="chips">${FILTERS.map(([k, l]) => `<button class="chip ${S.listFilter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
    <div class="scroll" id="lst"></div>`;
  const draw = () => {
    const q = S.listQuery.toLowerCase();
    const f = S.listFilter;
    const items = S.tree.persons.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !(p.code || '').includes(q)) return false;
      if (f === 'blood') return p.blood;
      if (f === 'inlaw') return !p.blood;
      if (f === 'alive') return !p.deceased;
      if (f === 'dec') return p.deceased;
      if (f === 'm' || f === 'f') return p.gender === f;
      if (f === 'photo') return !!p.photo;
      return true;
    });
    const groups = new Map();
    for (const p of items) {
      const g = S.fam.gen(p);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(p);
    }
    const order = [...groups.keys()].sort((a, b) => a - b);
    const lst = el.querySelector('#lst');
    if (!items.length) {
      lst.innerHTML = `<div class="empty"><div class="big">🔍</div>Hech kim topilmadi</div>`;
      return;
    }
    lst.innerHTML = order.map((g) => {
      const arr = groups.get(g).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      return `<div class="gen-head"><span class="h3" style="color:var(--gold)">${g}-avlod</span><span class="small muted" style="font-weight:700">${arr.length} kishi</span></div>
        ${arr.map((p) => personRow(p)).join('')}`;
    }).join('') + '<div style="height:20px"></div>';
    lst.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => personSheet(b.dataset.open)));
  };
  el.querySelector('#lq').oninput = (e) => { S.listQuery = e.target.value.trim(); draw(); };
  el.querySelectorAll('.chip').forEach((c) => (c.onclick = () => {
    S.listFilter = c.dataset.f;
    el.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c));
    haptic('light');
    draw();
  }));
  draw();
}

function sortKey(p) {
  // urug' tartibida: nasl yo'li bo'yicha tartib raqamlari
  return S.fam.lineage(p.blood ? p : S.fam.bloodSpouse(p) || p)
    .map((x) => String(x.child_order ?? 99).padStart(3, '0')).join('.') + (p.blood ? '0' : '1');
}

function personRow(p, right = '') {
  return `<button class="person-row" data-open="${p.id}">${avatar(p, 46)}
    <div class="grow"><div class="nm ellipsis">${esc(p.name)} ${p.deceased ? '<span class="muted" style="font-weight:600">†</span>' : ''}</div>
    <div class="meta ellipsis">${esc(subline(p))}</div></div>${right || I.chev.replace('<svg', '<svg class="chev"')}</button>`;
}

function subline(p) {
  const bits = [];
  const y = yearsLabel(p);
  if (y) bits.push(y);
  if (p.blood) {
    const f = S.fam.father(p) || S.fam.mother(p);
    if (f) bits.push(`${f.name} ${p.gender === 'm' ? 'o‘g‘li' : 'qizi'}`);
  } else {
    const s = S.fam.bloodSpouse(p);
    if (s) bits.push(`${s.name}ning turmush o‘rtog‘i`);
  }
  return bits.join(' · ');
}

function avatar(p, size = 48, extra = '') {
  const url = photoUrl(p);
  return `<div class="avatar ${p.gender} ${p.deceased ? 'dec' : ''} ${extra}" style="--s:${size}px">${url ? `<img src="${url}" alt="" loading="lazy">` : esc(initials(p.name))}</div>`;
}

// ------------------------------------------------------------ Tahlil tab ---
function renderStatsTab(el) {
  const P = S.tree.persons;
  const fam = S.fam;
  const alive = P.filter((p) => !p.deceased);
  const blood = P.filter((p) => p.blood);
  const men = P.filter((p) => p.gender === 'm').length;
  const gens = fam.maxGen - fam.minGen + 1;
  const firstYear = Math.min(...P.map((p) => Number(p.birth?.slice(0, 4)) || 9999));
  const span = firstYear < 9999 ? new Date().getFullYear() - firstYear : null;
  const byGen = [];
  for (let g = 1; g <= gens; g++) {
    const arr = P.filter((p) => fam.gen(p) === g);
    byGen.push({ g, m: arr.filter((p) => p.gender === 'm').length, f: arr.filter((p) => p.gender === 'f').length, n: arr.length });
  }
  const maxN = Math.max(1, ...byGen.map((x) => x.n));
  const bdays = upcomingBirthdays(P, 45);
  const elders = alive.filter((p) => p.birth).sort((a, b) => a.birth.localeCompare(b.birth)).slice(0, 5);
  const bigFam = P.filter((p) => p.blood).map((p) => ({ p, n: fam.children(p.id).length })).sort((a, b) => b.n - a.n).slice(0, 3);
  const q = quoteOfDay();
  const today = new Date();
  const mem = P.filter((p) => p.death?.length === 10 && Number(p.death.slice(5, 7)) === today.getMonth() + 1);

  el.innerHTML = `<div class="scroll" style="padding-top:8px">
    <div class="stat-grid">
      <div class="card stat hero"><div class="ic">🌳</div><div class="n">${P.length}</div><div class="l">kishi shajarada · ${gens} avlod${span ? ` · ${span} yillik tarix` : ''}</div></div>
      <div class="card stat"><div class="ic">🩸</div><div class="n">${blood.length}</div><div class="l">qon qarindosh</div></div>
      <div class="card stat"><div class="ic">💍</div><div class="n">${P.length - blood.length}</div><div class="l">kelin va kuyovlar</div></div>
      <div class="card stat"><div class="ic">💚</div><div class="n">${alive.length}</div><div class="l">hayot</div></div>
      <div class="card stat"><div class="ic">🕯</div><div class="n">${P.length - alive.length}</div><div class="l">marhumlar</div></div>
      <div class="card stat"><div class="ic">👨</div><div class="n">${men}</div><div class="l">erkaklar</div></div>
      <div class="card stat"><div class="ic">👩</div><div class="n">${P.length - men}</div><div class="l">ayollar</div></div>
    </div>
    <div class="quote-card"><q>${esc(q.t)}</q><div class="by">Kun hikmati · ${esc(q.a)}</div></div>
    <div class="section"><h3 class="h3">Avlodlar bo‘yicha</h3></div>
    <div class="card bars">${byGen.map((x) => `<div class="bar-row"><span>${x.g}-avlod</span><div class="bar"><i class="m" style="width:${(x.m / maxN) * 100}%"></i><i class="f" style="width:${(x.f / maxN) * 100}%"></i></div><span style="text-align:right">${x.n}</span></div>`).join('')}
      <div class="row small muted" style="margin-top:8px;gap:14px;font-weight:700"><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--male)"></i> erkak</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--female)"></i> ayol</span></div></div>
    <div class="section"><h3 class="h3">🎂 Yaqin tug‘ilgan kunlar</h3><span class="small muted">45 kun</span></div>
    ${bdays.length ? `<div class="card list-card">${bdays.slice(0, 8).map((b) => personRow(b.p, `<div class="bday-day"><b>${b.date.getDate()}</b><small>${monthShort(b.date.getMonth())}</small></div>`).replace('class="meta ellipsis">', `class="meta ellipsis">${b.diff === 0 ? '🎉 Bugun! ' : b.diff === 1 ? 'Ertaga · ' : `${b.diff} kundan so‘ng · `}${b.turns} yosh · `)).join('')}</div>`
      : '<div class="card" style="margin:0 16px;padding:16px" class="muted">Yaqin kunlarda tug‘ilgan kun yo‘q (to‘liq sana kiritilganlar hisobga olinadi).</div>'}
    ${mem.length ? `<div class="section"><h3 class="h3">🕯 Shu oyda xotira kunlari</h3></div><div class="card list-card">${mem.map((p) => personRow(p)).join('')}</div>` : ''}
    <div class="section"><h3 class="h3">🔗 Kim kimga kim?</h3></div>
    <div class="card" style="margin:0 16px;padding:14px"><div class="kin-pick">
      <button class="card kin-slot" data-kin="A">${S.kinA ? avatar(S.kinA, 54) + esc(S.kinA.name) : '<div class="avatar" style="--s:54px;background:var(--surface-2);color:var(--muted)">A</div>Birinchi inson'}</button>
      <div style="font-size:22px">↔︎</div>
      <button class="card kin-slot" data-kin="B">${S.kinB ? avatar(S.kinB, 54) + esc(S.kinB.name) : '<div class="avatar" style="--s:54px;background:var(--surface-2);color:var(--muted)">B</div>Ikkinchi inson'}</button>
    </div><div id="kin-res"></div></div>
    ${elders.length ? `<div class="section"><h3 class="h3">👑 Urug‘ oqsoqollari</h3></div><div class="card list-card">${elders.map((p) => personRow(p, `<span class="badge gold">${age(p)} yosh</span>`)).join('')}</div>` : ''}
    ${bigFam[0]?.n ? `<div class="section"><h3 class="h3">👨‍👩‍👧‍👦 Eng katta oilalar</h3></div><div class="card list-card">${bigFam.map((x) => personRow(x.p, `<span class="badge green">${x.n} farzand</span>`)).join('')}</div>` : ''}
    <div style="height:28px"></div></div>`;
  el.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => personSheet(b.dataset.open)));
  el.querySelectorAll('[data-kin]').forEach((b) => (b.onclick = () => pickPerson(b.dataset.kin === 'A' ? 'Birinchi insonni tanlang' : 'Ikkinchi insonni tanlang', (p) => {
    if (b.dataset.kin === 'A') S.kinA = p; else S.kinB = p;
    renderStatsTab(el);
    el.querySelector('[data-kin]')?.closest('.card')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  })));
  if (S.kinA && S.kinB) {
    const k = kinship(fam, S.kinA, S.kinB);
    el.querySelector('#kin-res').innerHTML = `<div class="kin-res"><div class="small muted" style="font-weight:700">${esc(S.kinB.name)} — ${esc(S.kinA.name)}ning</div>
      <div class="big">${esc(k.term)}</div>${k.detail ? `<div class="small muted" style="margin-top:6px">${esc(k.detail)}</div>` : ''}</div>`;
  }
}

function pickPerson(title, cb) {
  const sh = openSheet(`<div class="sheet-head"><div class="h2">${esc(title)}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div style="padding:0 18px 8px;position:relative"><input class="input" id="pq" placeholder="Ism bo‘yicha qidirish" autocomplete="off"></div>
    <div class="sheet-body" id="pl" style="padding:0 0 20px"></div>`);
  const draw = (q = '') => {
    const res = S.tree.persons.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 80);
    sh.querySelector('#pl').innerHTML = res.map((p) => personRow(p)).join('');
    sh.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => { closeTopSheet(); cb(S.fam.get(b.dataset.open)); }));
  };
  sh.querySelector('#pq').oninput = (e) => draw(e.target.value.trim());
  draw();
}

// ------------------------------------------------------------ Ko'proq tab --
function renderMoreTab(el) {
  const saved = savedTrees().find((t) => t.id === S.tree.id) || {};
  const log = S.tree.log || [];
  const actIcon = { add: '➕', edit: '✏️', delete: '🗑', photo: '📸', 'photo-del': '🖼', settings: '⚙️', create: '🌱', import: '📥' };
  const actText = { add: 'qo‘shildi', edit: 'tahrirlandi', delete: 'o‘chirildi', photo: 'surati qo‘yildi', 'photo-del': 'surati olib tashlandi', settings: 'sozlamalari o‘zgardi', create: '— shajara boshlandi', import: 'yuklandi' };
  el.innerHTML = `<div class="scroll" style="padding-top:8px">
    ${S.tree.description ? `<div class="card note" style="margin:0 16px 14px">${esc(S.tree.description)}</div>` : ''}
    <div class="card menu">
      <button class="menu-item" id="m-share"><div class="mi">📨</div><div class="grow"><div class="t">Qarindoshlarga ulashish</div><div class="d">${saved.viewCode ? `Kirish kodi: <b>${esc(saved.viewCode)}</b>` : 'Havola orqali taklif qilish'}</div></div>${I.chev}</button>
      ${inTelegram ? `<label class="menu-item"><div class="mi">🔔</div><div class="grow"><div class="t">Eslatmalar</div><div class="d">Tug‘ilgan kun va xotira kunlarida xabar</div></div><span class="switch"><input type="checkbox" id="m-sub" ${S.tree.subscribed ? 'checked' : ''}><span></span></span></label>` : ''}
      <button class="menu-item" id="m-lock"><div class="mi">${isEdit() ? '🔓' : '🔒'}</div><div class="grow"><div class="t">${isEdit() ? 'Tahrir rejimini yopish' : 'Tahrir rejimini ochish'}</div><div class="d">${isEdit() ? 'Faqat ko‘rish rejimiga qaytish' : 'Tahrir kodi talab qilinadi'}</div></div>${I.chev}</button>
    </div>
    ${isEdit() ? `<div class="section"><h3 class="h3">Tahrirchi uchun</h3></div><div class="card menu">
      <button class="menu-item" id="m-settings"><div class="mi">⚙️</div><div class="grow"><div class="t">Shajara sozlamalari</div><div class="d">Nomi, tavsifi va maxfiy kodlar</div></div>${I.chev}</button>
      ${inTelegram ? `<button class="menu-item" id="m-export"><div class="mi">💾</div><div class="grow"><div class="t">Zaxira nusxa</div><div class="d">JSON faylni Telegram chatga yuborish</div></div>${I.chev}</button>` : ''}
    </div>` : ''}
    <div class="section"><h3 class="h3">Boshqa</h3></div>
    <div class="card menu">
      <button class="menu-item" id="m-switch"><div class="mi">🌳</div><div class="grow"><div class="t">Boshqa shajaraga o‘tish</div><div class="d">Kod kiritish yoki yangi yaratish</div></div>${I.chev}</button>
      <button class="menu-item" id="m-onb"><div class="mi">✨</div><div class="grow"><div class="t">Tanishtiruvni qayta ko‘rish</div></div>${I.chev}</button>
      <button class="menu-item" id="m-forget"><div class="mi">🚪</div><div class="grow"><div class="t" style="color:var(--danger)">Shu qurilmadan chiqish</div><div class="d">Keyingi safar kod qayta so‘raladi</div></div></button>
    </div>
    <div class="section"><h3 class="h3">So‘nggi o‘zgarishlar</h3></div>
    <div class="card" style="margin:0 16px;padding:6px 0">${log.length ? log.slice(0, 25).map((l) => `<div class="log-item"><div class="dot">${actIcon[l.action] || '•'}</div><div class="grow"><b>${esc(l.name || '')}</b> ${actText[l.action] || l.action}<div class="small muted">${esc(l.who || '')} · ${relTime(l.at)}</div></div></div>`).join('') : '<div class="log-item muted">Hozircha o‘zgarishlar yo‘q</div>'}</div>
    <div class="muted small" style="text-align:center;padding:26px 16px 30px">Shajara iBot · @${BOT}<br>«Ildizini bilgan — adashmas»</div>
  </div>`;
  el.querySelector('#m-share').onclick = () => shareTree(saved.viewCode);
  el.querySelector('#m-lock').onclick = () => (isEdit() ? lockSheet() : unlockSheet());
  el.querySelector('#m-switch').onclick = () => renderGate();
  el.querySelector('#m-onb').onclick = () => renderOnboarding(() => renderMain());
  el.querySelector('#m-forget').onclick = async () => {
    if (!(await confirmBox('Bu qurilmada shajaradan chiqasizmi? Qayta kirish uchun kod kerak bo‘ladi.'))) return;
    forgetTree(S.tree.id);
    renderGate();
  };
  el.querySelector('#m-settings')?.addEventListener('click', settingsSheet);
  el.querySelector('#m-export')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try { await api('export', { method: 'POST' }); toast('Zaxira nusxa chatga yuborildi 💾'); }
    catch (err) { toast(err.message, true); }
    b.disabled = false;
  });
  el.querySelector('#m-sub')?.addEventListener('change', async (e) => {
    const on = e.target.checked;
    try {
      await api('subscribe', { method: 'POST', body: { on } });
      S.tree.subscribed = on;
      toast(on ? 'Eslatmalar yoqildi 🔔' : 'Eslatmalar o‘chirildi');
    } catch (err) { e.target.checked = !on; toast(err.message, true); }
  });
}

function relTime(iso) {
  const d = (Date.now() - new Date(iso)) / 1000;
  if (d < 60) return 'hozirgina';
  if (d < 3600) return `${Math.floor(d / 60)} daqiqa oldin`;
  if (d < 86400) return `${Math.floor(d / 3600)} soat oldin`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} kun oldin`;
  return new Date(iso).toLocaleDateString('uz-UZ');
}

function shareTree(code) {
  const show = (c) => {
    const link = `https://t.me/${BOT}?start=${encodeURIComponent(c)}`;
    const text = `🌳 «${S.tree.title}» — oilamiz shajarasi. Kirish kodi: ${c}\nHavolani bosing va o‘z ildizingizni ko‘ring!`;
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink && inTelegram) tg.openTelegramLink(url);
    else if (navigator.share) navigator.share({ text: text + '\n' + link }).catch(() => {});
    else { navigator.clipboard?.writeText(text + '\n' + link); toast('Havola nusxalandi'); }
  };
  if (code) return show(code);
  const sh = openSheet(`<div class="sheet-head"><div class="h2">Ulashish</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body"><p class="muted" style="margin-top:0">Bu qurilmada kirish kodi saqlanmagan. Ulashish uchun kirish kodini kiriting:</p>
    <input class="input code-input" id="sc" placeholder="kirish kodi" autocapitalize="off"><button class="btn btn-primary btn-block" style="margin-top:12px" id="sgo">Ulashish</button></div>`);
  sh.querySelector('#sgo').onclick = async () => {
    const c = sh.querySelector('#sc').value.trim().toLowerCase();
    if (!c) return;
    try {
      const r = await api('open', { method: 'POST', body: { code: c }, token: null });
      if (r.tree.id !== S.tree.id) throw new Error('Bu kod boshqa shajaraga tegishli');
      saveTreeLocal({ ...savedTrees().find((t) => t.id === S.tree.id), viewCode: c });
      closeTopSheet();
      show(c);
    } catch (err) { toast(err.message, true); }
  };
}

// =================================================================== SHEET
function openSheet(html) {
  const back = document.createElement('div');
  back.className = 'backdrop';
  const sh = document.createElement('div');
  sh.className = 'sheet';
  sh.innerHTML = `<div class="grab"></div>${html}`;
  const wrap = document.createElement('div');
  wrap.append(back, sh);
  $sheets.append(wrap);
  back.onclick = () => closeSheet(wrap);
  sh.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => closeSheet(wrap)));
  // pastga tortib yopish
  let sy = null;
  const grab = sh.querySelector('.grab');
  const head = sh.querySelector('.sheet-head') || grab;
  for (const h of [grab, head]) {
    h.addEventListener('touchstart', (e) => (sy = e.touches[0].clientY), { passive: true });
    h.addEventListener('touchmove', (e) => { if (sy !== null) { const d = Math.max(0, e.touches[0].clientY - sy); sh.style.transform = `translateY(${d}px)`; } }, { passive: true });
    h.addEventListener('touchend', (e) => {
      if (sy === null) return;
      const d = e.changedTouches[0].clientY - sy;
      sy = null;
      if (d > 90) closeSheet(wrap); else sh.style.transform = '';
    });
  }
  updateBackButton();
  haptic('light');
  return sh;
}
function closeSheet(wrap) {
  if (!wrap || wrap.dataset.closing) return;
  wrap.dataset.closing = 1;
  wrap.querySelector('.backdrop').classList.add('out');
  wrap.querySelector('.sheet').classList.add('out');
  setTimeout(() => { wrap.remove(); updateBackButton(); }, 230);
}
function closeTopSheet() {
  const all = [...$sheets.children].filter((w) => !w.dataset.closing);
  const w = all[all.length - 1];
  if (!w) return false;
  closeSheet(w);
  return true;
}
function closeAllSheets() { [...$sheets.children].forEach(closeSheet); }

// ------------------------------------------------------------ Shaxs kartasi
function personSheet(id) {
  const p = S.fam.get(id);
  if (!p) return;
  const fam = S.fam;
  const lin = fam.lineage(p.blood ? p : fam.bloodSpouse(p) || p);
  const a = age(p);
  const fatherP = fam.father(p);
  const motherP = fam.mother(p);
  const spouses = fam.spouses(p);
  const kids = fam.children(p.id);
  const sibs = fam.siblings(p);
  const grand = fam.grandchildren(p);
  const desc = fam.descendantsCount(p.id);
  const rels = (title, arr, label) => arr.length ? `<div class="rel-group"><div class="h3">${title} · ${arr.length}</div><div class="rel-list">${arr.map((x) => `<button class="rel" data-go="${x.id}">${avatar(x, 56)}<span>${esc(x.name)}</span>${label ? `<small>${esc(label(x))}</small>` : ''}</button>`).join('')}</div></div>` : '';
  const yrs = (x) => yearsLabel(x);
  const info = [
    p.birth && ['Tug‘ilgan', fmtDate(p.birth)],
    p.place && ['Tug‘ilgan joyi', p.place],
    p.deceased && ['Vafot etgan', p.death ? fmtDate(p.death) : 'sanasi noma’lum'],
    a !== null && [p.deceased ? 'Umr ko‘rgan' : 'Yoshi', `${a} yosh`],
    ['Avlod', `${fam.gen(p)}-avlod`],
    desc && ['Avlodlari', `${desc} kishi`],
    p.code && ['Daftar raqami', p.code],
    p.phone && ['Telefon', `<a href="tel:${esc(p.phone)}" style="color:var(--primary)">${esc(p.phone)}</a>`],
  ].filter(Boolean);
  const edit = isEdit();
  const sh = openSheet(`<div class="sheet-body">
    <div class="p-hero"><div style="position:relative">${avatar(p, 112, 'ring')}${edit ? `<button class="photo-edit" id="ph" aria-label="Surat">${I.camera}</button>` : ''}</div>
      <h2>${esc(p.name)}</h2><div class="dates">${esc(yearsLabel(p)) || '&nbsp;'}</div>
      <div class="badges">${p.blood ? '<span class="badge green">🩸 Qon qarindosh</span>' : '<span class="badge grey">💍 Kelin/kuyov</span>'}${p.deceased ? '<span class="badge grey">🕯 Marhum</span>' : ''}${lin.length > 1 ? `<span class="badge gold">${fam.gen(p)}-avlod</span>` : ''}</div></div>
    ${lin.length > 1 ? `<div class="card lineage"><span class="h3" style="width:100%;margin-bottom:4px">Nasl yo‘li</span>${lin.map((x, i) => `${i ? '<span class="sep">›</span>' : ''}<button data-go="${x.id}" class="${x.id === p.id ? 'me' : ''}">${esc(x.name)}</button>`).join('')}${!p.blood && lin.length ? '<span class="sep">💍</span><button class="me">' + esc(p.name) + '</button>' : ''}</div>` : ''}
    <dl class="card info-list">${info.map(([k, v]) => `<div><dt>${k}</dt><dd>${typeof v === 'string' && v.startsWith('<a') ? v : esc(v)}</dd></div>`).join('')}</dl>
    ${p.bio ? `<div class="card note"><div class="h3" style="margin-bottom:6px">Hayot yo‘li</div>${esc(p.bio)}</div>` : ''}
    ${p.note ? `<div class="card note">📝 ${esc(p.note)}</div>` : ''}
    ${rels('Ota-ona', [fatherP, motherP].filter(Boolean), (x) => (x.gender === 'm' ? 'otasi' : 'onasi'))}
    ${rels('Turmush o‘rtog‘i', spouses, yrs)}
    ${rels('Farzandlari', kids, yrs)}
    ${rels('Aka-uka, opa-singillari', sibs, yrs)}
    ${rels('Nevaralari', grand, yrs)}
    <div class="actions">
      <button class="btn btn-soft full" id="in-tree">${I.tree} Daraxtda ko‘rsatish</button>
      ${edit ? `
        <button class="btn btn-ghost btn-sm" data-add="child">👶 Farzand</button>
        <button class="btn btn-ghost btn-sm" data-add="spouse">💍 Turmush o‘rtog‘i</button>
        ${!fatherP || !motherP ? `<button class="btn btn-ghost btn-sm full" data-add="parent">👴 ${!fatherP && !motherP ? 'Ota yoki onasini' : !fatherP ? 'Otasini' : 'Onasini'} qo‘shish</button>` : ''}
        <button class="btn btn-ghost btn-sm" id="edit">${I.edit} Tahrirlash</button>
        <button class="btn btn-danger btn-sm" id="del">${I.trash} O‘chirish</button>` : `<button class="btn btn-ghost btn-sm full" id="ask-edit">${I.lock} Tahrirlash uchun kod kiriting</button>`}
    </div><div style="height:8px"></div></div>`);
  sh.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { closeTopSheet(); setTimeout(() => personSheet(b.dataset.go), 120); }));
  sh.querySelector('#in-tree').onclick = () => {
    closeAllSheets();
    if (S.tab !== 'tree') switchTab('tree');
    setTimeout(() => S.treeView?.focus(p.id, { k: 1 }), 80);
  };
  sh.querySelector('#ask-edit')?.addEventListener('click', () => { closeTopSheet(); unlockSheet(); });
  sh.querySelector('#edit')?.addEventListener('click', () => personForm({ person: p }));
  sh.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => personForm({ relation: b.dataset.add, of: p })));
  sh.querySelector('#del')?.addEventListener('click', async () => {
    if (!(await confirmBox(`${p.name} shajaradan o‘chirilsinmi?`))) return;
    try {
      const r = await api('person/' + p.id, { method: 'DELETE' });
      closeAllSheets();
      onTreeChanged(r.tree);
      toast('O‘chirildi');
    } catch (err) { toast(err.message, true); }
  });
  sh.querySelector('#ph')?.addEventListener('click', () => photoMenu(p));
}

// ------------------------------------------------------------ Surat --------
function photoMenu(p) {
  const sh = openSheet(`<div class="sheet-head"><div class="h2">Surat</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body"><div style="display:grid;gap:10px">
      <label class="btn btn-primary btn-block">${I.camera} ${p.photo ? 'Yangi surat tanlash' : 'Surat tanlash'}<input type="file" accept="image/*" id="pf" hidden></label>
      ${p.photo ? '<button class="btn btn-danger btn-block" id="prm">Suratni olib tashlash</button>' : ''}
      <div class="hint" style="text-align:center">Surat avtomatik kvadrat shaklda kesiladi va siqiladi</div></div></div>`);
  sh.querySelector('#pf').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lbl = sh.querySelector('label.btn');
    lbl.innerHTML = '<span class="spin"></span> Yuklanmoqda…';
    try {
      const data = await resizeImage(file, 640);
      const r = await api(`person/${p.id}/photo`, { method: 'POST', body: { data } });
      closeAllSheets();
      onTreeChanged(r.tree);
      toast('Surat qo‘yildi 📸');
      setTimeout(() => personSheet(p.id), 260);
    } catch (err) {
      toast(err.message || 'Suratni o‘qib bo‘lmadi', true);
      lbl.innerHTML = `${I.camera} Qayta urinish<input type="file" accept="image/*" id="pf" hidden>`;
    }
  };
  sh.querySelector('#prm')?.addEventListener('click', async () => {
    try {
      const r = await api(`person/${p.id}/photo`, { method: 'DELETE' });
      closeAllSheets();
      onTreeChanged(r.tree);
      toast('Surat olib tashlandi');
    } catch (err) { toast(err.message, true); }
  });
}

async function resizeImage(file, size) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    // yuz odatda yuqoriroqda bo'ladi — kvadratni biroz tepaga siljitamiz
    const sx = (img.naturalWidth - side) / 2;
    const sy = Math.max(0, (img.naturalHeight - side) * 0.3);
    const out = Math.min(size, side);
    const c = document.createElement('canvas');
    c.width = c.height = out;
    c.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, out, out);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ------------------------------------------------------------ Shaxs formasi
function personForm({ person, relation, of }) {
  const editing = !!person;
  const p = person || {};
  const defaultGender = relation === 'spouse' ? (of.gender === 'm' ? 'f' : 'm') : p.gender || 'm';
  const title = editing ? 'Tahrirlash' : relation === 'child' ? `${of.name}ga farzand` : relation === 'spouse' ? `${of.name}ga turmush o‘rtog‘i` : `${of.name}ning ota-onasi`;
  const spouses = relation === 'child' ? S.fam.spouses(of) : [];
  const fatherTaken = relation === 'parent' && of.father_id;
  const motherTaken = relation === 'parent' && of.mother_id;
  const g0 = relation === 'parent' ? (fatherTaken ? 'f' : 'm') : defaultGender;
  const sh = openSheet(`<div class="sheet-head"><div class="h2 ellipsis">${esc(title)}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <form class="sheet-body" id="pf" autocomplete="off">
      <div class="field"><label>Ismi (familiyasi bilan bo‘lishi mumkin)</label><input class="input" name="name" value="${esc(p.name || '')}" maxlength="80" required></div>
      <div class="field"><label>Jinsi</label><div class="seg" data-seg="gender">
        <button type="button" data-v="m" class="${g0 === 'm' ? 'on' : ''}"${relation === 'parent' && fatherTaken ? ' disabled style="opacity:.4"' : ''}>👨 Erkak</button>
        <button type="button" data-v="f" class="${g0 === 'f' ? 'on' : ''}"${relation === 'parent' && motherTaken ? ' disabled style="opacity:.4"' : ''}>👩 Ayol</button></div></div>
      ${spouses.length > 1 ? `<div class="field"><label>Onasi / otasi</label><select class="input" name="otherParentId">${spouses.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}<option value="">Noma’lum</option></select></div>` : ''}
      <div class="field"><label>Tug‘ilgan sana</label><input class="input" name="birth" value="${esc(dateToInput(p.birth))}" placeholder="1985 · 03.1985 · 20.03.1985" inputmode="numeric"></div>
      <div class="field"><label>Tug‘ilgan joyi</label><input class="input" name="place" value="${esc(p.place || '')}" placeholder="Masalan: Xiva" maxlength="120"></div>
      <label class="row card" style="padding:12px 14px;margin-bottom:14px"><div class="grow" style="font-weight:800">🕯 Vafot etgan</div><span class="switch"><input type="checkbox" name="deceased" ${p.deceased ? 'checked' : ''}><span></span></span></label>
      <div class="field ${p.deceased ? '' : 'hidden'}" id="death-f"><label>Vafot sanasi</label><input class="input" name="death" value="${esc(dateToInput(p.death))}" placeholder="2005 yoki 24.10.1984" inputmode="numeric"></div>
      <div class="field"><label>Telefon (ixtiyoriy)</label><input class="input" name="phone" value="${esc(p.phone || '')}" placeholder="+998 …" inputmode="tel" maxlength="30"></div>
      <div class="field"><label>Hayot yo‘li, xotiralar (ixtiyoriy)</label><textarea class="input" name="bio" maxlength="3000" placeholder="Kasbi, fazilatlari, eslab qolish kerak bo‘lgan voqealar…">${esc(p.bio || '')}</textarea></div>
      <div class="field"><label>Izoh</label><input class="input" name="note" value="${esc(p.note || '')}" maxlength="1000"></div>
      <div class="row" style="gap:10px">
        <div class="field grow"><label>Daftar raqami</label><input class="input" name="code" value="${esc(p.code || '')}" placeholder="2-6-4" maxlength="30"></div>
        ${relation === 'child' || (editing && (p.father_id || p.mother_id)) ? `<div class="field" style="width:120px"><label>Tartibi</label><input class="input" name="child_order" value="${p.child_order ?? ''}" inputmode="numeric" placeholder="avto"></div>` : ''}
      </div>
      <button class="btn btn-primary btn-block">${editing ? 'Saqlash' : 'Qo‘shish'}</button>
      <div style="height:10px"></div>
    </form>`);
  bindSeg(sh);
  const dec = sh.querySelector('[name="deceased"]');
  dec.onchange = () => sh.querySelector('#death-f').classList.toggle('hidden', !dec.checked);
  sh.querySelector('#pf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const birth = parseDateInput(f.get('birth'));
    const death = dec.checked ? parseDateInput(f.get('death')) : null;
    if (birth === undefined || death === undefined) return toast('Sana formati noto‘g‘ri. Masalan: 1958 yoki 20.03.1958', true);
    const body = {
      name: f.get('name'), gender: segVal(sh, 'gender'), birth, death, deceased: dec.checked,
      place: f.get('place'), phone: f.get('phone'), bio: f.get('bio'), note: f.get('note'), code: f.get('code'),
    };
    if (f.has('child_order')) body.child_order = f.get('child_order') || null;
    const btn = e.target.querySelector('button:not([type])');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>';
    try {
      let r;
      if (editing) r = await api('person/' + p.id, { method: 'PATCH', body });
      else {
        body.relation = relation;
        body.of = of.id;
        if (f.has('otherParentId')) body.otherParentId = f.get('otherParentId') || null;
        r = await api('person', { method: 'POST', body });
      }
      closeAllSheets();
      onTreeChanged(r.tree);
      toast(editing ? 'Saqlandi ✓' : `${r.person.name} qo‘shildi 🌱`);
      const id = editing ? p.id : r.person.id;
      if (S.tab === 'tree') setTimeout(() => S.treeView?.focus(id, { k: 1 }), 120);
      setTimeout(() => personSheet(id), 300);
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = editing ? 'Saqlash' : 'Qo‘shish';
    }
  };
}

// ------------------------------------------------------------ Kodlar -------
function unlockSheet() {
  const sh = openSheet(`<div class="sheet-head"><div class="h2">Tahrir rejimi</div><button class="icon-btn" data-close>${I.close}</button></div>
    <form class="sheet-body" id="uf" autocomplete="off"><div style="text-align:center;font-size:44px;margin:4px 0 8px">🔐</div>
      <p class="muted" style="text-align:center;margin:0 0 16px">Odam qo‘shish, surat qo‘yish va o‘zgartirish uchun <b>tahrir kodini</b> kiriting.</p>
      <input class="input code-input" name="code" placeholder="tahrir kodi" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go">
      <button class="btn btn-gold btn-block" style="margin-top:12px">Ochish</button><div style="height:10px"></div></form>`);
  const input = sh.querySelector('input');
  setTimeout(() => input.focus(), 350);
  sh.querySelector('#uf').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const r = await api('unlock', { method: 'POST', body: { code: input.value } });
      S.editToken = r.token;
      S.token = r.token;
      saveTreeLocal({ ...savedTrees().find((t) => t.id === S.tree.id), editToken: r.token });
      closeAllSheets();
      onTreeChanged(r.tree);
      toast('Tahrir rejimi ochildi ✏️');
    } catch (err) {
      toast(err.message, true);
      input.select();
      btn.disabled = false;
    }
  };
}

async function lockSheet() {
  if (!(await confirmBox('Tahrir rejimi yopilsinmi? Qayta ochish uchun kod kerak bo‘ladi.'))) return;
  S.editToken = null;
  S.token = S.viewToken;
  saveTreeLocal({ ...savedTrees().find((t) => t.id === S.tree.id), editToken: null });
  try {
    const r = await api('tree');
    onTreeChanged(r.tree);
  } catch {
    S.tree.role = 'view';
    onTreeChanged(S.tree);
  }
  toast('Faqat ko‘rish rejimi 🔒');
}

function settingsSheet() {
  const t = S.tree;
  const sh = openSheet(`<div class="sheet-head"><div class="h2">Sozlamalar</div><button class="icon-btn" data-close>${I.close}</button></div>
    <form class="sheet-body" id="sf" autocomplete="off">
      <div class="field"><label>Shajara nomi</label><input class="input" name="title" value="${esc(t.title)}" maxlength="80" required></div>
      <div class="field"><label>Tavsif</label><textarea class="input" name="description" maxlength="500">${esc(t.description || '')}</textarea></div>
      <div class="h3" style="margin:18px 0 10px">Kodlarni almashtirish</div>
      <div class="field"><label>🔑 Yangi kirish kodi</label><input class="input" name="viewCode" placeholder="o‘zgartirmaslik uchun bo‘sh qoldiring" autocapitalize="off"></div>
      <div class="field"><label>✏️ Yangi tahrir kodi</label><input class="input" name="editCode" placeholder="o‘zgartirmaslik uchun bo‘sh qoldiring" autocapitalize="off"></div>
      <div class="hint" style="margin:-4px 0 14px">⚠️ Kod almashtirilsa, boshqa qurilmalardagi barcha kirishlar bekor bo‘ladi — ularga yangi kodni yuborishingiz kerak.</div>
      <button class="btn btn-primary btn-block">Saqlash</button><div style="height:10px"></div></form>`);
  sh.querySelector('#sf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { title: f.get('title'), description: f.get('description') };
    if (f.get('viewCode').trim()) body.viewCode = f.get('viewCode').trim();
    if (f.get('editCode').trim()) body.editCode = f.get('editCode').trim();
    if ((body.viewCode || body.editCode) && !(await confirmBox('Kodlar almashtirilsinmi?'))) return;
    try {
      const r = await api('settings', { method: 'PATCH', body });
      S.editToken = r.token;
      S.token = r.token;
      if (body.viewCode || body.editCode) S.viewToken = r.token;
      const saved = savedTrees().find((x) => x.id === t.id) || {};
      saveTreeLocal({ ...saved, editToken: r.token, viewToken: S.viewToken, viewCode: body.viewCode ? body.viewCode.toLowerCase() : saved.viewCode });
      closeAllSheets();
      onTreeChanged(r.tree);
      toast('Saqlandi ✓');
    } catch (err) { toast(err.message, true); }
  };
}

// =================================================================== ISHGA TUSHIRISH
function boot() {
  initTelegram();
  if (!tg) applyTheme();
  const params = new URLSearchParams(location.search);
  const startCode = params.get('code') || tg?.initDataUnsafe?.start_param || '';
  const afterOnb = () => {
    if (startCode) return renderGate(startCode);
    const last = store.get('sh_last');
    if (last && savedTrees().some((t) => t.id === last)) return resumeTree(last);
    renderGate();
  };
  if (!store.get('sh_onb')) renderOnboarding(afterOnb);
  else afterOnb();
}

boot();
