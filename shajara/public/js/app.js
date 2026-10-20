// Shajara iBot — Mini App
import { I } from './icons.js';
import { quoteOfDay, randomQuote } from './quotes.js';
import { TreeView, esc } from './tree-view.js?v=5';
import { RealTreeView } from './real-tree.js?v=5';
import { defaultAvatar } from './avatars.js';
import { Family, yearsLabel, age, initials, parseDateInput, dateToInput, upcomingBirthdays, kinship } from './family.js';
import { t, nm, LANG, setLang, LANG_NAMES, fmtDate, monthShort, fmtNum } from './i18n.js';

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
  tree: null, fam: null, token: null, tab: 'tree', listFilter: 'all', listQuery: '', treeView: null,
  kinA: null, kinB: null, album: null, albumFilter: 'all', editMode: true,
};

// ------------------------------------------------------------ Telegram -----
function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  try { tg.disableVerticalSwipes?.(); } catch {}
  // To'liq ekran (Bot API 8.0+); Telegram tugmalari ostida qolmaslik uchun xavfsiz chegaralar
  const insets = () => {
    const a = tg.safeAreaInset || {}, c = tg.contentSafeAreaInset || {};
    const r = document.documentElement.style;
    r.setProperty('--safe-top', `${(a.top || 0) + (c.top || 0)}px`);
    r.setProperty('--safe-bottom', `${(a.bottom || 0) + (c.bottom || 0)}px`);
  };
  try {
    if (tg.isVersionAtLeast?.('8.0') && !['tdesktop', 'macos', 'web', 'weba', 'webk'].includes(tg.platform)) {
      tg.requestFullscreen();
      ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged'].forEach((e) => tg.onEvent(e, insets));
      insets();
    }
  } catch {}
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
  const show = !!viewerOpen || $sheets.children.length > 0 || !!document.querySelector('.screen[data-back]');
  show ? tg.BackButton.show() : tg.BackButton.hide();
}
function goBack() {
  if (viewerOpen) return viewerOpen();
  if (closeTopSheet()) return;
  document.querySelector('.screen[data-back]')?.dispatchEvent(new CustomEvent('back'));
}
async function confirmBox(text) {
  if (tg?.showConfirm && inTelegram) return new Promise((r) => tg.showConfirm(text, r));
  return confirm(text);
}
function openLink(url) {
  if (url.startsWith('https://t.me/') && tg?.openTelegramLink && inTelegram) tg.openTelegramLink(url);
  else window.open(url, '_blank');
}
async function copyText(s) {
  try { await navigator.clipboard.writeText(s); toast(t('Nusxa olindi ✓')); } catch { toast(s); }
}

// ------------------------------------------------------------ API ----------
async function api(path, { method = 'GET', body, token = S.token, timeout } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  if (tg?.initData) headers['x-init-data'] = tg.initData;
  let r;
  try {
    r = await fetch('/api/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: timeout ? AbortSignal.timeout(timeout) : undefined });
  } catch (e) {
    if (e?.name === 'TimeoutError') throw Object.assign(new Error(t('Javob kechikdi. Qayta urinib ko‘ring')), { status: 0 });
    throw Object.assign(new Error(t('Internet aloqasini tekshiring')), { status: 0 });
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = Object.assign(new Error(t(j.error || 'Xatolik yuz berdi')), { status: r.status });
    if (r.status === 402) setTimeout(() => premiumSheet(err.message), 300);
    throw err;
  }
  return j;
}

function photoUrl(p) {
  if (!p?.photo || !S.tree?.photoSig) return null;
  const { e, s } = S.tree.photoSig;
  return `/api/photo/${S.tree.id}/${p.photo}?e=${e}&s=${s}`;
}

// ------------------------------------------------------------ Toast --------
let toastT;
function toast(msg, err = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show' + (err ? ' err' : '');
  haptic(err ? 'error' : 'success');
  clearTimeout(toastT);
  toastT = setTimeout(() => (el.className = ''), 2800);
}

// ------------------------------------------------------------ Saqlangan shajaralar --
const savedTrees = () => store.get('sh_trees', []);
function saveTreeLocal(patch) {
  const prev = savedTrees().find((x) => x.id === patch.id) || {};
  const list = savedTrees().filter((x) => x.id !== patch.id);
  list.unshift({ ...prev, ...patch, at: Date.now() });
  store.set('sh_trees', list.slice(0, 8));
  store.set('sh_last', patch.id);
}
function forgetTree(id) {
  store.set('sh_trees', savedTrees().filter((x) => x.id !== id));
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
  album: `<svg viewBox="0 0 300 300" class="grow-in"><circle cx="150" cy="150" r="135" fill="#dcefe5" opacity=".6"/>
    <g class="float"><rect x="58" y="78" width="130" height="104" rx="14" fill="#fffdf8" stroke="#e4d9c4" stroke-width="3" transform="rotate(-8 123 130)"/>
    <rect x="112" y="92" width="130" height="104" rx="14" fill="#fffdf8" stroke="#e4d9c4" stroke-width="3" transform="rotate(6 177 144)"/>
    <rect x="124" y="104" width="106" height="66" rx="8" fill="#3db183" transform="rotate(6 177 144)"/><circle cx="160" cy="124" r="10" fill="#f6e7c4" transform="rotate(6 177 144)"/>
    <path d="M128 168 l30 -26 22 18 18 -14 30 22z" fill="#1f6b4f" transform="rotate(6 177 144)"/>
    <rect x="70" y="200" width="160" height="34" rx="12" fill="#b9862a"/><path d="M140 217 h20 M150 207 v20" stroke="#fff" stroke-width="5" stroke-linecap="round"/></g></svg>`,
  lock: `<svg viewBox="0 0 300 300" class="grow-in"><circle cx="150" cy="150" r="135" fill="#f6e7c4" opacity=".7"/>
    <g class="float"><rect x="88" y="132" width="124" height="104" rx="24" fill="#1f6b4f"/><path d="M114 132v-26a36 36 0 0 1 72 0v26" stroke="#1f6b4f" stroke-width="16" fill="none" stroke-linecap="round"/>
    <circle cx="150" cy="176" r="14" fill="#f6e7c4"/><rect x="144" y="182" width="12" height="28" rx="6" fill="#f6e7c4"/></g>
    <g fill="#b9862a"><circle cx="70" cy="96" r="7"/><circle cx="236" cy="210" r="9"/><circle cx="240" cy="92" r="5"/></g></svg>`,
  heart: `<svg viewBox="0 0 300 300" class="grow-in"><circle cx="150" cy="150" r="135" fill="#f9e4ec" opacity=".7"/>
    <g class="float"><path d="M150 236s-84-48-84-108a46 46 0 0 1 84-26 46 46 0 0 1 84 26c0 60-84 108-84 108z" fill="#b04f78"/>
    <path d="M150 210V130M150 160l-24-22M150 150l26-24" stroke="#fffdf8" stroke-width="7" stroke-linecap="round" fill="none"/></g>
    <g font-size="28"><text x="54" y="80">🎂</text><text x="222" y="86">🔔</text><text x="232" y="250">🤲</text></g></svg>`,
};

const SLIDES = [
  { lang: true },
  { art: 'tree', h: 'Ildizingizni bilib oling', p: 'Ota-bobolaringizdan boshlab bugungi nevaralargacha — butun urug‘ingiz bitta jonli daraxtda.' },
  { art: 'album', h: 'Oilaviy albom', p: 'Rasm, video va hujjatlarni bir joyda saqlang. Fayllar Telegram kanalingizda turadi — joy hech qachon tugamaydi.' },
  { art: 'lock', h: 'Ikki xil maxfiy kod', p: 'Kirish kodi yoki taklif havolasi bilan qarindoshlar ko‘radi. Tahrir kodi bilan esa faqat ishonchli kishilar o‘zgartiradi.' },
  { art: 'heart', h: 'Silai rahmni unutmang', p: 'Yangiliklar, tug‘ilgan kunlar va xotira kunlarida eslataman — shaxsiy chatda ham, oilaviy guruhda ham.' },
];

function langPicker() {
  return `<div class="chips" style="justify-content:center;padding-top:6px">${Object.entries(LANG_NAMES).map(([k, v]) =>
    `<button class="chip ${LANG === k ? 'on' : ''}" data-lang="${k}">${v}</button>`).join('')}</div>`;
}
function bindLangPicker(root, after) {
  root.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = () => {
    setLang(b.dataset.lang);
    if (S.tree && inTelegram) api('me', { method: 'PATCH', body: { lang: b.dataset.lang } }).catch(() => {});
    haptic('light');
    after();
  }));
}

