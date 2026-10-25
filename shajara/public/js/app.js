// Shajara AI — Mini App
import { I } from './icons.js';
import { quoteOfDay, randomQuote } from './quotes.js';
import { TreeView, esc } from './tree-view.js?v=5';
import { RealTreeView } from './real-tree.js?v=5';
import { defaultAvatar } from './avatars.js';
import { Family, yearsLabel, age, initials, parseDateInput, dateToInput, upcomingBirthdays, kinship } from './family.js';
import { t, tIn, nm, LANG, setLang, LANG_NAMES, fmtDate, monthShort, fmtNum } from './i18n.js';

const tg = window.Telegram?.WebApp;
const inTelegram = !!tg?.initData;
const BOT = 'ShajaraAiBot';
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
  // ko'rish oynasi ustidagi oyna (izohlar, «kim?») — avval o'sha yopiladi, video emas
  if (viewerOpen && $sheets.lastElementChild?.querySelector('.sheet.over-rv') && closeTopSheet()) return;
  if (viewerOpen) return viewerOpen();
  if (closeTopSheet()) return;
  document.querySelector('.screen[data-back]')?.dispatchEvent(new CustomEvent('back'));
}
async function confirmBox(text) {
  if (tg?.showConfirm && inTelegram) return new Promise((r) => tg.showConfirm(text, r));
  return confirm(text);
}
// o'z botining chati: havola mini app ichidan ochilmaydi — ilovani yopamiz, ostida bot chati
function openBot() {
  if (inTelegram && tg?.openTelegramLink) { tg.openTelegramLink(`https://t.me/${BOT}`); setTimeout(() => tg.close?.(), 300); } else window.open(`https://t.me/${BOT}`, '_blank');
}
// fayl/ZIP ni istalgan chatga — Telegram «Share with» oynasi (savePreparedInlineMessage)
// Ba'zi Android mijozlarida birinchi yuborishdan so'ng Telegram «yopildi» hodisasini qaytarmaydi va
// SDK keyingi chaqiruvni «WebAppShareMessageOpened» xatosi bilan rad etadi — u holda hodisani to'g'ridan-to'g'ri yuboramiz.
function shareVia(prepared) {
  if (!prepared || !tg?.shareMessage) return false;
  try { tg.shareMessage(prepared, (ok) => ok && toast(t('Yuborildi 📩'))); } catch (e) {
    if (!/ShareMessageOpened/.test(e?.message || '') || !window.Telegram?.WebView?.postEvent) throw e;
    window.Telegram.WebView.postEvent('web_app_send_prepared_message', false, { id: prepared });
  }
  return true;
}
function openLink(url) {
  if (url.startsWith('https://t.me/') && tg?.openTelegramLink && inTelegram) tg.openTelegramLink(url);
  else if (tg?.openLink && inTelegram) tg.openLink(url);
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
    <div class="onb-foot"><div class="small muted onb-legal">${t('Davom etib, siz {a} va {b}ga rozilik bildirasiz.', { a: `<a href="/legal/terms.html" target="_blank">${t('foydalanish shartlari')}</a>`, b: `<a href="/legal/privacy.html" target="_blank">${t('maxfiylik siyosati')}</a>` })}</div><div class="dots">${SLIDES.map(() => '<i></i>').join('')}</div>
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
const LOGO = '<img src="/img/icon192.png" alt="Shajara AI" class="logo-img">';

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
      setTimeout(quickStartSheet, 600);
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
  const want = new URLSearchParams(location.search).get('tab') || S.restoreTab;
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
  fetchUnread();
  // shajarada o'rnini hali belgilamagan bo'lsa — bir marta so'raymiz ("yo'qman" desa 30 kun so'ramaymiz)
  if (inTelegram && S.tree.me && !S.tree.me.pid && S.tree.persons.length > 1 && !S.goInbox && !S.goItem && !S.goMedia && !S.goUser && !S.goMemo && Date.now() - (store.get('sh_noself_' + S.tree.id, 0) || 0) > 30 * 864e5) setTimeout(() => whoAmISheet(true), 900);
  if (S.goInbox) { const k = { f: 'fam', l: 'log' }[S.goInbox] || 'me'; S.goInbox = null; setTimeout(() => notificationsSheet(k), 300); }
  if (S.goAlbumJoin) {
    const [, aid, code] = S.goAlbumJoin;
    S.goAlbumJoin = null;
    api(`album/a/${aid}/join`, { method: 'POST', body: { code } }).then(async (r) => { S.albumFilter = aid; await loadAlbum(true); switchTab('album'); toast(t('«{name}» albomiga qo‘shildingiz 🔒', { name: r.name })); }).catch((err) => toast(err.message, true));
  }
  if (S.goItem) { const id = S.goItem; S.goItem = null; setTimeout(() => openMediaComments(id, false), 300); }
  if (S.goUser) { const id = S.goUser; S.goUser = null; setTimeout(() => openMember(id), 300); }
  if (S.goMemo) { const id = S.goMemo; S.goMemo = null; setTimeout(async () => { if (!S.album) await loadAlbum().catch(() => {}); memorialSheet(id); }, 300); }
  if (S.goMedia) { const mid = S.goMedia; S.goMedia = null; setTimeout(() => openMediaComments(mid), 300); }
  if (S.openProps && canEdit()) { S.openProps = false; setTimeout(branchesSheet, 300); }
}

// o'qilmaganlar: me — shaxsiy (server), fam — oila izohlari, log — shajara yangiliklari
function unreadParts() {
  const seen = store.get('sh_seen_' + S.tree.id, null);
  return { me: S.inboxUnread || 0, fam: S.famUnread || 0, log: seen ? (S.tree.log || []).filter((l) => l.at > seen && !myLog(l)).length : 0 };
}
function unreadCount() { const u = unreadParts(); return u.me + u.fam + u.log; }
function refreshBell() {
  const d = document.querySelector('#bell .dot');
  if (!d) return;
  const n = unreadCount();
  d.classList.toggle('hidden', !n);
  d.classList.toggle('n', n > 0);
  d.textContent = n ? (n > 99 ? '99+' : n) : '';
}
async function fetchUnread() {
  const k = 'sh_fs_' + S.tree.id;
  if (!store.get(k, null)) store.set(k, new Date().toISOString());
  try {
    const r = await api('inbox?n=1&fs=' + encodeURIComponent(store.get(k, '')));
    S.inboxUnread = r.unread || 0; S.famUnread = r.fam || 0; refreshBell();
  } catch {}
}

function refreshChrome() {
  const tr = S.tree;
  const gens = S.fam.maxGen - S.fam.minGen + 1;
  document.getElementById('t-title').textContent = nm(tr.title);
  document.getElementById('t-sub').textContent = `${t('{n} kishi', { n: tr.persons.length })} · ${t('{n} avlod', { n: gens })}`;
  const lock = document.getElementById('lock');
  lock.className = 'lock-btn' + (isEdit() ? ' edit' : '');
  lock.innerHTML = isEdit() ? `${I.unlock}<span>${t('Tahrir')}</span>` : `${I.lock}<span>${t('Ko‘rish')}</span>`;
  refreshBell();
  if (!store.get('sh_seen_' + tr.id, null)) store.set('sh_seen_' + tr.id, new Date().toISOString());
}

function switchTab(tab, force) {
  if (S.tab === tab && !force) {
    if (tab === 'tree') S.treeView?.showRoot();
    return;
  }
  S.tab = tab;
  nav.set({ tab });
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
      <button class="icon-btn" data-z="mode" style="font-size:20px">${store.get('sh_tv') !== 'cards' ? '▦' : '🌳'}</button>
    </div>
    <div class="card legend"><span><i style="background:var(--male)"></i>${t('Erkak')}</span><span><i style="background:var(--female)"></i>${t('Ayol')}</span><span><i style="border:1.5px dashed var(--muted)"></i>${t('Kelin/kuyov')}</span></div>
    <div class="tree-hint">👆 ${t('Ochish uchun ismni bosing')}</div>
    <div id="my-bar" class="my-bar"></div>`;
  const TV = store.get('sh_tv') !== 'cards' ? RealTreeView : TreeView;
  const tv = new TV(el.querySelector('.tree-host'), { onOpen: (id) => personSheet(id), photoUrl, name: nm, genLabel: (n) => t('{n}-avlod', { n }) });
  S.treeView = tv;
  tv.setData(S.fam, S.tree.rootId);
  // «Mening oilam»: daraxt foydalanuvchining o'ziga markazlashadi
  const myId = S.tree.me?.pid && S.fam.get(S.tree.me.pid) ? S.tree.me.pid : null;
  requestAnimationFrame(() => (myId ? tv.focus(myId, { k: 1, pulse: false }) : tv.showRoot()));
  myBar(el);
  if (myId) el.querySelector('.tree-hint')?.remove();
  el.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => {
    haptic('light');
    const z = b.dataset.z;
    if (z === 'in') tv.zoom(1.35);
    if (z === 'out') tv.zoom(1 / 1.35);
    if (z === 'fit') tv.fit();
    if (z === 'root') tv.showRoot();
    if (z === 'mode') {
      store.set('sh_tv', store.get('sh_tv') !== 'cards' ? 'cards' : 'real');
      S.treeView = null;
      return renderTreeTab(el);
    }
    if (z === 'fold') {
      const open = !tv.collapsed.size;
      if (open) tv.collapseAll(); else tv.expandAll();
      tv.showRoot();
      toast(open ? t('Oilalar yig‘ildi — ochish uchun raqamni bosing') : t('Barcha oilalar ochildi'));
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
  wakeStream(A.stream);
  const counts = {};
  for (const it of A.items) counts[it.album] = (counts[it.album] || 0) + 1;
  const albums = A.albums.filter((a) => counts[a.id] || isEdit() || a.priv);
  const f = S.albumFilter;
  const tr = S.tree;
  const banner = A.hasChannel ? '' : isEdit()
    ? `<button class="card banner" id="ch-banner"><div style="font-size:26px">🗄</div><div class="grow"><b>${t('Albom yaratish uchun avval kanal ulang')}</b><div class="small muted">${t('Fayllar sizning yopiq Telegram kanalingizda abadiy saqlanadi')}</div></div>${I.chev}</button>`
    : `<div class="card banner"><div style="font-size:26px">🗄</div><div class="grow"><b>${t('Albom hali ochilmagan')}</b><div class="small muted">${t('Albomni ochish uchun shajara tahrirchisi albom kanalini ulashi kerak.')}</div></div></div>`;
  const section = (a, items) => `<div class="alb-head"><div class="grow"><div class="h2 ellipsis">${a.priv ? '🔒' : '📁'} ${esc(nm(a.name))}</div><div class="small muted">${t('{n} ta fayl', { n: items.length })}${a.priv ? ` · ${t('{name} oilasi uchun yopiq', { name: esc(nm(a.priv.headName)) })} · 👥 ${a.members}` : ''}</div></div>
      ${a.owner && a.ch ? `<button class="btn btn-soft btn-sm" data-alb-ch="${a.id}">📡</button>` : ''}
      ${a.owner ? `<button class="btn btn-soft btn-sm" data-alb-inv="${a.id}">👥 ${t('A’zolar')}</button>` : ''}
      ${a.mine ? `<button class="icon-btn" data-alb-menu="${a.id}">${I.more}</button>` : ''}</div>
    ${a.priv && !a.ch ? `<${a.owner ? `button data-alb-ch="${a.id}"` : 'div'} class="card banner" style="margin:4px 0 10px"><div style="font-size:22px">📡</div><div class="grow"><b>${t('Yopiq kanal ulanmagan')}</b><div class="small muted">${a.owner ? t('Fayl yuklash uchun bu albomga alohida yopiq Telegram kanal ulang') : t('Albom egasi yopiq kanal ulagach, fayl yuklash mumkin bo‘ladi')}</div></div>${a.owner ? I.chev + '</button>' : '</div>'}` : ''}
    ${a.priv && !items.length ? `<div class="small muted" style="padding:4px 2px 10px">${t('Bu albomni faqat siz qabul qilgan oila a’zolari ko‘radi. «Qo‘shish» orqali surat va videolarni yuklang.')}</div>` : ''}
    <div class="grid">${items.map(tile).join('')}</div>`;
  let body;
  if (!A.items.length && !A.albums.some((a) => a.priv)) {
    body = `<div class="empty"><div class="big">📸</div><b>${t('Albom hali bo‘sh')}</b><p class="small">${t('Oilaviy rasm, video va hujjatlarni qo‘shing — butun oila ko‘ra oladi.')}</p></div>`;
  } else if (f === 'all') {
    body = A.albums.filter((a) => counts[a.id] || a.priv).map((a) => section(a, A.items.filter((it) => it.album === a.id))).join('');
  } else {
    const a = A.albums.find((x) => x.id === f);
    body = a ? section(a, A.items.filter((it) => it.album === f)) : '';
  }
  const cur = A.albums.find((a) => a.id === f);
  el.innerHTML = `<div class="scroll ${S.sel ? 'sel-mode' : ''}" style="padding-top:8px">
    ${banner}
    <div class="alb-bar"><button class="chip on alb-pick" id="alb-pick"><span class="ellipsis">${cur ? `${cur.priv ? '🔒' : '📁'} ${esc(nm(cur.name))} · ${counts[cur.id] || 0}` : `📚 ${t('Hammasi')} · ${A.items.length}`}</span><b>▾</b></button>
      ${A.items.length ? `<button class="chip ${S.sel ? 'on' : ''}" id="sel-tg" title="${t('Tanlash')}">☑️</button>` : ''}
      ${A.canUpload && inTelegram ? `<button class="chip" id="priv-new">🔒 ${t('Yopiq albom')}</button>` : ''}</div>
    ${body}
    <div style="height:${S.sel ? 150 : 90}px"></div></div>
    ${S.sel ? `<div class="sel-bar card"><div class="row" style="gap:8px;align-items:center"><b id="sel-n">${S.sel.size}</b><span class="muted small grow">${t('ta tanlandi')}</span>
        <button class="chip" id="sel-all">${t('Hammasini tanlash')}</button><button class="icon-btn" id="sel-x">${I.close}</button></div>
      <div class="sel-acts"><button data-sa="send">📤<span>${t('Yuborish')}</span></button><button data-sa="zip">🗜<span>ZIP</span></button><button data-sa="move">📁<span>${t('Ko‘chirish')}</span></button><button data-sa="delete" class="danger">🗑<span>${t('O‘chirish')}</span></button></div></div>`
    : A.canUpload ? `<button class="fab" id="add">${I.plus}<span>${t('Qo‘shish')}</span></button>` : ''}`;
  // albomlar ro'yxati — bitta tugmada; tanlangani ochiladi
  el.querySelector('#alb-pick').onclick = () => {
    const row = (id, ic, name, n) => `<button class="card alb-opt ${f === id ? 'on' : ''}" data-pick="${id}"><span style="font-size:20px">${ic}</span><b class="grow ellipsis">${name}</b><span class="muted small">${n}</span></button>`;
    const sh = openSheet(`<div class="sheet-head"><div class="h2 grow">📚 ${t('Albomlar')}</div><button class="icon-btn" data-close>${I.close}</button></div>
      <div class="sheet-body">${row('all', '📚', t('Hammasi'), A.items.length)}${albums.map((a) => row(a.id, a.priv ? '🔒' : '📁', esc(nm(a.name)), counts[a.id] || 0)).join('')}</div>`);
    sh.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { S.albumFilter = b.dataset.pick; haptic('light'); closeAllSheets(); renderAlbumTab(el); }));
  };
  const order = (f === 'all' ? A.albums.filter((a) => counts[a.id]).flatMap((a) => A.items.filter((it) => it.album === a.id)) : A.items.filter((it) => it.album === f)).map((it) => it.id);
  el.querySelectorAll('[data-item]').forEach((b) => {
    // bosib turish (0.45 s) — tanlash rejimi yoqiladi va shu fayl belgilanadi
    let lp = null;
    let xy = null;
    const stop = () => { clearTimeout(lp); lp = null; };
    b.addEventListener('pointerdown', (e) => {
      xy = [e.clientX, e.clientY];
      stop();
      lp = setTimeout(() => { S.lpAt = Date.now(); haptic('medium'); (S.sel ||= new Set()).add(b.dataset.item); renderAlbumTab(el); }, 450);
    });
    b.addEventListener('pointermove', (e) => { if (lp && Math.hypot(e.clientX - xy[0], e.clientY - xy[1]) > 10) stop(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, stop));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  el.querySelectorAll('[data-item]').forEach((b) => (b.onclick = () => {
    if (Date.now() - (S.lpAt || 0) < 700) return; // bosib turishdan keyingi «click»
    if (!S.sel) return openViewer(order, order.indexOf(b.dataset.item));
    const id = b.dataset.item;
    S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id);
    b.classList.toggle('sel', S.sel.has(id));
    el.querySelector('#sel-n').textContent = S.sel.size;
    haptic('light');
  }));
  // fayl menejeri: tanlash rejimi
  el.querySelector('#sel-tg')?.addEventListener('click', () => { S.sel = S.sel ? null : new Set(); renderAlbumTab(el); });
  el.querySelector('#sel-x')?.addEventListener('click', () => { S.sel = null; renderAlbumTab(el); });
  el.querySelector('#sel-all')?.addEventListener('click', () => {
    if (order.every((id) => S.sel.has(id))) order.forEach((id) => S.sel.delete(id)); else order.forEach((id) => S.sel.add(id));
    renderAlbumTab(el);
  });
  el.querySelectorAll('[data-sa]').forEach((b) => (b.onclick = () => selAction(b.dataset.sa)));
  el.querySelectorAll('[data-alb-menu]').forEach((b) => (b.onclick = () => albumMenu(b.dataset.albMenu)));
  el.querySelectorAll('[data-alb-inv]').forEach((b) => (b.onclick = () => privMembers(b.dataset.albInv)));
  el.querySelectorAll('[data-alb-ch]').forEach((b) => (b.onclick = () => privChannelSheet(b.dataset.albCh)));

  el.querySelector('#priv-new')?.addEventListener('click', privAlbumSheet);
  el.querySelector('#add')?.addEventListener('click', uploadSheet);
  el.querySelector('#ch-banner')?.addEventListener('click', () => linkSheet('channel'));
}

// Shox oilasining maxfiy albomi: yaratish (o'zi egallagan shox uchun) va oila a'zolarini taklif qilish
async function privAlbumSheet() {
  let heads = [];
  try { heads = (await api('album/heads')).heads; } catch (err) { return toast(err.message, true); }
  if (!heads.length) {
    toast(t('Avval shajarada o‘zingizni belgilang — shunda oilangiz uchun albom ochish mumkin'), true);
    return whoAmISheet();
  }
  const sh = openSheet(`<div class="sheet-head"><div class="h2 grow">🔒 ${t('Oilaviy albom')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body"><p class="small muted" style="margin-top:0">${t('Bu albomni faqat tanlangan oila a’zolari ko‘radi. Boshqa oilalar va begonalar ko‘ra olmaydi.')} ${t('Fayllar shu albom uchun alohida ochiladigan yopiq Telegram kanalda saqlanadi.')}</p>
    <div class="field"><label>${t('Qaysi oila uchun')}</label><select class="input" name="head">${heads.map((h) => `<option value="${h.id}">${esc(nm(h.name))} ${t('oilasi')}</option>`).join('')}</select></div>
    <div class="field"><label>${t('Albom nomi')}</label><input class="input" name="name" maxlength="60" value="${esc(t('{name} oilasi', { name: nm(heads[0].name) }))}"></div>
    <button class="btn btn-primary btn-block" id="pa-go">${t('Yaratish')}</button></div>`);
  const sel = sh.querySelector('[name=head]');
  sel.onchange = () => (sh.querySelector('[name=name]').value = t('{name} oilasi', { name: nm(heads.find((h) => h.id === sel.value)?.name || '') }));
  sh.querySelector('#pa-go').onclick = async (e) => {
    e.currentTarget.disabled = true;
    try {
      const r = await api('album', { method: 'POST', body: { priv: sel.value, name: sh.querySelector('[name=name]').value } });
      closeAllSheets();
      S.albumFilter = r.album.id;
      await refreshAlbum();
      toast(t('Oilaviy albom yaratildi 🔒'));
      privChannelSheet(r.album.id);
    } catch (err) { toast(err.message, true); e.target.disabled = false; }
  };
}
// Yopiq albomning alohida kanali: egasi hech kim kirmaydigan yangi yopiq kanal ochadi va botni qo'shadi — o'zi ulanadi
function privChannelSheet(aid) {
  const a = S.album?.albums.find((x) => x.id === aid);
  const old = a?.ch?.id || null;
  const sh = openSheet(`<div class="sheet-head"><div class="h2 grow">📡 ${t('Yopiq albom kanali')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body"><p class="small muted" style="margin-top:0">${t('Bu albom fayllari alohida yopiq Telegram kanalda saqlanadi. Oila a’zolari ularni shu ilovada ko‘radi — kanalga hech kim kirmasligi kerak.')}</p>
      ${a?.ch ? `<div class="card" style="padding:4px 0;margin-bottom:12px"><div class="log-item"><div class="dot">✅</div><div class="grow"><b>${esc(a.ch.title)}</b></div></div></div>` : ''}
      <div id="lk"><ol class="steps"><li>${t('Telegramda <b>yangi yopiq kanal</b> oching (masalan: «{title} albomi»). Unga hech kimni qo‘shmang va havolasini hech kimga bermang.', { title: esc(nm(a?.name || '')) })}</li>
        <li>${t('Pastdagi tugmani bosing va o‘sha kanalni tanlang — bot admin bo‘ladi va kanal avtomatik ulanadi.')}</li></ol>
      <button class="btn btn-primary btn-block" id="gen">${t(a?.ch ? 'Boshqa kanal ulash' : 'Botni kanalga qo‘shish')}</button></div></div>`);
  sh.querySelector('#gen').onclick = async (e) => {
    const gen = e.currentTarget;
    gen.disabled = true;
    try {
      const r = await api(`album/a/${aid}/linkcode`, { method: 'POST', body: {} });
      awaitLink(sh, {
        code: r.code, url: `https://t.me/${r.bot}?startchannel&admin=post_messages+edit_messages+delete_messages+invite_users`,
        done: async () => {
          const ch = (await loadAlbum(true)).albums.find((x) => x.id === aid)?.ch;
          const ok = !!ch && ch.id !== old;
          if (ok) { closeAllSheets(); toast(t('Kanal ulandi ✅')); refreshAlbum(); }
          return ok;
        },
      });
    } catch (err) { toast(err.message, true); gen.disabled = false; }
  };
}

// Bu odam menga kim? (shajarada o'zini belgilagan bo'lsa) — «Nevarasi» → «Nevarangiz»
function meKin(p) {
  const me = S.tree.me?.pid && S.fam.get(S.tree.me.pid);
  if (!me || me.id === p.id) return '';
  const k = kinship(S.fam, me, p, t, nm)?.term || '';
  if (!k || !['uz', 'uzc'].includes(LANG)) return k;
  const w = k.split(' ');
  w[0] = /si$/i.test(w[0]) ? w[0].slice(0, -2) + 'ngiz' : /и$|i$/i.test(w[0]) ? w[0].slice(0, -1) + 'ingiz' : w[0];
  return w.join(' ');
}
// O'z oilasining to'liqligi (o'zi, juftlari va avlodlari)
function myFamilyStats() {
  const me = S.tree.me?.pid && S.fam.get(S.tree.me.pid);
  if (!me) return null;
  const ids = new Set([me.id]);
  const walk = (id) => S.fam.children(id).forEach((c) => { if (!ids.has(c.id)) { ids.add(c.id); walk(c.id); } });
  walk(me.id);
  for (const id of [...ids]) for (const sp of S.fam.spouses(S.fam.get(id))) ids.add(sp.id);
  const list = [...ids].map((id) => S.fam.get(id)).filter(Boolean);
  const ok = list.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.birth || '') && (!x.deceased || /^\d{4}-\d{2}-\d{2}$/.test(x.death || ''))).length;
  return { total: list.length, pct: Math.round((ok / list.length) * 100) };
}
async function fillMyFamily() {
  try {
    const r = await api('me/branch', { method: 'POST' });
    store.set('sh_ob2_' + S.tree.id, 1);
    closeAllSheets();
    S.treeView = null;
    renderBranchWizard(r.treeId, r.bid);
  } catch (err) { toast(err.message, true); if (!S.tree.me?.pid) whoAmISheet(); }
}
// «Mening oilam» qatori va yangi a'zo uchun 3 qadam (daraxt bo'limi tepasida)
function myBar(el) {
  const tr = S.tree;
  if (!inTelegram || !tr.me) return;
  const me = tr.me.pid && S.fam.get(tr.me.pid);
  const bar = el.querySelector('#my-bar');
  const go = (id) => { if (!id) return; haptic('light'); S.treeView?.focus(id, { k: 1 }); setTimeout(() => personSheet(id), 250); };
  const st = myFamilyStats();
  // 1) o'zini belgilash — majburiy; 2) oila to'liqligi — shunchaki eslatma; 3) avatar yo'q bo'lsa — ixtiyoriy taklif
  const steps = !me ? `<button class="card ob-card ob-fill" id="ob1">👤 ${t('Shajarada o‘zingizni belgilang')}</button>`
    : (st && st.pct < 100 ? `<button class="card ob-card ob-fill" id="ob2">📋 ${t('Oilangiz {pct}% to‘liq — to‘ldirasizmi?', { pct: st.pct })}</button>` : '')
      + (!me.photo && !store.get('sh_noph_' + tr.id, 0) ? `<div class="card ob-card ob-fill row" style="flex-direction:row;align-items:center;gap:8px"><span class="grow">📷 ${t('Profilingizga surat qo‘ying')}</span>
          <button class="btn btn-primary btn-sm" id="ob3">${t('Qo‘yish')}</button><button class="icon-btn sm" id="ob3x">${I.close}</button></div>` : '');
  const kids = me ? S.fam.children(me.id) : [];
  const sp = me ? S.fam.spouses(me)[0] : null;
  const par = me && (S.fam.father(me) || S.fam.mother(me));
  bar.innerHTML = (me ? `<div class="my-chips">
      <button class="chip on" data-my="me">👤 ${t('Men')}</button>
      ${par ? `<button class="chip" data-my="par">👪 ${t('Ota-onam')}</button>` : ''}
      ${sp ? `<button class="chip" data-my="sp">💍 ${t('Turmush o‘rtog‘im')}</button>` : ''}
      ${kids.length ? `<button class="chip" data-my="kids">👶 ${t('Farzandlarim')} · ${kids.length}</button>` : ''}
      <button class="chip" data-my="alb">🔒 ${t('Oilaviy albomim')}</button></div>` : '') + steps;
  bar.querySelectorAll('[data-my]').forEach((b) => (b.onclick = async () => {
    const k = b.dataset.my;
    if (k === 'me') go(me.id);
    if (k === 'par') go(par.id);
    if (k === 'sp') go(sp.id);
    if (k === 'kids') go(kids[0].id);
    if (k === 'alb') {
      const A = await loadAlbum().catch(() => null);
      const a = A?.albums.find((x) => x.priv);
      if (a) { S.albumFilter = a.id; switchTab('album'); } else privAlbumSheet();
    }
  }));
  bar.querySelector('#ob1')?.addEventListener('click', () => whoAmISheet(true));
  bar.querySelector('#ob2')?.addEventListener('click', fillMyFamily);
  bar.querySelector('#ob3')?.addEventListener('click', () => photoMenu(me));
  bar.querySelector('#ob3x')?.addEventListener('click', () => { store.set('sh_noph_' + tr.id, 1); myBar(el); });
}
// Telefonda ishlaydigan AI (Real-ESRGAN slim, UpscalerJS + TensorFlow.js) — kerak bo'lganda yuklanadi (~2.4 MB)
const loadJs = (src) => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error(t('Yuklab bo‘lmadi. Internetni tekshiring'))); document.head.append(s); });
let upscalerP = null;
function getUpscaler() {
  return (upscalerP ||= (async () => {
    window.DefaultUpscalerJSModel ||= {};
    if (!window.tf) await loadJs('/vendor/tf.min.js');
    if (!window.Upscaler) await loadJs('/vendor/upscaler.min.js');
    return new window.Upscaler({ model: { scale: 2, modelType: 'layers', path: '/vendor/esrgan-x2/model.json', inputRange: [0, 255], outputRange: [0, 255] } });
  })().catch((e) => { upscalerP = null; throw e; }));
}
async function localUpscale(src, onP, noShrink) {
  const up = await getUpscaler();
  let img = src;
  if (!(src instanceof HTMLCanvasElement)) {
    img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    await img.decode();
  } else { img.naturalWidth = src.width; img.naturalHeight = src.height; }
  // telefon kuchi uchun: kirish 1000 px gacha (natija 2000 px); WebGL yo'q bo'lsa (sekin) — 500 px
  await window.tf.ready();
  const lim = window.tf.getBackend() === 'webgl' ? 1000 : 500;
  const k = Math.min(1, lim / Math.max(img.naturalWidth, img.naturalHeight));
  if (noShrink && k < 1) return src instanceof HTMLCanvasElement ? src.toDataURL('image/jpeg', 0.92) : src; // kichraytirib kattalashtirish — sifatni pasaytiradi
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const out = await up.upscale(c, { patchSize: 64, padding: 6, output: 'tensor', progress: (p) => onP?.(p) });
  const oc = document.createElement('canvas');
  oc.width = out.shape[1]; oc.height = out.shape[0];
  const px = await window.tf.browser.toPixels(window.tf.tidy(() => out.clipByValue(0, 255).cast('int32')));
  out.dispose();
  oc.getContext('2d').putImageData(new ImageData(px, oc.width, oc.height), 0, 0);
  return oc.toDataURL('image/jpeg', 0.92);
}
// AI uchun tayyorlash: telefon skrinshotidagi qora tasmalar (holat paneli, tugmalar) kesiladi, uzun tomoni ≤1600 px.
// Natija: { img: base64 JPEG (serverga), url: dataURL — solishtirishda «Asl» sifatida }
async function prepForAI(src) {
  const img = new Image(); img.crossOrigin = 'anonymous'; img.src = src; await img.decode();
  const [x0, y0, x1, y1] = screenshotCrop(img, img.naturalWidth, img.naturalHeight);
  const w = x1 - x0, h = y1 - y0, k = Math.min(1, 1600 / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(img, x0, y0, w, h, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.92);
  return { img: url.split(',')[1], url };
}
// Telefon skrinshoti (rasm ko'rish oynasi): tepa va pastda qop-qora tasmalar — faqat rasmning o'zi qoldiriladi.
// Oddiy fotosuratlarga tegilmaydi: faqat cho'ziq (≥1.7:1) rasmda va ikki chetida ham qora tasma bo'lsa.
function screenshotCrop(img, W, H) {
  const full = [0, 0, W, H];
  if (Math.max(W, H) / Math.min(W, H) < 1.7) return full;
  const k = Math.min(1, 480 / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, w, h);
  const p = ctx.getImageData(0, 0, w, h).data, tall = H >= W, n = tall ? h : w, m = tall ? w : h;
  const dark = (a) => { let d = 0; for (let b = 0; b < m; b++) { const i = (tall ? a * w + b : b * w + a) * 4; if (p[i] * 77 + p[i + 1] * 150 + p[i + 2] * 29 < 18 * 256) d++; } return d / m; };
  const D = Array.from({ length: n }, (_, a) => dark(a));
  let s0 = 0, s1 = 0; // eng uzun oraliq, unda qop-qora (interfeys) qator yo'q — rasmning o'zi
  for (let a = 0; a < n;) { if (D[a] < 0.99) { let b = a; while (b < n && D[b] < 0.99) b++; if (b - a > s1 - s0) { s0 = a; s1 = b; } a = b; } else a++; }
  if (s1 - s0 < n * 0.25 || s0 < n * 0.04 || n - s1 < n * 0.04) return full;
  const f = (tall ? H : W) / n;
  return tall ? [0, Math.round(s0 * f), W, Math.round(s1 * f)] : [Math.round(s0 * f), 0, Math.round(s1 * f), H];
}
const dataBlob = (u) => { const [h, b] = u.split(','); const s = atob(b); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return new Blob([a], { type: h.slice(5).split(';')[0] }); };
// ✨ Rasm sifatini oshirish: tanlash → natija (oldin/keyin) → albomga alohida nusxa (asli qoladi)
function enhanceSheet(it) {
  const sh = openSheet(`<div class="sheet-head"><div class="h2 grow">✨ ${t('Sifatni oshirish')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body" id="en-b"><div style="display:grid;gap:10px">
      <button class="card banner" data-m="restore" style="text-align:left"><div style="font-size:24px">🪄</div><div class="grow"><b>${t('Sifatli qilish (AI)')}</b><div class="small muted">${t('Rasm o‘z holicha qoladi: odamlar, ranglar, joylashuv o‘zgarmaydi. Tiniqlashadi, yuzlar aniqlashadi, o‘lchami 2 barobar kattalashadi.')}</div></div></button>
      ${S.album?.rcol ? `<label class="row card" style="padding:10px 12px;gap:10px"><input type="checkbox" id="en-col"><div class="grow"><b>🎨 ${t('Oq-qora rasmni rangli qilish')}</b><div class="small muted">${t('Belgilansa — AI oq-qora rasmga tabiiy rang beradi. Belgilanmasa rasm o‘z rangida qoladi.')}</div></div></label>` : ''}
      <button class="card banner" data-m="fix" style="text-align:left"><div style="font-size:24px">🩹</div><div class="grow"><b>${t('Shikastlarni tuzatish')}</b><div class="small muted">${t('Tirnalgan, ko‘chgan, dog‘ tushgan joylarni barmoq bilan bo‘yang — atrofdagi rasm bilan to‘ldiriladi, so‘ng tiniqlashtiriladi. Bepul.')}</div></div></button>
      <button class="card banner" data-m="up" style="text-align:left"><div style="font-size:24px">🔍</div><div class="grow"><b>${t('Telefonda tiniqlashtirish')}</b><div class="small muted">${t('Internetsiz, oddiyroq usul: rasm 2 barobar kattalashib, biroz tiniqlashadi.')}</div></div></button>
      <div class="small muted">${t('Asl rasm o‘zgarmaydi. Natija yoqsa — albomga alohida nusxa bo‘lib qo‘shiladi.')}</div></div></div>`);
  sh.classList.add('over-rv');
  const box = sh.querySelector('#en-b');
  sh.querySelectorAll('[data-m]').forEach((b) => (b.onclick = async () => {
    const mode = b.dataset.m;
    if (mode === 'fix') return repairEditor(it, sh, box);
    const color = !!sh.querySelector('#en-col')?.checked;
    box.innerHTML = `<div class="empty"><span class="spin" style="color:var(--primary)"></span><div class="small muted" style="margin-top:10px" id="en-p">${mode === 'restore' ? t('AI ishlamoqda… 30–90 soniya') : t('AI ishlamoqda…')}</div></div>`;
    try {
      // telefonda tiniqlashtirish — qurilmaning o'zida; «sifatli qilish» — serverda (HF Space)
      const prog = (p) => { const el = box.querySelector('#en-p'); if (el) el.textContent = `${t('AI ishlamoqda…')} ${Math.round(p * 100)}%`; };
      let r, asl = it.src || it.thumb;
      if (mode === 'up') r = { url: await localUpscale(it.src, prog) };
      else {
        const prep = await prepForAI(it.src);
        asl = prep.url; // skrinshot chetlari kesilgan bo'lsa ham bir xil solishtirish
        r = await api(`album/i/${it.id}/enhance`, { method: 'POST', body: { img: prep.img, color }, timeout: 290000 });
      }
      box.innerHTML = `<div class="cmp" id="cmp"><img src="${r.url}" alt=""><div class="cmp-a"><img src="${asl}" alt=""></div><input type="range" min="0" max="100" value="50" id="cmp-r"><span class="cmp-l">${t('Asl')}</span><span class="cmp-r">${t('Yangi')}</span></div>
        <div class="small muted" style="margin:8px 2px">${t('Chiziqni suring va solishtiring. Yuzlar tanib bo‘lmas darajada o‘zgargan bo‘lsa — saqlamang.')}</div>
        <button class="btn btn-primary btn-block" id="en-s">💾 ${t('Albomga saqlash (asli ham qoladi)')}</button>`;
      const cmp = box.querySelector('#cmp');
      const set = (v) => cmp.style.setProperty('--x', v + '%');
      set(50);
      box.querySelector('#cmp-r').oninput = (e) => set(e.target.value);
      box.querySelector('#en-s').onclick = async (e) => {
        e.currentTarget.disabled = true;
        try {
          if (r.url.startsWith('data:')) {
            const blob = dataBlob(r.url); // fetch(data:) CSP (connect-src) da bloklanadi
            await uploadOriginal(new File([blob], 'enhanced.jpg', { type: blob.type || 'image/jpeg' }), { album: it.album, caption: `✨ ${it.caption || ''}`.trim() });
          } else await api(`album/i/${it.id}/enhance`, { method: 'POST', body: { rid: r.rid, color }, timeout: 90000 });
          toast(t('Saqlandi ✓')); closeTopSheet(); loadAlbum(true).catch(() => {}); } catch (err) { toast(err.message, true); e.currentTarget.disabled = false; }
      };
    } catch (err) { box.innerHTML = `<div class="empty small muted">${esc(err.message)}</div>`; }
  }));
}

// alohida oyna (yuklashdan keyin): yopilganda keyingi rasmga o'tiladi
function repairSheet(it) {
  return new Promise((done) => {
    const sh = openSheet(`<div class="sheet-head"><div class="h2 grow">🩹 ${t('Shikastlarni tuzatish')}</div><button class="icon-btn" data-close>${I.close}</button></div><div class="sheet-body" id="en-b"></div>`);
    new MutationObserver((_, o) => { if (!sh.isConnected) { o.disconnect(); done(); } }).observe(document.body, { childList: true, subtree: true });
    repairEditor(it, sh, sh.querySelector('#en-b'));
  });
}
// 🩹 Shikastlarni tuzatish: barmoq bilan belgilash (+ avto-taklif) → to'ldirish → darajalar → ESRGAN 2× → keskinlik
async function repairEditor(it, sh, box) {
  box.innerHTML = `<div class="empty"><span class="spin" style="color:var(--primary)"></span></div>`;
  let R, img;
  try {
    R = await import('./restore.js?v=1');
    img = new Image(); img.crossOrigin = 'anonymous'; img.src = it.src; await img.decode();
  } catch (err) { box.innerHTML = `<div class="empty small muted">${esc(err.message)}</div>`; return; }
  const k = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * k), H = Math.round(img.naturalHeight * k);
  box.innerHTML = `<div class="rp-wrap" id="rpw"><div class="rp-in" id="rpi"><canvas id="rpb"></canvas><canvas id="rpm" class="rp-m"></canvas></div></div>
    <div class="seg" id="rpt" style="margin-top:8px"><button type="button" class="on" data-t="paint">🖌 ${t('Bo‘yash')}</button><button type="button" data-t="erase">🧽 ${t('O‘chirish')}</button><button type="button" data-t="pan">✋ ${t('Surish')}</button></div>
    <div class="row" style="gap:8px;margin-top:8px;align-items:center"><span class="small muted">${t('Cho‘tka')}</span><input type="range" id="rps" min="3" max="60" value="14" class="grow">
      <button type="button" class="btn btn-ghost btn-sm" id="rpz">🔍 1×</button><button type="button" class="btn btn-ghost btn-sm" id="rpu">↩️</button></div>
    <div class="small muted" style="margin:8px 2px">${t('Shikastlangan joylarni (oq dog‘, ko‘chgan, tirnalgan) qizil bilan bo‘yang. Mayda joylar uchun 🔍 bilan kattalashtiring. Ko‘z, nishon kabi joylarga tegmang.')}</div>
    <div class="row" style="gap:8px"><button type="button" class="btn btn-ghost grow" id="rpa">🤖 ${t('Avto-topish')}</button><button type="button" class="btn btn-primary grow" id="rpg">✨ ${t('Tuzatish')}</button></div>`;
  const cb = box.querySelector('#rpb'), cm = box.querySelector('#rpm'), wrap = box.querySelector('#rpw'), inner = box.querySelector('#rpi');
  cb.width = cm.width = W; cb.height = cm.height = H;
  const bx = cb.getContext('2d', { willReadFrequently: true }), mx = cm.getContext('2d', { willReadFrequently: true });
  bx.drawImage(img, 0, 0, W, H);
  let tool = 'paint', zoom = 1, last = null;
  const hist = [];
  const snap = () => { hist.push(mx.getImageData(0, 0, W, H)); if (hist.length > 8) hist.shift(); };
  box.querySelectorAll('#rpt button').forEach((b) => (b.onclick = () => {
    tool = b.dataset.t;
    box.querySelectorAll('#rpt button').forEach((x) => x.classList.toggle('on', x === b));
    cm.style.touchAction = tool === 'pan' ? 'auto' : 'none';
  }));
  box.querySelector('#rpz').onclick = (e) => {
    zoom = zoom >= 3 ? 1 : zoom + 1;
    inner.style.width = zoom * 100 + '%';
    e.currentTarget.textContent = `🔍 ${zoom}×`;
  };
  box.querySelector('#rpu').onclick = () => { const d = hist.pop(); if (d) mx.putImageData(d, 0, 0); else mx.clearRect(0, 0, W, H); };
  const pt = (e) => { const r = cm.getBoundingClientRect(); return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height]; };
  const stroke = (a, b) => {
    const sz = +box.querySelector('#rps').value * Math.max(1, W / 1000) / Math.sqrt(zoom);
    mx.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
    mx.strokeStyle = mx.fillStyle = '#ff2d2d'; mx.lineWidth = sz; mx.lineCap = mx.lineJoin = 'round';
    mx.beginPath(); mx.moveTo(...a); mx.lineTo(...b); mx.stroke();
  };
  cm.style.touchAction = 'none';
  cm.addEventListener('pointerdown', (e) => { if (tool === 'pan') return; snap(); cm.setPointerCapture(e.pointerId); last = pt(e); stroke(last, last); });
  cm.addEventListener('pointermove', (e) => { if (!last) return; const p = pt(e); stroke(last, p); last = p; });
  const end = () => (last = null);
  cm.addEventListener('pointerup', end); cm.addEventListener('pointercancel', end);
  box.querySelector('#rpa').onclick = () => {
    snap();
    const m = R.detectDefects(bx.getImageData(0, 0, W, H).data, W, H);
    const o = mx.getImageData(0, 0, W, H);
    for (let i = 0; i < m.length; i++) if (m[i]) { o.data[i * 4] = 255; o.data[i * 4 + 1] = 45; o.data[i * 4 + 2] = 45; o.data[i * 4 + 3] = 255; }
    mx.putImageData(o, 0, 0);
    toast(t('Topilgan joylarni tekshiring: keraksizini 🧽 bilan o‘chiring'));
  };
  box.querySelector('#rpg').onclick = async () => {
    const md = mx.getImageData(0, 0, W, H).data, mask = new Uint8Array(W * H);
    for (let i = 0; i < mask.length; i++) mask[i] = md[i * 4 + 3] > 20 ? 1 : 0;
    box.innerHTML = `<div class="empty"><span class="spin" style="color:var(--primary)"></span><div class="small muted" style="margin-top:10px" id="en-p">${t('Tuzatilmoqda…')}</div></div>`;
    try {
      await new Promise((r) => setTimeout(r, 30));
      const d = bx.getImageData(0, 0, W, H);
      R.inpaint(d.data, W, H, R.dilate(mask, W, H, 1));
      R.levels(d.data);
      bx.putImageData(d, 0, 0);
      const prog = (p) => { const el = box.querySelector('#en-p'); if (el) el.textContent = `${t('AI tiniqlashtirmoqda…')} ${Math.round(p * 100)}%`; };
      let url = await localUpscale(cb, prog, true).catch(() => null);
      if (!url) { R.sharpen(cb, 0.5); url = cb.toDataURL('image/jpeg', 0.92); }
      else {
        const im2 = new Image(); im2.src = url; await im2.decode();
        const c2 = document.createElement('canvas'); c2.width = im2.width; c2.height = im2.height;
        c2.getContext('2d').drawImage(im2, 0, 0); R.sharpen(c2, 0.35); url = c2.toDataURL('image/jpeg', 0.92);
      }
      box.innerHTML = `<div class="cmp" id="cmp"><img src="${url}" alt=""><div class="cmp-a"><img src="${it.src || it.thumb}" alt=""></div><input type="range" min="0" max="100" value="50" id="cmp-r"><span class="cmp-l">${t('Asl')}</span><span class="cmp-r">${t('Yangi')}</span></div>
        <div class="small muted" style="margin:8px 2px">${t('Chiziqni suring va solishtiring.')}</div>
        <div class="row" style="gap:8px"><button class="btn btn-ghost grow" id="en-again">🩹 ${t('Yana tuzatish')}</button><button class="btn btn-primary grow" id="en-s">💾 ${t('Saqlash')}</button></div>`;
      const cmp = box.querySelector('#cmp');
      cmp.style.setProperty('--x', '50%');
      box.querySelector('#cmp-r').oninput = (e) => cmp.style.setProperty('--x', e.target.value + '%');
      // natija ustida yana davom ettirish (qolgan dog'lar uchun)
      box.querySelector('#en-again').onclick = () => repairEditor({ ...it, src: url }, sh, box);
      box.querySelector('#en-s').onclick = async (e) => {
        e.currentTarget.disabled = true;
        try {
          await uploadOriginal(new File([dataBlob(url)], 'restored.jpg', { type: 'image/jpeg' }), { album: it.album, caption: `🩹 ${it.caption || ''}`.trim() });
          toast(t('Saqlandi ✓')); closeTopSheet(); loadAlbum(true).catch(() => {});
        } catch (err) { toast(err.message, true); e.currentTarget.disabled = false; }
      };
    } catch (err) { box.innerHTML = `<div class="empty small muted">${esc(err.message)}</div>`; }
  };
}