function renderOnboarding(done, start = 0) {
  let i = start;
  $app.innerHTML = `<div class="screen onb pattern">
    <div class="onb-top"><button class="onb-skip">${t('O‘tkazib yuborish')}</button></div>
    <div class="onb-track">${SLIDES.map((s) => s.lang
      ? `<div class="onb-slide"><div class="logo" style="width:96px;height:96px;margin-bottom:22px">${LOGO}</div><h2>Tilni tanlang · Выберите язык</h2>
          <div class="lang-list">${Object.entries(LANG_NAMES).map(([k, v]) => `<button class="lang-opt ${LANG === k ? 'on' : ''}" data-lang="${k}"><span>${{ uz: '🇺🇿', uzc: '🇺🇿', ru: '🇷🇺', en: '🇬🇧' }[k]}</span>${v}${LANG === k ? '<b>✓</b>' : ''}</button>`).join('')}</div></div>`
      : `<div class="onb-slide"><div class="onb-art">${ART[s.art]}</div><h2>${t(s.h)}</h2><p>${t(s.p)}</p></div>`).join('')}</div>
    <div class="onb-foot"><div class="dots">${SLIDES.map(() => '<i></i>').join('')}</div>
    <button class="btn btn-primary btn-block" id="onb-next"></button></div></div>`;
  const track = $app.querySelector('.onb-track');
  const dots = [...$app.querySelectorAll('.dots i')];
  const next = $app.querySelector('#onb-next');
  const go = (n, anim = true) => {
    i = Math.max(0, Math.min(SLIDES.length - 1, n));
    track.style.transform = `translateX(${-i * 100}%)`;
    dots.forEach((d, j) => d.classList.toggle('on', j === i));
    next.textContent = i === SLIDES.length - 1 ? t('Boshlash 🌱') : t('Keyingi');
    if (anim) {
      const art = track.children[i].querySelector('.onb-art svg');
      if (art) art?.getBoundingClientRect(); art?.classList.add('grow-in');
      haptic('light');
    }
  };
  go(i, false);
  bindLangPicker($app, () => renderOnboarding(done, i));
  const finish = () => { store.set('sh_onb', 2); haptic('success'); done(); };
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
      <h1 class="h1">${t('Shajara')}</h1>
      <div class="muted" style="margin-top:6px;font-weight:600">${t('Urug‘ingiz tarixi — bir joyda, abadiy')}</div></div>
    <div class="quote-card"><q id="gq">${esc(t(q.t))}</q><div class="by" id="gqa">${esc(t(q.a))}</div></div>
    <form class="card code-box" id="code-form" autocomplete="off">
      <div class="h3" style="margin-bottom:10px">${t('Mavjud shajaraga kirish')}</div>
      <input class="input code-input" id="code" placeholder="${t('shajara kodi')}" value="${esc(prefill)}" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" />
      <button class="btn btn-primary btn-block" style="margin-top:12px" id="enter">${t('Kirish')}</button>
      <div class="hint" style="text-align:center;margin-top:10px">${t('Kodni yoki taklif havolasini shajara egasidan so‘rang')}</div>
    </form>
    <div class="divider">${t('yoki')}</div>
    <div style="padding:0 16px"><button class="btn btn-gold btn-block" id="create">🌱 ${t('Yangi shajara yaratish')}</button></div>
    ${recent.length ? `<div class="recent"><div class="h3" style="margin-top:22px">${t('Oxirgi kirilganlar')}</div>
      ${recent.map((x) => `<button class="card recent-item" data-id="${x.id}" style="width:100%;text-align:left"><div class="tree-ic">🌳</div>
        <div class="grow"><div style="font-weight:800" class="ellipsis">${esc(nm(x.title))}</div><div class="small muted">${t('{n} kishi', { n: x.count || 0 })}</div></div>${I.chev}</button>`).join('')}</div>` : ''}
    <div style="padding:20px 16px 30px">${langPicker()}</div>
  </div></div>`;
  updateBackButton();
  bindLangPicker($app, () => renderGate($app.querySelector('#code')?.value || ''));
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
      openTree(r.tree, r.token, code.toLowerCase());
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = t('Kirish');
    }
  };
  $app.querySelector('#create').onclick = () => renderCreate();
  $app.querySelectorAll('.recent-item').forEach((b) => (b.onclick = () => resumeTree(b.dataset.id)));
  if (prefill) setTimeout(() => form.requestSubmit(), 150);
  const timer = setInterval(() => {
    const el = document.getElementById('gq');
    if (!el) return clearInterval(timer);
    q = randomQuote(q);
    el.textContent = t(q.t);
    document.getElementById('gqa').textContent = t(q.a);
    el.parentElement.classList.remove('quote-fade'); void el.offsetWidth; el.parentElement.classList.add('quote-fade');
  }, 7000);
}

async function resumeTree(id) {
  const saved = savedTrees().find((x) => x.id === id);
  if (!saved?.token) return renderGate();
  showLoader();
  try {
    const r = await api('tree', { token: saved.token });
    openTree(r.tree, saved.token);
  } catch (err) {
    if (err.status === 401 || err.status === 403 || err.status === 404) forgetTree(id);
    toast(err.message, true);
    renderGate();
  }
}

async function joinByInvite(inv) {
  showLoader();
  try {
    const r = await api('join', { method: 'POST', body: { inv }, token: null });
    openTree(r.tree, r.token);
    toast(t('Xush kelibsiz! 🌳'));
  } catch (err) {
    toast(err.message, true);
    renderGate();
  }
}

function showLoader() {
  $app.innerHTML = `<div class="loader pattern"><div style="text-align:center"><div class="logo" style="animation:float 2s ease-in-out infinite">${LOGO}</div><div class="muted" style="font-weight:700">${t('Shajara ochilmoqda…')}</div></div></div>`;
}

// =================================================================== YARATISH
function renderCreate() {
  const suggested = 'oila' + Math.floor(1000 + Math.random() * 9000);
  $app.innerHTML = `<div class="screen" data-back><div class="topbar"><button class="icon-btn" id="back">${I.back}</button><div class="grow"><div class="title">${t('Yangi shajara')}</div><div class="sub">${t('Bir daqiqada tayyor')}</div></div></div>
    <div class="scroll pad"><form id="cf" autocomplete="off">
      <div class="field"><label>${t('Shajara nomi')}</label><input class="input" name="title" placeholder="${t('Masalan: Karimovlar shajarasi')}" maxlength="80" required></div>
      <div class="field"><label>${t('Qisqacha tavsif (ixtiyoriy)')}</label><input class="input" name="description" placeholder="${t('Qayerdan, qaysi urug‘dan…')}" maxlength="300"></div>
      <div class="h3" style="margin:22px 0 12px">${t('Eng katta ajdod')}</div>
      <div class="field"><label>${t('Ismi')}</label><input class="input" name="name" placeholder="${t('Masalan: Hasan bobo')}" maxlength="80" required></div>
      <div class="field"><label>${t('Jinsi')}</label><div class="seg" data-seg="gender"><button type="button" class="on" data-v="m">👨 ${t('Erkak')}</button><button type="button" data-v="f">👩 ${t('Ayol')}</button></div></div>
      <div class="field"><label>${t('Tug‘ilgan yili yoki sanasi')}</label><input class="input" name="birth" placeholder="1857 · 20.03.1958" inputmode="numeric"></div>
      <div class="h3" style="margin:22px 0 12px">${t('Maxfiy kodlar')}</div>
      <div class="field"><label>🔑 ${t('Kirish kodi — qarindoshlar shu bilan ko‘radi')}</label><input class="input" name="viewCode" value="${suggested}" autocapitalize="off" minlength="4" required><div class="hint">${t('Noyob bo‘lishi kerak. Kamida 4 belgi.')}</div></div>
      <div class="field"><label>✏️ ${t('Tahrir kodi — faqat ishonchli kishilar uchun')}</label><input class="input" name="editCode" placeholder="${t('kamida 6 belgi')}" autocapitalize="off" minlength="6" required><div class="hint">${t('Bu kod bilan odam qo‘shish, surat qo‘yish va o‘zgartirish mumkin. Uni yo‘qotmang!')}</div></div>
      <button class="btn btn-primary btn-block" style="margin-top:10px">${t('Shajarani yaratish')}</button>
      <div style="height:30px"></div>
    </form></div></div>`;
  $app.querySelector('.screen').addEventListener('back', () => renderGate());
  $app.querySelector('#back').onclick = () => renderGate();
  updateBackButton();
  bindSeg($app);
  $app.querySelector('#cf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const birth = parseDateInput(f.get('birth'));
    if (birth === undefined) return toast(t('Sana formati noto‘g‘ri. Masalan: 1958 yoki 20.03.1958'), true);
    const btn = e.target.querySelector('button:not([type])');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>';
    try {
      const r = await api('create', {
        method: 'POST', token: null,
        body: { title: f.get('title'), description: f.get('description'), viewCode: f.get('viewCode'), editCode: f.get('editCode'), root: { name: f.get('name'), gender: segVal($app, 'gender'), birth } },
      });
      toast(t('Tabriklaymiz! Shajarangiz yaratildi 🌱'));
      openTree(r.tree, r.token, f.get('viewCode').trim().toLowerCase());
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = t('Shajarani yaratish');
    }
  };
}

function bindSeg(root) {
  root.querySelectorAll('.seg').forEach((seg) => seg.querySelectorAll('button').forEach((b) => (b.onclick = () => {
    if (b.disabled) return;
    seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    haptic('light');
    seg.dispatchEvent(new Event('change'));
  })));
}
const segVal = (root, name) => root.querySelector(`[data-seg="${name}"] .on`)?.dataset.v;

// =================================================================== ASOSIY ILOVA
function openTree(tree, token, viewCode) {
  S.token = token;
  S.album = null;
  S.editMode = store.get('sh_edit_' + tree.id, true);
  setTree(tree);
  const saved = savedTrees().find((x) => x.id === tree.id) || {};
  saveTreeLocal({ id: tree.id, title: tree.title, count: tree.persons.length, token, viewCode: viewCode || saved.viewCode || null });
  const want = new URLSearchParams(location.search).get('tab');
  if (want && ['tree', 'list', 'album', 'stats', 'more'].includes(want)) S.tab = want;
  renderMain();
}

function setTree(tree) {
  S.tree = tree;
  S.fam = new Family(tree.persons);
}

const canEdit = () => S.tree?.role === 'edit';
const isEdit = () => canEdit() && S.editMode;

function renderMain() {
  $app.innerHTML = `<div class="screen">
    <div class="topbar"><button class="icon-btn" id="home" aria-label="${t('Shajaralar')}">${LOGO.replace('viewBox', 'style="width:26px;height:26px;background:var(--primary);border-radius:8px;padding:2px" viewBox')}</button>
      <div class="grow"><div class="title ellipsis" id="t-title"></div><div class="sub" id="t-sub"></div></div>
      <button class="icon-btn lang-btn" id="langb">${{ uz: 'UZ', uzc: 'ЎЗ', ru: 'RU', en: 'EN' }[LANG]}</button>
      <button class="icon-btn bell" id="bell" aria-label="${t('Bildirishnomalar')}">${I.bell}<i class="dot hidden"></i></button>
      <button class="lock-btn" id="lock"></button></div>
    <div class="views">${['tree', 'list', 'album', 'stats', 'more'].map((v) => `<section class="view" data-view="${v}"></section>`).join('')}</div>
    <nav class="tabbar">
      ${[['tree', I.tree, 'Daraxt'], ['list', I.list, 'Ro‘yxat'], ['album', I.image, 'Albom'], ['stats', I.chart, 'Tahlil'], ['more', I.menu, 'Ko‘proq']]
        .map(([k, ic, l]) => `<button class="tab" data-tab="${k}">${ic}<span>${t(l)}</span></button>`).join('')}
    </nav></div>`;
  $app.querySelector('#home').onclick = () => renderGate();
  $app.querySelector('#lock').onclick = () => (canEdit() ? toggleEditMode() : unlockSheet());
  $app.querySelector('#bell').onclick = () => notificationsSheet();
  $app.querySelector('#langb').onclick = () => langSheet();
  $app.querySelectorAll('.tab').forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));
  S.treeView = null;
  refreshChrome();
  placeFab?.();
  const go = S.goPerson && S.fam.get(S.goPerson) ? S.goPerson : null;
  S.goPerson = null;
  switchTab(go ? 'tree' : S.tab || 'tree', true);
  updateBackButton();
  if (go) setTimeout(() => { S.treeView?.focus(go, { k: 1 }); personSheet(go); }, 250);
}

function unreadCount() {
  const seen = store.get('sh_seen_' + S.tree.id, null);
  if (!seen) return 0;
  return (S.tree.log || []).filter((l) => l.at > seen).length;
}

function refreshChrome() {
  const tr = S.tree;
  const gens = S.fam.maxGen - S.fam.minGen + 1;
  document.getElementById('t-title').textContent = nm(tr.title);
  document.getElementById('t-sub').textContent = `${t('{n} kishi', { n: tr.persons.length })} · ${t('{n} avlod', { n: gens })}`;
  const lock = document.getElementById('lock');
  lock.className = 'lock-btn' + (isEdit() ? ' edit' : '');
  lock.innerHTML = isEdit() ? `${I.unlock}<span>${t('Tahrir')}</span>` : `${I.lock}<span>${t('Ko‘rish')}</span>`;
  const n = unreadCount();
  document.querySelector('#bell .dot')?.classList.toggle('hidden', !n);
  if (!store.get('sh_seen_' + tr.id, null)) store.set('sh_seen_' + tr.id, new Date().toISOString());
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
  ({ tree: renderTreeTab, list: renderListTab, album: renderAlbumTab, stats: renderStatsTab, more: renderMoreTab })[tab](el);
}

function onTreeChanged(tree, token) {
  if (token) {
    S.token = token;
    S.album = null;
    saveTreeLocal({ id: tree.id, token });
  }
  setTree(tree);
  saveTreeLocal({ id: tree.id, title: tree.title, count: tree.persons.length });
  refreshChrome();
  if (S.treeView) S.treeView.setData(S.fam, S.tree.rootId);
  for (const tab of ['list', 'stats', 'more']) {
    const el = $app.querySelector(`[data-view="${tab}"]`);
    if (el && (S.tab === tab || el.innerHTML)) renderTab(tab);
  }
}

function toggleEditMode() {
  S.editMode = !S.editMode;
  store.set('sh_edit_' + S.tree.id, S.editMode);
  toast(S.editMode ? t('Tahrir rejimi yoqildi ✏️') : t('Faqat ko‘rish rejimi 🔒'));
  onTreeChanged(S.tree);
}

// ------------------------------------------------------------ Daraxt tab ---
function renderTreeTab(el) {
  if (S.treeView) return;
  el.innerHTML = `<div class="tree-host" style="position:absolute;inset:0"></div>
    <div class="tree-search"><div style="position:relative">${I.search}<input class="input" id="ts" placeholder="${t('Daraxtdan qidirish…')}" autocomplete="off"></div><div class="card suggest hidden" id="sg"></div></div>
    <div class="tree-tools">
      <button class="icon-btn" data-z="in">${I.plus}</button>
      <button class="icon-btn" data-z="out">${I.minus}</button>
      <button class="icon-btn" data-z="fit">${I.fit}</button>
      <button class="icon-btn" data-z="root">${I.target}</button>
      <button class="icon-btn" data-z="fold">${I.layers}</button>
      <button class="icon-btn" data-z="mode" style="font-size:20px">${store.get('sh_tv') === 'real' ? '▦' : '🌳'}</button>
    </div>
    <div class="card legend"><span><i style="background:var(--male)"></i>${t('Erkak')}</span><span><i style="background:var(--female)"></i>${t('Ayol')}</span><span><i style="border:1.5px dashed var(--muted)"></i>${t('Kelin/kuyov')}</span></div>
    <div class="tree-hint">👆 ${t('Ochish uchun ismni bosing')}</div>`;
  const TV = store.get('sh_tv') === 'real' ? RealTreeView : TreeView;
  const tv = new TV(el.querySelector('.tree-host'), { onOpen: (id) => personSheet(id), photoUrl, name: nm, genLabel: (n) => t('{n}-avlod', { n }) });
  S.treeView = tv;
  tv.setData(S.fam, S.tree.rootId);
  requestAnimationFrame(() => tv.showRoot());
  el.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => {
    haptic('light');
    const z = b.dataset.z;
    if (z === 'in') tv.zoom(1.35);
    if (z === 'out') tv.zoom(1 / 1.35);
    if (z === 'fit') tv.fit();
    if (z === 'root') tv.showRoot();
    if (z === 'mode') {
      store.set('sh_tv', store.get('sh_tv') === 'real' ? 'cards' : 'real');
      S.treeView = null;
      return renderTreeTab(el);
    }
    if (z === 'fold') {
      const open = !tv.collapsed.size;
      if (open) tv.collapseAll(); else tv.expandAll();
      tv.showRoot();
      toast(open ? t('Shoxlar yig‘ildi — ochish uchun raqamni bosing') : t('Barcha shoxlar ochildi'));
    }
  }));
  const input = el.querySelector('#ts');
  const sg = el.querySelector('#sg');
  input.oninput = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) return sg.classList.add('hidden');
    const res = S.tree.persons.filter((p) => matches(p, q)).slice(0, 8);
    sg.classList.toggle('hidden', !res.length);
    sg.innerHTML = res.map((p) => `<button data-id="${p.id}">${avatar(p, 34)}<div class="grow"><div style="font-weight:800">${esc(nm(p.name))}</div><div class="small muted">${esc(subline(p))}</div></div></button>`).join('');
    sg.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      sg.classList.add('hidden');
      input.value = '';
      input.blur();
      tv.focus(b.dataset.id, { k: 1 });
    }));
  };
}

const matches = (p, q) => p.name.toLowerCase().includes(q) || nm(p.name).toLowerCase().includes(q) || (p.code || '').includes(q);

// ------------------------------------------------------------ Ro'yxat tab --
const FILTERS = [['all', 'Hammasi'], ['blood', '🩸 Qon qarindosh'], ['inlaw', '💍 Kelin-kuyov'], ['alive', 'Hayot'], ['dec', 'Marhumlar'], ['m', 'Erkaklar'], ['f', 'Ayollar'], ['photo', '📸 Suratli']];
function renderListTab(el) {
  el.innerHTML = `<div class="search-bar" style="padding-top:8px">${I.search}<input class="input" id="lq" placeholder="${t('Ism bo‘yicha qidirish')}" value="${esc(S.listQuery)}" autocomplete="off"></div>
    <div class="chips">${FILTERS.map(([k, l]) => `<button class="chip ${S.listFilter === k ? 'on' : ''}" data-f="${k}">${t(l)}</button>`).join('')}</div>
    <div class="scroll" id="lst"></div>
    ${isEdit() ? `<button class="fab" id="addp">${I.plus}<span>${t('Odam qo‘shish')}</span></button>` : ''}`;
  el.querySelector('#addp')?.addEventListener('click', addPeopleSheet);
  const draw = () => {
    const q = S.listQuery.toLowerCase();
    const f = S.listFilter;
    const items = S.tree.persons.filter((p) => {
      if (q && !matches(p, q)) return false;
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
    const lst = el.querySelector('#lst');
    if (!items.length) {
      lst.innerHTML = `<div class="empty"><div class="big">🔍</div>${t('Hech kim topilmadi')}</div>`;
      return;
    }
    lst.innerHTML = [...groups.keys()].sort((a, b) => a - b).map((g) => {
      const arr = groups.get(g).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      return `<div class="gen-head"><span class="h3" style="color:var(--gold)">${t('{n}-avlod', { n: g })}</span><span class="small muted" style="font-weight:700">${t('{n} kishi', { n: arr.length })}</span></div>${arr.map((p) => personRow(p)).join('')}`;
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
  return S.fam.lineage(p.blood ? p : S.fam.bloodSpouse(p) || p).map((x) => String(x.child_order ?? 99).padStart(3, '0')).join('.') + (p.blood ? '0' : '1');
}

function personRow(p, right = '') {
  return `<button class="person-row" data-open="${p.id}">${avatar(p, 46)}
    <div class="grow"><div class="nm ellipsis">${esc(nm(p.name))}${p.deceased ? ` <span class="badge grey" style="vertical-align:2px">${t('marhum')}</span>` : ''}</div>
    <div class="meta ellipsis">${esc(subline(p))}</div></div>${right || I.chev}</button>`;
}

function subline(p) {
  const bits = [];
  const y = yearsLabel(p);
  if (y) bits.push(y);
  if (p.blood) {
    const f = S.fam.father(p) || S.fam.mother(p);
    if (f) bits.push(t(p.gender === 'm' ? '{name} o‘g‘li' : '{name} qizi', { name: nm(f.name) }));
  } else {
    const s = S.fam.bloodSpouse(p);
    if (s) bits.push(t('{name}ning turmush o‘rtog‘i', { name: nm(s.name) }));
  }
  return bits.join(' · ');
}

function avatar(p, size = 48, extra = '') {
  const url = photoUrl(p);
  return `<div class="avatar ${p.gender} ${p.deceased ? 'dec' : ''} ${extra}" style="--s:${size}px">${url ? `<img src="${url}" alt="" loading="lazy">` : defaultAvatar(p, age(p))}</div>`;
}

// ------------------------------------------------------------ Odam qo'shish: bittalab yoki fayldan
function addPeopleSheet() {
  const sh = openSheet(`<div class="sheet-head"><div class="h2">${t('Odam qo‘shish')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body"><div class="card menu" style="margin:0">
      <button class="menu-item" id="one"><div class="mi">👤</div><div class="grow"><div class="t">${t('Bittalab qo‘shish')}</div><div class="d">${t('Kimning farzandi, turmush o‘rtog‘i yoki ota-onasi ekanini tanlang')}</div></div>${I.chev}</button>
      <button class="menu-item" id="file"><div class="mi">📄</div><div class="grow"><div class="t">${t('Fayldan yuklash')}</div><div class="d">${t('Excel/CSV ro‘yxat yoki zaxira JSON fayl')}</div></div>${I.chev}</button>
    </div></div>`);
  sh.querySelector('#one').onclick = () => {
    closeTopSheet();
    pickPerson(t('Kimga qarindosh?'), (rel) => {
      const m = openSheet(`<div class="sheet-head"><div class="h2 ellipsis">${esc(nm(rel.name))}</div><button class="icon-btn" data-close>${I.close}</button></div>
        <div class="sheet-body"><div style="display:grid;gap:10px">
          <button class="btn btn-ghost" data-r="child">👶 ${t('Farzandi')}</button>
          <button class="btn btn-ghost" data-r="spouse">💍 ${t('Turmush o‘rtog‘i')}</button>
          ${!rel.father_id || !rel.mother_id ? `<button class="btn btn-ghost" data-r="parent">👴 ${t('Ota yoki onasi')}</button>` : ''}</div></div>`);
      m.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { closeTopSheet(); personForm({ relation: b.dataset.r, of: rel }); }));
    });
  };
  sh.querySelector('#file').onclick = () => { closeTopSheet(); importSheet(); };
}

const COLS = {
  name: ['ism', 'ismi', 'name', 'имя', 'фио', 'исм'], gender: ['jins', 'jinsi', 'gender', 'пол', 'жинс'],
  birth: ['tugilgan', 'tug‘ilgan', "tug'ilgan", 'birth', 'рождение', 'дата рождения', 'туғилган'], death: ['vafot', 'death', 'смерть', 'дата смерти', 'вафот'],
  deceased: ['marhum', 'deceased', 'умер'], father: ['ota', 'otasi', 'father', 'отец', 'ота'], mother: ['ona', 'onasi', 'mother', 'мать', 'она'],
  spouse: ['turmush_ortogi', 'turmush', 'juft', 'spouse', 'супруг', 'супруга'], place: ['joy', 'place', 'место', 'жой'],
  phone: ['telefon', 'phone', 'телефон'], note: ['izoh', 'note', 'примечание', 'изоҳ'], code: ['raqam', 'code', 'номер'],
};
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0];
  const sep = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.trim().toLowerCase());
  const idx = {};
  for (const [k, names] of Object.entries(COLS)) idx[k] = head.findIndex((h) => names.includes(h));
  if (idx.name < 0) throw new Error(t('Faylda «ism» ustuni topilmadi'));
  return rows.filter((r) => r.some((x) => x.trim())).map((r) => Object.fromEntries(Object.entries(idx).filter(([, i]) => i >= 0).map(([k, i]) => [k, (r[i] || '').trim()])));
}

function importSheet() {
  const sh = openSheet(`<div class="sheet-head"><div class="h2">📄 ${t('Fayldan yuklash')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body">
      <ol class="steps"><li>${t('Namuna faylni yuklab oling va Excel’da to‘ldiring.')}</li>
        <li>${t('Ustunlar: ism, jins, tugilgan, vafot, ota, ona, turmush_ortogi, joy, telefon, izoh. Ota/ona/turmush o‘rtog‘i — fayldagi yoki shajaradagi ism.')}</li>
        <li>${t('Excel’da «CSV» formatida saqlang va shu yerga yuklang.')}</li></ol>
      <button class="btn btn-ghost btn-block" id="tpl">⬇️ ${t('Namuna faylni yuklab olish')}</button>
      <label class="drop" style="margin-top:12px">📄<b>${t('Faylni tanlang (.csv yoki .json)')}</b><input type="file" accept=".csv,.txt,.json,text/csv,application/json" hidden id="imf"></label>
      <div id="prev"></div></div>`);
  sh.querySelector('#tpl').onclick = () => {
    const url = location.origin + '/namuna.csv';
    if (tg?.downloadFile && inTelegram) { try { tg.downloadFile({ url, file_name: 'shajara-namuna.csv' }); return; } catch {} }
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shajara-namuna.csv';
    a.click();
  };
  sh.querySelector('#imf').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const box = sh.querySelector('#prev');
    try {
      if (/\.json$/i.test(file.name) || text.trim().startsWith('{')) {
        const data = JSON.parse(text);
        if (!Array.isArray(data.persons)) throw new Error(t('Fayl formati noto‘g‘ri'));
        box.innerHTML = `<div class="card note" style="margin-top:12px">${t('Zaxira faylda {n} kishi bor. Hozirgi shajara to‘liq almashtiriladi (faqat egasi).', { n: data.persons.length })}</div>
          <button class="btn btn-danger btn-block" id="go">${t('Shajarani almashtirish')}</button>`;
        box.querySelector('#go').onclick = async () => {
          if (!(await confirmBox(t('Hozirgi ma’lumotlar o‘rniga fayldagilar yoziladi. Davom etasizmi?')))) return;
          await doImport({ mode: 'replace', data: { meta: data.meta, persons: data.persons } });
        };
        return;
      }
      const rows = parseCSV(text);
      box.innerHTML = `<div class="h3" style="margin:14px 2px 8px">${t('{n} ta qator topildi', { n: rows.length })}</div>
        <div class="card" style="padding:4px 0;max-height:240px;overflow:auto">${rows.slice(0, 50).map((r) => `<div class="log-item"><div class="dot">${/^(f|a|ayol|ж|female)/i.test(r.gender || '') ? '👩' : '👨'}</div><div class="grow"><b>${esc(r.name)}</b><div class="small muted">${esc([r.birth, r.father && t('otasi') + ': ' + r.father, r.mother && t('onasi') + ': ' + r.mother, r.spouse && '💍 ' + r.spouse].filter(Boolean).join(' · '))}</div></div></div>`).join('')}</div>
        <button class="btn btn-primary btn-block" style="margin-top:12px" id="go">${t('Shajaraga qo‘shish ({n})', { n: rows.length })}</button>`;
      box.querySelector('#go').onclick = () => doImport({ mode: 'append', rows });
    } catch (err) {
      box.innerHTML = `<div class="card note" style="margin-top:12px;color:var(--danger)">${esc(err.message)}</div>`;
    }
  };
  async function doImport(body) {
    const b = sh.querySelector('#go');
    b.disabled = true;
    b.innerHTML = '<span class="spin"></span>';
    try {
      const r = await api('import', { method: 'POST', body });
      closeAllSheets();
      onTreeChanged(r.tree);
      toast(t('{n} kishi qo‘shildi 🌱', { n: r.count }));
    } catch (err) { toast(err.message, true); b.disabled = false; b.textContent = t('Qayta urinish'); }
  }
}

// ------------------------------------------------------------ Albom tab ----
const TYPE_ICON = { photo: '🖼', video: '🎬', animation: '🎞', video_note: '⭕', document: '📄', audio: '🎵', voice: '🎙' };
const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');
const fmtSize = (b) => (!b ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

async function loadAlbum(force) {
  if (S.album && !force) return S.album;
  S.album = await api('album');
  return S.album;
}

async function renderAlbumTab(el) {
  if (!S.album) el.innerHTML = `<div class="empty"><span class="spin" style="color:var(--primary)"></span></div>`;
  let A;
  try { A = await loadAlbum(); } catch (err) { el.innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
  const counts = {};
  for (const it of A.items) counts[it.album] = (counts[it.album] || 0) + 1;
  const albums = A.albums.filter((a) => counts[a.id] || isEdit());
  const f = S.albumFilter;
  const tr = S.tree;
  const banner = A.hasChannel ? '' : isEdit()
    ? `<button class="card banner" id="ch-banner"><div style="font-size:26px">🗄</div><div class="grow"><b>${t('Albom yaratish uchun avval kanal ulang')}</b><div class="small muted">${t('Fayllar sizning yopiq Telegram kanalingizda abadiy saqlanadi')}</div></div>${I.chev}</button>`
    : `<div class="card banner"><div style="font-size:26px">🗄</div><div class="grow"><b>${t('Albom hali ochilmagan')}</b><div class="small muted">${t('Albomni ochish uchun shajara tahrirchisi albom kanalini ulashi kerak.')}</div></div></div>`;
  const section = (a, items) => `<div class="alb-head"><div class="grow"><div class="h2 ellipsis">📁 ${esc(nm(a.name))}</div><div class="small muted">${t('{n} ta fayl', { n: items.length })}</div></div>
      ${isEdit() ? `<button class="icon-btn" data-alb-menu="${a.id}">${I.more}</button>` : ''}</div>
    <div class="grid">${items.map(tile).join('')}</div>`;
  let body;
  if (!A.items.length) {
    body = `<div class="empty"><div class="big">📸</div><b>${t('Albom hali bo‘sh')}</b><p class="small">${t('Oilaviy rasm, video va hujjatlarni qo‘shing — butun oila ko‘ra oladi.')}</p></div>`;
  } else if (f === 'all') {
    body = A.albums.filter((a) => counts[a.id]).map((a) => section(a, A.items.filter((it) => it.album === a.id))).join('');
  } else {
    const a = A.albums.find((x) => x.id === f);
    body = a ? section(a, A.items.filter((it) => it.album === f)) : '';
  }
  el.innerHTML = `<div class="scroll" style="padding-top:8px">
    ${banner}
    <div class="chips"><button class="chip ${f === 'all' ? 'on' : ''}" data-af="all">${t('Hammasi')} · ${A.items.length}</button>${albums.map((a) => `<button class="chip ${f === a.id ? 'on' : ''}" data-af="${a.id}">${esc(nm(a.name))} · ${counts[a.id] || 0}</button>`).join('')}</div>
    ${body}
    <div style="height:90px"></div></div>
    ${A.canUpload ? `<button class="fab" id="add">${I.plus}<span>${t('Qo‘shish')}</span></button>` : ''}`;
  el.querySelectorAll('[data-af]').forEach((b) => (b.onclick = () => { S.albumFilter = b.dataset.af; haptic('light'); renderAlbumTab(el); }));
  const order = (f === 'all' ? A.albums.filter((a) => counts[a.id]).flatMap((a) => A.items.filter((it) => it.album === a.id)) : A.items.filter((it) => it.album === f)).map((it) => it.id);
  el.querySelectorAll('[data-item]').forEach((b) => (b.onclick = () => openViewer(order, order.indexOf(b.dataset.item))));
  el.querySelectorAll('[data-alb-menu]').forEach((b) => (b.onclick = () => albumMenu(b.dataset.albMenu)));
  el.querySelector('#add')?.addEventListener('click', uploadSheet);
  el.querySelector('#ch-banner')?.addEventListener('click', () => linkSheet('channel'));
}

function tile(it) {
  const img = it.thumb ? `<img src="${it.thumb}" alt="" loading="lazy">` : `<div class="tile-ic">${TYPE_ICON[it.type] || '📄'}</div>`;
  const badge = it.type === 'video' || it.type === 'animation' || it.type === 'video_note' ? `<span class="tile-badge">▶ ${fmtDur(it.dur)}</span>`
    : it.type !== 'photo' ? `<span class="tile-badge">${TYPE_ICON[it.type] || ''} ${esc((it.name || '').slice(0, 14))}</span>` : '';
  return `<button class="tile" data-item="${it.id}">${img}${badge}</button>`;
}

// Reels uslubidagi ko'rgich: tepaga/pastga surib almashtirish, bir bosish — yozuvlarni yashirish
const SV = (d, f = 'none') => `<svg viewBox="0 0 24 24" fill="${f}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const VI = {
  heart: (on) => SV('<path d="M12 21s-7.5-4.6-9.5-9.2C1 8.4 3.2 5 6.6 5c2 0 3.4 1.1 4.4 2.5C12 6.1 13.4 5 15.4 5 18.8 5 21 8.4 21.5 11.8 19.5 16.4 12 21 12 21z"/>', on ? 'currentColor' : 'none'),
  eye: SV('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  send: SV('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>'),
  full: SV('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  play: SV('<path d="M7 4.5v15l12.5-7.5z"/>', 'currentColor'),
  pause: SV('<rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/>', 'currentColor'),
  mute: (m) => SV(m ? '<path d="M11 5 6 9H2v6h4l5 4zM23 9l-6 6M17 9l6 6"/>' : '<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'),
  back10: SV('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><text x="12" y="15.5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">10</text>'),
  fwd10: SV('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/><text x="12" y="15.5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">10</text>'),
};
const FILE_IC = { pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', ppt: '📙', pptx: '📙', zip: '🗜', rar: '🗜', '7z': '🗜', txt: '📝', apk: '📱' };
const fmtT = (s) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
const fmtN = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n || 0));

function openViewer(ids, index) {
  const A = S.album;
  const items = ids.map((id) => A.items.find((x) => x.id === id)).filter(Boolean);
  if (!items.length) return;
  let cur = -1;
  const box = document.createElement('div');
  box.className = 'rv';
  box.innerHTML = `<div class="rv-feed">${items.map((it, i) => `<section class="rv-slide" data-i="${i}"></section>`).join('')}</div>
    <div class="rv-top rv-ui"><button class="rv-x" id="rv-x">${I.close}</button><div class="rv-count"></div>
      ${isEdit() ? `<button class="rv-x" id="rv-ed">${I.edit}</button><button class="rv-x" id="rv-dl">${I.trash}</button>` : ''}</div>`;
  document.body.append(box);
  const feed = box.querySelector('.rv-feed');
  const slides = [...feed.children];
  const close = () => { io.disconnect(); box.querySelectorAll('video,audio').forEach((m) => m.pause()); box.remove(); viewerOpen = null; updateBackButton(); };
  viewerOpen = close;
  box.querySelector('#rv-x').onclick = close;
  box.querySelector('#rv-ed')?.addEventListener('click', () => { const it = items[cur]; close(); itemEditSheet(it); });
  box.querySelector('#rv-dl')?.addEventListener('click', async () => {
    const it = items[cur];
    if (!(await confirmBox(t('Bu fayl albomdan o‘chirilsinmi?')))) return;
    try { await api(`album/i/${it.id}`, { method: 'DELETE' }); close(); await refreshAlbum(); toast(t('O‘chirildi')); } catch (err) { toast(err.message, true); }
  });

  // Bir bosish — barcha yozuv va tugmalarni yashirish/ko'rsatish; ikki bosish — rasmni kattalashtirish
  let tapT = null;
  feed.addEventListener('click', (e) => {
    if (e.target.closest('button, input, .rv-seek, .rv-audio')) return;
    const img = e.target.closest('.rv-slide')?.querySelector('img.rv-img');
    if (tapT) {
      clearTimeout(tapT); tapT = null;
      if (img) zoomToggle(img);
      return;
    }
    tapT = setTimeout(() => { tapT = null; box.classList.toggle('bare'); }, 240);
  });

  function hydrate(i) {
    const sl = slides[i];
    if (!sl || sl.dataset.ready) return;
    sl.dataset.ready = 1;
    const it = items[i];
    const a = A.albums.find((x) => x.id === it.album);
    const land = it.w && it.h && it.w > it.h * 1.15 && (it.kind === 'image' || it.kind === 'video');
    let media;
    if (it.kind === 'image' && it.src) media = `<img class="rv-img" src="${it.src}" alt="" draggable="false">`;
    else if (it.kind === 'video' && it.src) {
      media = `<video class="rv-vid" src="${it.src}" playsinline preload="metadata" ${it.type === 'animation' ? 'loop muted' : 'loop'} poster="${it.thumb || ''}"></video>
        <div class="rv-big-play">${VI.play}</div>`;
    } else if (it.kind === 'audio' && it.src) {
      media = `<div class="rv-audio"><div class="rv-disc">${it.thumb ? `<img src="${it.thumb}" alt="">` : '🎵'}</div>
        <div class="rv-a-name">${esc(it.name || t('Audio'))}</div>
        <div class="rv-seek big"><i></i></div><div class="rv-a-time"><span class="c">0:00</span><span class="d">${fmtDur(it.dur) || '0:00'}</span></div>
        <div class="rv-a-ctl"><button data-a="-10">${VI.back10}</button><button class="rv-a-play" data-a="play">${VI.play}</button><button data-a="10">${VI.fwd10}</button></div>
        <button class="rv-a-spd" data-a="spd">1×</button><audio preload="metadata" src="${it.src}"></audio></div>`;
    } else {
      const ext = (it.name || '').split('.').pop().toLowerCase();
      media = `<div class="rv-file">${it.thumb ? `<img class="bg" src="${it.thumb}" alt="">` : ''}<div class="ic">${it.kind === 'file' ? FILE_IC[ext] || '📄' : TYPE_ICON[it.type] || '📄'}</div>
        <div class="nm">${esc(it.name || t('Fayl'))}</div><div class="meta">${[ext && ext.length < 6 ? ext.toUpperCase() : '', fmtSize(it.size), fmtDur(it.dur)].filter(Boolean).join(' · ')}</div>
        <div class="hint">${t('Bu faylni chatda ochish mumkin')}</div>
        ${inTelegram ? `<button class="btn btn-primary" data-act="send">📩 ${t('Chatga yuborish')}</button>` : ''}</div>`;
    }
    sl.innerHTML = `<div class="rv-media">${media}</div>
      <div class="rv-side rv-ui">
        <button class="rv-b like ${it.liked ? 'on' : ''}" data-act="like">${VI.heart(it.liked)}<span>${fmtN(it.likes)}</span></button>
        <div class="rv-b">${VI.eye}<span class="vw">${fmtN(it.views)}</span></div>
        ${it.kind === 'video' && it.type !== 'animation' ? `<button class="rv-b" data-act="mute">${VI.mute(false)}</button>` : ''}
        ${it.kind === 'video' && it.src ? `<button class="rv-b spd" data-act="spd"><b>1×</b></button>` : ''}
        ${inTelegram ? `<button class="rv-b" data-act="send">${VI.send}<span class="sn">${fmtN(it.sends)}</span></button>` : ''}
      </div>
      ${land ? `<button class="rv-full rv-ui" data-act="full">${VI.full}</button>` : ''}
      <div class="rv-info rv-ui">
        <div class="rv-meta">📁 ${esc(nm(a?.name || ''))} · ${fmtDate(it.at.slice(0, 10))}</div>
        ${it.by?.name ? `<button class="rv-by" data-act="by">👤 ${esc(it.by.name)}</button>` : ''}
        ${it.caption ? `<div class="rv-cap">${esc(it.caption)}</div>` : ''}
        ${it.kind === 'video' && it.src ? `<div class="rv-vbar"><div class="rv-seek"><i></i></div><span class="rv-vt">0:00</span><button data-act="pp">${VI.pause}</button></div>` : ''}
      </div>`;
    sl.querySelectorAll('[data-act]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); act(b.dataset.act, it, sl, b); }));
    const v = sl.querySelector('video');
    if (v) bindVideo(v, sl);
    const au = sl.querySelector('audio');
    if (au) bindAudio(au, sl);
    const img = sl.querySelector('img.rv-img');
    if (img) bindPinch(img);
  }

  async function act(k, it, sl, b) {
    haptic('light');
    if (k === 'like') {
      it.liked = !it.liked;
      it.likes = Math.max(0, (it.likes || 0) + (it.liked ? 1 : -1));
      b.classList.toggle('on', it.liked);
      b.innerHTML = `${VI.heart(it.liked)}<span>${fmtN(it.likes)}</span>`;
      try { const r = await api(`album/i/${it.id}/like`, { method: 'POST' }); if (r.likes != null) { it.likes = r.likes; it.liked = r.liked; b.querySelector('span').textContent = fmtN(r.likes); } } catch {}
    }
    if (k === 'send') {
      b.disabled = true;
      try {
        const r = await api(`album/i/${it.id}/send`, { method: 'POST' });
        toast(t('Chatga yuborildi 📩'));
        it.sends = r.sends ?? (it.sends || 0) + 1;
        sl.querySelectorAll('.sn').forEach((x) => (x.textContent = fmtN(it.sends)));
      } catch (err) { toast(err.message, true); }
      b.disabled = false;
    }
    if (k === 'spd') speedPop(b, sl.querySelector('video'), (v) => (b.innerHTML = `<b>${v}×</b>`));
    if (k === 'by') openProfile(it);
    if (k === 'full') {
      const on = !sl.classList.contains('land');
      sl.classList.toggle('land', on);
      feed.style.overflowY = on ? 'hidden' : '';
      try { on ? tg?.requestFullscreen?.() : tg?.exitFullscreen?.(); } catch {}
    }
    if (k === 'mute') {
      const v = sl.querySelector('video');
      v.muted = !v.muted;
      b.innerHTML = VI.mute(v.muted);
    }
    if (k === 'pp') {
      const v = sl.querySelector('video');
      v.paused ? v.play().catch(() => {}) : v.pause();
    }
  }

  function seekable(bar, media) {
    const go = (e) => {
      const r = bar.getBoundingClientRect();
      if (media.duration) media.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * media.duration;
    };
    bar.onpointerdown = (e) => { e.stopPropagation(); bar.setPointerCapture(e.pointerId); go(e); bar.onpointermove = go; };
    bar.onpointerup = bar.onpointercancel = () => (bar.onpointermove = null);
    bar.onclick = (e) => e.stopPropagation();
  }

  function bindVideo(v, sl) {
    const fill = sl.querySelector('.rv-vbar .rv-seek i');
    const tm = sl.querySelector('.rv-vt');
    const pp = sl.querySelector('[data-act="pp"]');
    const sync = () => { pp.innerHTML = v.paused ? VI.play : VI.pause; sl.classList.toggle('paused', v.paused); };
    v.addEventListener('timeupdate', () => { fill.style.width = (v.currentTime / (v.duration || 1)) * 100 + '%'; tm.textContent = `${fmtT(v.currentTime)} / ${fmtT(v.duration)}`; });
    v.addEventListener('play', sync);
    v.addEventListener('pause', sync);
    v.addEventListener('volumechange', () => { const m = sl.querySelector('[data-act="mute"]'); if (m) m.innerHTML = VI.mute(v.muted); });
    sl.querySelector('.rv-big-play').onclick = (e) => { e.stopPropagation(); v.play().catch(() => {}); };
    seekable(sl.querySelector('.rv-vbar .rv-seek'), v);
  }

  function bindAudio(au, sl) {
    const fill = sl.querySelector('.rv-seek i');
    const c = sl.querySelector('.rv-a-time .c');
    const d = sl.querySelector('.rv-a-time .d');
    const play = sl.querySelector('.rv-a-play');
    const sync = () => { play.innerHTML = au.paused ? VI.play : VI.pause; sl.classList.toggle('playing', !au.paused); };
    au.addEventListener('timeupdate', () => { fill.style.width = (au.currentTime / (au.duration || 1)) * 100 + '%'; c.textContent = fmtT(au.currentTime); });
    au.addEventListener('loadedmetadata', () => { if (isFinite(au.duration)) d.textContent = fmtT(au.duration); });
    au.addEventListener('play', sync);
    au.addEventListener('pause', sync);
    au.addEventListener('error', () => { sl.querySelector('.rv-a-name').insertAdjacentHTML('afterend', `<div class="small" style="opacity:.7">${t('Bu formatni ilovada ijro etib bo‘lmadi — chatga yuboring')}</div>`); }, { once: true });
    sl.querySelectorAll('[data-a]').forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      haptic('light');
      const k = b.dataset.a;
      if (k === 'play') au.paused ? au.play().catch(() => {}) : au.pause();
      else if (k === 'spd') speedPop(b, au, (v) => (b.textContent = v + '×'));
      else au.currentTime = Math.max(0, au.currentTime + Number(k));
    }));
    seekable(sl.querySelector('.rv-seek'), au);
  }

  // Tezlik menyusi: tugma yonida kichik panel (0.5× — 3×)
  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3];
  function speedPop(btn, media, show) {
    box.querySelector('.rv-pop')?.remove();
    const pop = document.createElement('div');
    pop.className = 'rv-pop';
    pop.innerHTML = SPEEDS.map((v) => `<button type="button" data-v="${v}" class="${media.playbackRate === v ? 'on' : ''}">${v}×</button>`).join('');
    box.append(pop);
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    pop.style.top = (r.top - h - 10 > 8 ? r.top - h - 10 : r.bottom + 10) + 'px';
    const off = (e) => {
      if (pop.contains(e.target)) return;
      pop.remove();
      document.removeEventListener('pointerdown', off, true);
    };
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
    pop.onclick = (e) => {
      e.stopPropagation();
      const v = Number(e.target.closest('[data-v]')?.dataset.v);
      if (!v) return;
      try { media.playbackRate = v; } catch {}
      show(media.playbackRate);
      haptic('light');
      pop.remove();
      document.removeEventListener('pointerdown', off, true);
    };
  }

  // Ikki barmoq bilan kattalashtirish; kattalashganda lenta surilmaydi, rasm suriladi
  function zoomToggle(img, k) {
    const z = img._z || (img._z = { k: 1, x: 0, y: 0 });
    z.k = k ?? (z.k > 1 ? 1 : 2.5);
    if (z.k <= 1) Object.assign(z, { k: 1, x: 0, y: 0 });
    img.style.transition = 'transform .25s';
    img.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.k})`;
    setTimeout(() => (img.style.transition = ''), 260);
    feed.style.overflowY = z.k > 1 ? 'hidden' : '';
  }
  function bindPinch(img) {
    const z = img._z || (img._z = { k: 1, x: 0, y: 0 });
    let p0 = null;
    const host = img.parentElement;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    host.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) { e.preventDefault(); p0 = { d: dist(e.touches), k: z.k }; }
      else if (z.k > 1) p0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, sx: z.x, sy: z.y };
    }, { passive: false });
    host.addEventListener('touchmove', (e) => {
      if (!p0) return;
      e.preventDefault();
      if (e.touches.length === 2 && p0.d) z.k = Math.min(5, Math.max(1, p0.k * (dist(e.touches) / p0.d)));
      else if (e.touches.length === 1 && p0.x != null) { z.x = p0.sx + e.touches[0].clientX - p0.x; z.y = p0.sy + e.touches[0].clientY - p0.y; }
      img.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.k})`;
      feed.style.overflowY = 'hidden';
    }, { passive: false });
    host.addEventListener('touchend', (e) => {
      if (e.touches.length) return;
      p0 = null;
      if (z.k <= 1.05) zoomToggle(img, 1);
    });
  }

  function activate(i) {
    if (i === cur) return;
    cur = i;
    box.querySelector('.rv-pop')?.remove();
    box.querySelector('.rv-count').textContent = `${i + 1} / ${items.length}`;
    for (const j of [i - 1, i, i + 1, i + 2]) hydrate(j);
    slides.forEach((sl, j) => {
      const m = sl.querySelector('video, audio');
      if (!m) return;
      if (j === i && m.tagName === 'VIDEO') m.play().catch(() => { m.muted = true; m.play().catch(() => {}); });
      else if (j !== i) m.pause();
      if (j !== i && sl.classList.contains('land')) { sl.classList.remove('land'); feed.style.overflowY = ''; }
    });
    const it = items[i];
    {
      api(`album/i/${it.id}/view`, { method: 'POST' }).then((r) => {
        if (r?.views != null) { it.views = r.views; const el = slides[i].querySelector('.vw'); if (el) el.textContent = fmtN(r.views); }
      }).catch(() => {});
    }
  }
  const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && activate(Number(e.target.dataset.i))), { root: feed, threshold: 0.6 });
  slides.forEach((s) => io.observe(s));
  const start = Math.max(0, Math.min(index, items.length - 1));
  hydrate(start);
  feed.scrollTop = start * feed.clientHeight;
  activate(start);
  updateBackButton();
}
let viewerOpen = null;

function openProfile(it) {
  if (it.byUser) return openLink(`https://t.me/${it.byUser}`);
  if (it.by?.id) {
    try { window.location.href = `tg://user?id=${it.by.id}`; return; } catch {}
  }
  toast(t('Bu foydalanuvchining profili yopiq'), true);
}

function albumSelect(selected, withNew = true) {
  const A = S.album;
  return `<select class="input" name="album">${A.albums.map((a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(nm(a.name))}</option>`).join('')}
    ${withNew ? `<option value="__new" ${!A.albums.length ? 'selected' : ''}>➕ ${t('Yangi albom')}</option>` : ''}</select>
    <input class="input ${A.albums.length ? 'hidden' : ''}" name="albumName" placeholder="${t('Yangi albom nomi (masalan: To‘y 2024)')}" maxlength="60" style="margin-top:8px">`;
}
function bindAlbumSelect(root) {
  const sel = root.querySelector('[name=album]');
  const inp = root.querySelector('[name=albumName]');
  sel.onchange = () => inp.classList.toggle('hidden', sel.value !== '__new');
}

function itemEditSheet(it) {
  const sh = openSheet(`<div class="sheet-head"><div class="h2">${t('Tahrirlash')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <form class="sheet-body" id="ief"><div class="field"><label>${t('Albom')}</label>${albumSelect(it.album)}</div>
    <div class="field"><label>${t('Izoh')}</label><textarea class="input" name="caption" maxlength="900">${esc(it.caption || '')}</textarea></div>
    <button class="btn btn-primary btn-block">${t('Saqlash')}</button></form>`);
  bindAlbumSelect(sh);
  sh.querySelector('#ief').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { caption: f.get('caption') };
    if (f.get('album') === '__new') body.albumName = f.get('albumName'); else body.album = f.get('album');
    try { await api(`album/i/${it.id}`, { method: 'PATCH', body }); closeAllSheets(); await refreshAlbum(); toast(t('Saqlandi ✓')); } catch (err) { toast(err.message, true); }
  };
}

function albumMenu(aid) {
  const a = S.album.albums.find((x) => x.id === aid);
  const sh = openSheet(`<div class="sheet-head"><div class="h2 ellipsis">📁 ${esc(nm(a.name))}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <form class="sheet-body" id="amf"><div class="field"><label>${t('Albom nomi')}</label><input class="input" name="name" value="${esc(a.name)}" maxlength="60" required></div>
    <button class="btn btn-primary btn-block">${t('Saqlash')}</button>
    <button type="button" class="btn btn-danger btn-block" style="margin-top:10px" id="adl">${t('Albomni o‘chirish')}</button>
    <div class="hint" style="text-align:center;margin-top:8px">${t('Fayllar o‘chmaydi — «Umumiy» albomiga o‘tadi')}</div></form>`);
  sh.querySelector('#amf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api(`album/a/${aid}`, { method: 'PATCH', body: { name: new FormData(e.target).get('name') } }); closeAllSheets(); await refreshAlbum(); } catch (err) { toast(err.message, true); }
  };
  sh.querySelector('#adl').onclick = async () => {
    if (!(await confirmBox(t('Albom o‘chirilsinmi?')))) return;
    try { await api(`album/a/${aid}`, { method: 'DELETE' }); S.albumFilter = 'all'; closeAllSheets(); await refreshAlbum(); } catch (err) { toast(err.message, true); }
  };
}

async function refreshAlbum() {
  await loadAlbum(true);
  const el = $app.querySelector('[data-view="album"]');
  if (el && S.tab === 'album') renderAlbumTab(el);
}

function uploadSheet() {
  const sh = openSheet(`<div class="sheet-head"><div class="h2">${t('Albomga qo‘shish')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <form class="sheet-body" id="uf">
      <label class="drop">${I.image}<b>${t('Rasmlarni tanlang')}</b><span class="small muted">${t('Bir nechta rasmni birdaniga tanlash mumkin')}</span><input type="file" accept="image/*" multiple hidden name="files"></label>
      <div class="thumbs" id="pv"></div>
      <div class="field"><label>${t('Albom')}</label>${albumSelect(S.albumFilter !== 'all' ? S.albumFilter : S.album.albums[0]?.id)}</div>
      <div class="field"><label>${t('Izoh — kim, qachon, qayerda?')}</label><textarea class="input" name="caption" maxlength="900" placeholder="${t('Masalan: Bobomning 80 yillik yubileyi, 2019')}"></textarea></div>
      <button class="btn btn-primary btn-block" id="ub" disabled>${t('Yuklash')}</button>
      <div class="card note" style="margin-top:14px">🎬 ${t('Video, ovozli xabar va hujjatlarni botga yuboring — bot albom va izohni so‘raydi. Oilaviy guruhda esa faylga javoban /albom yozing.')}
        ${inTelegram ? `<button type="button" class="btn btn-ghost btn-sm" style="margin-top:10px;width:100%" id="tobot">📎 ${t('Botga fayl yuborish')}</button>` : ''}</div>
    </form>`);
  bindAlbumSelect(sh);
  const input = sh.querySelector('[name=files]');
  let files = [];
  input.onchange = () => {
    files = [...input.files].slice(0, 20);
    sh.querySelector('#pv').innerHTML = files.map((f) => `<img src="${URL.createObjectURL(f)}" alt="">`).join('');
    sh.querySelector('#ub').disabled = !files.length;
    sh.querySelector('#ub').textContent = t('Yuklash ({n})', { n: files.length });
  };
  sh.querySelector('#tobot')?.addEventListener('click', () => openLink(`https://t.me/${BOT}`));
  sh.querySelector('#uf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { caption: f.get('caption') };
    if (f.get('album') === '__new') body.albumName = f.get('albumName') || t('Umumiy'); else body.album = f.get('album');
    const btn = sh.querySelector('#ub');
    btn.disabled = true;
    let ok = 0;
    for (const file of files) {
      btn.innerHTML = `<span class="spin"></span> ${ok + 1}/${files.length}`;
      try {
        const data = await resizeImage(file, 2048, false);
        const r = await api('album/upload', { method: 'POST', body: { ...body, data } });
        if (body.albumName) { body.album = r.album.id; delete body.albumName; }
        ok++;
      } catch (err) {
        toast(err.message, true);
        break;
      }
    }
    closeAllSheets();
    if (ok) toast(t('{n} ta fayl qo‘shildi 📸', { n: ok }));
    await refreshAlbum();
  };
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
  const elders = alive.filter((p) => { const a = age(p); return a !== null && a <= 105; }).sort((a, b) => a.birth.localeCompare(b.birth)).slice(0, 5);
  const bigFam = P.filter((p) => p.blood).map((p) => ({ p, n: fam.children(p.id).length })).sort((a, b) => b.n - a.n).slice(0, 3);
  const q = quoteOfDay();
  const today = new Date();
  const mem = P.filter((p) => p.death?.length === 10 && Number(p.death.slice(5, 7)) === today.getMonth() + 1);
  const kinSlot = (p, l) => p ? avatar(p, 54) + esc(nm(p.name)) : `<div class="avatar" style="--s:54px;background:var(--surface-2);color:var(--muted)">${l}</div>${t(l === 'A' ? 'Birinchi inson' : 'Ikkinchi inson')}`;

  el.innerHTML = `<div class="scroll" style="padding-top:8px">
    <div class="stat-grid">
      <div class="card stat hero"><div class="ic">🌳</div><div class="n">${fmtNum(P.length)}</div><div class="l">${t('kishi shajarada')} · ${t('{n} avlod', { n: gens })}${span ? ` · ${t('{n} yillik tarix', { n: span })}` : ''}</div></div>
      <div class="card stat"><div class="ic">🩸</div><div class="n">${blood.length}</div><div class="l">${t('qon qarindosh')}</div></div>
      <div class="card stat"><div class="ic">💍</div><div class="n">${P.length - blood.length}</div><div class="l">${t('kelin va kuyovlar')}</div></div>
      <div class="card stat"><div class="ic">💚</div><div class="n">${alive.length}</div><div class="l">${t('hayot')}</div></div>
      <div class="card stat"><div class="ic">🤲</div><div class="n">${P.length - alive.length}</div><div class="l">${t('marhumlar')}</div></div>
      <div class="card stat"><div class="ic">👨</div><div class="n">${men}</div><div class="l">${t('erkaklar')}</div></div>
      <div class="card stat"><div class="ic">👩</div><div class="n">${P.length - men}</div><div class="l">${t('ayollar')}</div></div>
    </div>
    <div class="quote-card"><q>${esc(t(q.t))}</q><div class="by">${t('Kun hikmati')} · ${esc(t(q.a))}</div></div>
    <div class="section"><h3 class="h3">${t('Avlodlar bo‘yicha')}</h3></div>
    <div class="card bars">${byGen.map((x) => `<div class="bar-row"><span>${t('{n}-avlod', { n: x.g })}</span><div class="bar"><i class="m" style="width:${(x.m / maxN) * 100}%"></i><i class="f" style="width:${(x.f / maxN) * 100}%"></i></div><span style="text-align:right">${x.n}</span></div>`).join('')}</div>
    <div class="section"><h3 class="h3">🎂 ${t('Yaqin tug‘ilgan kunlar')}</h3><span class="small muted">${t('{n} kun', { n: 45 })}</span></div>
    ${bdays.length ? `<div class="card list-card">${bdays.slice(0, 8).map((b) => personRow(b.p, `<div class="bday-day"><b>${b.date.getDate()}</b><small>${monthShort(b.date.getMonth())}</small></div>`).replace('class="meta ellipsis">', `class="meta ellipsis">${b.diff === 0 ? '🎉 ' + t('Bugun!') + ' ' : b.diff === 1 ? t('Ertaga') + ' · ' : t('{n} kundan so‘ng', { n: b.diff }) + ' · '}${t('{n} yosh', { n: b.turns })} · `)).join('')}</div>`
      : `<div class="card" style="margin:0 16px;padding:16px">${t('Yaqin kunlarda tug‘ilgan kun yo‘q (to‘liq sana kiritilganlar hisobga olinadi).')}</div>`}
    ${mem.length ? `<div class="section"><h3 class="h3">🤲 ${t('Shu oyda xotira kunlari')}</h3></div><div class="card list-card">${mem.map((p) => personRow(p)).join('')}</div>` : ''}
    <div class="section"><h3 class="h3">🔗 ${t('Kim kimga kim?')}</h3></div>
    <div class="card" style="margin:0 16px;padding:14px"><div class="kin-pick">
      <button class="card kin-slot" data-kin="A">${kinSlot(S.kinA, 'A')}</button><div style="font-size:22px">↔︎</div><button class="card kin-slot" data-kin="B">${kinSlot(S.kinB, 'B')}</button>
    </div><div id="kin-res"></div></div>
    ${elders.length ? `<div class="section"><h3 class="h3">👑 ${t('Urug‘ oqsoqollari')}</h3></div><div class="card list-card">${elders.map((p) => personRow(p, `<span class="badge gold">${t('{n} yosh', { n: age(p) })}</span>`)).join('')}</div>` : ''}
    ${bigFam[0]?.n ? `<div class="section"><h3 class="h3">👨‍👩‍👧‍👦 ${t('Eng katta oilalar')}</h3></div><div class="card list-card">${bigFam.map((x) => personRow(x.p, `<span class="badge green">${t('{n} farzand', { n: x.n })}</span>`)).join('')}</div>` : ''}
    <div style="height:28px"></div></div>`;
  el.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => personSheet(b.dataset.open)));
  el.querySelectorAll('[data-kin]').forEach((b) => (b.onclick = () => pickPerson(t(b.dataset.kin === 'A' ? 'Birinchi insonni tanlang' : 'Ikkinchi insonni tanlang'), (p) => {
    if (b.dataset.kin === 'A') S.kinA = p; else S.kinB = p;
    renderStatsTab(el);
    el.querySelector('#kin-res')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  })));
  if (S.kinA && S.kinB) {
    const k = kinship(fam, S.kinA, S.kinB, t, nm);
    el.querySelector('#kin-res').innerHTML = `<div class="kin-res"><div class="small muted" style="font-weight:700">${t('{b} — {a} uchun:', { a: esc(nm(S.kinA.name)), b: esc(nm(S.kinB.name)) })}</div>
      <div class="big">${esc(k.term)}</div>${k.detail ? `<div class="small muted" style="margin-top:6px">${esc(k.detail)}</div>` : ''}</div>`;
  }
}