// «Rasmdagilar kim?» — shajaradan belgilash
function tagSheet(it, onDone) {
  let tags = [...(it.tags || [])];
  const sh = openSheet(`<div class="sheet-head"><div class="h2 grow">👥 ${t('Rasmdagilar kim?')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body"><div id="tg-on" class="tag-list"></div>
    <input class="input" id="tg-q" placeholder="${t('Ismini yozing…')}" autocomplete="off" style="margin-top:10px"><div id="tg-res"></div>
    <button class="btn btn-primary btn-block" id="tg-save" style="margin-top:12px">${t('Saqlash')}</button>
    ${inTelegram ? `<button class="btn btn-soft btn-block" id="tg-ask" style="margin-top:8px">❓ ${t('Bilmayman — oiladan so‘rash')}</button>` : ''}</div>`);
  sh.classList.add('over-rv');
  sh.querySelector('#tg-ask')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try { const r = await api(`album/i/${it.id}/ask`, { method: 'POST' }); toast(t('So‘rov yuborildi: {n} kishi ✓', { n: r.n })); } catch (err) { toast(err.message, true); }
  });
  const on = sh.querySelector('#tg-on');
  const drawOn = () => {
    on.innerHTML = tags.map((id) => `<button class="chip on" data-rm="${id}">${esc(nm(S.fam.get(id)?.name || '?'))} ✕</button>`).join('') || `<div class="small muted">${t('Hali hech kim belgilanmagan')}</div>`;
    on.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { tags = tags.filter((x) => x !== b.dataset.rm); drawOn(); }));
  };
  sh.querySelector('#tg-q').oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    const xs = q.length < 2 ? [] : S.tree.persons.filter((p) => nm(p.name).toLowerCase().includes(q) && !tags.includes(p.id)).slice(0, 12);
    const res = sh.querySelector('#tg-res');
    res.innerHTML = xs.map((p) => `<button class="ppl-row" data-add="${p.id}">${avatar(p, 32)}<span class="grow"><b>${esc(nm(p.name))}</b> <span class="small muted">${p.birth ? String(p.birth).slice(0, 4) : ''}</span></span>➕</button>`).join('');
    res.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => { tags.push(b.dataset.add); drawOn(); e.target.value = ''; res.innerHTML = ''; }));
  };
  drawOn();
  sh.querySelector('#tg-save').onclick = async () => {
    try { const r = await api(`album/i/${it.id}/tags`, { method: 'POST', body: { tags } }); it.tags = r.tags; closeTopSheet(); toast(t('Saqlandi ✓')); onDone?.(); } catch (err) { toast(err.message, true); }
  };
}

// «Shajarada siz kimsiz?»: foydalanuvchini shaxsga bog'lash (keyin o'zgartirish mumkin)
function whoAmISheet(must) {
  const tr = S.tree;
  if (!inTelegram || !tr.me) return;
  must = must === true && !tr.me.pid;
  const label = (p) => `${nm(p.name)}${patronymic(p) ? ' ' + nm(patronymic(p)) : ''}`;
  const sub = (p) => [p.birth ? String(p.birth).slice(0, 4) : '', S.fam.get(p.father_id) ? t('otasi: {name}', { name: nm(S.fam.get(p.father_id).name) }) : ''].filter(Boolean).join(' · ');
  const sh = openSheet(`<div class="sheet-head"><div class="h2 grow">👤 ${t('Shajarada siz kimsiz?')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body"><p class="small muted" style="margin-top:0">${t('O‘zingizni toping va tanlang. Shunda bot sizni taniydi: oilangiz, albomlaringiz va eslatmalar sizga moslashadi. Adashsangiz, «Ko‘proq» bo‘limida o‘zgartirasiz.')}</p>
    <input class="input" id="wa-q" placeholder="${t('Ismingizni yozing…')}" autocomplete="off">
    <div id="wa-list" style="margin-top:8px"></div>
    <button class="btn btn-ghost btn-block" id="wa-none" style="margin-top:10px">${t('Men shajarada yo‘qman')}</button></div>`);
  const wrap = sh.parentElement;
  if (must) {
    // majburiy qadam: yopib bo'lmaydi (faqat tanlash yoki «shajarada yo'qman»)
    wrap.dataset.lock = 1;
    sh.querySelector('[data-close]')?.remove();
    wrap.querySelector('.backdrop').onclick = null;
  }
  const unlock = () => delete wrap.dataset.lock;
  const list = sh.querySelector('#wa-list');
  const draw = () => {
    const q = sh.querySelector('#wa-q').value.trim().toLowerCase();
    const xs = q.length < 2 ? [] : tr.persons.filter((p) => !p.deceased && nm(p.name).toLowerCase().includes(q)).slice(0, 30);
    list.innerHTML = xs.map((p) => `<button class="ppl-row" data-wa="${p.id}">${avatar(p, 36)}<span class="grow"><b>${esc(label(p))}</b><div class="small muted">${esc(sub(p))}</div></span>${p.id === tr.me.pid ? '✓' : ''}</button>`).join('')
      || `<div class="small muted" style="padding:8px 2px">${q.length < 2 ? t('Kamida 2 harf yozing') : t('Topilmadi')}</div>`;
    list.querySelectorAll('[data-wa]').forEach((b) => (b.onclick = async () => {
      const p = S.fam.get(b.dataset.wa);
      if (!(await confirmBox(t('Siz — {name}{sub}?', { name: label(p), sub: sub(p) ? ` (${sub(p)})` : '' })))) return;
      try {
        await api('me', { method: 'PATCH', body: { pid: p.id } }); tr.me.pid = p.id; unlock(); closeAllSheets(); toast(t('Rahmat! Endi bot sizni taniydi ✓')); haptic('success');
        const host = document.querySelector('.view[data-view="tree"]'); if (host) myBar(host);
        S.treeView?.focus(p.id, { k: 1 });
      } catch (err) { toast(err.message, true); }
    }));
  };
  sh.querySelector('#wa-q').oninput = draw;
  draw();
  sh.querySelector('#wa-none').onclick = () => { store.set('sh_noself_' + tr.id, Date.now()); unlock(); closeAllSheets(); };
}

// Albom egasi: a'zolar va bir martalik taklif havolasi
async function privMembers(aid) {
  await loadAlbum(true).catch(() => {});
  const a = S.album.albums.find((x) => x.id === aid);
  if (!a?.owner) return;
  const me = String(S.album.me || '');
  const sh = openSheet(`<div class="sheet-head"><div class="h2 grow">👥 ${esc(a.name)}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body">
      <button class="btn btn-primary btn-block" id="pm-inv">🔗 ${t('Bir martalik taklif havolasini yuborish')}</button>
      <div class="small muted" style="margin:6px 2px 14px">${t('Har bir havola faqat bitta kishiga ishlaydi — kim ochsa, o‘sha qo‘shiladi.')}</div>
      <div class="h3" style="margin:14px 2px 8px">👥 ${t('A’zolar')} · ${a.memberList.length}</div>
      ${a.memberList.map((m) => `<div class="dp-row"><b class="grow">${esc(m.name)}${m.id === me ? ` <span class="muted small">(${t('siz')})</span>` : ''}</b>${m.id === me ? '' : `<button class="btn btn-ghost btn-sm" data-rm="${m.id}">${t('Chiqarish')}</button>`}</div>`).join('')}
    </div>`);
  const call = async (k, body) => { try { await api(`album/a/${aid}/${k}`, { method: 'POST', body }); closeAllSheets(); await refreshAlbum(); privMembers(aid); } catch (err) { toast(err.message, true); } };
  sh.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = async () => { if (await confirmBox(t('Bu kishi albomdan chiqarilsinmi?'))) call('remove', { uid: b.dataset.rm }); }));
  sh.querySelector('#pm-inv').onclick = async () => {
    try {
      const { code } = await api(`album/a/${aid}/invite`, { method: 'POST' });
      const link = `${S.tree.invite}_k${aid}${code}`;
      const text = t('Assalomu alaykum! «{name}» — oilamizning yopiq albomi. Havola orqali kiring va oilaviy suratlarni birga saqlaylik.', { name: a.name });
      openLink(`https://t.me/share/url?url=${encodeURIComponent(`${text} ${link}`)}`);
    } catch (err) { toast(err.message, true); }
  };
}

function tile(it) {
  const img = it.thumb ? `<img src="${it.thumb}" alt="" loading="lazy">` : `<div class="tile-ic">${TYPE_ICON[it.type] || '📄'}</div>`;
  const badge = it.type === 'video' || it.type === 'animation' || it.type === 'video_note' ? `<span class="tile-badge">▶ ${fmtDur(it.dur)}</span>`
    : it.type !== 'photo' && it.kind !== 'image' ? `<span class="tile-badge">${TYPE_ICON[it.type] || ''} ${esc((it.name || '').slice(0, 14))}</span>` : '';
  return `<div class="tile-w"><button class="tile ${S.sel?.has(it.id) ? 'sel' : ''}" data-item="${it.id}">${img}${badge}${it.priv ? `<span class="tile-lock">${it.pub ? '🌐' : '🔒'}</span>` : ''}</button>
    <div class="tile-st"><span>${VI.eye}${fmtN(it.views)}</span><span class="${it.liked ? 'on' : ''}">${VI.heart(it.liked)}${fmtN(it.likes)}</span><span>${VI.cm}${fmtN(it.cm)}</span></div></div>`;
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
  cm: SV('<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.1A8.5 8.5 0 1 1 21 12z"/>'),
  fwd10: SV('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/><text x="12" y="15.5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">10</text>'),
};
const FILE_IC = { pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', ppt: '📙', pptx: '📙', zip: '🗜', rar: '🗜', '7z': '🗜', txt: '📝', apk: '📱' };
const fmtT = (s) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
const fmtN = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n || 0));

function openViewer(ids, index, opts = {}) {
  const A = S.album;
  const items = ids.map((id) => A.items.find((x) => x.id === id)).filter(Boolean);
  if (!items.length) return;
  let cur = -1;
  const box = document.createElement('div');
  box.className = 'rv';
  box.innerHTML = `<div class="rv-feed">${items.map((it, i) => `<section class="rv-slide" data-i="${i}"></section>`).join('')}</div>
    <div class="rv-top rv-ui"><button class="rv-x" id="rv-x">${I.close}</button><div class="rv-count"></div>
      <button class="rv-x hidden" id="rv-ed">${I.edit}</button><button class="rv-x hidden" id="rv-dl">${I.trash}</button></div>`;
  document.body.append(box);
  const feed = box.querySelector('.rv-feed');
  const slides = [...feed.children];
  // over: ochiq oynalar (masalan, shaxs oynasi) ustida ochiladi — yopilganda ular qaytadi
  const hidden = opts.over ? [...$sheets.children].filter((w) => w.style.visibility !== 'hidden') : [];
  hidden.forEach((w) => (w.style.visibility = 'hidden'));
  const close = () => { io.disconnect(); box.querySelectorAll('video,audio').forEach((m) => m.pause()); box.remove(); hidden.forEach((w) => (w.style.visibility = '')); viewerOpen = null; updateBackButton(); };
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
    // videoning markazi bosilsa — pauza/davom; boshqa joyi — yozuvlarni yashirish
    const vid = e.target.closest('.rv-slide')?.querySelector('video.rv-vid');
    if (vid) {
      const r = vid.getBoundingClientRect();
      // faqat markazdagi ▶ tugma doirasi (64px) — undan tashqarisi pauza qilmaydi
      if (Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < 34) {
        clearTimeout(tapT); tapT = null;
        vid.paused ? vid.play().catch(() => {}) : vid.pause();
        haptic('light');
        return;
      }
    }
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
        <div class="rv-a-name">${esc(it.caption || it.name || t('Audio'))}</div>
        <div class="rv-seek big"><i></i></div><div class="rv-a-time"><span class="c">0:00</span><span class="d">${fmtDur(it.dur) || '0:00'}</span></div>
        <div class="rv-a-ctl"><button data-a="-10">${VI.back10}</button><button class="rv-a-play" data-a="play">${VI.play}</button><button data-a="10">${VI.fwd10}</button></div>
        <div class="rv-a-row"><button class="rv-a-spd" data-a="spd">1×</button><button class="rv-a-spd rv-a-loop ${store.get('sh_loop', false) ? 'on' : ''}" data-a="loop">🔁</button></div>
        <audio preload="metadata" src="${it.src}" ${store.get('sh_loop', false) ? 'loop' : ''}></audio></div>`;
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
        <button class="rv-b" data-act="seen">${VI.eye}<span class="vw">${fmtN(it.views)}</span></button>
        ${it.priv && !it.member ? '' : `<button class="rv-b" data-act="cm">${VI.cm}<span class="cmn">${fmtN(it.cm)}</span></button>`}
        ${it.kind === 'video' && it.type !== 'animation' ? `<button class="rv-b" data-act="mute">${VI.mute(false)}</button>` : ''}
        ${it.kind === 'video' && it.src ? `<button class="rv-b spd" data-act="spd"><b>1×</b></button>` : ''}
        ${inTelegram && (!it.priv || it.member) ? `<button class="rv-b" data-act="send">${VI.send}<span class="sn">${fmtN(it.sends)}</span></button>` : ''}
        <div class="rv-below">${inTelegram && it.kind === 'image' && it.src && (!it.priv || it.member) ? `<button class="rv-b" data-act="enh"><b style="font-size:20px">✨</b></button>` : ''}
          ${inTelegram ? `<button class="rv-b" data-act="tags"><b style="font-size:20px">👥</b><span class="tgn">${(it.tags || []).length || ''}</span></button>` : ''}
          ${it.priv && it.member && albOf(it)?.mine ? `<button class="rv-b pubb ${it.pub ? 'on' : ''}" data-act="pub"><b>🌐</b><span>${it.pub ? t('Umumiyda') : t('Umumiy')}</span></button>` : ''}</div>
      </div>
      ${land ? `<button class="rv-full rv-ui" data-act="full">${VI.full}</button>` : ''}
      <div class="rv-info rv-ui">
        <div class="rv-meta">📁 ${esc(nm(a?.name || ''))} · ${fmtDate(it.at.slice(0, 10))} ${new Date(it.at).toTimeString().slice(0, 5)}${it.size ? ' · ' + fmtSize(it.size) : ''}</div>
        ${it.by?.name ? `<button class="rv-by" data-act="by">👤 ${esc(it.by.name)}</button>` : ''}
        ${it.caption ? `<div class="rv-cap">${esc(it.caption)}</div>` : ''}
        <div class="rv-tags">${(it.tags || []).map((id) => S.fam.get(id) ? `<button data-act="tagp" data-pid="${id}">👤 ${esc(nm(S.fam.get(id).name))}</button>` : '').join('')}</div>
        ${it.kind === 'video' && it.src ? `<div class="rv-vbar"><div class="rv-seek"><i></i></div><span class="rv-vt">0:00</span><button data-act="pp">${VI.pause}</button></div>` : ''}
      </div>`;
    sl.querySelectorAll('[data-act]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); if (b.dataset.held) { delete b.dataset.held; return; } act(b.dataset.act, it, sl, b); }));
    for (const [sel, k] of [['.like', 'likes'], ['[data-act="seen"]', 'seen']]) { const b = sl.querySelector(sel); if (b) onHold(b, () => peopleSheet(it, k)); }
    const v = sl.querySelector('video');
    if (v) { streamFallback(v, it); bindVideo(v, sl); }
    const au = sl.querySelector('audio');
    if (au) { streamFallback(au, it); bindAudio(au, sl); }
    const img = sl.querySelector('img.rv-img');
    if (img) bindPinch(img);
  }

  async function act(k, it, sl, b) {
    haptic('light');
    if (k === 'enh') return enhanceSheet(it);
    if (k === 'tags') return tagSheet(it, () => { sl.querySelector('.tgn').textContent = (it.tags || []).length || ''; sl.querySelector('.rv-tags').innerHTML = (it.tags || []).map((id) => S.fam.get(id) ? `<button data-act="tagp" data-pid="${id}">👤 ${esc(nm(S.fam.get(id).name))}</button>` : '').join(''); sl.querySelectorAll('[data-act="tagp"]').forEach((x) => (x.onclick = (e) => { e.stopPropagation(); personSheetOver(x.dataset.pid); })); });
    if (k === 'tagp') return personSheetOver(b.dataset.pid);
    if (k === 'pub') {
      // umumiy albomda ham ko'rsatish — avval tasdiqlash
      const on = !it.pub;
      if (!(await confirmBox(on ? t('Bu fayl shajaraning umumiy albomida ham hammaga ko‘rinadigan bo‘ladi. Rozimisiz?') : t('Fayl umumiy albomdan olinib, faqat oilaviy albomda qoladi. Davom etilsinmi?')))) return;
      try { await api(`album/i/${it.id}/pub`, { method: 'POST', body: { on } }); it.pub = on; b.classList.toggle('on', on); b.querySelector('span').textContent = on ? t('Umumiyda') : t('Umumiy'); toast(on ? t('Umumiy albomda ham ko‘rinadi 🌐') : t('Faqat oilaviy albomda 🔒')); } catch (err) { toast(err.message, true); }
      return;
    }
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
        const sh = tg?.shareMessage && tg.isVersionAtLeast?.('8.0') && await api(`album/i/${it.id}/share`, { method: 'POST' }).catch(() => null);
        const shared = shareVia(sh?.id);
        const r = shared ? {} : await api(`album/i/${it.id}/send`, { method: 'POST' });
        if (!shared) toast(t('Chatga yuborildi 📩'));
        it.sends = r.sends ?? (it.sends || 0) + 1;
        sl.querySelectorAll('.sn').forEach((x) => (x.textContent = fmtN(it.sends)));
      } catch (err) { toast(err.message, true); }
      b.disabled = false;
    }
    if (k === 'spd') speedPop(b, sl.querySelector('video'), (v) => (b.innerHTML = `<b>${v}×</b>`));
    if (k === 'by') openProfile(it);
    if (k === 'seen') peopleSheet(it, 'seen');
    if (k === 'cm') commentsSheet(it, sl);
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
      else if (k === 'loop') { au.loop = !au.loop; b.classList.toggle('on', au.loop); store.set('sh_loop', au.loop); toast(au.loop ? t('Takrorlash yoqildi 🔁') : t('Takrorlash o‘chirildi')); }
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
    // tahrirlash/o'chirish — faqat faylni yuklagan yoki albomni yaratgan kishiga
    const own = canManageItem(items[i]);
    box.querySelector('#rv-ed')?.classList.toggle('hidden', !own);
    box.querySelector('#rv-dl')?.classList.toggle('hidden', !own);
    for (const j of [i - 1, i, i + 1, i + 2]) hydrate(j);
    slides.forEach((sl, j) => {
      const m = sl.querySelector('video, audio');
      if (!m) return;
      if (j === i && m.tagName === 'VIDEO') m.play().catch(() => { m.muted = true; m.play().catch(() => {}); });
      else if (j === i) m.play().catch(() => {}); // audio ham avtomatik
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

// Bosib turish (~0.5 s): ro'yxatni ochadi; keyingi click o'tkazib yuboriladi
function onHold(el, fn) {
  let tm = null;
  const stop = () => { clearTimeout(tm); tm = null; };
  el.addEventListener('pointerdown', () => { stop(); tm = setTimeout(() => { tm = null; el.dataset.held = 1; haptic('medium'); fn(); }, 500); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, stop);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
// Telegram profil rasmi (bo'lmasa — bosh harf). Ism uzun bo'lsa qisqartiriladi.
const shortName = (n, max = 24) => { const x = String(n || '?').trim(); return x.length > max ? x.slice(0, max - 1) + '…' : x; };
const myId = () => String(tg?.initDataUnsafe?.user?.id || '');
const albOf = (it) => S.album?.albums.find((a) => a.id === it?.album);
const canManageItem = (it) => !!it && !!myId() && (!!albOf(it)?.mine || String(it.by?.id || '') === myId());
function uAvatar(u, cls = 'cm-av') {
  return `<span class="${cls}">${esc((u?.name || '?').slice(0, 1))}${u?.ph ? `<img class="av-img" src="${u.ph}" alt="" loading="lazy">` : ''}</span>`;
}
// Mini App ichida rasm/videoni bosib turganda brauzer menyusi (havola, yuklash) chiqmasin
document.addEventListener('contextmenu', (e) => { if (e.target.closest?.('img, video, audio, a, .tile, .rv')) e.preventDefault(); });
document.addEventListener('dragstart', (e) => { if (e.target.tagName === 'IMG') e.preventDefault(); });
document.addEventListener('error', (e) => { if (e.target?.classList?.contains('av-img')) e.target.remove(); }, true);

// Foydalanuvchi profili (ilova ichida): rasmi, ismi, albomga yuklagan fayllari
async function openUser(u) {
  if (!u) return;
  if (!S.album) await loadAlbum().catch(() => {});
  const mine = (S.album?.items || []).filter((x) => String(x.by?.id || '') === String(u.id));
  const sh = openSheet(`<div class="sheet-head"><div class="grow"></div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body"><div class="prof">${uAvatar(u, 'prof-av')}<div class="h2" style="margin-top:10px">${esc(shortName(u.name, 40))}</div>
      <div class="row" style="gap:8px;justify-content:center;flex-wrap:wrap;margin-top:10px">${u.username ? `<button class="btn btn-soft btn-sm" id="pf-tg">✈️ ${t('Telegramda ochish')}</button>` : ''}
      ${u.pid && S.fam?.get(u.pid) ? `<button class="btn btn-soft btn-sm" id="pf-p">🌳 ${t('Shajarada')}: ${esc(nm(S.fam.get(u.pid).name))}</button>` : u.pid === null ? `<span class="small muted">${t('Shajarada o‘zini hali belgilamagan')}</span>` : ''}</div></div>
      <div class="h3" style="margin:16px 2px 8px">📸 ${t('Albomga joylagan fayllari')} · ${mine.length}</div>
      ${mine.length ? `<div class="grid">${mine.map(tile).join('')}</div>` : `<div class="small muted">${t('Hozircha fayl yo‘q')}</div>`}</div>`);
  sh.classList.add('over-rv');
  sh.querySelector('#pf-tg')?.addEventListener('click', () => openLink(`https://t.me/${u.username}`));
  sh.querySelector('#pf-p')?.addEventListener('click', () => { closeTopSheet(); setTimeout(() => personSheet(u.pid), 150); });
  const ids = mine.map((x) => x.id);
  sh.querySelectorAll('[data-item]').forEach((b) => (b.onclick = () => { closeAllSheets(); viewerOpen?.(); openViewer(ids, ids.indexOf(b.dataset.item)); }));
}
async function peopleSheet(it, k, mid) {
  const sh = openSheet(`<div class="sheet-head"><h3>${k === 'likes' ? '❤️ ' + t('Yoqtirganlar') : '👁 ' + t('Ko‘rganlar')}</h3></div>
    <div class="ppl"><div class="empty"><span class="spin" style="color:var(--primary)"></span></div></div>`);
  sh.classList.add('over-rv');
  const box = sh.querySelector('.ppl');
  try {
    const r = await api(`album/i/${it.id || it}/people?k=${k}${mid ? '&mid=' + mid : ''}`);
    box.innerHTML = r.people.length ? r.people.map((u, i) => `<button class="ppl-row" data-i="${i}">${uAvatar(u)}<b class="grow ellipsis">${esc(shortName(u.name))}</b></button>`).join('')
      : `<div class="empty small muted">${t('Hali hech kim yo‘q')}</div>`;
    box.querySelectorAll('.ppl-row').forEach((b) => (b.onclick = () => openUser(r.people[b.dataset.i])));
  } catch (err) { box.innerHTML = `<div class="empty small muted">${esc(err.message)}</div>`; }
}

// Instagram uslubidagi izohlar: matn kanalda, bu yerda ko'rsatish/yozish
async function commentsSheet(it, sl) {
  const me = String(S.album?.me || '');
  const canDel = !!S.album?.canEdit;
  const sh = openSheet(`<div class="sheet-head"><h3>💬 ${t('Izohlar')}</h3></div>
    <div class="cm-list"><div class="empty"><span class="spin" style="color:var(--primary)"></span></div></div>
    ${inTelegram ? `<div class="cm-bar"><div class="cm-mode hidden"><span></span><button type="button">✕</button></div>
      <div class="cm-in"><textarea class="input" rows="1" maxlength="1000" placeholder="${t('Izoh yozing…')}"></textarea><button class="btn btn-primary cm-send">➤</button></div></div>`
      : `<div class="small muted center" style="padding:10px">${t('Izoh yozish faqat Telegram ichida')}</div>`}`);
  sh.classList.add('over-rv', 'cm-sheet');
  const list = sh.querySelector('.cm-list');
  const ta = sh.querySelector('textarea');
  const mode = sh.querySelector('.cm-mode');
  let L = [];
  let st = null; // {re} | {edit}
  const setMode = (m, label) => {
    st = m;
    if (!mode) return;
    mode.classList.toggle('hidden', !m);
    mode.querySelector('span').textContent = label || '';
  };
  mode?.querySelector('button').addEventListener('click', () => { if (st?.edit) ta.value = ''; setMode(null); });
  const one = (c) => `<div class="cm ${c.re ? 'cm-reply' : ''}" data-mid="${c.mid}">
      <button class="cm-avb" data-u="${c.mid}">${uAvatar({ ...c.by, name: c.name })}</button>
      <div class="grow"><div class="cm-h"><button class="cm-name" data-u="${c.mid}">${esc(shortName(c.name))}</button> <span class="muted">${relTime(c.at)}${c.ed ? ' · ' + t('tahrirlangan') : ''}</span></div>
        <div class="cm-t">${c.text == null ? `<i class="muted">${t('Matn kanalda — hozircha o‘qib bo‘lmadi')}</i>` : esc(c.text)}</div>
        <div class="cm-a">${!c.re && inTelegram ? `<button data-re="${c.mid}">${t('Javob berish')}</button>` : ''}
          ${c.mine && c.text != null ? `<button data-ed="${c.mid}">${t('Tahrirlash')}</button>` : ''}
          ${c.mine || canDel ? `<button data-del="${c.mid}">${t('O‘chirish')}</button>` : ''}
          ${c.likes ? `<button data-lks="${c.mid}">❤️ ${t('{n} ta yoqtirish', { n: c.likes })}</button>` : ''}</div></div>
      <button class="cm-like ${c.liked ? 'on' : ''}" data-lk="${c.mid}">${VI.heart(c.liked)}<span>${c.likes || ''}</span></button></div>`;
  const draw = () => {
    const top = L.filter((c) => !c.re);
    list.innerHTML = top.length ? top.map((c) => one(c) + L.filter((r) => r.re === c.mid).map(one).join('')).join('')
      : `<div class="empty small muted">${t('Hali izoh yo‘q. Birinchi bo‘lib yozing!')}</div>`;
    const cnt = L.length;
    it.cm = cnt;
    sl?.querySelectorAll('.cmn').forEach((x) => (x.textContent = fmtN(cnt)));
  };
  const find = (mid) => L.find((c) => c.mid === Number(mid));
  list.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.u) return openUser({ ...find(b.dataset.u).by, name: find(b.dataset.u).name });
    if (b.dataset.lks) return peopleSheet(it, 'likes', b.dataset.lks);
    if (b.dataset.re) { const c = find(b.dataset.re); setMode({ re: c.mid }, `↩️ ${c.name}`); ta.focus(); return; }
    if (b.dataset.ed) { const c = find(b.dataset.ed); setMode({ edit: c.mid }, `✏️ ${t('Tahrirlash')}`); ta.value = c.text; ta.focus(); return; }
    if (b.dataset.del) {
      if (!confirm(t('Izoh o‘chirilsinmi?'))) return;
      try { const r = await api(`album/i/${it.id}/c/${b.dataset.del}`, { method: 'DELETE' }); L = L.filter((c) => !r.removed.includes(c.mid)); draw(); } catch (err) { toast(err.message, true); }
      return;
    }
    if (b.dataset.lk) {
      const c = find(b.dataset.lk);
      if (!inTelegram) return;
      c.liked = !c.liked; c.likes = Math.max(0, (c.likes || 0) + (c.liked ? 1 : -1)); draw(); haptic('light');
      try { const r = await api(`album/i/${it.id}/c/${c.mid}/like`, { method: 'POST' }); if (r.likes != null) { c.likes = r.likes; c.liked = r.liked; draw(); } } catch {}
    }
  });
  sh.querySelector('.cm-send')?.addEventListener('click', async (e) => {
    const text = ta.value.trim();
    if (!text) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      if (st?.edit) {
        const r = await api(`album/i/${it.id}/c/${st.edit}`, { method: 'PATCH', body: { text } });
        Object.assign(find(st.edit), { text: r.text, ed: true });
      } else {
        const r = await api(`album/i/${it.id}/c`, { method: 'POST', body: { text, re: st?.re || null } });
        L.push(r.item);
      }
      ta.value = ''; setMode(null); draw(); haptic('success');
      list.scrollTop = list.scrollHeight;
    } catch (err) { toast(err.message, true); }
    btn.disabled = false;
  });
  try {
    const r = await api(`album/i/${it.id}/c`);
    L = r.items;
    draw();
  } catch (err) { list.innerHTML = `<div class="empty small muted">${esc(err.message)}</div>`; }
}