function pickPerson(title, cb) {
  const sh = openSheet(`<div class="sheet-head"><div class="h2">${esc(title)}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div style="padding:0 18px 8px"><input class="input" id="pq" placeholder="${t('Ism bo‘yicha qidirish')}" autocomplete="off"></div>
    <div class="sheet-body" id="pl" style="padding:0 0 20px"></div>`);
  const draw = (q = '') => {
    sh.querySelector('#pl').innerHTML = S.tree.persons.filter((p) => matches(p, q.toLowerCase())).slice(0, 80).map((p) => personRow(p)).join('');
    sh.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => { closeTopSheet(); cb(S.fam.get(b.dataset.open)); }));
  };
  sh.querySelector('#pq').oninput = (e) => draw(e.target.value.trim());
  draw();
}

// ------------------------------------------------------------ Ko'proq tab --
function renderMoreTab(el) {
  const tr = S.tree;
  const item = (id, ic, title, desc = '', right = I.chev, cls = '') => `<button class="menu-item" id="${id}"><div class="mi">${ic}</div><div class="grow"><div class="t ${cls}">${title}</div>${desc ? `<div class="d">${desc}</div>` : ''}</div>${right}</button>`;
  const prem = tr.premium || {};
  el.innerHTML = `<div class="scroll" style="padding-top:8px">
    ${tr.description ? `<div class="card note" style="margin:0 16px 14px">${esc(tr.description)}</div>` : ''}
    <div class="card menu">
      ${item('m-ai', '✨', t('AI yordamchi'), t('Ilova va bot haqida istalgan savol'))}
      ${item('m-invite', '📨', t('Qarindoshlarni taklif qilish'), t('Shaxsiy taklif havolasi — kodni aytish shart emas'))}
      ${item('m-notif', '🔔', t('Bildirishnomalar'), t('Yangiliklar va sozlamalar'))}
      ${item('m-lang', '🌐', t('Til'), LANG_NAMES[LANG])}
      ${item('m-group', '👨‍👩‍👧', t('Oilaviy guruh'), tr.groups.length ? tr.groups.map((g) => esc(g.title)).join(', ') : t('Botni oilaviy guruhingizga qo‘shing'))}
      ${item('m-premium', '⭐', 'Premium', prem.active ? t('Faol: {d} gacha', { d: fmtDate(prem.until.slice(0, 10)) }) : prem.paywall ? t('Cheksiz albom va barcha imkoniyatlar') : t('Hozircha barcha imkoniyatlar bepul'))}
    </div>
    ${canEdit() ? `<div class="section"><h3 class="h3">${t('Tahrirchi uchun')}</h3></div><div class="card menu">
      ${item('m-edit', isEdit() ? '🔓' : '🔒', isEdit() ? t('Tahrir rejimini yopish') : t('Tahrir rejimini yoqish'), '', `<span class="switch"><input type="checkbox" ${isEdit() ? 'checked' : ''} tabindex="-1"><span></span></span>`)}
      ${item('m-channel', '🗄', t('Albom kanali'), tr.channel ? '✅ ' + esc(tr.channel.title) : t('Ulanmagan — fayllarni kanalda saqlang'))}
      ${item('m-dupes', '🧹', t('Takroriy odamlar'), t('Ikkilangan yozuvlarni topish va birlashtirish'))}
      ${item('m-members', '👥', t('A’zolar va huquqlar'), t('{n} kishi kirgan', { n: tr.memberCount }))}
      ${item('m-settings', '⚙️', t('Shajara sozlamalari'), t('Nomi, kodlar, albom huquqlari'))}
      ${inTelegram ? item('m-export', '💾', t('Zaxira nusxa'), t('Shajara va albom ro‘yxati JSON faylda chatga')) : ''}
    </div>` : `<div class="card menu" style="margin-top:14px">${item('m-unlock', '🔐', t('Tahrirlash huquqini olish'), t('Tahrir kodi talab qilinadi'))}</div>`}
    <div class="section"><h3 class="h3">${t('Boshqa')}</h3></div>
    <div class="card menu">
      ${item('m-switch', '🌳', t('Boshqa shajaraga o‘tish'), t('Kod kiritish yoki yangi yaratish'))}
      ${item('m-onb', '✨', t('Tanishtiruvni qayta ko‘rish'))}
      ${item('m-forget', '🚪', t('Shu qurilmadan chiqish'), t('Keyingi safar kod qayta so‘raladi'), '', 'danger')}
    </div>
    <div class="muted small" style="text-align:center;padding:26px 16px 30px">Shajara iBot · @${BOT}<br>${t('«Ildizini bilgan — adashmas»')}</div>
  </div>`;
  const on = (id, fn) => el.querySelector('#' + id)?.addEventListener('click', fn);
  on('m-invite', inviteSheet);
  on('m-ai', aiSheet);
  on('m-dupes', dupesSheet);
  on('m-notif', notificationsSheet);
  on('m-lang', langSheet);
  on('m-group', () => linkSheet('group'));
  on('m-channel', () => linkSheet('channel'));
  on('m-premium', () => premiumSheet());
  on('m-edit', toggleEditMode);
  on('m-unlock', unlockSheet);
  on('m-members', membersSheet);
  on('m-settings', settingsSheet);
  on('m-switch', () => renderGate());
  on('m-onb', () => renderOnboarding(() => renderMain()));
  on('m-forget', async () => {
    if (!(await confirmBox(t('Bu qurilmada shajaradan chiqasizmi? Qayta kirish uchun kod kerak bo‘ladi.')))) return;
    forgetTree(tr.id);
    renderGate();
  });
  on('m-export', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try { await api('export', { method: 'POST' }); toast(t('Zaxira nusxa chatga yuborildi 💾')); } catch (err) { toast(err.message, true); }
    b.disabled = false;
  });
}

function relTime(iso) {
  const d = (Date.now() - new Date(iso)) / 1000;
  if (d < 60) return t('hozirgina');
  if (d < 3600) return t('{n} daqiqa oldin', { n: Math.floor(d / 60) });
  if (d < 86400) return t('{n} soat oldin', { n: Math.floor(d / 3600) });
  if (d < 86400 * 30) return t('{n} kun oldin', { n: Math.floor(d / 86400) });
  return fmtDate(iso.slice(0, 10));
}

const ACT = {
  add: ['🌱', '{name} qo‘shildi'], edit: ['✏️', '{name} tahrirlandi'], delete: ['🗑', '{name} o‘chirildi'], photo: ['🖼', '{name} surati qo‘yildi'],
  'photo-del': ['🖼', '{name} surati olib tashlandi'], settings: ['⚙️', 'Sozlamalar o‘zgardi'], create: ['🌱', 'Shajara boshlandi: {name}'],
  import: ['📥', 'Ma’lumotlar yuklandi: {name}'], album: ['📸', 'Albom: {name}'],
  'undo-import': ['↩️', 'Import bekor qilindi: {name}'], merge: ['🧹', 'Takror birlashtirildi: {name}'],
};

function notificationsSheet() {
  const tr = S.tree;
  const seen = store.get('sh_seen_' + tr.id, '');
  const log = tr.log || [];
  const n = tr.me?.notify || {};
  const sw = (k, label) => `<label class="row card" style="padding:12px 14px;margin-bottom:8px"><div class="grow" style="font-weight:700">${label}</div><span class="switch"><input type="checkbox" data-n="${k}" ${(n[k] ?? true) ? 'checked' : ''}><span></span></span></label>`;
  const sh = openSheet(`<div class="sheet-head"><div class="h2">🔔 ${t('Bildirishnomalar')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body">
      ${inTelegram && tr.me ? `<div class="h3" style="margin:4px 2px 10px">${t('Menga Telegram orqali yuborilsin')}</div>
        ${sw('album', '📸 ' + t('Albomga yangi fayllar'))}${sw('tree', '🌱 ' + t('Shajaradagi yangiliklar'))}${sw('bday', '🎂 ' + t('Tug‘ilgan kun va xotira kunlari'))}` : ''}
      <div class="h3" style="margin:16px 2px 6px">${t('So‘nggi yangiliklar')}</div>
      <div class="card" style="padding:6px 0">${log.length ? log.slice(0, 60).map((l) => {
        const [ic, tx] = ACT[l.action] || ['•', l.action];
        return `<div class="log-item ${seen && l.at > seen ? 'new' : ''}"><div class="dot">${ic}</div><div class="grow">${t(tx, { name: `<b>${esc(nm(l.name || ''))}</b>` })}<div class="small muted">${esc(l.who || '')} · ${relTime(l.at)}</div></div></div>`;
      }).join('') : `<div class="log-item muted">${t('Hozircha yangiliklar yo‘q')}</div>`}</div>
    </div>`);
  store.set('sh_seen_' + tr.id, new Date().toISOString());
  document.querySelector('#bell .dot')?.classList.add('hidden');
  sh.querySelectorAll('[data-n]').forEach((c) => (c.onchange = async () => {
    const body = { notify: { [c.dataset.n]: c.checked } };
    try { await api('me', { method: 'PATCH', body }); tr.me.notify = { ...(tr.me.notify || {}), ...body.notify }; toast(t('Saqlandi ✓')); } catch (err) { c.checked = !c.checked; toast(err.message, true); }
  }));
}