// Guruhdagi "O'qish" tugmasidan kelganda: faylni ochib, izohlarni ko'rsatish
async function openMediaComments(id, withComments = true) {
  try {
    await loadAlbum(true);
    const ids = S.album.items.map((x) => x.id);
    if (!ids.includes(id)) return;
    switchTab('album');
    viewerOpen?.();
    openViewer(ids, ids.indexOf(id));
    const it = S.album.items.find((x) => x.id === id);
    if (withComments) setTimeout(() => commentsSheet(it, document.querySelector(`.rv-slide[data-i="${ids.indexOf(id)}"]`)), 400);
  } catch {}
}

function openProfile(it) {
  if (it.byUser) return openLink(`https://t.me/${it.byUser}`);
  if (it.by?.id) {
    try { window.location.href = `tg://user?id=${it.by.id}`; return; } catch {}
  }
  toast(t('Bu foydalanuvchining profili yopiq'), true);
}

function albumSelect(selected, withNew = true) {
  const A = S.album;
  return `<select class="input" name="album">${A.albums.filter((a) => !a.locked).map((a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${a.priv ? '🔒 ' : ''}${esc(nm(a.name))}</option>`).join('')}
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

// Katta video Render'dagi oqim serveridan; u 8 soniyada javob bermasa (uxlagan/ishlamayapti) — Vercel orqali
function streamFallback(m, it) {
  if (!it.src2) return;
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    clearTimeout(tm);
    const play = !m.paused;
    m.src = it.src2;
    m.load();
    if (play) m.play().catch(() => {});
  };
  const tm = setTimeout(go, 8000);
  m.addEventListener('loadedmetadata', () => { done = true; clearTimeout(tm); }, { once: true });
  m.addEventListener('error', go, { once: true });
}
// bepul Render 15 daqiqada uxlaydi — albom ochilganda oldindan uyg'otib qo'yamiz
let streamWoke = 0;
function wakeStream(u) {
  if (!u || Date.now() - streamWoke < 10 * 60e3) return;
  streamWoke = Date.now();
  fetch(u + '/health', { mode: 'no-cors' }).catch(() => {});
}

// Tanlangan fayllar ustida amal: o'chirish, ko'chirish, bot chatiga yuborish, ZIP
async function selAction(k) {
  const ids = [...(S.sel || [])];
  if (!ids.length) return toast(t('Avval fayllarni tanlang'), true);
  const skip = (r) => (r.skipped ? ' · ' + t('{n} tasiga ruxsat yo‘q', { n: r.skipped }) : '');
  const done = async (msg) => { S.sel = null; toast(msg); await refreshAlbum(); };
  try {
    if (k === 'delete') {
      if (!(await confirmBox(t('{n} ta fayl o‘chirilsinmi?', { n: ids.length })))) return;
      const r = await api('album/batch', { method: 'POST', body: { op: 'delete', ids } });
      return done(t('{n} ta fayl o‘chirildi', { n: r.n }) + skip(r));
    }
    if (k === 'move') {
      const sh = openSheet(`<div class="sheet-head"><div class="h2 grow">📁 ${t('Qaysi albomga ko‘chiramiz?')}</div><button class="icon-btn" data-close>${I.close}</button></div>
        <div class="sheet-body">${S.album.albums.filter((a) => !a.priv || a.ch).map((a) => `<button class="card alb-opt" data-to="${a.id}"><span style="font-size:20px">${a.priv ? '🔒' : '📁'}</span><b class="grow ellipsis">${esc(nm(a.name))}</b></button>`).join('')}</div>`);
      sh.querySelectorAll('[data-to]').forEach((b) => (b.onclick = async () => {
        b.disabled = true;
        try {
          const r = await api('album/batch', { method: 'POST', body: { op: 'move', ids, album: b.dataset.to } });
          closeAllSheets();
          done(t('{n} ta fayl ko‘chirildi', { n: r.n }) + skip(r));
        } catch (err) { toast(err.message, true); b.disabled = false; }
      }));
      return;
    }
    if (k === 'send') {
      const r = await api('album/batch', { method: 'POST', body: { op: 'send', ids } });
      S.sel = null;
      refreshAlbum();
      const sh = openSheet(`<div class="sheet-head"><div class="h2 grow">📤 ${t('Yuborildi')}</div><button class="icon-btn" data-close>${I.close}</button></div>
        <div class="sheet-body"><p>${t('{n} ta fayl bot chatiga yuborildi. U yerdan istalgan chatga yuboring: faylni bosib turing → «Forward» (Uzatish).', { n: r.n })}</p>
        ${r.skipped ? `<div class="hint">${t('{n} tasi yopiq albomdan — chatga yuborilmaydi.', { n: r.skipped })}</div>` : ''}
        <button class="btn btn-primary btn-block" id="tobot">🤖 ${t('Botni ochish')}</button></div>`);
      sh.querySelector('#tobot').onclick = openBot;
      return;
    }
    if (k === 'zip') {
      const r = await api('album/batch', { method: 'POST', body: { op: 'zip', ids } });
      const sh = openSheet(`<div class="sheet-head"><div class="h2 grow">🗜 ZIP</div><button class="icon-btn" data-close>${I.close}</button></div>
        <div class="sheet-body"><p style="margin-top:0"><b>${esc(r.name)}</b><br><span class="muted small">${t('{n} ta fayl', { n: r.count })} · ${fmtSize(r.size)}</span></p>
        <p class="small muted">${t('ZIP ichida har bir albom alohida papka bo‘ladi.')}</p>
        <button class="btn btn-primary btn-block" id="z-send">📤 ${t('Telegramda yuborish')}</button>
        <div class="hint">${t('ZIP Telegram’ga yuklanadi (2 GB gacha bitta fayl), so‘ng istalgan odam yoki chatni tanlaysiz. Katta ZIP bir necha daqiqa oladi — ilovani yopsangiz ham bot chatiga keladi.')}</div></div>`);
      sh.querySelector('#z-send').addEventListener('click', async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        b.innerHTML = `<span class="spin"></span> ${t('ZIP tayyorlanmoqda…')}`;
        const j = await fetch(r.url + '&send=1').then((x) => x.json()).catch(() => ({ ok: false }));
        if (!j.ok) { toast(j.error || t('Yuborib bo‘lmadi'), true); b.disabled = false; b.textContent = '📤 ' + t('Telegramda yuborish'); return; }
        closeAllSheets();
        if (!shareVia(j.prepared)) {
          const s2 = openSheet(`<div class="sheet-head"><div class="h2 grow">🗜 ZIP</div><button class="icon-btn" data-close>${I.close}</button></div>
            <div class="sheet-body"><p>${t('ZIP {n} qismga bo‘linib bot chatiga yuborildi. U yerdan istalgan chatga yuboring (Forward).', { n: j.parts })}</p>
            ${j.skipped ? `<div class="hint">${t('{n} ta fayl 48 MB dan katta — ZIP’ga sig‘madi, ularni alohida yuboring.', { n: j.skipped })}</div>` : ''}
            <button class="btn btn-primary btn-block" id="tobot">🤖 ${t('Botni ochish')}</button></div>`);
          s2.querySelector('#tobot').onclick = openBot;
        }
      });
    }
  } catch (err) { toast(err.message, true); }
}

async function refreshAlbum() {
  await loadAlbum(true);
  const el = $app.querySelector('[data-view="album"]');
  if (el && S.tab === 'album') renderAlbumTab(el);
}

const UP_MAX = 50 * 1024 * 1024; // Telegram Bot API fayl yuborish chegarasi (server faylni kanalga shu orqali joylaydi)
function uploadSheet() {
  const sh = openSheet(`<div class="sheet-head"><div class="h2">${t('Albomga qo‘shish')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body" id="uw">
      <button class="card banner up-way" id="w-app"><div style="font-size:26px">📱</div><div class="grow"><b>${t('Ilovada yuklash')}</b><div class="small muted">${t('Rasm, video, audio va hujjatlar — har biri 50 MB gacha, bir nechtasini birdan. Asl sifatda saqlanadi.')}</div></div>${I.chev}</button>
      ${inTelegram ? `<button class="card banner up-way" id="w-bot"><div style="font-size:26px">🤖</div><div class="grow"><b>${t('Bot orqali yuborish')}</b><div class="small muted">${t('50 MB dan katta video va fayllar (2 GB gacha) hamda ovozli xabarlar. Telegram o‘zi yuklaydi: tez, internet uzilsa ham davom etadi.')}</div></div>${I.chev}</button>` : ''}
      <div class="hint">${t('Qaysi birini tanlash kerak? Fayl 50 MB gacha bo‘lsa — ilovada. Kattaroq bo‘lsa yoki internet sekin bo‘lsa — bot orqali.')}</div>
    </div>`);
  sh.querySelector('#w-app').onclick = () => uploadForm(sh);
  sh.querySelector('#w-bot')?.addEventListener('click', () => {
    sh.querySelector('#uw').innerHTML = `<ol class="steps"><li>${t('«Botni ochish» tugmasini bosing.')}</li>
        <li>${t('Faylni botga yuboring (📎 → Fayl). Asl sifatda saqlanishi uchun «Fayl» sifatida yuboring.')}</li>
        <li>${t('Bot qaysi albomga qo‘shishni so‘raydi (🔒 yopiq albomlar ham bor), so‘ng izoh yozasiz.')}</li></ol>
      <button class="btn btn-primary btn-block" id="tobot">🤖 ${t('Botni ochish')}</button>`;
    sh.querySelector('#tobot').onclick = openBot;
  });
}