function langSheet() {
  const sh = openSheet(`<div class="sheet-head"><div class="h2">🌐 ${t('Til')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body"><div class="card menu" style="margin:0">${Object.entries(LANG_NAMES).map(([k, v]) => `<button class="menu-item" data-lang="${k}"><div class="grow t">${v}</div>${LANG === k ? '✓' : ''}</button>`).join('')}</div></div>`);
  bindLangPicker(sh, () => { closeAllSheets(); renderMain(); });
}

function inviteSheet() {
  const tr = S.tree;
  const code = savedTrees().find((x) => x.id === tr.id)?.viewCode;
  const text = t('🌳 «{title}» — oilamiz shajarasi. Havolani bosing va o‘z ildizingizni ko‘ring!', { title: nm(tr.title) });
  const sh = openSheet(`<div class="sheet-head"><div class="h2">📨 ${t('Taklif qilish')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body"><p class="muted" style="margin-top:0">${t('Bu havola orqali kirgan qarindoshlar shajarani ko‘ra oladi va albomga fayl qo‘sha oladi. Tahrirlash uchun alohida kod kerak.')}</p>
    <div class="card" style="padding:12px 14px;word-break:break-all;font-weight:700;font-size:13px">${esc(tr.invite)}</div>
    <div class="actions"><button class="btn btn-primary" id="shr">${I.share} ${t('Ulashish')}</button><button class="btn btn-ghost" id="cpy">${t('Nusxa olish')}</button></div>
    ${code ? `<div class="hint" style="text-align:center;margin-top:12px">${t('Kirish kodi: {code}', { code: `<b>${esc(code)}</b>` })}</div>` : ''}
    <div class="hint" style="text-align:center;margin-top:6px">${t('Havolani bekor qilish uchun sozlamalarda kirish kodini almashtiring.')}</div></div>`);
  sh.querySelector('#shr').onclick = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(tr.invite)}&text=${encodeURIComponent(text)}`;
    if (inTelegram) openLink(url);
    else if (navigator.share) navigator.share({ text: text + '\n' + tr.invite }).catch(() => {});
    else copyText(tr.invite);
  };
  sh.querySelector('#cpy').onclick = () => copyText(tr.invite);
}

function linkSheet(kind) {
  const tr = S.tree;
  const isCh = kind === 'channel';
  const linked = isCh ? (tr.channel ? [{ id: 'channel', title: tr.channel.title }] : []) : tr.groups;
  const sh = openSheet(`<div class="sheet-head"><div class="h2">${isCh ? '🗄 ' + t('Albom kanali') : '👨‍👩‍👧 ' + t('Oilaviy guruh')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body">
      <p class="muted" style="margin-top:0">${isCh
        ? t('Albom fayllari sizning yopiq Telegram kanalingizda saqlanadi — joy cheklanmagan va fayllar hech qachon yo‘qolmaydi. Kanal a’zolari albomni Telegramda ham ko‘ra oladi.')
        : t('Bot oilaviy guruhingizda ishlaydi: albom va shajara yangiliklari, tug‘ilgan kunlar guruhga keladi. Guruhda /shajara, /tugilgan va faylga javoban /albom buyruqlari ishlaydi.')}</p>
      ${linked.length ? `<div class="card" style="padding:4px 0;margin-bottom:12px">${linked.map((g) => `<div class="log-item"><div class="dot">✅</div><div class="grow"><b>${esc(g.title)}</b></div>${canEdit() ? `<button class="btn btn-danger btn-sm" data-unlink="${g.id}">${t('Uzish')}</button>` : ''}</div>`).join('')}</div>` : ''}
      ${isCh && tr.channel?.invite ? `<button class="btn btn-soft btn-block" id="joinch" style="margin-bottom:12px">${t('Kanalga qo‘shilish')}</button>` : ''}
      ${canEdit() ? `<div id="lk"><button class="btn btn-primary btn-block" id="gen">${t(isCh ? 'Kanal ulash' : 'Guruhga qo‘shish')}</button></div>` : `<div class="hint">${t('Ulash uchun tahrir huquqi kerak.')}</div>`}
    </div>`);
  sh.querySelector('#joinch')?.addEventListener('click', () => openLink(tr.channel.invite));
  sh.querySelectorAll('[data-unlink]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox(t('Uzilsinmi? Bot bu chatdan chiqadi.')))) return;
    try {
      const r = await api('unlink', { method: 'POST', body: { id: b.dataset.unlink } });
      closeAllSheets();
      onTreeChanged(r.tree);
    } catch (err) { toast(err.message, true); }
  }));
  sh.querySelector('#gen')?.addEventListener('click', async (e) => {
    const gen = e.currentTarget;
    gen.disabled = true;
    try {
      const r = await api('linkcode', { method: 'POST', body: { kind } });
      const add = isCh ? `https://t.me/${r.bot}?startchannel&admin=post_messages+edit_messages+delete_messages+invite_users`
        : `https://t.me/${r.bot}?startgroup=${r.code}`;
      const tail = `<button class="btn btn-ghost btn-block" style="margin-top:8px" id="cpc">${t('Buyruqdan nusxa olish')}</button><div class="hint" style="text-align:center;margin-top:8px">${t('Kod 30 daqiqa amal qiladi')}</div>`;
      sh.querySelector('#lk').innerHTML = isCh
        ? `<ol class="steps"><li>${t('Telegramda yangi <b>yopiq kanal</b> oching (masalan: «{title} albomi»).', { title: esc(nm(tr.title)) })}</li>
            <li>${t('Pastdagi tugma orqali botni kanalga <b>admin</b> qilib qo‘shing.')}</li>
            <li>${t('Kanalga quyidagi xabarni yozing:')}<div class="code-pill">/ulash ${r.code}</div></li></ol>
           <button class="btn btn-primary btn-block" id="addb">${t('Botni kanalga qo‘shish')}</button>${tail}`
        : `<ol class="steps"><li>${t('Pastdagi tugmani bosing va oilaviy guruhingizni tanlang — bot avtomatik ulanadi.')}</li>
            <li>${t('Agar ulanmasa, guruhga shu buyruqni yozing:')}<div class="code-pill">/ulash ${r.code}</div></li></ol>
           <button class="btn btn-primary btn-block" id="addb">${t('Guruhni tanlash')}</button>${tail}`;
      sh.querySelector('#addb').onclick = () => openLink(add);
      sh.querySelector('#cpc').onclick = () => copyText(`/ulash ${r.code}`);
    } catch (err) { toast(err.message, true); gen.disabled = false; }
  });
}

function membersSheet() {
  const sh = openSheet(`<div class="sheet-head"><div class="h2">👥 ${t('A’zolar va huquqlar')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body" id="mb"><div class="empty"><span class="spin" style="color:var(--primary)"></span></div></div>`);
  const draw = async () => {
    let r;
    try { r = await api('members'); } catch (err) { sh.querySelector('#mb').innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
    const owner = S.tree.isOwner || !r.members.some((x) => x.owner);
    sh.querySelector('#mb').innerHTML = `<p class="muted small" style="margin-top:0">${t('Bot orqali shajaraga kirgan barcha qarindoshlar. Egasi boshqalarga tahrir huquqini berishi yoki kirishni taqiqlashi mumkin.')}</p>
      <div class="card" style="padding:4px 0">${r.members.sort((a, b) => (b.owner - a.owner) || (a.role > b.role ? 1 : -1)).map((x) => `<div class="log-item"><div class="dot">${x.owner ? '👑' : x.role === 'edit' ? '✏️' : '👤'}</div>
        <div class="grow"><b>${esc(x.name)}</b>${x.me ? ` <span class="badge green">${t('siz')}</span>` : ''}<div class="small muted">${x.username ? '@' + esc(x.username) + ' · ' : ''}${t(x.owner ? 'Egasi' : x.role === 'edit' ? 'Tahrirchi' : 'Ko‘ruvchi')}</div></div>
        ${owner && !x.me && !x.owner ? `<button class="icon-btn" data-mm="${x.id}">${I.more}</button>` : ''}</div>`).join('') || `<div class="log-item muted">—</div>`}</div>
      ${r.banned.length ? `<div class="h3" style="margin:16px 2px 8px">${t('Taqiqlanganlar')}</div><div class="card" style="padding:4px 0">${r.banned.map((x) => `<div class="log-item"><div class="dot">⛔</div><div class="grow"><b>${esc(x.name)}</b></div>${owner ? `<button class="btn btn-ghost btn-sm" data-unban="${x.id}">${t('Ruxsat berish')}</button>` : ''}</div>`).join('')}</div>` : ''}`;
    sh.querySelectorAll('[data-unban]').forEach((b) => (b.onclick = async () => { await api('members/' + b.dataset.unban, { method: 'PATCH', body: { ban: false } }).catch((e) => toast(e.message, true)); draw(); }));
    sh.querySelectorAll('[data-mm]').forEach((b) => (b.onclick = () => {
      const x = r.members.find((y) => y.id === b.dataset.mm);
      const m2 = openSheet(`<div class="sheet-head"><div class="h2 ellipsis">${esc(x.name)}</div><button class="icon-btn" data-close>${I.close}</button></div>
        <div class="sheet-body"><div style="display:grid;gap:10px">
          <button class="btn btn-ghost" data-act="role">${x.role === 'edit' ? t('Tahrir huquqini olib qo‘yish') : t('Tahrir huquqini berish')}</button>
          <button class="btn btn-ghost" data-act="owner">👑 ${t('Egalikni topshirish')}</button>
          <button class="btn btn-danger" data-act="ban">⛔ ${t('Kirishni taqiqlash')}</button></div></div>`);
      m2.querySelectorAll('[data-act]').forEach((bb) => (bb.onclick = async () => {
        const act = bb.dataset.act;
        if (act !== 'role' && !(await confirmBox(t('Ishonchingiz komilmi?')))) return;
        const body = act === 'role' ? { role: x.role === 'edit' ? 'view' : 'edit' } : act === 'owner' ? { owner: true } : { ban: true };
        try { await api('members/' + x.id, { method: 'PATCH', body }); closeTopSheet(); toast(t('Saqlandi ✓')); if (act === 'owner') S.tree.isOwner = false; draw(); } catch (err) { toast(err.message, true); }
      }));
    }));
  };
  draw();
}

async function premiumSheet(reason) {
  const prem = S.tree?.premium || {};
  let plans = { month: 99, year: 799 };
  try { plans = await api('plans'); } catch {}
  const sh = openSheet(`<div class="sheet-head"><div class="h2">⭐ Shajara Premium</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body">
      ${reason ? `<div class="card note" style="border-color:var(--gold)">${esc(reason)}</div>` : ''}
      <div class="premium-hero"><div style="font-size:44px">🌳⭐</div><b>${prem.active ? t('Premium faol: {d} gacha', { d: fmtDate(prem.until.slice(0, 10)) }) : t('Butun oila uchun — bitta obuna')}</b></div>
      <ul class="perks"><li>📸 ${t('Cheksiz oilaviy albom')}</li><li>👥 ${t('Cheksiz shajara a’zolari')}</li><li>👨‍👩‍👧 ${t('Bir nechta oilaviy guruh')}</li><li>💾 ${t('Avtomatik zaxira nusxa')}</li><li>💚 ${t('Loyihaning rivojiga hissa')}</li></ul>
      ${!prem.paywall && !prem.active ? `<div class="hint" style="text-align:center;margin-bottom:12px">${t('Ishga tushirish davrida barcha imkoniyatlar bepul. Xohlasangiz, loyihani hozirdan qo‘llab-quvvatlashingiz mumkin.')}</div>` : ''}
      ${inTelegram ? `<div class="actions"><button class="btn btn-ghost" data-plan="month">${t('1 oy')} · ⭐ ${plans.month}</button><button class="btn btn-gold" data-plan="year">${t('1 yil')} · ⭐ ${plans.year}</button></div>` : `<div class="hint">${t('To‘lov faqat Telegram ichida')}</div>`}
      <div class="hint" style="text-align:center;margin-top:10px">${t('To‘lov Telegram Stars orqali, xavfsiz.')}</div>
    </div>`);
  sh.querySelectorAll('[data-plan]').forEach((b) => (b.onclick = async () => {
    try {
      const r = await api('premium', { method: 'POST', body: { plan: b.dataset.plan, lang: LANG } });
      tg.openInvoice(r.link, async (status) => {
        if (status !== 'paid') return;
        toast(t('Rahmat! Premium faollashtirildi ⭐'));
        closeAllSheets();
        const fresh = await api('tree');
        onTreeChanged(fresh.tree);
      });
    } catch (err) { toast(err.message, true); }
  }));
}

// =================================================================== SHEET
// Takroriy odamlar: bir odamning farzandlari/juftlari orasida ismi o'xshash yozuvlarni birlashtirish
function dupesSheet() {
  const sh = openSheet(`<div class="sheet-head"><div class="h2 grow">🧹 ${t('Takroriy odamlar')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body" id="dpb"><div class="empty"><span class="spin" style="color:var(--primary)"></span></div></div>`);
  const body = sh.querySelector('#dpb');
  const load = async () => {
    let r;
    try { r = await api('dupes'); } catch (err) { body.innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
    if (!r.pairs.length) { body.innerHTML = `<div class="empty"><div class="big">✨</div><b>${t('Takrorlar topilmadi')}</b></div>`; return; }
    const who = (p) => `<b>${esc(nm(p.name))}</b>${p.birth || p.death ? ` <span class="muted">${esc(yearsLabel(p))}</span>` : ''}${p.kids ? ` · ${t('{n} farzand', { n: p.kids })}` : ''}${p.photo ? ' · 📷' : ''}`;
    body.innerHTML = `<div class="hint" style="margin-bottom:10px">${t('Bir odamning farzandlari yoki turmush o‘rtoqlari orasida ismi o‘xshash yozuvlar. Birlashtirilganda barcha ma’lumot va bog‘lanishlar saqlanadi.')}</div>
      <button class="btn btn-primary btn-block" id="dpall">🧹 ${t('Hammasini birlashtirish')} (${r.pairs.length})</button>
      <div class="dp-list">${r.pairs.map((x, i) => `<div class="dp-row"><div class="grow"><div>${who(x.keep)}</div><div>${who(x.drop)}</div>
        <div class="small muted">${esc(t(x.type === 'spouse' ? '{name}ning turmush o‘rtog‘i' : '{name}ning farzandi', { name: nm(x.of) }))}</div></div>
        <button class="btn btn-soft btn-sm" data-i="${i}">${t('Birlashtirish')}</button></div>`).join('')}</div>`;
    const merge = async (pairs, btn) => {
      btn.disabled = true;
      try {
        const res = await api('dupes/merge', { method: 'POST', body: { pairs } });
        onTreeChanged(res.tree);
        toast(t('{n} ta takror birlashtirildi', { n: res.merged }));
        load();
      } catch (err) { toast(err.message, true); btn.disabled = false; }
    };
    body.querySelector('#dpall').onclick = async (e) => {
      const btn = e.currentTarget;
      if (await confirmBox(t('Hammasi birlashtirilsinmi?'))) merge(r.pairs.map((x) => [x.keep.id, x.drop.id]), btn);
    };
    body.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { const x = r.pairs[Number(b.dataset.i)]; merge([[x.keep.id, x.drop.id]], b); }));
  };
  load();
}