function uploadForm(sh) {
  sh.querySelector('#uw').outerHTML = `<form class="sheet-body" id="uf">
      <label class="drop">${I.image}<b>${t('Fayllarni tanlang')}</b><span class="small muted">${t('Rasm, video, audio, hujjat — har biri 50 MB gacha')}</span><input type="file" multiple hidden name="files"></label>
      <div class="thumbs" id="pv"></div>
      <div class="card note hidden" id="bigw"></div>
      <div class="field"><label>${t('Albom')}</label>${albumSelect(S.albumFilter !== 'all' ? S.albumFilter : S.album.albums[0]?.id)}</div>
      <label class="row card" style="padding:10px 12px;margin-bottom:10px;gap:10px"><input type="checkbox" name="fix"><div class="grow"><b>🪄 ${t('Sifatli qilish (AI)')}</b><div class="small muted">${t('Yuklangach AI rasmni asl holicha tiniqlashtiradi: odamlar, ranglar, joylashuv o‘zgarmaydi. Asl rasm ham, sifatli nusxa ham albomda qoladi.')}</div></div></label>
      ${S.album?.rcol ? `<label class="row card" style="padding:10px 12px;margin-bottom:10px;gap:10px"><input type="checkbox" name="color"><div class="grow"><b>🎨 ${t('Oq-qora rasmni rangli qilish')}</b><div class="small muted">${t('«Sifatli qilish» bilan birga ishlaydi.')}</div></div></label>` : ''}
      <div class="field" id="capf"><label>${t('Izoh — kim, qachon, qayerda?')}</label><textarea class="input" name="caption" maxlength="900" placeholder="${t('Masalan: Bobomning 80 yillik yubileyi, 2019')}"></textarea></div>
      <button class="btn btn-primary btn-block" id="ub" disabled>${t('Yuklash')}</button>
      <div class="hint" style="margin-top:12px">📦 ${t('50 MB dan katta fayllarni bot orqali yuboring: «Albomga qo‘shish» → «Bot orqali yuborish».')}</div>
    </form>`;
  bindAlbumSelect(sh);
  const input = sh.querySelector('[name=files]');
  let files = [];
  input.onchange = () => {
    const all = [...input.files];
    const big = all.filter((f) => f.size > UP_MAX);
    files = all.filter((f) => f.size <= UP_MAX).slice(0, 20);
    const prev = (f) => (/^image/.test(f.type) ? `<img src="${URL.createObjectURL(f)}" alt="">` : `<div class="tile-ic">${/^video/.test(f.type) ? '🎬' : /^audio/.test(f.type) ? '🎵' : '📄'}</div>`);
    // bir nechta fayl — har biriga alohida izoh
    const many = files.length > 1;
    sh.querySelector('#pv').classList.toggle('up-list', many);
    sh.querySelector('#pv').innerHTML = many
      ? `<div class="small muted" style="margin-bottom:6px">${t('Har bir faylga alohida izoh yozing — kim, qachon, qayerda?')}</div>` + files.map((f, i) => `<div class="up-row"><div class="up-th">${prev(f)}<b class="up-pct" data-pct="${i}"></b></div><textarea class="input" data-cap="${i}" rows="2" maxlength="900" placeholder="${t('{i}-fayl izohi', { i: i + 1 })}"></textarea></div>`).join('')
      : files.map(prev).join('');
    sh.querySelector('#capf').classList.toggle('hidden', many);
    const bw = sh.querySelector('#bigw');
    bw.classList.toggle('hidden', !big.length);
    if (big.length) {
      bw.innerHTML = `⚠️ ${t('{n} ta fayl 50 MB dan katta — ularni bot orqali yuboring.', { n: big.length })}${inTelegram ? `<button type="button" class="btn btn-ghost btn-sm" style="margin-top:8px;width:100%" id="tobot2">🤖 ${t('Botni ochish')}</button>` : ''}`;
      bw.querySelector('#tobot2')?.addEventListener('click', openBot);
    }
    sh.querySelector('#ub').disabled = !files.length;
    sh.querySelector('#ub').textContent = files.length ? t('Yuklash ({n})', { n: files.length }) : t('Yuklash');
  };
  sh.querySelector('#uf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { caption: f.get('caption') };
    if (f.get('album') === '__new') body.albumName = f.get('albumName') || t('Umumiy'); else body.album = f.get('album');
    const pa = S.album.albums.find((a) => a.id === body.album && a.priv && !a.ch);
    if (pa) {
      toast(t('Avval bu yopiq albomga alohida Telegram kanal ulang'), true);
      if (pa.owner) { closeAllSheets(); privChannelSheet(pa.id); }
      return;
    }
    const btn = sh.querySelector('#ub');
    btn.disabled = true;
    let ok = 0;
    const toFix = [];
    const caps = [...sh.querySelectorAll('[data-cap]')].map((x) => x.value.trim());
    for (const [i, file] of files.entries()) {
      btn.innerHTML = `<span class="spin"></span> ${ok + 1}/${files.length}`;
      if (files.length > 1) body.caption = caps[i] || '';
      const pct = sh.querySelector(`[data-pct="${i}"]`);
      try {
        const fix = f.get('fix') && /^image\/(jpeg|png|webp)/.test(file.type);
        const ai = fix && S.album?.rst !== false;
        // asl rasm o'zgarmasdan yuklanadi; tuzatish oynasi yuklashdan keyin ochiladi (natija — alohida nusxa)
        const src = file;
        const r = await uploadOriginal(src, body, (k) => {
          btn.innerHTML = `<span class="spin"></span> ${ok + 1}/${files.length} · ${Math.round(k * 100)}%`;
          if (pct) pct.textContent = `${Math.round(k * 100)}%`;
        });
        if (ai && r.item?.id) {
          btn.innerHTML = `<span class="spin"></span> ${ok + 1}/${files.length} · 🪄 ${t('AI sifatli qilmoqda…')}`;
          try {
            const color = !!f.get('color'), prep = await prepForAI(URL.createObjectURL(file));
            const e1 = await api(`album/i/${r.item.id}/enhance`, { method: 'POST', body: { img: prep.img, color }, timeout: 290000 });
            await api(`album/i/${r.item.id}/enhance`, { method: 'POST', body: { rid: e1.rid, color }, timeout: 90000 });
          } catch (err) { toast(err.message, true); }
        }
        if (fix && !ai) toFix.push({ src: URL.createObjectURL(file), album: r.album.id, caption: body.caption || '' });
        if (pct) pct.textContent = '✅';
        if (body.albumName) { body.album = r.album.id; delete body.albumName; }
        ok++;
      } catch (err) {
        if (pct) pct.textContent = '⚠️';
        toast(err.message, true);
        break;
      }
    }
    closeAllSheets();
    if (ok) toast(t('{n} ta fayl qo‘shildi 📸', { n: ok }));
    await refreshAlbum();
    for (const x of toFix) await repairSheet(x);
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
      ${inTelegram && tr.me ? item('m-me', '👤', t('Shajarada men'), tr.me.pid && S.fam.get(tr.me.pid) ? esc(nm(S.fam.get(tr.me.pid).name)) + ' · ' + t('o‘zgartirish') : t('Belgilanmagan — o‘zingizni tanlang')) : ''}
      ${item('m-ai', '✨', t('AI yordamchi'), t('Ilova va bot haqida istalgan savol'))}
      ${item('m-invite', '📨', t('Qarindoshlarni taklif qilish'), t('Shaxsiy taklif havolasi — kodni aytish shart emas'))}
      ${item('m-notif', '🔔', t('Bildirishnomalar'), t('Yangiliklar va sozlamalar'))}
      ${inTelegram ? item('m-book', '📖', t('Shajara kitobi'), t('Chop etishga tayyor kitob — PDF qilib saqlash mumkin')) : ''}
      ${item('m-lang', '🌐', t('Til'), LANG_NAMES[LANG])}
      ${item('m-group', '👨‍👩‍👧', t('Oilaviy guruh'), tr.groups.length ? tr.groups.map((g) => esc(g.title)).join(', ') : t('Botni oilaviy guruhingizga qo‘shing'))}
      ${item('m-premium', '⭐', 'Premium', prem.active ? t('Faol: {d} gacha', { d: fmtDate(prem.until.slice(0, 10)) }) : prem.paywall ? t('Cheksiz albom va barcha imkoniyatlar') : t('Hozircha barcha imkoniyatlar bepul'))}
    </div>
    ${canEdit() ? `<div class="section"><h3 class="h3">${t('Tahrirchi uchun')}</h3></div><div class="card menu">
      ${item('m-edit', isEdit() ? '🔓' : '🔒', isEdit() ? t('Tahrir rejimini yopish') : t('Tahrir rejimini yoqish'), '', `<span class="switch"><input type="checkbox" ${isEdit() ? 'checked' : ''} tabindex="-1"><span></span></span>`)}
      ${item('m-channel', '🗄', t('Albom kanali'), tr.channel ? '✅ ' + esc(tr.channel.title) : t('Ulanmagan — fayllarni kanalda saqlang'))}
      ${item('m-branches', '📨', t('Oila havolalari va takliflar'), t('To‘liqlik paneli, oilalarga to‘ldirtirish va tasdiqlash'))}
      ${item('m-dupes', '🧹', t('Takroriy odamlar'), t('Ikkilangan yozuvlarni topish va birlashtirish'))}
      ${item('m-members', '👥', t('A’zolar va huquqlar'), t('{n} kishi kirgan', { n: tr.memberCount }))}
      ${item('m-settings', '⚙️', t('Shajara sozlamalari'), t('Nomi, kodlar, albom huquqlari'))}
      ${inTelegram ? item('m-export', '💾', t('Zaxira nusxa'), t('Shajara va albom ro‘yxati JSON faylda chatga')) : ''}
    </div>` : `<div class="card menu" style="margin-top:14px">${item('m-unlock', '🔐', t('Tahrirlash huquqini olish'), t('Tahrir kodi talab qilinadi'))}</div>`}
    <div class="section"><h3 class="h3">${t('Boshqa')}</h3></div>
    <div class="card menu">
      ${item('m-switch', '🌳', t('Boshqa shajaraga o‘tish'), t('Kod kiritish yoki yangi yaratish'))}
      ${item('m-onb', '✨', t('Tanishtiruvni qayta ko‘rish'))}
      ${item('m-legal', '📄', t('Maxfiylik siyosati va shartlar'))}
      ${item('m-forget', '🚪', t('Shu qurilmadan chiqish'), t('Keyingi safar kod qayta so‘raladi'), '', 'danger')}
    </div>
    <div class="muted small" style="text-align:center;padding:26px 16px 30px">Shajara AI · @${BOT}<br>${t('«Ildizini bilgan — adashmas»')}</div>
  </div>`;
  const on = (id, fn) => el.querySelector('#' + id)?.addEventListener('click', fn);
  on('m-me', whoAmISheet);
  on('m-invite', inviteSheet);
  on('m-ai', aiSheet);
  on('m-legal', () => openLink(location.origin + '/legal/privacy.html'));
  on('m-dupes', dupesSheet);
  on('m-branches', branchesSheet);
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
  on('m-book', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try { await api('book', { method: 'POST', timeout: 60000 }); toast(t('Kitob bot chatiga yuborildi 📖')); } catch (err) { toast(err.message, true); }
    b.disabled = false;
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
  branch: ['📨', 'Oila ma’lumotlari yangilandi: {name}'], join: ['👋', '{name} shajaraga qo‘shildi'], 'undo-import': ['↩️', 'Import bekor qilindi: {name}'], merge: ['🧹', 'Takror birlashtirildi: {name}'],
};

// Bildirishnomalar bo'limi (Instagram uslubi): Menga · Oila izohlari · Yangiliklar · Sozlamalar
// o'zim qilgan amal (eski yozuvlarda uid yo'q — ism bo'yicha)
function myLog(l) {
  const u = tg?.initDataUnsafe?.user;
  if (!u) return false;
  if (l.uid) return l.uid === String(u.id);
  return [[u.first_name, u.last_name].filter(Boolean).join(' '), u.username && '@' + u.username].filter(Boolean).includes(l.who);
}

// Yangiliklar yozuvi bosilganda: shaxs, albom fayli, yangi a'zo yoki takliflar paneli
function logTarget(l) {
  const r = l.ref;
  if (r && (r.startsWith('a:') || r.startsWith('u:') || S.fam?.get(r))) return r;
  // takliflar paneli — faqat tahrir rejimi yoqilgan tahrirchiga (bildirishnoma orqali ruxsatsiz bo'limga kirilmasin)
  if (l.action === 'branch' || r === 'props') return isEdit() ? 'props' : 'tree';
  if (l.action === 'album') { const a = S.album?.albums.find((x) => x.name === String(l.name || '').split(' · ')[0]); return a ? 'al:' + a.id : 'album'; }
  if (l.action === 'join') { const m = Object.entries(S.tree.members || {}).find(([, x]) => x.name === l.name); if (m) return 'u:' + m[0]; }
  const p = S.tree.persons.find((x) => x.name === l.name);
  return p ? p.id : 'tree';
}
function openLogTarget(r) {
  if (r === 'props') return isEdit() ? branchesSheet() : switchTab('tree');
  if (r === 'tree' || r === 'album') return switchTab(r);
  if (r.startsWith('al:')) { S.albumFilter = r.slice(3); return switchTab('album'); }
  if (r.startsWith('a:')) return openMediaComments(r.slice(2), false);
  if (r.startsWith('u:')) return openMember(r.slice(2));
  return personSheet(r);
}
async function openMember(id) {
  try { const u = await api('member/' + id); openUser(u); } catch (err) { toast(err.message, true); }
}

function notificationsSheet(tab) {
  const U = unreadParts();
  tab ||= U.me ? 'me' : U.fam ? 'fam' : U.log ? 'log' : 'me';
  const tr = S.tree;
  const seen = store.get('sh_seen_' + tr.id, '');
  // bitta odamning 1 soat ichidagi ketma-ket albom yozuvlari — bitta qator (eski yozuvlar uchun ham)
  const log = (tr.log || []).filter((l) => !myLog(l)).reduce((acc, l) => {
    const prev = acc[acc.length - 1];
    const [an, n] = String(l.name || '').split(' · ');
    if (prev && l.action === 'album' && prev.action === 'album' && prev.who === l.who && prev.an === an && Date.parse(prev.last) - Date.parse(l.at) < 3600e3) {
      prev.cnt += Number(n) || 1; prev.name = `${an} · ${prev.cnt}`; prev.last = l.at; return acc;
    }
    acc.push(l.action === 'album' ? { ...l, an, cnt: Number(n) || 1, last: l.at } : l);
    return acc;
  }, []);
  const n = tr.me?.notify || {};
  const sw = (k, label, def = true, sub = '') => `<label class="row card" style="padding:12px 14px;margin-bottom:8px"><div class="grow"><div style="font-weight:700">${label}</div>${sub ? `<div class="small muted">${sub}</div>` : ''}</div><span class="switch"><input type="checkbox" data-n="${k}" ${(n[k] ?? def) ? 'checked' : ''}><span></span></span></label>`;
  const tabs = [['me', '🔔 ' + t('Menga')], ['fam', '💬 ' + t('Oila izohlari')], ['log', '🌳 ' + t('Yangiliklar')], ['set', '⚙️']];
  const sh = openSheet(`<div class="sheet-head"><div class="h2 grow">🔔 ${t('Bildirishnomalar')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="chips ib-tabs">${tabs.map(([k, l]) => `<button class="chip" data-ib="${k}">${l}${U[k] ? `<span class="ib-n">${U[k]}</span>` : ''}</button>`).join('')}</div>
    <div class="sheet-body" id="ib-body"></div>`);
  sh.classList.add('sheet-full');
  const body = sh.querySelector('#ib-body');
  const KIND = { like: '❤️ {who} faylingizni yoqtirdi', cm: '💬 {who} faylingizga izoh yozdi', re: '↩️ {who} izohingizga javob yozdi', cmlike: '❤️ {who} izohingizni yoqtirdi' };
  let L = [];
  const row = (x, i) => {
    const c = x.c;
    const who = x.who || c?.by;
    const f = S.album?.items.find((y) => y.id === x.iid);
    const head = x.kind ? t(KIND[x.kind], { who: `<b>${esc(shortName(x.who.name))}</b>` }) : `<b>${esc(shortName(c.name))}</b>`;
    const isNew = x.isNew || (tab === 'fam' && S.famSeen && c?.at > S.famSeen && !c.mine);
    return `<div class="ib ${isNew ? 'new' : ''}" data-i="${i}">
      <button class="cm-avb" data-who="${i}">${uAvatar(x.kind ? who : { ...c.by, name: c.name })}</button>
      <div class="grow ib-main" data-open="${i}"><div class="small">${head} <span class="muted">· ${relTime(x.at || c.at)}</span></div>
        <div class="small muted ellipsis">📁 ${esc(nm(x.album))}</div>
        ${c && x.kind !== 'like' ? `<div class="cm-t">${c.text == null ? `<i class="muted">${t('Matn kanalda — hozircha o‘qib bo‘lmadi')}</i>` : esc(c.text)}</div>
        <div class="cm-a">${inTelegram ? `<button data-rep="${i}">${t('Javob berish')}</button>` : ''}<button class="ib-lk ${c.liked ? 'on' : ''}" data-lk="${i}">${VI.heart(c.liked)} ${c.likes || ''}</button></div>` : ''}</div>
      <button class="ib-th" data-open="${i}">${f?.thumb ? `<img src="${f.thumb}" alt="" loading="lazy">` : TYPE_ICON[f?.type] || '📄'}</button></div>`;
  };
  const draw = () => {
    body.innerHTML = L.length ? `<div class="card" style="padding:4px 12px">${L.map(row).join('')}</div>`
      : `<div class="empty small muted">${tab === 'me' ? t('Hozircha bildirishnoma yo‘q. Kimdir faylingizga yoki izohingizga like bossa yoki izoh yozsa, shu yerda ko‘rinadi.') : t('Hali izoh yo‘q')}</div>`;
  };
  const load = async (k) => {
    tab = k;
    sh.querySelectorAll('[data-ib]').forEach((b) => b.classList.toggle('on', b.dataset.ib === k));
    // bo'lim ochildi — uning soni o'qilgan hisoblanadi (yangilari ro'yxatda belgilanib turadi)
    sh.querySelector(`[data-ib="${k}"] .ib-n`)?.remove();
    if (k === 'fam') { S.famSeen = store.get('sh_fs_' + tr.id, ''); store.set('sh_fs_' + tr.id, new Date().toISOString()); S.famUnread = 0; refreshBell(); }
    if (k === 'log') {
      body.innerHTML = `<div class="card" style="padding:6px 0">${log.length ? log.slice(0, 60).map((l) => {
        const [ic, tx] = ACT[l.action] || ['•', l.action];
        const go = logTarget(l);
        return `<div class="log-item tap ${seen && l.at > seen ? 'new' : ''}" data-lg="${esc(go)}"><div class="dot">${ic}</div><div class="grow">${t(tx, { name: `<b>${esc(nm(l.name || ''))}</b>` })}<div class="small muted">${l.action === 'join' ? '' : esc(l.who || '') + ' · '}${relTime(l.at)}</div></div><span class="muted">›</span></div>`;
      }).join('') : `<div class="log-item muted">${t('Hozircha yangiliklar yo‘q')}</div>`}</div>`;
      body.querySelectorAll('[data-lg]').forEach((b) => (b.onclick = () => { closeTopSheet(); setTimeout(() => openLogTarget(b.dataset.lg), 150); }));
      store.set('sh_seen_' + tr.id, new Date().toISOString());
      refreshBell();
      return;
    }
    if (k === 'set') {
      body.innerHTML = inTelegram && tr.me ? `<div class="h3" style="margin:4px 2px 10px">${t('Menga Telegram orqali yuborilsin')}</div>
        ${sw('social', '❤️ ' + t('Like va izohlar (menga tegishli)'))}${sw('album', '📸 ' + t('Albomga yangi fayllar'))}${sw('tree', '🌱 ' + t('Shajaradagi yangiliklar'))}${sw('bday', '🎂 ' + t('Tug‘ilgan kun va xotira kunlari'))}
        ${sw('daily', '🌙 ' + t('Kunlik xulosa'), false, t('Albom va shajara yangiliklari darhol emas, kechqurun bitta xabarda keladi'))}`
        : `<div class="empty small muted">${t('Bu funksiya faqat Telegram ichida ishlaydi')}</div>`;
      body.querySelectorAll('[data-n]').forEach((c) => (c.onchange = async () => {
        const b = { notify: { [c.dataset.n]: c.checked } };
        try { await api('me', { method: 'PATCH', body: b }); tr.me.notify = { ...(tr.me.notify || {}), ...b.notify }; toast(t('Saqlandi ✓')); } catch (err) { c.checked = !c.checked; toast(err.message, true); }
      }));
      return;
    }
    body.innerHTML = `<div class="empty"><span class="spin" style="color:var(--primary)"></span></div>`;
    try {
      if (!S.album) await loadAlbum().catch(() => {});
      L = (await api('inbox?k=' + k)).items;
      if (tab !== k) return;
      draw();
      if (k === 'me') { S.inboxUnread = 0; refreshBell(); }
    } catch (err) { body.innerHTML = `<div class="empty small muted">${esc(err.message)}</div>`; }
  };
  sh.querySelectorAll('[data-ib]').forEach((b) => (b.onclick = () => load(b.dataset.ib)));
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-who],[data-open],[data-rep],[data-lk]');
    if (!b) return;
    const x = L[b.dataset.who ?? b.dataset.open ?? b.dataset.rep ?? b.dataset.lk];
    if (b.dataset.who) return openUser(x.kind ? x.who : { ...x.c.by, name: x.c.name });
    if (b.dataset.lk) {
      const c = x.c;
      c.liked = !c.liked; c.likes = Math.max(0, (c.likes || 0) + (c.liked ? 1 : -1)); draw(); haptic('light');
      try { const r = await api(`album/i/${x.iid}/c/${c.mid}/like`, { method: 'POST' }); if (r.likes != null) { c.likes = r.likes; c.liked = r.liked; draw(); } } catch {}
      return;
    }
    if (b.dataset.rep) {
      const c = x.c;
      const text = prompt(t('Javobingiz:') + ` ${c.name}`);
      if (!text?.trim()) return;
      try { await api(`album/i/${x.iid}/c`, { method: 'POST', body: { text: text.trim(), re: c.re || c.mid } }); toast(t('Yuborildi ✓')); haptic('success'); } catch (err) { toast(err.message, true); }
      return;
    }
    // fayl ochiladi (izoh bo'lsa — izohlari bilan)
    closeAllSheets();
    openMediaComments(x.iid, x.kind !== 'like');
  });
  load(tab);
}


function langSheet() {
  const sh = openSheet(`<div class="sheet-head"><div class="h2">🌐 ${t('Til')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body"><div class="card menu" style="margin:0">${Object.entries(LANG_NAMES).map(([k, v]) => `<button class="menu-item" data-lang="${k}"><div class="grow t">${v}</div>${LANG === k ? '✓' : ''}</button>`).join('')}</div></div>`);
  bindLangPicker(sh, () => { closeAllSheets(); renderMain(); });
}

function inviteSheet() {
  const tr = S.tree;
  const code = savedTrees().find((x) => x.id === tr.id)?.viewCode;
  // havola va xabar tanlangan tilda (ilova ham shu tilda ochiladi: oxiridagi -ru/-en/...)
  let lang = LANG;
  const link = () => `${tr.invite}-${lang}`;
  const msg = () => tIn(lang, '🌳 «{title}» — oilamiz shajarasi. Havolani bosing va o‘z ildizingizni ko‘ring!', { title: tr.title })[0];
  const sh = openSheet(`<div class="sheet-head"><div class="h2">📨 ${t('Taklif qilish')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body"><p class="muted" style="margin-top:0">${t('Bu havola orqali kirgan qarindoshlar shajarani ko‘ra oladi va albomga fayl qo‘sha oladi. Tahrirlash uchun alohida kod kerak.')}</p>
    <div class="h3" style="margin:6px 2px 8px">🌐 ${t('Havola tili')}</div>
    <div class="seg" data-seg="il" style="margin-bottom:10px">${Object.entries(LANG_NAMES).map(([k, v]) => `<button type="button" data-v="${k}" class="${k === lang ? 'on' : ''}">${v}</button>`).join('')}</div>
    <div class="card" id="il-link" style="padding:12px 14px;word-break:break-all;font-weight:700;font-size:13px">${esc(link())}</div>
    <div class="actions"><button class="btn btn-primary" id="shr">${I.share} ${t('Ulashish')}</button><button class="btn btn-ghost" id="cpy">${t('Nusxa olish')}</button></div>
    ${code ? `<div class="hint" style="text-align:center;margin-top:12px">${t('Kirish kodi: {code}', { code: `<b>${esc(code)}</b>` })}</div>` : ''}
    <div class="hint" style="text-align:center;margin-top:6px">${t('Havolani bekor qilish uchun sozlamalarda kirish kodini almashtiring.')}</div></div>`);
  bindSeg(sh);
  sh.querySelector('[data-seg="il"]').addEventListener('change', () => { lang = segVal(sh, 'il') || lang; sh.querySelector('#il-link').textContent = link(); });
  sh.querySelector('#shr').onclick = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(`${msg()}\n\n${link()}`)}`;
    if (inTelegram) openLink(url);
    else if (navigator.share) navigator.share({ text: msg() + '\n' + link() }).catch(() => {});
    else copyText(link());
  };
  sh.querySelector('#cpy').onclick = () => copyText(link());
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
      ${canEdit() ? `<div id="lk"><ol class="steps">${isCh
        ? `<li>${t('Telegramda yangi <b>yopiq kanal</b> oching (masalan: «{title} albomi»).', { title: esc(nm(tr.title)) })}</li><li>${t('Pastdagi tugmani bosing va o‘sha kanalni tanlang — bot admin bo‘ladi va kanal avtomatik ulanadi.')}</li>`
        : `<li>${t('Pastdagi tugmani bosing va oilaviy guruhingizni tanlang — bot avtomatik ulanadi.')}</li>`}</ol>
        <button class="btn btn-primary btn-block" id="gen">${t(isCh ? 'Botni kanalga qo‘shish' : 'Guruhni tanlash')}</button></div>` : `<div class="hint">${t('Ulash uchun tahrir huquqi kerak.')}</div>`}
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
      const n0 = (tr.groups || []).length;
      awaitLink(sh, {
        code: r.code, group: !isCh,
        url: isCh ? `https://t.me/${r.bot}?startchannel&admin=post_messages+edit_messages+delete_messages+invite_users` : `https://t.me/${r.bot}?startgroup=${r.code}`,
        done: async () => {
          const fresh = await api('tree');
          const ok = isCh ? !!fresh.tree.channel : (fresh.tree.groups || []).length > n0;
          if (ok) { closeAllSheets(); onTreeChanged(fresh.tree); toast(t(isCh ? 'Kanal ulandi ✅' : 'Guruh ulandi ✅')); }
          return ok;
        },
      });
    } catch (err) { toast(err.message, true); gen.disabled = false; }
  });
}