// AI yordamchi bilan suhbat (oxirgi xabarlar qurilmada saqlanadi)
const aiChat = store.get('sh_ai', []);
const AI_TIPS = ['Qanday qilib odam qo‘shaman?', 'Albomga qanday rasm qo‘shaman?', 'Albom kanalini qanday ulayman?', 'Botni oilaviy guruhga qanday ulayman?', 'Tahrir kodi nima?'];
const SPARK = '<svg viewBox="0 0 24 24" class="spark" aria-hidden="true"><path d="M12 2c.7 5 2.3 7.3 7.5 8-5.2.7-6.8 3-7.5 8-.7-5-2.3-7.3-7.5-8 5.2-.7 6.8-3 7.5-8z"/></svg>';
const CLIP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 11-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/></svg>';

const fileB64 = (blob) => new Promise((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] || '');
  r.onerror = () => bad(r.error);
  r.readAsDataURL(blob);
});
// Katta rasmni (telefon kamerasi) 2000 px gacha kichraytirib JPEG qilamiz — yuklash tezlashadi
async function shrinkImage(file) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
  return { data: await fileB64(blob), mime: 'image/jpeg' };
}
async function pollJob(job) {
  const until = Date.now() + 6 * 60e3;
  let misses = 0;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 2500));
    let d;
    try { d = await api('ai/job/' + job, { timeout: 20e3 }); misses = 0; } catch (e) { if (++misses > 4) throw e; continue; }
    if (d.status === 'done') return d;
    if (d.status === 'error') throw new Error(t(d.error || 'Xatolik yuz berdi'));
  }
  throw new Error(t('Javob kechikdi. Qayta urinib ko‘ring'));
}

// AI ajratgan ro'yxatni ko'rib chiqish: yangilar yoki hammasi
async function aiPreview(job) {
  let d;
  try { d = await api('ai/job/' + job); } catch (err) { return toast(err.message, true); }
  if (d.status !== 'done') return toast(t('Ma’lumot eskirgan. Faylni qayta yuboring'), true);
  const byId = new Map(d.rows.map((r) => [r.id, r]));
  const fresh = new Set(d.newIds || []);
  const nmOf = (id) => byId.get(id)?.name;
  const yrs = (r) => [r.birth, r.death === '+' ? '†' : r.death].filter(Boolean).join(' – ');
  const row = (r) => `<div class="ai-row"><b>${r.gender === 'f' ? '👩' : '👨'} ${esc(nm(r.name))}</b>${yrs(r) ? ` <span class="muted">${esc(yrs(r))}</span>` : ''}${fresh.has(r.id) ? ` <span class="ai-new">${t('yangi')}</span>` : ''}
      <div class="small muted">${[nmOf(r.father) && `${t('ota')}: ${esc(nm(nmOf(r.father)))}`, nmOf(r.mother) && `${t('ona')}: ${esc(nm(nmOf(r.mother)))}`, nmOf(r.spouse) && `${t('juft')}: ${esc(nm(nmOf(r.spouse)))}`].filter(Boolean).join(' · ')}</div></div>`;
  let only = fresh.size > 0;
  const sh = openSheet(`<div class="sheet-head"><div class="h2 grow">📋 ${t('{n} kishi topildi', { n: d.count })}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body">${fresh.size ? `<div class="seg" id="aps"><button type="button" class="on" data-v="new">${t('Yangilar')} · ${fresh.size}</button><button type="button" data-v="all">${t('Hammasi')} · ${d.count}</button></div>` : ''}
    <div class="ai-rows" id="apr"></div></div>`);
  const draw = () => { sh.querySelector('#apr').innerHTML = d.rows.filter((r) => !only || fresh.has(r.id)).map(row).join(''); };
  sh.querySelectorAll('#aps button').forEach((b) => (b.onclick = () => {
    only = b.dataset.v === 'new';
    sh.querySelectorAll('#aps button').forEach((x) => x.classList.toggle('on', x === b));
    draw();
  }));
  draw();
}

function aiSheet() {
  const sh = openSheet(`<div class="sheet-head"><div class="h2 grow ai-title">${SPARK} ${t('AI yordamchi')}</div>
      <button class="icon-btn" id="aic" aria-label="${t('Tozalash')}">${I.trash}</button><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body"><div class="ai-log" id="ail"></div>
    <form class="ai-form" id="aif"><button type="button" class="icon-btn ai-clip" id="aia" aria-label="${t('Fayl yuborish')}">${CLIP}</button>
      <input class="input" name="q" placeholder="${t('Savolingizni yozing…')}" autocomplete="off" maxlength="2000" enterkeyhint="send">
      <button class="btn btn-primary">${I.chev}</button><input type="file" id="aifile" hidden></form></div>`);
  const log = sh.querySelector('#ail');
  let busy = false;
  let failed = null;
  const save = () => store.set('sh_ai', aiChat.slice(-20));
  const card = (m, i) => {
    const c = m.card;
    const act = c.applied ? `<span class="ai-ok">✅ ${t('Qo‘shildi')}</span>${isEdit() ? `<button type="button" class="btn btn-soft btn-sm" data-undo="${i}">↩️ ${t('Bekor qilish')}</button>` : ''}`
      : !c.fresh ? `<span class="small muted">${t('Hammasi shajarada bor')}</span>`
      : isEdit() ? `<button type="button" class="btn btn-primary btn-sm" data-apply="${i}">✅ ${t('Shajaraga qo‘shish')} (+${c.fresh})</button>`
      : `<span class="small muted">${t('Qo‘shish uchun tahrir rejimini yoqing')}</span>`;
    return `<div class="ai-msg bot ai-card"><b>📋 ${t('{n} kishi topildi', { n: c.count })}</b>${c.summary ? `<div>${esc(c.summary)}</div>` : ''}
      ${c.matched ? `<div class="small muted">${t('{m} tasi shajarada allaqachon bor — qayta qo‘shilmaydi', { m: c.matched })}</div>` : ''}
      <div class="ai-card-btns">${act}<button type="button" class="btn btn-soft btn-sm" data-prev="${c.job}">👁 ${c.fresh && !c.applied ? `${t('Yangilar')} · ${c.fresh}` : t('Ro‘yxat')}</button>
      ${inTelegram ? `<button type="button" class="btn btn-soft btn-sm" data-csv="${c.job}">📩 CSV</button>` : ''}</div></div>`;
  };
  const draw = () => {
    log.innerHTML = (aiChat.length ? '' : `<div class="ai-msg bot">${t('Assalomu alaykum! Shajara, albom, kodlar yoki bot buyruqlari haqida so‘rang.')}</div>
        <div class="ai-tips"><button type="button" class="chip" data-file>📎 ${t('Fayldan ro‘yxat tuzish')}</button>${AI_TIPS.map((q) => `<button type="button" class="chip" data-q="${esc(t(q))}">${esc(t(q))}</button>`).join('')}</div>`) +
      aiChat.map((m, i) => (m.card ? card(m, i) : `<div class="ai-msg ${m.role === 'user' ? 'me' : 'bot'}">${esc(m.content)}</div>`)).join('') +
      (busy ? `<div class="ai-msg bot"><span class="dots"><i></i><i></i><i></i></span>${typeof busy === 'string' ? ` <span class="small muted">${esc(busy)}</span>` : ''}</div>` : '') +
      (failed ? `<div class="ai-err">${esc(failed.msg)}${failed.q ? ` <button type="button" class="btn btn-soft btn-sm" id="air">↻ ${t('Qayta urinish')}</button>` : ''}</div>` : '');
    log.scrollTop = log.scrollHeight;
    log.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => ask(b.dataset.q)));
    log.querySelector('[data-file]')?.addEventListener('click', () => sh.querySelector('#aifile').click());
    log.querySelector('#air')?.addEventListener('click', () => { const q = failed.q; failed = null; ask(q, true); });
    log.querySelectorAll('[data-prev]').forEach((b) => (b.onclick = () => aiPreview(b.dataset.prev)));
    log.querySelectorAll('[data-csv]').forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try { await api('ai/csv', { method: 'POST', body: { job: b.dataset.csv } }); toast(t('Chatga yuborildi 📩')); } catch (err) { toast(err.message, true); }
      b.disabled = false;
    }));
    log.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = async () => {
      const m = aiChat[Number(b.dataset.undo)];
      if (!(await confirmBox(t('Oxirgi import bekor qilinsinmi? U bilan qo‘shilgan odamlar o‘chiriladi.')))) return;
      b.disabled = true;
      try {
        const r = await api('ai/undo', { method: 'POST' });
        onTreeChanged(r.tree);
        m.card.applied = false;
        toast(t('{n} kishi olib tashlandi', { n: r.removed }));
        const d = await api('ai/job/' + m.card.job).catch(() => null);
        if (d?.status === 'done') Object.assign(m.card, { matched: d.matched, fresh: d.fresh });
        save();
      } catch (err) { toast(err.message, true); }
      draw();
    }));
    log.querySelectorAll('[data-apply]').forEach((b) => (b.onclick = async () => {
      const m = aiChat[Number(b.dataset.apply)];
      b.disabled = true;
      b.innerHTML = '<span class="spin"></span>';
      try {
        const r = await api('ai/apply', { method: 'POST', body: { job: m.card.job } });
        m.card.applied = true;
        save();
        onTreeChanged(r.tree);
        toast(t('{n} kishi qo‘shildi', { n: r.created }));
      } catch (err) { toast(err.message, true); }
      draw();
    }));
  };
  const ask = async (q, retry) => {
    if (busy || !q) return;
    failed = null;
    const history = aiChat.filter((m) => !m.card).slice(-8);
    if (!retry) aiChat.push({ role: 'user', content: q });
    busy = true;
    draw();
    try {
      const r = await api('ai', { method: 'POST', body: { q, history: retry ? history.slice(0, -1) : history, lang: LANG }, timeout: 60e3 });
      aiChat.push({ role: 'assistant', content: r.answer });
      haptic('light');
    } catch (err) {
      failed = { q, msg: err.message };
    }
    busy = false;
    save();
    draw();
  };
  const sendFile = async (f) => {
    if (busy || !f) return;
    failed = null;
    aiChat.push({ role: 'user', content: `📎 ${f.name} · ${fmtSize(f.size)}` });
    busy = t('Fayl tahlil qilinmoqda… 1-2 daqiqa');
    draw();
    try {
      let data, mime = f.type || '', name = f.name;
      if (/^image\//.test(mime) && f.size > 1.5e6) {
        ({ data, mime } = await shrinkImage(f));
        name = name.replace(/\.\w+$/, '') + '.jpg';
      } else {
        if (f.size > 3 * 1024 * 1024) throw new Error(t('Fayl juda katta (3 MB gacha)'));
        data = await fileB64(f);
      }
      const { job } = await api('ai/file', { method: 'POST', body: { name, mime, data, lang: LANG }, timeout: 90e3 });
      const d = await pollJob(job);
      aiChat.push({ role: 'assistant', content: `📋 ${d.count}`, card: { job, count: d.count, matched: d.matched, fresh: d.fresh, summary: d.summary } });
      haptic('success');
    } catch (err) {
      failed = { msg: err.message };
    }
    busy = false;
    save();
    draw();
  };
  draw();
  const fileInp = sh.querySelector('#aifile');
  sh.querySelector('#aia').onclick = () => fileInp.click();
  fileInp.onchange = () => { const f = fileInp.files[0]; fileInp.value = ''; sendFile(f); };
  sh.querySelector('#aic').onclick = () => { aiChat.length = 0; failed = null; save(); draw(); };
  sh.querySelector('#aif').onsubmit = (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    e.target.q.value = '';
    ask(q);
  };
}