// Bot kanal/guruhga qo'shilishi bilan o'zi ulanadi (kod shart emas): ilovaga qaytilganda va har 6 soniyada tekshiramiz
function awaitLink(sh, { code, url, group, done }) {
  openLink(url);
  sh.querySelector('#lk').innerHTML = `<div class="card note" style="text-align:center">⏳ ${t(group ? 'Guruh tanlangach, bot o‘zi ulanadi' : 'Kanal tanlangach, bot o‘zi ulanadi')}</div>
    <button class="btn btn-primary btn-block" style="margin-top:10px" id="again">${t(group ? 'Guruhni tanlash' : 'Botni kanalga qo‘shish')}</button>
    <button class="btn btn-soft btn-block" style="margin-top:8px" id="chk">${t('Uladim — tekshirish')}</button>
    <div class="hint" style="margin-top:12px">${t(group ? 'Agar ulanmasa, guruhga shu buyruqni yozing:' : 'Avtomatik ulanmasa, kanalga shu buyruqni yozing:')}<div class="code-pill">/ulash ${code}</div></div>
    <button class="btn btn-ghost btn-block btn-sm" id="cpc">${t('Buyruqdan nusxa olish')}</button>`;
  let stop = false;
  let n = 0;
  const check = async (loud) => {
    if (stop || !sh.isConnected) return;
    if (await done().catch(() => false)) stop = true;
    else if (loud) toast(t('Hali ulanmagan — kanalni tanlang yoki /ulash buyrug‘ini yozing'), true);
  };
  const onVis = () => document.visibilityState === 'visible' && check();
  const iv = setInterval(() => {
    if (stop || !sh.isConnected || ++n > 20) { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); tg?.offEvent?.('activated', onVis); return; }
    check();
  }, 6000);
  document.addEventListener('visibilitychange', onVis);
  tg?.onEvent?.('activated', onVis);
  sh.querySelector('#again').onclick = () => openLink(url);
  sh.querySelector('#chk').onclick = () => check(true);
  sh.querySelector('#cpc').onclick = () => copyText(`/ulash ${code}`);
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