let placeFab = null;
// Har sahifada turadigan suzuvchi 🤖 tugma: bosilsa yordamchi ochiladi, surib boshqa joyga qo'yish mumkin
function mountAiFab() {
  if (document.querySelector('.ai-fab')) return;
  const b = document.createElement('button');
  b.className = 'ai-fab';
  b.setAttribute('aria-label', t('AI yordamchi'));
  b.innerHTML = `<b>AI</b>${SPARK}`;
  document.body.append(b);
  let pos = store.get('sh_aifab', null);
  const S_ = 52;
  const place = () => {
    const w = window.innerWidth, h = window.innerHeight;
    // standart joy: sarlavha ostida o'ngda (daraxtda qidiruv maydoni yonidagi bo'sh joy)
    const tb = document.querySelector('.topbar')?.getBoundingClientRect();
    const y = pos ? pos.y * h - S_ / 2 : tb ? tb.bottom + 8 : h * 0.36;
    b.style.left = (pos?.side === 'l' ? 10 : w - S_ - 10) + 'px';
    b.style.top = Math.min(h - S_ - 96, Math.max(60, y)) + 'px';
  };
  placeFab = place;
  let st = null;
  let dragged = false;
  b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); st = { x: e.clientX, y: e.clientY }; dragged = false; });
  b.addEventListener('pointermove', (e) => {
    if (!st || (!dragged && Math.hypot(e.clientX - st.x, e.clientY - st.y) < 8)) return;
    dragged = true;
    b.classList.add('drag');
    b.style.left = e.clientX - S_ / 2 + 'px';
    b.style.top = e.clientY - S_ / 2 + 'px';
  });
  const end = (e) => {
    if (!st) return;
    st = null;
    b.classList.remove('drag');
    if (dragged) {
      pos = { side: e.clientX < window.innerWidth / 2 ? 'l' : 'r', y: e.clientY / window.innerHeight };
      store.set('sh_aifab', pos);
      place();
    }
  };
  b.addEventListener('pointerup', end);
  b.addEventListener('pointercancel', end);
  // ochish 'click' da — aks holda keyingi sensor bosishi ochilgan oynani darhol yopib qo'yadi
  b.addEventListener('click', () => { if (dragged) { dragged = false; return; } haptic('light'); aiSheet(); });
  window.addEventListener('resize', place);
  place();
}

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
  let sy = null;
  for (const h of [sh.querySelector('.grab'), sh.querySelector('.sheet-head')].filter(Boolean)) {
    h.addEventListener('touchstart', (e) => (sy = e.touches[0].clientY), { passive: true });
    h.addEventListener('touchmove', (e) => { if (sy !== null) sh.style.transform = `translateY(${Math.max(0, e.touches[0].clientY - sy)}px)`; }, { passive: true });
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
const closeAllSheets = () => [...$sheets.children].forEach(closeSheet);

// ------------------------------------------------------------ Shaxs kartasi
function personSheet(id) {
  const p = S.fam.get(id);
  if (!p) return;
  const fam = S.fam;
  const lin = fam.lineage(p.blood ? p : fam.bloodSpouse(p) || p);
  const a = age(p);
  const fatherP = fam.father(p);
  const motherP = fam.mother(p);
  const rels = (title, arr, label) => arr.length ? `<div class="rel-group"><div class="h3">${title} · ${arr.length}</div><div class="rel-list">${arr.map((x) => `<button class="rel" data-go="${x.id}">${avatar(x, 56)}<span>${esc(nm(x.name))}</span>${label ? `<small>${esc(label(x))}</small>` : ''}</button>`).join('')}</div></div>` : '';
  const desc = fam.descendantsCount(p.id);
  const info = [
    p.birth && [t('Tug‘ilgan'), fmtDate(p.birth)],
    p.place && [t('Tug‘ilgan joyi'), p.place],
    p.deceased && [t('Vafot etgan'), p.death ? fmtDate(p.death) : t('sanasi noma’lum')],
    a !== null && [t(p.deceased ? 'Umr ko‘rgan' : 'Yoshi'), t('{n} yosh', { n: a })],
    [t('Avlod'), t('{n}-avlod', { n: fam.gen(p) })],
    desc && [t('Avlodlari'), t('{n} kishi', { n: desc })],
    p.code && [t('Daftar raqami'), p.code],
    p.phone && [t('Telefon'), `<a href="tel:${esc(p.phone)}" style="color:var(--primary)">${esc(p.phone)}</a>`],
  ].filter(Boolean);
  const edit = isEdit();
  const sh = openSheet(`<div class="sheet-body">
    <div class="p-hero"><div style="position:relative">${avatar(p, 112, 'ring')}${edit ? `<button class="photo-edit" id="ph">${I.camera}</button>` : ''}</div>
      <h2>${esc(nm(p.name))}</h2><div class="dates">${esc(yearsLabel(p)) || '&nbsp;'}</div>
      <div class="badges">${p.blood ? `<span class="badge green">🩸 ${t('Qon qarindosh')}</span>` : `<span class="badge grey">💍 ${t('Kelin/kuyov')}</span>`}${p.deceased ? `<span class="badge grey">🤲 ${t('Marhum')}</span>` : ''}<span class="badge gold">${t('{n}-avlod', { n: fam.gen(p) })}</span></div></div>
    ${lin.length > 1 ? `<div class="card lineage"><span class="h3" style="width:100%;margin-bottom:4px">${t('Nasl yo‘li')}</span>${lin.map((x, i) => `${i ? '<span class="sep">›</span>' : ''}<button data-go="${x.id}" class="${x.id === p.id ? 'me' : ''}">${esc(nm(x.name))}</button>`).join('')}${!p.blood ? `<span class="sep">💍</span><button class="me">${esc(nm(p.name))}</button>` : ''}</div>` : ''}
    <dl class="card info-list">${info.map(([k, v]) => `<div><dt>${k}</dt><dd>${String(v).startsWith('<a') ? v : esc(v)}</dd></div>`).join('')}</dl>
    ${p.bio ? `<div class="card note"><div class="h3" style="margin-bottom:6px">${t('Hayot yo‘li')}</div>${esc(p.bio)}</div>` : ''}
    ${p.note ? `<div class="card note">📝 ${esc(p.note)}</div>` : ''}
    ${rels(t('Ota-ona'), [fatherP, motherP].filter(Boolean), (x) => t(x.gender === 'm' ? 'otasi' : 'onasi'))}
    ${rels(t('Turmush o‘rtog‘i'), fam.spouses(p), yearsLabel)}
    ${rels(t('Farzandlari'), fam.children(p.id), yearsLabel)}
    ${rels(t('Aka-uka, opa-singillari'), fam.siblings(p), yearsLabel)}
    ${rels(t('Nevaralari'), fam.grandchildren(p), yearsLabel)}
    <div class="actions">
      <button class="btn btn-soft full" id="in-tree">${I.tree} ${t('Daraxtda ko‘rsatish')}</button>
      ${edit ? `
        <button class="btn btn-ghost btn-sm" data-add="child">👶 ${t('Farzand')}</button>
        <button class="btn btn-ghost btn-sm" data-add="spouse">💍 ${t('Turmush o‘rtog‘i')}</button>
        ${!fatherP || !motherP ? `<button class="btn btn-ghost btn-sm full" data-add="parent">👴 ${t(!fatherP && !motherP ? 'Ota yoki onasini qo‘shish' : !fatherP ? 'Otasini qo‘shish' : 'Onasini qo‘shish')}</button>` : ''}
        <button class="btn btn-ghost btn-sm" id="edit">${I.edit} ${t('Tahrirlash')}</button>
        <button class="btn btn-danger btn-sm" id="del">${I.trash} ${t('O‘chirish')}</button>` : canEdit() ? '' : `<button class="btn btn-ghost btn-sm full" id="ask-edit">${I.lock} ${t('Tahrirlash uchun kod kiriting')}</button>`}
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
    if (!(await confirmBox(t('{name} shajaradan o‘chirilsinmi?', { name: nm(p.name) })))) return;
    try {
      const r = await api('person/' + p.id, { method: 'DELETE' });
      closeAllSheets();
      onTreeChanged(r.tree);
      toast(t('O‘chirildi'));
    } catch (err) { toast(err.message, true); }
  });
  sh.querySelector('#ph')?.addEventListener('click', () => photoMenu(p));
}

// ------------------------------------------------------------ Surat --------
function photoMenu(p) {
  const sh = openSheet(`<div class="sheet-head"><div class="h2">${t('Surat')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body"><div style="display:grid;gap:10px">
      <label class="btn btn-primary btn-block">${I.camera} ${t(p.photo ? 'Yangi surat tanlash' : 'Surat tanlash')}<input type="file" accept="image/*" id="pf" hidden></label>
      ${p.photo ? `<button class="btn btn-danger btn-block" id="prm">${t('Suratni olib tashlash')}</button>` : ''}
      <div class="hint" style="text-align:center">${t('Surat avtomatik kvadrat shaklda kesiladi va siqiladi')}</div></div></div>`);
  sh.querySelector('#pf').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    sh.querySelector('label.btn').innerHTML = `<span class="spin"></span> ${t('Yuklanmoqda…')}`;
    try {
      const data = await resizeImage(file, 640, true);
      const r = await api(`person/${p.id}/photo`, { method: 'POST', body: { data } });
      closeAllSheets();
      onTreeChanged(r.tree);
      toast(t('Surat qo‘yildi 📸'));
      setTimeout(() => personSheet(p.id), 260);
    } catch (err) {
      toast(err.message || t('Suratni o‘qib bo‘lmadi'), true);
      closeAllSheets();
    }
  };
  sh.querySelector('#prm')?.addEventListener('click', async () => {
    try {
      const r = await api(`person/${p.id}/photo`, { method: 'DELETE' });
      closeAllSheets();
      onTreeChanged(r.tree);
      toast(t('Surat olib tashlandi'));
    } catch (err) { toast(err.message, true); }
  });
}

async function resizeImage(file, size, square) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const c = document.createElement('canvas');
    if (square) {
      const side = Math.min(W, H);
      const out = Math.min(size, side);
      c.width = c.height = out;
      c.getContext('2d').drawImage(img, (W - side) / 2, Math.max(0, (H - side) * 0.3), side, side, 0, 0, out, out);
    } else {
      const k = Math.min(1, size / Math.max(W, H));
      c.width = Math.round(W * k);
      c.height = Math.round(H * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    }
    return c.toDataURL('image/jpeg', square ? 0.85 : 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ------------------------------------------------------------ Shaxs formasi
function personForm({ person, relation, of }) {
  const editing = !!person;
  const p = person || {};
  const title = editing ? t('Tahrirlash') : relation === 'child' ? t('{name}ga farzand', { name: nm(of.name) }) : relation === 'spouse' ? t('{name}ga turmush o‘rtog‘i', { name: nm(of.name) }) : t('{name}ning ota-onasi', { name: nm(of.name) });
  const spouses = relation === 'child' ? S.fam.spouses(of) : [];
  const fatherTaken = relation === 'parent' && of.father_id;
  const motherTaken = relation === 'parent' && of.mother_id;
  const g0 = relation === 'parent' ? (fatherTaken ? 'f' : 'm') : relation === 'spouse' ? (of.gender === 'm' ? 'f' : 'm') : p.gender || 'm';
  const sh = openSheet(`<div class="sheet-head"><div class="h2 ellipsis">${esc(title)}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <form class="sheet-body" id="pf" autocomplete="off">
      <div class="field"><label>${t('Ismi (familiyasi bilan bo‘lishi mumkin)')}</label><input class="input" name="name" value="${esc(p.name || '')}" maxlength="80" required></div>
      <div class="field"><label>${t('Jinsi')}</label><div class="seg" data-seg="gender">
        <button type="button" data-v="m" class="${g0 === 'm' ? 'on' : ''}"${fatherTaken ? ' disabled style="opacity:.4"' : ''}>👨 ${t('Erkak')}</button>
        <button type="button" data-v="f" class="${g0 === 'f' ? 'on' : ''}"${motherTaken ? ' disabled style="opacity:.4"' : ''}>👩 ${t('Ayol')}</button></div></div>
      ${spouses.length > 1 ? `<div class="field"><label>${t('Onasi / otasi')}</label><select class="input" name="otherParentId">${spouses.map((s) => `<option value="${s.id}">${esc(nm(s.name))}</option>`).join('')}<option value="">${t('Noma’lum')}</option></select></div>` : ''}
      <div class="field"><label>${t('Tug‘ilgan sana')}</label><input class="input" name="birth" value="${esc(dateToInput(p.birth))}" placeholder="1985 · 03.1985 · 20.03.1985" inputmode="numeric"></div>
      <div class="field"><label>${t('Tug‘ilgan joyi')}</label><input class="input" name="place" value="${esc(p.place || '')}" placeholder="${t('Masalan: Xiva')}" maxlength="120"></div>
      <label class="row card" style="padding:12px 14px;margin-bottom:14px"><div class="grow" style="font-weight:800">🤲 ${t('Vafot etgan')}</div><span class="switch"><input type="checkbox" name="deceased" ${p.deceased ? 'checked' : ''}><span></span></span></label>
      <div class="field ${p.deceased ? '' : 'hidden'}" id="death-f"><label>${t('Vafot sanasi')}</label><input class="input" name="death" value="${esc(dateToInput(p.death))}" placeholder="2005 · 24.10.1984" inputmode="numeric"></div>
      <div class="field"><label>${t('Telefon (ixtiyoriy)')}</label><input class="input" name="phone" value="${esc(p.phone || '')}" placeholder="+998 …" inputmode="tel" maxlength="30"></div>
      <div class="field"><label>${t('Hayot yo‘li, xotiralar (ixtiyoriy)')}</label><textarea class="input" name="bio" maxlength="3000" placeholder="${t('Kasbi, fazilatlari, eslab qolish kerak bo‘lgan voqealar…')}">${esc(p.bio || '')}</textarea></div>
      <div class="field"><label>${t('Izoh')}</label><input class="input" name="note" value="${esc(p.note || '')}" maxlength="1000"></div>
      <div class="row" style="gap:10px">
        <div class="field grow"><label>${t('Daftar raqami')}</label><input class="input" name="code" value="${esc(p.code || '')}" placeholder="2-6-4" maxlength="30"></div>
        ${relation === 'child' || (editing && (p.father_id || p.mother_id)) ? `<div class="field" style="width:120px"><label>${t('Tartibi')}</label><input class="input" name="child_order" value="${p.child_order ?? ''}" inputmode="numeric" placeholder="${t('avto')}"></div>` : ''}
      </div>
      <button class="btn btn-primary btn-block">${t(editing ? 'Saqlash' : 'Qo‘shish')}</button>
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
    if (birth === undefined || death === undefined) return toast(t('Sana formati noto‘g‘ri. Masalan: 1958 yoki 20.03.1958'), true);
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
        Object.assign(body, { relation, of: of.id });
        if (f.has('otherParentId')) body.otherParentId = f.get('otherParentId') || null;
        r = await api('person', { method: 'POST', body });
      }
      closeAllSheets();
      onTreeChanged(r.tree);
      const pid = editing ? p.id : r.person.id;
      toast(editing ? t('Saqlandi ✓') : t('{name} qo‘shildi 🌱', { name: nm(r.person.name) }));
      if (S.tab === 'tree') setTimeout(() => S.treeView?.focus(pid, { k: 1 }), 120);
      setTimeout(() => personSheet(pid), 300);
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = t(editing ? 'Saqlash' : 'Qo‘shish');
    }
  };
}

// ------------------------------------------------------------ Kodlar -------
function unlockSheet() {
  const sh = openSheet(`<div class="sheet-head"><div class="h2">${t('Tahrir rejimi')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <form class="sheet-body" id="uf" autocomplete="off"><div style="text-align:center;font-size:44px;margin:4px 0 8px">🔐</div>
      <p class="muted" style="text-align:center;margin:0 0 16px">${t('Odam qo‘shish, surat qo‘yish va o‘zgartirish uchun <b>tahrir kodini</b> kiriting.')}</p>
      <input class="input code-input" name="code" placeholder="${t('tahrir kodi')}" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go">
      <button class="btn btn-gold btn-block" style="margin-top:12px">${t('Ochish')}</button><div style="height:10px"></div></form>`);
  const input = sh.querySelector('input');
  setTimeout(() => input.focus(), 350);
  sh.querySelector('#uf').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const r = await api('unlock', { method: 'POST', body: { code: input.value } });
      S.editMode = true;
      store.set('sh_edit_' + r.tree.id, true);
      closeAllSheets();
      onTreeChanged(r.tree, r.token);
      toast(t('Tahrir rejimi ochildi ✏️'));
    } catch (err) {
      toast(err.message, true);
      input.select();
      btn.disabled = false;
    }
  };
}

function settingsSheet() {
  const tr = S.tree;
  const owner = tr.isOwner;
  const up = tr.settings?.albumUpload || 'members';
  const sh = openSheet(`<div class="sheet-head"><div class="h2">${t('Sozlamalar')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <form class="sheet-body" id="sf" autocomplete="off">
      <div class="field"><label>${t('Shajara nomi')}</label><input class="input" name="title" value="${esc(tr.title)}" maxlength="80" required></div>
      <div class="field"><label>${t('Tavsif')}</label><textarea class="input" name="description" maxlength="500">${esc(tr.description || '')}</textarea></div>
      <div class="field"><label>${t('Albomga kim fayl qo‘sha oladi?')}</label><div class="seg" data-seg="up"><button type="button" data-v="members" class="${up === 'members' ? 'on' : ''}">${t('Barcha a’zolar')}</button><button type="button" data-v="editors" class="${up === 'editors' ? 'on' : ''}">${t('Tahrirchilar')}</button></div></div>
      ${owner ? `<div class="h3" style="margin:18px 0 10px">${t('Kodlarni almashtirish')}</div>
      <div class="field"><label>🔑 ${t('Yangi kirish kodi')}</label><input class="input" name="viewCode" placeholder="${t('o‘zgartirmaslik uchun bo‘sh qoldiring')}" autocapitalize="off"></div>
      <div class="field"><label>✏️ ${t('Yangi tahrir kodi')}</label><input class="input" name="editCode" placeholder="${t('o‘zgartirmaslik uchun bo‘sh qoldiring')}" autocapitalize="off"></div>
      <div class="hint" style="margin:-4px 0 14px">⚠️ ${t('Kod almashtirilsa, eski taklif havolalari va boshqa qurilmalardagi kirishlar bekor bo‘ladi.')}</div>`
      : `<div class="hint" style="margin:6px 0 14px">🔐 ${t('Kodlarni faqat shajara egasi almashtira oladi.')}</div>`}
      <button class="btn btn-primary btn-block">${t('Saqlash')}</button><div style="height:10px"></div></form>`);
  bindSeg(sh);
  sh.querySelector('#sf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { title: f.get('title'), description: f.get('description'), albumUpload: segVal(sh, 'up') };
    if (f.get('viewCode')?.trim()) body.viewCode = f.get('viewCode').trim();
    if (f.get('editCode')?.trim()) body.editCode = f.get('editCode').trim();
    if ((body.viewCode || body.editCode) && !(await confirmBox(t('Kodlar almashtirilsinmi?')))) return;
    try {
      const r = await api('settings', { method: 'PATCH', body });
      if (body.viewCode) saveTreeLocal({ id: tr.id, viewCode: body.viewCode.toLowerCase() });
      closeAllSheets();
      onTreeChanged(r.tree, r.token);
      toast(t('Saqlandi ✓'));
    } catch (err) { toast(err.message, true); }
  };
}

// =================================================================== ISHGA TUSHIRISH
function boot() {
  initTelegram();
  if (!tg) applyTheme();
  document.documentElement.lang = LANG === 'uzc' ? 'uz-Cyrl' : LANG;
  const params = new URLSearchParams(location.search);
  const sp = tg?.initDataUnsafe?.start_param || '';
  const inv = params.get('inv') || (sp.startsWith('inv_') ? sp : '');
  S.goPerson = /_(p\d{1,8})$/.exec(inv.slice(30))?.[1] || null;
  const startCode = params.get('code') || (!inv ? sp : '');
  const afterOnb = () => {
    mountAiFab();
    if (inv) return joinByInvite(inv);
    if (startCode) return renderGate(startCode);
    const last = store.get('sh_last');
    if (last && savedTrees().some((x) => x.id === last && x.token)) return resumeTree(last);
    renderGate();
  };
  if (store.get('sh_onb') !== 2) renderOnboarding(afterOnb);
  else afterOnb();
}

boot();