// Asl sifatda yuklash: fayl o'zgartirilmaydi, 2.5 MB bo'laklarda yuboriladi va kanalga «fayl» sifatida saqlanadi
async function uploadOriginal(file, meta = {}, onProgress) {
  const CH = 2.5 * 1024 * 1024;
  const n = Math.max(1, Math.ceil(file.size / CH));
  if (file.size > UP_MAX) throw new Error(t('Fayl juda katta (50 MB gacha)'));
  const u = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  for (let i = 0; i < n; i++) {
    onProgress?.(i / n);
    await api('album/up/chunk', { method: 'POST', body: { u, i, data: await fileB64(file.slice(i * CH, (i + 1) * CH)) } });
  }
  onProgress?.(1);
  return api('album/up/finish', { method: 'POST', body: { u, n, name: file.name || 'photo.jpg', mime: file.type || 'application/octet-stream', ...meta } });
}
const fileB64 = (blob) => new Promise((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] || '');
  r.onerror = () => bad(r.error);
  r.readAsDataURL(blob);
});
// 🪄 Eski (chop etilgan) rasmni avtomatik tuzatish — faqat oddiy ishlov, rasmga hech narsa «chizilmaydi»:
// har kanal bo'yicha darajalarni cho'zish (sarg'ayish/xiralikni ketkazadi, oq balans), so'ng yengil keskinlik.
async function autoFix(file) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 3000 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  const lo = [], hi = [];
  for (let ch = 0; ch < 3; ch++) {
    const h = new Uint32Array(256);
    for (let i = ch; i < p.length; i += 16) h[p[i]]++; // har 4-piksel — tezlik uchun
    const n = p.length / 16;
    let s = 0, a = 0, b = 255;
    for (let v = 0; v < 256; v++) { s += h[v]; if (s > n * 0.005) { a = v; break; } }
    s = 0;
    for (let v = 255; v >= 0; v--) { s += h[v]; if (s > n * 0.005) { b = v; break; } }
    if (b - a < 100) { const m = (a + b) / 2; a = Math.max(0, m - 50); b = Math.min(255, m + 50); } // haddan oshirmaslik
    lo[ch] = a; hi[ch] = b;
  }
  const lut = [0, 1, 2].map((ch) => Uint8ClampedArray.from({ length: 256 }, (_, v) => ((v - lo[ch]) * 255) / (hi[ch] - lo[ch])));
  for (let i = 0; i < p.length; i += 4) { p[i] = lut[0][p[i]]; p[i + 1] = lut[1][p[i + 1]]; p[i + 2] = lut[2][p[i + 2]]; }
  ctx.putImageData(d, 0, 0);
  // yengil keskinlik (unsharp mask): asl + 0.5 × (asl − xiralashtirilgan)
  if ('filter' in ctx) {
    const b = document.createElement('canvas');
    b.width = c.width; b.height = c.height;
    const bx = b.getContext('2d', { willReadFrequently: true });
    bx.filter = `blur(${Math.max(1, Math.round(c.width / 1500))}px)`;
    bx.drawImage(c, 0, 0);
    const bd = bx.getImageData(0, 0, c.width, c.height).data;
    const o = ctx.getImageData(0, 0, c.width, c.height);
    const q = o.data;
    for (let i = 0; i < q.length; i += 4) for (let j = 0; j < 3; j++) q[i + j] = q[i + j] + 0.5 * (q[i + j] - bd[i + j]);
    ctx.putImageData(o, 0, 0);
  }
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.92));
  return new File([blob], (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}
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
  if (!wrap || wrap.dataset.closing || wrap.dataset.lock) return;
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
    p.fname && [t('Otasining ismi'), esc(p.fname)],
    p.code && [t('Daftar raqami'), p.code],
    p.phone && [t('Telefon'), `<a href="tel:${esc(p.phone)}" style="color:var(--primary)">${esc(p.phone)}</a>`],
  ].filter(Boolean);
  const edit = isEdit();
  const sh = openSheet(`<div class="sheet-body">
    <div class="p-hero"><div style="position:relative">${avatar(p, 112, 'ring')}${edit ? `<button class="photo-edit" id="ph">${I.camera}</button>` : ''}</div>
      <h2>${esc(nm(p.name))}${S.tree.me?.pid === p.id ? ` <span class="me-badge">${t('Siz')}</span>` : ''}</h2>${patronymic(p) ? `<div class="patr">${esc(nm(patronymic(p)))}</div>` : ''}<div class="dates">${esc(yearsLabel(p)) || '&nbsp;'}</div>
      ${meKin(p) ? `<div class="kin-me">🫶 ${t('Sizga')}: <b>${esc(meKin(p))}</b></div>` : ''}
      <div class="badges">${p.blood ? `<span class="badge green">🩸 ${t('Qon qarindosh')}</span>` : `<span class="badge grey">💍 ${t('Kelin/kuyov')}</span>`}${p.deceased ? `<span class="badge grey">🤲 ${t('Marhum')}</span>` : ''}<span class="badge gold">${t('{n}-avlod', { n: fam.gen(p) })}</span></div></div>
    ${lin.length > 1 ? `<div class="card lineage"><span class="h3" style="width:100%;margin-bottom:4px">${t('Nasl yo‘li')}</span>${lin.map((x, i) => `${i ? '<span class="sep">›</span>' : ''}<button data-go="${x.id}" class="${x.id === p.id ? 'me' : ''}">${esc(nm(x.name))}</button>`).join('')}${!p.blood ? `<span class="sep">💍</span><button class="me">${esc(nm(p.name))}</button>` : ''}</div>` : ''}
    <dl class="card info-list">${info.map(([k, v]) => `<div><dt>${k}</dt><dd>${String(v).startsWith('<a') ? v : esc(v)}</dd></div>`).join('')}</dl>
    ${p.bio ? `<div class="card note"><div class="h3" style="margin-bottom:6px">${t('Hayot yo‘li')}</div>${esc(p.bio)}</div>` : ''}
    ${p.note ? `<div class="card note">📝 ${esc(p.note)}</div>` : ''}
    ${p.deceased ? `<button class="btn btn-soft full" id="memo" style="margin-bottom:10px">🕯 ${t('Xotira sahifasi')}</button>` : ''}
    <div id="p-photos"></div>
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
        <button class="btn btn-ghost btn-sm full" id="br-link">🔗 ${t('{name} oilasi havolasi — o‘zlari to‘ldirsin', { name: esc(nm(p.name)) })}</button>
        <button class="btn btn-ghost btn-sm" id="edit">${I.edit} ${t('Tahrirlash')}</button>
        <button class="btn btn-danger btn-sm" id="del">${I.trash} ${t('O‘chirish')}</button>` : canEdit() ? '' : `<button class="btn btn-ghost btn-sm full" id="ask-edit">${I.lock} ${t('Tahrirlash uchun kod kiriting')}</button>`}
    </div><div style="height:8px"></div></div>`);
  sh.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { closeTopSheet(); setTimeout(() => personSheet(b.dataset.go), 120); }));
  // shu odam belgilangan suratlar
  (S.album ? Promise.resolve(S.album) : loadAlbum().catch(() => null)).then((A) => {
    const box = sh.querySelector('#p-photos');
    const xs = (A?.items || []).filter((it) => (it.tags || []).includes(p.id));
    if (!box || !xs.length) return;
    const ids = xs.map((x) => x.id);
    box.innerHTML = `<div class="rel-group"><div class="h3">📸 ${t('Suratlari')} · ${xs.length}</div><div class="grid">${xs.slice(0, 12).map(tile).join('')}</div></div>`;
    box.querySelectorAll('[data-item]').forEach((b) => (b.onclick = () => { viewerOpen?.(); openViewer(ids, ids.indexOf(b.dataset.item), { over: true }); }));
  });
  sh.querySelector('#memo')?.addEventListener('click', () => memorialSheet(p.id));
  sh.querySelector('#in-tree').onclick = () => {
    closeAllSheets();
    if (S.tab !== 'tree') switchTab('tree');
    setTimeout(() => S.treeView?.focus(p.id, { k: 1 }), 80);
  };
  sh.querySelector('#ask-edit')?.addEventListener('click', () => { closeTopSheet(); unlockSheet(); });
  sh.querySelector('#edit')?.addEventListener('click', () => personForm({ person: p }));
  sh.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => personForm({ relation: b.dataset.add, of: p })));
  sh.querySelector('#br-link')?.addEventListener('click', () => branchLinkSheet(p));
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
  // rasmga bosilsa — to'liq hajmda (albomdagi asl nusxa, bo'lmasa avatarning o'zi)
  sh.querySelector('.p-hero .avatar img')?.closest('.avatar').addEventListener('click', () => openPortrait(p));
  if (p.photoItem && !S.album?.items.some((x) => x.id === p.photoItem)) loadAlbum(true).catch(() => {});
}
// Otasining ismi bo'yicha: 2000-yilgacha «Jumaboyevich/…evna», keyin «Jumaboy o‘g‘li/qizi» (portret izohidagi qoida bilan bir xil)
// Qon qarindosh ismida familiya/otasining ismi bo'lsa — faqat ism (serverdagi stripSurname bilan bir xil)
function stripSur(name) {
  const w = String(name || '').trim().split(/\s+/);
  if (w.length < 2) return w.join(' ');
  if (/^\S+(ov|ova|ev|eva|yev|yeva|ovich|evich|ovna|evna|yevna)$/i.test(w[1]) || /(^|\s)(qizi|o[‘'’`ʻ]?g[‘'’`ʻ]?li|қизи|ўғли)$/i.test(w.slice(1).join(' '))) return w[0];
  return w.join(' ');
}
function patronymic(p) {
  if (stripSur(p.name) !== String(p.name || '').trim()) return ''; // ismda allaqachon yozilgan
  const f = S.fam.get(p.father_id);
  const first = String(f?.name || p.fname || '').trim().split(/\s+/)[0];
  if (!first) return '';
  const yr = Number(String(p.birth || '').slice(0, 4)) || (Number(String(f?.birth || '').slice(0, 4)) + 25) || (p.deceased ? 1950 : 2000);
  const l = first.slice(-1).toLowerCase();
  const fem = p.gender === 'f';
  return yr < 2000 ? first + (/[aeiou]/.test(l) ? 'yev' : l === 'y' ? 'ev' : 'ov') + (fem ? 'na' : 'ich') : `${first} ${fem ? 'qizi' : 'o‘g‘li'}`;
}
// viewer ustida shaxs oynasi
// Xotira sahifasi: marhumning surati, sanalari, suratlari va oila yozgan xotira/duolar
async function memorialSheet(id) {
  const p = S.fam.get(id);
  if (!p) return;
  const yrs = p.death ? new Date().getFullYear() - Number(String(p.death).slice(0, 4)) : null;
  const sh = openSheet(`<div class="sheet-head"><div class="h2 grow">🕯 ${t('Xotira sahifasi')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body"><div class="prof">${avatar(p, 96)}<div class="h2" style="margin-top:10px">${esc(nm(p.name))}</div>
      <div class="small muted">${esc(p.birth ? fmtDate(p.birth) : '')} — ${esc(p.death ? fmtDate(p.death) : '')}${yrs ? ` · ${t('vafotiga {n} yil', { n: yrs })}` : ''}</div></div>
      <div id="mm-ph"></div>
      <div class="h3" style="margin:16px 2px 8px">🤲 ${t('Xotira va duolar')}</div><div id="mm-list"><div class="empty"><span class="spin" style="color:var(--primary)"></span></div></div>
      ${inTelegram && S.tree.me ? `<textarea class="input" id="mm-t" rows="3" maxlength="1000" placeholder="${t('Xotira yoki duo yozing…')}" style="margin-top:10px"></textarea>
      <button class="btn btn-primary btn-block" id="mm-s" style="margin-top:8px">${t('Yuborish')}</button>` : ''}</div>`);
  const xs = (S.album?.items || []).filter((it) => (it.tags || []).includes(id));
  if (xs.length) {
    const ids = xs.map((x) => x.id);
    sh.querySelector('#mm-ph').innerHTML = `<div class="h3" style="margin:16px 2px 8px">📸 ${t('Suratlari')} · ${xs.length}</div><div class="grid">${xs.slice(0, 30).map(tile).join('')}</div>`;
    sh.querySelectorAll('[data-item]').forEach((b) => (b.onclick = () => { viewerOpen?.(); openViewer(ids, ids.indexOf(b.dataset.item), { over: true }); }));
  }
  const list = sh.querySelector('#mm-list');
  const draw = (items) => {
    list.innerHTML = items.length ? items.map((x) => `<div class="card" style="padding:10px 12px;margin-bottom:8px"><div class="small"><b>${esc(x.name)}</b> <span class="muted">· ${relTime(x.at)}</span>${x.mine ? ` <button class="btn btn-ghost btn-sm" data-mdel="${x.id}" style="float:right">✕</button>` : ''}</div><div style="margin-top:4px;white-space:pre-wrap">${esc(x.text)}</div></div>`).join('')
      : `<div class="small muted">${t('Hali hech kim yozmagan. Birinchi bo‘lib yod eting.')}</div>`;
    list.querySelectorAll('[data-mdel]').forEach((b) => (b.onclick = async () => { await api(`memory/${id}/${b.dataset.mdel}`, { method: 'DELETE' }).catch((e) => toast(e.message, true)); load(); }));
  };
  const load = async () => { try { draw((await api('memory/' + id)).items); } catch (err) { list.innerHTML = `<div class="small muted">${esc(err.message)}</div>`; } };
  load();
  sh.querySelector('#mm-s')?.addEventListener('click', async (e) => {
    const ta = sh.querySelector('#mm-t');
    if (!ta.value.trim()) return;
    e.currentTarget.disabled = true;
    try { await api('memory/' + id, { method: 'POST', body: { text: ta.value } }); ta.value = ''; load(); } catch (err) { toast(err.message, true); }
    e.currentTarget.disabled = false;
  });
}
function personSheetOver(id) { personSheet(id); const last = [...$sheets.children].pop()?.querySelector('.sheet'); last?.classList.add('over-rv'); }
async function openPortrait(p) {
  // darhol avatar ko'rinadi, albomdagi asl nusxa tayyor bo'lgach o'sha ochiladi
  const src = photoUrl(p);
  const box = document.createElement('div');
  box.className = 'pz';
  box.innerHTML = `${src ? `<img src="${src}" alt="">` : ''}${p.photoItem ? '<span class="spin pz-spin"></span>' : ''}<button class="rv-x">${I.close}</button>`;
  box.onclick = () => box.remove();
  document.body.append(box);
  if (!p.photoItem) return;
  try {
    if (!S.album?.items.some((x) => x.id === p.photoItem)) await loadAlbum(true);
    if (!box.isConnected || !S.album.items.some((x) => x.id === p.photoItem)) return box.querySelector('.pz-spin')?.remove();
    box.remove();
    viewerOpen?.();
    openViewer([p.photoItem], 0, { over: true });
  } catch { box.querySelector('.pz-spin')?.remove(); }
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
      const data = await resizeImage(file, 640, true); // kichik avatar (ko'rsatish uchun)
      let r = await api(`person/${p.id}/photo`, { method: 'POST', body: { data } });
      // asl nusxa — albomning «Portretlar» papkasiga, siqilmagan holda (kanal ulanmagan bo'lsa o'tkazib yuboriladi)
      try {
        sh.querySelector('label.btn').innerHTML = `<span class="spin"></span> ${t('Asl nusxa albomga saqlanmoqda…')}`;
        const up = await uploadOriginal(file, { pid: p.id });
        if (up.item) { S.album = null; const q = r.tree.persons.find((x) => x.id === p.id); if (q) q.photoItem = up.item; }
      } catch {}
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
      <div class="field"><label>${t('Otasining ismi')}</label><input class="input" name="fname" value="${esc(p.fname || '')}" placeholder="${t('Shajarada otasi bo‘lmasa (masalan, kelin uchun)')}" maxlength="60"></div>
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
      fname: f.get('fname'), place: f.get('place'), phone: f.get('phone'), bio: f.get('bio'), note: f.get('note'), code: f.get('code'),
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

// =================================================================== SHOX TO'LDIRISH (havola orqali)
// Qarindosh oila boshidan boshlab har bir oilani ketma-ket tasdiqlaydi/to'ldiradi; oxirida taklif yuboriladi.
async function renderBranchWizard(treeId, bid) {
  showLoader();
  let d;
  try { d = await api(`br/${treeId}/${bid}`, { token: null }); } catch (err) {
    $app.innerHTML = `<div class="empty" style="padding-top:80px"><div class="big">🔗</div><b>${esc(err.message)}</b></div>`;
    return;
  }
  if (d.lang && d.lang !== LANG) setLang(d.lang); // havola yuborilgan til
  const orig = new Map(d.persons.map((p) => [p.id, p]));
  const W = new Map(d.persons.map((p) => [p.id, { ...p, spouse_ids: [...p.spouse_ids] }]));
  let seq = 0;
  const newId = () => 'n' + (++seq);
  // qoralama: avval kiritilganlar tiklanadi va to'xtagan qadamdan davom etiladi
  for (const o of d.draft?.ops || []) {
    if (o.op === 'update' && W.has(o.id)) Object.assign(W.get(o.id), o.f);
    else if (o.op === 'add' && o.tmp) {
      W.set(o.tmp, { id: o.tmp, ...o.f, father_id: o.father || null, mother_id: o.mother || null, spouse_ids: o.spouse ? [o.spouse] : [], unk: !!o.unk });
      seq = Math.max(seq, Number(String(o.tmp).slice(1)) || 0);
    }
  }
  for (const o of d.draft?.ops || []) if (o.op === 'update' && o.unk && W.has(o.id)) W.get(o.id).unk = true;
  const kidsOf = (id) => [...W.values()].filter((p) => p.father_id === id || p.mother_id === id);
  const spousesOf = (id) => [...new Set([...(W.get(id)?.spouse_ids || []), ...[...W.values()].filter((p) => p.spouse_ids.includes(id)).map((p) => p.id)])].map((x) => W.get(x)).filter(Boolean);
  // qadamlar: bosh va uning qon avlodlari (juftlar o'z jufti kartasida to'ldiriladi)
  const order = () => {
    const out = [];
    const walk = (id) => { if (out.includes(id)) return; out.push(id); kidsOf(id).forEach((c) => walk(c.id)); };
    walk(d.head);
    return out;
  };
  let i = Math.max(0, Math.min(Number(d.draft?.step) || 0, order().length - 1));
  let curSave = null;
  const yr = (v) => Number(String(v || '').slice(0, 4)) || 0;
  // o'zgarishlar ro'yxati (yuborish va qoralama uchun)
  const buildOps = () => {
    const ops = [];
    for (const x of W.values()) {
      if (String(x.id).startsWith('n')) {
        ops.push({ op: 'add', tmp: x.id, f: { name: x.name, gender: x.gender, birth: x.birth, death: x.death, deceased: x.deceased, fname: x.fname || null }, father: x.father_id, mother: x.mother_id, spouse: x.spouse_ids[0] || null, ...(x.unk ? { unk: true } : {}) });
        continue;
      }
      const o = orig.get(x.id);
      const f = {};
      if (x.name && x.name !== o.name) f.name = x.name;
      if (x.gender !== o.gender) f.gender = x.gender;
      if ((x.birth || null) !== (o.birth || null)) f.birth = x.birth;
      if ((x.fname || null) !== (o.fname || null)) f.fname = x.fname;
      if (!!x.deceased !== !!o.deceased) f.deceased = x.deceased;
      if ((x.death || null) !== (o.death || null) && x.death) f.death = x.death;
      if (Object.keys(f).length) ops.push({ op: 'update', id: x.id, f, ...(x.unk ? { unk: true } : {}) });
    }
    return ops;
  };
  // avtomatik saqlash: har qadamda va sahifadan chiqib ketganda
  let lastDraft = '';
  let stale = false;
  const onStale = (err) => { if (err?.status !== 409 || stale) return false; stale = true; toast(err.message); setTimeout(() => renderBranchWizard(treeId, bid), 1200); return true; };
  const saveDraft = async () => {
    if (stale) return;
    const body = { ops: buildOps(), step: i, base: d.base };
    const k = JSON.stringify(body.ops) + i;
    if (k === lastDraft || (!body.ops.length && !d.draft)) return;
    lastDraft = k;
    try { await api(`br/${treeId}/${bid}/draft`, { method: 'PUT', body, token: null }); } catch (err) { lastDraft = ''; onStale(err); }
  };
  const flush = () => { if (document.visibilityState === 'hidden' && document.querySelector('.bw-row')) { curSave?.(); saveDraft(); } };
  document.addEventListener('visibilitychange', flush);
  const draw = () => {
    const ids = order();
    const p = W.get(ids[i]);
    const sps = spousesOf(p.id);
    const kids = kidsOf(p.id);
    const row = (x, kind) => `<div class="bw-row" data-id="${x.id}" data-kind="${kind}" data-unk="${x.unk ? 1 : ''}">
        ${kind === 'sp' ? (() => { const [f0, ...sur] = String(x.name || '').split(' '); return `<div class="bw-names">
          <label class="fl"><span>${t('Ismi')}</span><input class="input" name="first" value="${esc(f0 || '')}" placeholder="${t('Ismi')}"></label>
          <label class="fl"><span>${t('Familiyasi')}</span><input class="input" name="sur" value="${esc(sur.join(' '))}" placeholder="${t('Familiyasi')}"></label>
          <label class="fl"><span>${t('Otasining ismi')}</span><input class="input" name="fname" value="${esc(x.fname || '')}" placeholder="${t('Otasining ismi')}"></label></div>`; })()
          : `<label class="fl"><span>${t('Ismi')}</span><input class="input" name="name" value="${esc(x.name || '')}" placeholder="${t('Faqat ismi (masalan: Go‘zal)')}"></label>`}
        <div class="bw-sub">${kind === 'kid' ? `<label class="fl"><span>${t('Jinsi')}</span><select class="input" name="gender"><option value="m" ${x.gender !== 'f' ? 'selected' : ''}>👦 ${t('O‘g‘il')}</option><option value="f" ${x.gender === 'f' ? 'selected' : ''}>👧 ${t('Qiz')}</option></select></label>` : ''}
          <label class="fl"><span>${t('Tug‘ilgan sana')}</span><input class="input" name="birth" value="${esc(dateToInput(x.birth))}" placeholder="${t('Tug‘ilgan sana: 20.03.1958')}" inputmode="numeric"></label>
          <button type="button" class="bw-unk ${x.unk ? 'on' : ''}" data-unk-btn>🤷 ${t('Bilmayman')}</button>
          <label class="bw-dec"><input type="checkbox" name="deceased" ${x.deceased ? 'checked' : ''}> ${t('Marhum')}</label></div>
        <label class="fl bw-death ${x.deceased ? '' : 'hidden'}"><span>${t('Vafot sanasi')}</span><input class="input" name="death" value="${esc(dateToInput(x.death))}" placeholder="${t('Vafot sanasi: 05.06.2001')}" inputmode="numeric"></label>
        ${kind === 'kid' && sps.length > 1 ? `<select class="input" name="other">${sps.map((s) => `<option value="${s.id}" ${[x.father_id, x.mother_id].includes(s.id) ? 'selected' : ''}>${t(p.gender === 'f' ? 'Otasi' : 'Onasi')}: ${esc(s.name)}</option>`).join('')}</select>` : ''}
        ${String(x.id).startsWith('n') ? `<button type="button" class="bw-del" data-del="${x.id}">✕</button>` : ''}
        <div class="bw-warn hidden"></div></div>`;
    $app.innerHTML = `<div class="screen"><div class="topbar"><div class="grow"><div class="title ellipsis">${esc(d.title)}</div>
        <div class="sub">${t('{n} / {m} oila', { n: i + 1, m: ids.length })}</div></div></div>
      <div class="bw-prog"><i style="width:${((i + 1) / ids.length) * 100}%"></i></div>
      <div class="scroll pad"><form id="bw" autocomplete="off">
        ${i === 0 ? `<div class="card note" style="margin-bottom:12px">${t('Har bir oilani tekshirib chiqing: to‘g‘ri bo‘lsa — «Keyingisi», noto‘g‘ri yoki yetishmasa — tuzating va qo‘shing. Barcha maydonlar to‘ldirilishi shart — sanalarni to‘liq (kun.oy.yil) yozing.')}</div>` : ''}
        <div class="h3">👤 ${t('Shaxs')}</div>
        <div class="bw-person">${row(p, 'self')}
          <div class="seg" data-seg="g"><button type="button" data-v="m" class="${p.gender !== 'f' ? 'on' : ''}">👨 ${t('Erkak')}</button><button type="button" data-v="f" class="${p.gender === 'f' ? 'on' : ''}">👩 ${t('Ayol')}</button></div></div>
        <div class="h3" style="margin-top:18px">💍 ${t('Turmush o‘rtog‘i')}</div>
        <div id="bw-sp">${sps.map((s) => row(s, 'sp')).join('') || `<div class="small muted">${t('Kiritilmagan')}</div>`}</div>
        <button type="button" class="btn btn-ghost btn-sm" id="add-sp">➕ ${t('Turmush o‘rtog‘i qo‘shish')}</button>
        <div class="h3" style="margin-top:18px">👶 ${t('Farzandlari')} · ${kids.length}</div>
        <div id="bw-kids">${kids.map((k) => row(k, 'kid')).join('') || `<div class="small muted">${t('Kiritilmagan')}</div>`}</div>
        <button type="button" class="btn btn-ghost btn-sm" id="add-kid">➕ ${t('Farzand qo‘shish')}</button>
        ${!String(p.id).startsWith('n') && p.id !== d.head ? `<button type="button" class="btn btn-ghost btn-sm full" id="dlg" style="margin-top:14px">🔗 ${t('Bu oilani boshqa kishiga topshirish')}</button>` : ''}
        <div class="bw-nav">${i > 0 ? `<button type="button" class="btn btn-soft" id="prev">← ${t('Orqaga')}</button>` : ''}
          <button class="btn btn-primary grow">${i < ids.length - 1 ? `${t('Keyingisi')} →` : `✅ ${t('Yuborish')}`}</button></div>
        <button type="button" class="btn btn-ghost btn-sm full" id="bw-later" style="margin-top:10px">💾 ${t('Saqlab, keyinroq davom ettirish')}</button>
        <div class="small muted" style="text-align:center;margin-top:6px">${t('Kiritganlaringiz avtomatik saqlanadi — havolani qayta ochsangiz, shu joydan davom etasiz.')}</div>
        <div style="height:40px"></div></form></div></div>`;
    bindSeg($app);
    const form = $app.querySelector('#bw');
    // ota-ona va farzand yoshi farqini tekshirish (ogohlantirish, to'smaydi)
    const warn = () => form.querySelectorAll('.bw-row[data-kind="kid"]').forEach((r) => {
      const b = yr(parseDateInput(r.querySelector('[name=birth]').value) || '');
      const pb = yr(parseDateInput(form.querySelector('.bw-row[data-kind="self"] [name=birth]').value) || '');
      const w = r.querySelector('.bw-warn');
      const bad = b && pb && b - pb < 14;
      w.classList.toggle('hidden', !bad);
      w.textContent = bad ? t('Diqqat: farzand ota-onasidan 14 yoshdan kam kichik') : '';
    });
    form.oninput = warn;
    form.onchange = (e) => { if (e.target.name === 'deceased') e.target.closest('.bw-row').querySelector('.bw-death').classList.toggle('hidden', !e.target.checked); };
    warn();
    // strict — «Keyingisi»/«Yuborish»da: hech qaysi maydon bo'sh qolmasin
    const save = (strict) => {
      for (const r of form.querySelectorAll('.bw-row')) {
        const x = W.get(r.dataset.id);
        if (!x) continue;
        // turmush o'rtog'i: ism va familiya alohida maydonlarda — birga saqlanadi
        let name = r.querySelector('[name=name]')?.value.trim() ?? [r.querySelector('[name=first]').value.trim(), r.querySelector('[name=sur]').value.trim()].filter(Boolean).join(' ');
        if (r.dataset.kind !== 'sp' && stripSur(name) !== name) { name = stripSur(name); r.querySelector('[name=name]').value = name; toast(t('Faqat ism saqlandi: {name} — familiya va otasining ismi shajaradan avtomatik olinadi', { name })); }
        const bi = r.querySelector('[name=birth]').value;
        const birth = parseDateInput(bi);
        if (birth === undefined) { toast(t('Sana formati noto‘g‘ri. Masalan: 1958 yoki 20.03.1958'), true); r.querySelector('[name=birth]').focus(); return false; }
        const dec = r.querySelector('[name=deceased]').checked;
        const death = dec ? parseDateInput(r.querySelector('[name=death]').value) : null;
        if (death === undefined) { toast(t('Sana formati noto‘g‘ri. Masalan: 1958 yoki 20.03.1958'), true); r.querySelector('[name=death]').focus(); return false; }
        if (strict && !(String(x.id).startsWith('n') && !name && !bi.trim())) {
          const full = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
          // turmush o'rtog'i (ota-onasi shoxda yo'q) — familiyasi ham shart
          const inLaw = r.dataset.kind === 'sp' && !x.father_id && !x.mother_id;
          const unk = r.dataset.unk === '1'; // «Bilmayman» — sana majburiy emas
          const bad = !name ? 'name' : inLaw && name.split(/\s+/).length < 2 ? 'surname' : !unk && !full(birth) ? 'birth' : dec && !unk && !full(death) ? 'death' : null;
          if (bad) {
            if (bad === 'surname') { toast(t('Turmush o‘rtog‘ining familiyasini ham yozing'), true); const el = r.querySelector('[name=sur]') || r.querySelector('[name=name]'); el.classList.add('bad'); el.focus(); return false; }
            toast(t(bad === 'name' ? 'Ismni kiriting' : bad === 'birth' ? 'Tug‘ilgan sanani to‘liq kiriting (kun.oy.yil)' : 'Vafot sanasini to‘liq kiriting (kun.oy.yil)'), true);
            const el = r.querySelector(`[name=${bad}]`) || r.querySelector('[name=first]'); el.classList.add('bad'); el.focus(); return false;
          }
        }
        const unk = r.dataset.unk === '1';
        const fullD = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
        x.unk = unk;
        x.name = name;
        // «Bilmayman»da chala sana saqlanmaydi — avvalgisi qoladi
        if (!unk || fullD(birth) || !birth) x.birth = unk && !fullD(birth) ? orig.get(x.id)?.birth || null : birth;
        x.deceased = dec;
        if (!unk || fullD(death) || !death) x.death = unk && !fullD(death) ? orig.get(x.id)?.death || null : death;
        const fn = r.querySelector('[name=fname]');
        if (fn) x.fname = fn.value.trim().slice(0, 60);
        const g = r.querySelector('[name=gender]');
        if (g) x.gender = g.value;
        const o = r.querySelector('[name=other]');
        if (o && String(x.id).startsWith('n')) { if (W.get(o.value)?.gender === 'f') x.mother_id = o.value; else x.father_id = o.value; }
      }
      p.gender = segVal($app, 'g') || p.gender;
      // ismi bo'sh yangi qatorlar tashlab yuboriladi
      for (const x of [...W.values()]) if (String(x.id).startsWith('n') && !x.name) W.delete(x.id);
      return true;
    };
    const addRow = (kind) => {
      if (!save()) return;
      const x = { id: newId(), name: '', gender: kind === 'sp' ? (p.gender === 'f' ? 'm' : 'f') : 'm', birth: null, death: null, deceased: false, father_id: null, mother_id: null, spouse_ids: [] };
      if (kind === 'sp') x.spouse_ids = [p.id];
      else {
        const sp = spousesOf(p.id);
        const other = sp.length === 1 ? sp[0] : sp[sp.length - 1];
        if (p.gender === 'f') { x.mother_id = p.id; x.father_id = other?.id || null; } else { x.father_id = p.id; x.mother_id = other?.id || null; }
      }
      W.set(x.id, x);
      draw();
      setTimeout(() => $app.querySelector(`.bw-row[data-id="${x.id}"] [name=name]`)?.focus(), 50);
    };
    $app.querySelector('#add-sp').onclick = () => addRow('sp');
    $app.querySelector('#add-kid').onclick = () => addRow('kid');
    $app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { save(); W.delete(b.dataset.del); draw(); }));
    $app.querySelectorAll('[data-unk-btn]').forEach((b) => (b.onclick = () => { const r = b.closest('.bw-row'); const on = r.dataset.unk !== '1'; r.dataset.unk = on ? '1' : ''; b.classList.toggle('on', on); haptic('light'); }));
    $app.querySelector('#dlg')?.addEventListener('click', async () => {
      try {
        const r = await api(`br/${treeId}/${bid}/sub`, { method: 'POST', body: { head: p.id }, token: null });
        const msg = t('Assalomu alaykum! Iltimos «{title}» shajarasidagi {name} oilasi ma’lumotlarini to‘ldirishda yordam bersangiz.\n\nHavola:', { title: d.title, name: p.name });
        tg?.openTelegramLink ? tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(`${msg} ${r.link}`)}`) : copyText(r.link);
      } catch (err) { toast(err.message, true); }
    });
    curSave = save;
    $app.querySelector('#prev')?.addEventListener('click', () => { if (save()) { i--; draw(); saveDraft(); window.scrollTo(0, 0); } });
    $app.querySelector('#bw-later').onclick = async () => {
      if (!save()) return;
      lastDraft = '';
      await saveDraft();
      if (stale) return;
      haptic('success');
      $app.innerHTML = `<div class="empty" style="padding-top:80px"><div class="big">💾</div><b>${t('Saqlandi!')}</b>
        <p class="small">${t('Istalgan vaqtda havolani qayta ochib, to‘xtagan joyingizdan davom ettirishingiz mumkin.')}</p>
        <button class="btn btn-primary" id="bw-cont" style="margin-top:14px">✍️ ${t('Davom ettirish')}</button></div>`;
      $app.querySelector('#bw-cont').onclick = () => { draw(); window.scrollTo(0, 0); };
      if (tg?.close) setTimeout(() => tg.close(), 1500);
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!save(true)) return;
      if (i < order().length - 1) { i++; haptic('light'); draw(); saveDraft(); return; }
      saveDraft();
      review();
    };
  };
  // Yuborishdan oldin: kiritilgan hamma ma'lumot bir sahifada — xato bo'lsa o'sha oilaga qaytib tuzatiladi
  const review = () => {
    const ids = order();
    const who = (x) => `<b>${esc(x.name || '?')}</b>${x.fname ? ` <span class="muted">(${t('otasining ismi')}: ${esc(x.fname)})</span>` : ''} · ${x.unk ? `<span class="muted">${t('Bilmayman')}</span>` : esc(x.birth ? fmtDate(x.birth) : '—')}${x.deceased ? ` · † ${esc(x.death ? fmtDate(x.death) : '')}` : ''}`;
    $app.innerHTML = `<div class="screen"><div class="topbar"><div class="grow"><div class="title ellipsis">📋 ${t('Tekshirib chiqing')}</div></div></div>
      <div class="scroll" style="padding:12px 16px"><div class="card note" style="margin-bottom:12px">${t('Yuborishdan oldin hammasini yana bir bor diqqat bilan o‘qib chiqing: ismlar, familiyalar va sanalar. Xato bo‘lsa — «✏️ Tuzatish»ni bosing va to‘g‘irlang.')}</div>
      ${ids.map((id, k) => { const p = W.get(id); return `<div class="card" style="margin-bottom:10px;padding:12px 14px"><div class="row" style="justify-content:space-between;align-items:flex-start;gap:8px"><div class="grow">
        <div>👤 ${who(p)}</div>
        ${spousesOf(id).map((x) => `<div class="small" style="margin-top:4px">💍 ${who(x)}</div>`).join('')}
        ${kidsOf(id).map((x) => `<div class="small" style="margin-top:4px">${x.gender === 'f' ? '👧' : '👦'} ${who(x)}</div>`).join('')}</div>
        <button type="button" class="btn btn-ghost btn-sm" data-go="${k}">✏️ ${t('Tuzatish')}</button></div></div>`; }).join('')}
      <div class="bw-nav"><button type="button" class="btn btn-soft" id="rv-back">← ${t('Orqaga')}</button><button type="button" class="btn btn-primary grow" id="rv-send">✅ ${t('Hammasi to‘g‘ri — yuborish')}</button></div>
      <div style="height:40px"></div></div></div>`;
    window.scrollTo(0, 0);
    $app.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { i = Number(b.dataset.go); draw(); window.scrollTo(0, 0); }));
    $app.querySelector('#rv-back').onclick = () => { i = ids.length - 1; draw(); };
    $app.querySelector('#rv-send').onclick = () => submit();
  };
  const submit = async () => {
    const ops = buildOps().map(({ unk, ...o }) => o);
    if (!ops.length) {
      $app.innerHTML = `<div class="empty" style="padding-top:80px"><div class="big">✅</div><b>${t('Rahmat! Hamma ma’lumot to‘g‘ri ekan — o‘zgarish yo‘q.')}</b></div>`;
      return;
    }
    showLoader();
    try {
      await api(`br/${treeId}/${bid}`, { method: 'POST', body: { ops, base: d.base }, token: null });
      stale = true; // yuborildi — endi qoralama saqlanmaydi
      document.removeEventListener('visibilitychange', flush);
      $app.innerHTML = `<div class="empty" style="padding-top:80px"><div class="big">🎉</div><b>${t('Rahmat! Ma’lumotlar yuborildi.')}</b>
        <p class="small">${t('Shajara egasi tekshirib tasdiqlagach, ular shajaraga qo‘shiladi. Natija haqida bot xabar beradi.')}</p>
        ${S.tree ? `<button class="btn btn-primary" id="bw-back" style="margin-top:14px">🌳 ${t('Shajaraga qaytish')}</button>` : ''}</div>`;
      $app.querySelector('#bw-back')?.addEventListener('click', () => location.reload());
      haptic('success');
    } catch (err) {
      if (onStale(err)) return;
      toast(err.message, true);
      i = order().length - 1;
      draw();
    }
  };
  draw();
}

// Tahrirchi: shox havolasini yaratish
async function branchLinkSheet(p) {
  // havola va xabar tanlangan tilda boradi (bot ham, ilova ham shu tilda ochiladi)
  let lang = LANG;
  const links = {};
  const sh = openSheet(`<div class="sheet-head"><div class="h2 grow">🔗 ${t('{name} oilasi havolasi', { name: esc(nm(p.name)) })}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body"><p class="small muted">${t('Bu havolani {name} oilasidan bir kishiga yuboring. U shu oila va avlodlari ma’lumotlarini savol-javob orqali to‘ldiradi. Siz tasdiqlagach, shajaraga qo‘shiladi.', { name: `<b>${esc(nm(p.name))}</b>` })}</p>
    <div class="h3" style="margin:6px 2px 8px">🌐 ${t('Havola tili')}</div>
    <div class="seg" data-seg="bl">${Object.entries(LANG_NAMES).map(([k, v]) => `<button type="button" data-v="${k}" class="${k === lang ? 'on' : ''}">${v}</button>`).join('')}</div>
    <div class="card note" id="bl-link" style="word-break:break-all;font-weight:700;margin-top:10px">…</div>
    <button class="btn btn-primary btn-block" id="bl-share" style="margin-top:10px">📤 ${t('Ulashish')}</button>
    <button class="btn btn-soft btn-block" id="bl-copy" style="margin-top:8px">📋 ${t('Nusxa olish')}</button></div>`);
  bindSeg(sh);
  const get = async () => {
    if (!links[lang]) links[lang] = (await api('branch', { method: 'POST', body: { head: p.id, lang } })).link;
    sh.querySelector('#bl-link').textContent = links[lang];
    return links[lang];
  };
  sh.querySelector('[data-seg="bl"]').addEventListener('change', () => { lang = segVal(sh, 'bl') || lang; get().catch((err) => toast(err.message, true)); });
  get().catch((err) => toast(err.message, true));
  sh.querySelector('#bl-copy').onclick = async () => { try { copyText(await get()); } catch (err) { toast(err.message, true); } };
  sh.querySelector('#bl-share').onclick = async () => {
    try {
      const link = await get();
      const [text] = tIn(lang, 'Assalomu alaykum! Iltimos «{title}» shajarasidagi {name} oilasi ma’lumotlarini to‘ldirishda yordam bersangiz.\n\nHavola:', { title: S.tree.title, name: p.name });
      openLink(`https://t.me/share/url?url=${encodeURIComponent(`${text} ${link}`)}`);
    } catch (err) { toast(err.message, true); }
  };
}

// Yangi shajara: bosh ajdod farzandlarining ismlari → har biriga shox havolasi (hammasi bitta shajara ichida)
function quickStartSheet() {
  const root = S.tree?.persons?.[0];
  if (!root || S.tree.persons.length > 1) return;
  const sh = openSheet(`<div class="sheet-head"><div class="h2 grow">🌱 ${t('Tez boshlash')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body"><p class="small muted" style="margin-top:0">${t('{name}ning farzandlari ismlarini yozing (har birini yangi qatorda). So‘ng har bir farzandga oila havolasini yuborasiz — ular o‘z oilasini o‘zlari to‘ldiradi.', { name: `<b>${esc(nm(root.name))}</b>` })}</p>
    <textarea class="input" id="qs-kids" rows="6" placeholder="${t('Masalan:\nKarimboy\nJumaboy\nOydin')}"></textarea>
    <button class="btn btn-primary btn-block" id="qs-go" style="margin-top:10px">${t('Qo‘shish va havolalarni olish')}</button><div id="qs-list" style="margin-top:12px"></div></div>`);
  sh.querySelector('#qs-go').onclick = async (e) => {
    const names = sh.querySelector('#qs-kids').value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 30);
    if (!names.length) return;
    e.currentTarget.disabled = true;
    const added = [];
    for (const name of names) {
      try {
        const r = await api('person', { method: 'POST', body: { name, gender: /(a|а|oy|gul|xon|niso|bibi|bonu|oza)$/i.test(name) && !/(boy|бой)$/i.test(name) ? 'f' : 'm', relation: 'child', of: root.id } });
        onTreeChanged(r.tree);
        added.push(r.person);
      } catch (err) { toast(err.message, true); }
    }
    sh.querySelector('#qs-kids').closest('.sheet-body').querySelector('textarea').remove();
    e.target.remove();
    sh.querySelector('#qs-list').innerHTML = `<div class="small muted" style="margin-bottom:8px">${t('Har bir farzandga oila havolasini yuboring 👇')}</div>` +
      added.map((p, i) => `<div class="dp-row"><b class="grow">${esc(nm(p.name))}</b><button class="btn btn-primary btn-sm" data-ql="${i}">🔗 ${t('Havola')}</button></div>`).join('');
    sh.querySelectorAll('[data-ql]').forEach((b) => (b.onclick = () => branchLinkSheet(added[Number(b.dataset.ql)])));
  };
}

// Tahrirchi: kelgan takliflar va faol havolalar
async function branchesSheet() {
  const sh = openSheet(`<div class="sheet-head"><div class="h2 grow">📨 ${t('Oila havolalari va takliflar')}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="sheet-body" id="bsb"><div class="empty"><span class="spin" style="color:var(--primary)"></span></div></div>`);
  const body = sh.querySelector('#bsb');
  const load = async () => {
    let r;
    try { r = await api('branch'); } catch (err) { body.innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
    const pname = (id) => nm(S.fam.get(id)?.name || '?');
    const fmt = (v) => (v ? dateToInput(v) : '—');
    const line = (o, pr) => {
      if (o.op === 'add') {
        const rel = o.father || o.mother ? t('farzandi: {name}', { name: [o.father, o.mother].map((x) => (String(x).startsWith('n') ? pr.ops.find((y) => y.tmp === x)?.f.name : S.fam.get(x) && pname(x))).filter(Boolean).join(' + ') })
          : o.spouse ? t('turmush o‘rtog‘i: {name}', { name: String(o.spouse).startsWith('n') ? pr.ops.find((y) => y.tmp === o.spouse)?.f.name : pname(o.spouse) }) : '';
        return `<div class="pr-line add">➕ <b>${esc(o.f.name)}</b> ${o.f.birth ? esc(fmt(o.f.birth)) : ''}${o.f.deceased ? ' †' : ''} <span class="muted">${esc(rel)}</span></div>`;
      }
      const p = S.fam.get(o.id);
      const ch = Object.entries(o.f).map(([k, v]) => `${{ name: t('ism'), gender: t('jins'), birth: t('tug‘ilgan'), death: t('vafot'), deceased: t('marhum') }[k] || k}: ${esc(k === 'birth' || k === 'death' ? `${fmt(p?.[k])} → ${fmt(v)}` : k === 'deceased' ? (v ? t('ha') : t('yo‘q')) : k === 'gender' ? (v === 'f' ? t('ayol') : t('erkak')) : `${p?.name || ''} → ${v}`)}`).join('; ');
      return `<div class="pr-line">✏️ <b>${esc(pname(o.id))}</b> <span class="muted">${ch}</span></div>`;
    };
    const c = r.complete;
    const MISS = { name: t('ism'), birth: t('tug‘ilgan'), death: t('vafot') };
    const panel = `<div class="card" style="margin-bottom:12px;padding:12px 14px"><div class="row" style="justify-content:space-between"><b>📊 ${t('To‘liqlik')}</b><b style="color:var(--primary)">${c.pct}%</b></div>
      <div class="bw-prog"><i style="width:${c.pct}%"></i></div>
      <div class="small muted">${c.missing.length ? t('Ma’lumoti to‘liq bo‘lmagan: {n} kishi', { n: c.missing.length }) : t('Barcha ma’lumotlar to‘liq ✓')}</div>
      ${c.missing.length ? `<details style="margin-top:6px"><summary class="small">${t('Ro‘yxatni ko‘rish')}</summary>${c.missing.map((x) => `<div class="pr-line" data-pp="${x.id}">👤 <b>${esc(nm(x.name || '?'))}</b> <span class="muted">— ${x.miss.map((k) => MISS[k]).join(', ')}</span></div>`).join('')}</details>` : ''}</div>`;
    const dirty = S.tree.persons.filter((p) => (p.father_id || p.mother_id) && stripSur(p.name) !== String(p.name || '').trim());
    const clean = dirty.length ? `<div class="card" style="margin-bottom:12px;padding:12px 14px"><b>✂️ ${t('{n} kishining ismida familiya yoki otasining ismi ham yozilgan', { n: dirty.length })}</b>
      <div class="small muted" style="margin:4px 0 8px">${dirty.slice(0, 6).map((p) => `${esc(p.name)} → <b>${esc(stripSur(p.name))}</b>`).join('<br>')}${dirty.length > 6 ? '<br>…' : ''}</div>
      <button class="btn btn-primary btn-sm" id="clean-names">${t('Faqat ismni qoldirish')}</button></div>` : '';
    // eslatma kimga: havolani ochgan mas'ul yoki (ochilmagan bo'lsa) shu oilada o'zini belgilagan a'zolar
    const remTargets = r.branches.filter((b) => !b.sent).flatMap((b) => b.claimedName ? [{ bid: b.bid }] : (b.cands || []).map((c) => ({ bid: b.bid, to: c.id })));
    body.innerHTML = `${clean}${panel}${r.proposals.length ? r.proposals.map((pr, i) => `<div class="card pr-card"><div><b>${t('{name} oilasi', { name: esc(nm(pr.headName)) })}</b> · 👤 ${esc(pr.by?.name || '')} · <span class="muted">${esc((pr.upd || pr.at).slice(0, 10))}</span></div>
        ${pr.draft ? `<div class="pr-warn" style="background:var(--soft,#eef4ff)">✍️ ${t('Hali to‘ldirilmoqda (chala). Hozir qabul qilsangiz ham bo‘ladi — mas’ul qolganini davom ettiradi.')}</div>` : ''}
        <div class="pr-ops">${pr.ops.map((o) => line(o, pr)).join('')}</div>
        ${(pr.warn || []).length ? `<div class="pr-warn">${pr.warn.map((w) => `⚠️ ${esc(w)}`).join('<br>')}</div>` : ''}
        <div class="row" style="gap:8px;margin-top:8px"><button class="btn btn-primary btn-sm grow" data-ok="${i}">✅ ${t(pr.draft ? 'Hozircha borini qabul qilish' : 'Tasdiqlash')}</button><button class="btn btn-ghost btn-sm" data-ed="${i}">✏️</button>${pr.draft ? '' : `<button class="btn btn-soft btn-sm" data-no="${i}">${t('Rad etish')}</button>`}</div></div>`).join('')
      : `<div class="empty" style="padding:20px"><b>${t('Yangi takliflar yo‘q')}</b></div>`}
      <div class="row" style="justify-content:space-between;margin:18px 0 8px"><div class="h3" style="margin:0">🔗 ${t('Faol havolalar')}</div>
        ${remTargets.length > 1 ? `<button class="btn btn-soft btn-sm" id="rem-all">🔔 ${t('Hammasiga eslatma')} · ${remTargets.length}</button>` : ''}</div>
      ${r.branches.length ? r.branches.map((b) => `<div class="card br-card"><div class="row" style="justify-content:space-between"><b>${t('{name} oilasi', { name: esc(nm(b.headName)) })}</b><b style="color:var(--primary)">${b.pct}%</b></div>
        <div class="bw-prog"><i style="width:${b.pct}%"></i></div>
        <div class="small muted">${[b.noBirth && t('{n} kishining tug‘ilgan sanasi yo‘q', { n: b.noBirth }), b.noSpouse && t('{n} kishining turmush o‘rtog‘i noma’lum', { n: b.noSpouse }), b.noDeath && t('{n} kishining vafot sanasi yo‘q', { n: b.noDeath })].filter(Boolean).join(', ') || t('Barcha ma’lumotlar to‘liq ✓')}</div>
        <div class="small muted" style="margin-top:4px">${b.claimedName ? '👤 ' + esc(b.claimedName) : b.expired ? '⌛ ' + t('Muddati tugagan') : t('Hali ochilmagan') + (b.exp ? ' · ' + t('{d} gacha', { d: fmtDate(b.exp.slice(0, 10)) }) : '')}${b.parentName ? ' · ↳ ' + esc(nm(b.parentName)) : ''}</div>
        ${b.claimedName ? `<label class="row small" style="gap:8px;margin-top:8px"><span class="switch"><input type="checkbox" data-trust="${b.bid}" ${b.trust ? 'checked' : ''}><span></span></span>${t('Ishonchli mas’ul — tasdiqsiz qo‘shilsin')}</label>` : ''}
        <div class="row" style="gap:6px;margin-top:8px">${b.claimedName && !b.sent && !b.drafting ? `<button class="btn btn-primary btn-sm grow" data-rem="${b.bid}">🔔 ${t('Mas’ulga eslatma yuborish')}</button>`
          : b.sent ? `<span class="grow small muted">📨 ${t('Yubordi — tasdiqlashingizni kutmoqda')}</span>`
          : b.drafting ? `<span class="grow small muted">✍️ ${t('To‘ldirmoqda (chala)')}</span><button class="btn btn-soft btn-sm" data-rem="${b.bid}">🔔</button>`
          : `<span class="grow row" style="gap:6px;flex-wrap:wrap">${(b.cands || []).map((c) => `<button class="btn btn-primary btn-sm" data-rem="${b.bid}" data-to="${c.id}">🔔 ${esc(shortName(c.name, 14))}</button>`).join('')}<button class="btn ${b.cands?.length ? 'btn-soft' : 'btn-primary'} btn-sm" data-shr="${esc(b.link)}" data-nm="${esc(nm(b.headName))}">📤 ${t('Qayta yuborish')}</button></span>`}
          <button class="btn btn-soft btn-sm" data-copy="${esc(b.link)}">📋</button><button class="btn btn-ghost btn-sm" data-rev="${b.bid}">${t('Bekor qilish')}</button></div></div>`).join('')
      : `<div class="small muted">${t('Havola yaratish: daraxtda oila boshini oching → «Oila havolasi».')}</div>`}
      ${r.applied?.length ? `<div class="h3" style="margin:18px 0 8px">↩️ ${t('Qo‘shilganlar tarixi')}</div>${r.applied.map((a, i) => `<div class="dp-row"><div class="grow"><b>${esc(nm(a.headName))}</b><div class="small muted">👤 ${esc(a.by?.name || '')} · ${relTime(a.at)} · ${a.n} ${t('o‘zgarish')}</div></div>
        <button class="btn btn-ghost btn-sm" data-undo="${i}">↩️ ${t('Qaytarish')}</button></div>`).join('')}` : ''}`;
    // ✏️ — taklifdagi ism/sanalarni shu yerda tuzatib, keyin tasdiqlash
    const LBL = { name: t('Ismi'), fname: t('Otasining ismi'), birth: t('Tug‘ilgan sana'), death: t('Vafot sanasi') };
    body.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => {
      const pr = r.proposals[Number(b.dataset.ed)];
      const box = b.closest('.pr-card').querySelector('.pr-ops');
      box.innerHTML = pr.ops.map((o, k) => {
        const keys = o.op === 'add' ? ['name', 'fname', 'birth', 'death'] : Object.keys(o.f || {}).filter((x) => LBL[x]);
        if (!keys.length) return line(o, pr);
        return `<div class="pr-edit" data-op="${k}"><div class="small" style="margin:6px 0 2px"><b>${o.op === 'add' ? '➕' : `✏️ ${esc(pname(o.id))}`}</b></div>${keys.map((x) => `<label class="fl"><span>${LBL[x]}</span><input class="input" data-k="${x}" value="${esc(x === 'birth' || x === 'death' ? dateToInput(o.f[x]) : o.f[x] || '')}"${x === 'birth' || x === 'death' ? ` inputmode="numeric" placeholder="${x === 'birth' ? '20.03.1958' : '—'}"` : ''}></label>`).join('')}</div>`;
      }).join('');
      box.style.maxHeight = 'none';
      b.remove();
    }));
    const edits = (card) => {
      const out = {};
      for (const el of card.querySelectorAll('.pr-edit')) {
        const f = {};
        for (const inp of el.querySelectorAll('[data-k]')) {
          const k = inp.dataset.k;
          if (k === 'birth' || k === 'death') {
            const v = parseDateInput(inp.value);
            if (v === undefined) { inp.focus(); throw new Error(t('Sana formati noto‘g‘ri. Masalan: 1958 yoki 20.03.1958')); }
            f[k] = v;
          } else f[k] = inp.value.trim();
        }
        out[el.dataset.op] = f;
      }
      return Object.keys(out).length ? out : undefined;
    };
    const act = async (pr, action, btn) => {
      btn.disabled = true;
      try { const x = await api(`branch/proposal/${pr.id}`, { method: 'POST', body: { action, edits: action === 'apply' ? edits(btn.closest('.pr-card')) : undefined } }); if (x.tree) onTreeChanged(x.tree); toast(action === 'apply' ? t('Shajaraga qo‘shildi ✓') : t('Rad etildi')); load(); } catch (err) { toast(err.message, true); btn.disabled = false; }
    };
    body.querySelectorAll('[data-ok]').forEach((b) => (b.onclick = () => act(r.proposals[Number(b.dataset.ok)], 'apply', b)));
    body.querySelectorAll('[data-no]').forEach((b) => (b.onclick = () => act(r.proposals[Number(b.dataset.no)], 'reject', b)));
    body.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
    body.querySelector('#clean-names')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try { const x = await api('branch/cleannames', { method: 'POST' }); onTreeChanged(x.tree); toast(t('{n} ta ism tozalandi ✓', { n: x.n })); load(); } catch (err) { toast(err.message, true); }
    });
    body.querySelectorAll('[data-shr]').forEach((b) => (b.onclick = () => {
      const msg = t('Assalomu alaykum! Iltimos «{title}» shajarasidagi {name} oilasi ma’lumotlarini to‘ldirishda yordam bersangiz.\n\nHavola:', { title: S.tree.title, name: b.dataset.nm });
      openLink(`https://t.me/share/url?url=${encodeURIComponent(b.dataset.shr)}&text=${encodeURIComponent(msg)}`);
    }));
    body.querySelector('#rem-all')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      let ok = 0;
      for (const x of remTargets) ok += await api(`branch/${x.bid}/remind`, { method: 'POST', body: x.to ? { to: x.to } : {} }).then(() => 1, () => 0);
      toast(t('Eslatma yuborildi: {n} kishi ✓', { n: ok }));
    });
    body.querySelectorAll('[data-rem]').forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try { await api(`branch/${b.dataset.rem}/remind`, { method: 'POST', body: b.dataset.to ? { to: b.dataset.to } : {} }); toast(t('Eslatma yuborildi ✓')); } catch (err) { toast(err.message, true); b.disabled = false; }
    }));
    body.querySelectorAll('[data-trust]').forEach((c) => (c.onchange = async () => {
      try { await api('branch/' + c.dataset.trust, { method: 'PATCH', body: { trust: c.checked } }); toast(t('Saqlandi ✓')); } catch (err) { c.checked = !c.checked; toast(err.message, true); }
    }));
    body.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = async () => {
      if (!(await confirmBox(t('Bu o‘zgarishlar shajaradan qaytarib olinsinmi?')))) return;
      try { const x = await api(`branch/proposal/${r.applied[Number(b.dataset.undo)].id}`, { method: 'POST', body: { action: 'undo' } }); if (x.tree) onTreeChanged(x.tree); toast(t('Qaytarildi ✓')); load(); } catch (err) { toast(err.message, true); }
    }));
    body.querySelectorAll('[data-pp]').forEach((b) => (b.onclick = () => { if (S.fam.get(b.dataset.pp)) personSheet(b.dataset.pp); }));
    body.querySelectorAll('[data-rev]').forEach((b) => (b.onclick = async () => {
      if (!(await confirmBox(t('Havola bekor qilinsinmi?')))) return;
      try { await api('branch/' + b.dataset.rev, { method: 'DELETE' }); load(); } catch (err) { toast(err.message, true); }
    }));
  };
  load();
}

// Telegram «Yangilash» (⋮ → Reload): sahifa qayta yuklanadi, lekin start_param o'sha-o'sha qoladi —
// eski havola (masalan, shaxs kartasi) qayta ochilmasin, foydalanuvchi turgan bo'lim tiklansin. sessionStorage faqat shu oynada yashaydi.
const nav = {
  get() { try { return JSON.parse(sessionStorage.getItem('sh_nav') || 'null'); } catch { return null; } },
  set(v) { try { sessionStorage.setItem('sh_nav', JSON.stringify({ ...(nav.get() || {}), ...v })); } catch {} },
};

// =================================================================== ISHGA TUSHIRISH
function boot() {
  initTelegram();
  if (!tg) applyTheme();
  document.documentElement.lang = LANG === 'uzc' ? 'uz-Cyrl' : LANG;
  const params = new URLSearchParams(location.search);
  const sp = tg?.initDataUnsafe?.start_param || '';
  let inv = params.get('inv') || (sp.startsWith('inv_') ? sp : '');
  // taklif havolasi tili: ...-ru — birinchi marta kirayotgan bo'lsa shu tilda ochiladi
  const il = /-(uz|uzc|ru|en)$/.exec(inv);
  if (il) { inv = inv.slice(0, -il[0].length); let had = null; try { had = localStorage.getItem('sh_lang'); } catch {} if (!had) setLang(il[1]); }
  S.goPerson = /_(p\d{1,8})$/.exec(inv.slice(30))?.[1] || null;
  S.goMedia = /_m([a-z0-9]{10})$/.exec(inv.slice(30))?.[1] || null;
  S.goInbox = /_([nfl])$/.exec(inv.slice(30))?.[1] || null;
  S.goItem = /_a([a-z0-9]{10})$/.exec(inv.slice(30))?.[1] || null;
  S.goUser = /_u(\d{1,15})$/.exec(inv.slice(30))?.[1] || null;
  S.goMemo = /_x(p\d{1,8})$/.exec(inv.slice(30))?.[1] || null;
  S.goAlbumJoin = /_k([A-Za-z0-9]{8})([A-Za-z0-9_-]{10})$/.exec(inv.slice(30)) || null;
  const back = nav.get();
  if (back) { // yangilash: havoladagi bir martalik amallar takrorlanmaydi
    S.goPerson = S.goMedia = S.goInbox = S.goItem = S.goUser = S.goMemo = S.goAlbumJoin = null;
    S.restoreTab = back.tab;
  } else nav.set({ tab: null });
  const startCode = params.get('code') || (!inv ? sp : '');
  const br = /^([a-z0-9]{6,20})_([A-Za-z0-9]{4,16})$/.exec(params.get('br') || '');
  if (br) return renderBranchWizard(br[1], br[2]);
  S.openProps = !back && params.get('props') === '1';
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

// Sana maydonlari yonida 📅 — kalendardan tanlash (qo'lda yil yoki to'liq sana yozish ham ishlaydi)
const DATE_SEL = 'input[name=birth],input[name=death],input[data-k=birth],input[data-k=death]';
function addDatePicker(inp) {
  if (inp.dataset.dp || inp.type === 'date' || inp.type === 'hidden') return;
  inp.dataset.dp = '1';
  const wrap = document.createElement('span');
  wrap.className = 'dp-wrap';
  inp.replaceWith(wrap);
  const cal = document.createElement('input');
  cal.type = 'date';
  cal.className = 'dp-cal';
  cal.max = new Date().toISOString().slice(0, 10);
  cal.min = '1700-01-01';
  cal.tabIndex = -1;
  cal.setAttribute('aria-label', t('Kalendardan tanlash'));
  const btn = document.createElement('span');
  btn.className = 'dp-btn';
  btn.textContent = '📅';
  wrap.append(inp, btn, cal);
  const sync = () => { const v = parseDateInput(inp.value); cal.value = v && v.length === 10 ? v : ''; };
  cal.addEventListener('focus', sync);
  cal.addEventListener('pointerdown', sync);
  cal.addEventListener('change', () => {
    if (!cal.value) return;
    inp.value = dateToInput(cal.value);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
new MutationObserver(() => document.querySelectorAll(DATE_SEL).forEach(addDatePicker)).observe(document.body, { childList: true, subtree: true });
