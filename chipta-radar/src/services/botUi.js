/**
 * Bot interfeysi — faqat inline tugmalar (reply-klaviatura va Mini App ishlatilmaydi).
 *
 * Bu yerda faqat klaviatura va qisqa matn yordamchilari (toza funksiyalar, test qilsa bo'ladi).
 * Holat (sehrgar) va yuborish mantig'i botController.js da.
 */
import { Markup } from 'telegraf';
import { listStations } from './stations.js';
import { REGIONS } from './personal.js';
import { formatMoney } from '../utils/text.js';
import { todayISO, addDays, isISODate, diffDays, WEEKDAYS_UZ } from '../utils/dates.js';
import { keepButton, LANG_LABELS } from '../i18n/index.js';
import { TEXTS } from '../i18n/texts.js';

/* --------------------------- Asosiy menyu --------------------------- */

export const WELCOME = TEXTS.welcome.uz;

export function mainMenu({ admin = false } = {}) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ Kuzatuv qo\'shish', 'm:add')],
    [Markup.button.callback('🚆 Poyezd narxlari', 'm:prices'), Markup.button.callback('📋 Kuzatuvlarim', 'm:watches')],
    // Akkaunt/Bronlarim vaqtincha olib tashlandi (kod va handlerlar saqlanadi — keyin qaytarsa bo'ladi)
    [Markup.button.callback('👥 Do\'stlarni taklif qilish', 'm:ref'), Markup.button.callback('ℹ️ Yordam', 'm:help')],
    [Markup.button.callback('📱 Qo\'ng\'iroq ilovasi', 'm:app'), keepButton(Markup.button.callback('🌐 Til · Язык · Language', 'm:lang'))],
    ...(admin ? [[Markup.button.callback('🛠 Admin panel', 'adm:menu')]] : []),
  ]);
}

/** Rangli tugma (Telegram 2026-fevraldan: primary — ko'k, success — yashil, danger — qizil; eski ilovada oddiy) */
const styled = (button, style) => ({ ...button, style });
const cancelButton = (text = '❌ Bekor') => styled(Markup.button.callback(text, 'm:home'), 'danger');

/** Til tanlash (tugmalar har doim o'z tilida) */
export function langKeyboard() {
  const button = (code) => keepButton(Markup.button.callback(LANG_LABELS[code], `lang:${code}`));
  return Markup.inlineKeyboard([[button('uz'), button('uzc')], [button('ru'), button('en')]]);
}

/** Har bir ekran oxirida "asosiy menyu" tugmasi */
export function backToMenuRow() {
  return [Markup.button.callback('🏠 Asosiy menyu', 'm:home')];
}

/* --------------------------- Stansiyalar --------------------------- */

const PER_PAGE = 18; // 3 ustun × 6 qator

/**
 * Stansiyalar to'ri (inline). Prefiks: 'wz:f' (qayerdan) yoki 'wz:t' (qayerga).
 * Pagination: `${prefix}p:<page>`, tanlash: `${prefix}:<code>`.
 * only (Set) — faqat poyezd qatnaydigan bekatlar; bunda «Barcha bekatlar» (`${prefix}a`) tugmasi chiqadi.
 */
export function stationGrid(prefix, { page = 0, excludeCode = null, only = null } = {}) {
  const all = listStations().filter((station) => station.code !== excludeCode && (!only || only.has(station.code)));
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  const current = Math.min(Math.max(0, page), pages - 1);
  const slice = all.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);

  const rows = [];
  for (let i = 0; i < slice.length; i += 3) {
    rows.push(slice.slice(i, i + 3).map((station) => Markup.button.callback(station.nameUz, `${prefix}:${station.code}`)));
  }

  if (pages > 1) {
    const nav = [];
    if (current > 0) nav.push(Markup.button.callback('⬅️', `${prefix}p:${current - 1}`));
    nav.push(Markup.button.callback(`${current + 1}/${pages}`, 'noop'));
    if (current < pages - 1) nav.push(Markup.button.callback('➡️', `${prefix}p:${current + 1}`));
    rows.push(nav);
  }

  if (only) rows.push([Markup.button.callback('🔎 Barcha bekatlar', `${prefix}a`)]);
  rows.push([Markup.button.callback('⬅️ Orqaga', 'wz:back'), cancelButton('❌ Bekor qilish')]);
  return Markup.inlineKeyboard(rows);
}

/** Kuzatuv qo'shishning birinchi bosqichi: mahalliy yoki xorijiy yo'nalish */
export function scopeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🇺🇿 Mahalliy (O\'zbekiston ichida)', 'wz:scope:local')],
    [Markup.button.callback('🌍 Xorijiy (Qozog\'iston)', 'wz:scope:intl')],
    [cancelButton('❌ Bekor qilish')],
  ]);
}

/** Xorijiy yo'nalish bekatlari (kichik ro'yxat, bayroq bilan) */
export function intlStationGrid(prefix, stations) {
  const flag = (station) => (station.country === 'KZ' ? '🇰🇿' : '🇺🇿');
  const rows = [];
  for (let i = 0; i < stations.length; i += 2) {
    rows.push(stations.slice(i, i + 2).map((station) => Markup.button.callback(`${flag(station)} ${station.nameUz}`, `${prefix}:${station.code}`)));
  }
  rows.push([Markup.button.callback('⬅️ Orqaga', 'wz:back'), cancelButton()]);
  return Markup.inlineKeyboard(rows);
}

/* ------------------------------ Sanalar ---------------------------- */

const DATE_WINDOW = 15; // bir ekranda ko'rsatiladigan kunlar

const MONTHS_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'];

/** "5-okt, dus" */
export function shortDate(iso) {
  if (!isISODate(iso)) return iso || '';
  const date = new Date(`${iso}T00:00:00Z`);
  const month = MONTHS_SHORT[date.getUTCMonth()];
  const weekday = WEEKDAYS_UZ[date.getUTCDay()].slice(0, 3);
  return `${date.getUTCDate()}-${month}, ${weekday}`;
}

/**
 * Sana to'ri. offset — qancha kundan boshlab. maxDaysAhead — oxirgi kun.
 * Tanlash: `wz:d:<iso>`, varaqlash: `wz:dp:<offset>`.
 */
export function dateGrid(offset = 0, maxDaysAhead = 60) {
  const today = todayISO();
  const start = Math.min(offset, maxDaysAhead);
  const rows = [];
  let row = [];
  for (let i = 0; i < DATE_WINDOW; i += 1) {
    const day = start + i;
    if (day > maxDaysAhead) break;
    const iso = addDays(today, day);
    row.push(Markup.button.callback(shortDate(iso), `wz:d:${iso}`));
    if (row.length === 3) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);

  const nav = [];
  if (start > 0) nav.push(Markup.button.callback('⬅️ Oldingi', `wz:dp:${Math.max(0, start - DATE_WINDOW)}`));
  if (start + DATE_WINDOW <= maxDaysAhead) nav.push(Markup.button.callback('Keyingi ➡️', `wz:dp:${start + DATE_WINDOW}`));
  if (nav.length) rows.push(nav);

  rows.push([cancelButton('❌ Bekor qilish')]);
  return Markup.inlineKeyboard(rows);
}

/* ---------------------------- Vagon turi --------------------------- */

export const CAR_CHOICES = [
  { type: 'any', label: '✅ Farqi yo\'q' },
  { type: 'sitting', label: '💺 O\'rindiqli' },
  { type: 'platskart', label: '🛏 Plaskart' },
  { type: 'kupe', label: '🚪 Kupe' },
  { type: 'sv', label: '🛌 Lyuks / SV' },
  { type: 'general', label: '🚃 Umumiy' },
];

/**
 * Vagon turlari — bir nechtasini belgilash mumkin (`wz:c:<tur>` — belgilash/olib tashlash,
 * `wz:cok` — davom). Yonida shu yo'nalishdagi eng arzon narx (prices: {tur: so'm}).
 */
export function carKeyboard(selected = [], prices = {}, { showAll = false, currency = 'UZS' } = {}) {
  const rows = [[Markup.button.callback('✅ Farqi yo\'q (istalgan vagon)', 'wz:c:any')]];
  const choices = CAR_CHOICES.filter((item) => item.type !== 'any');
  // Faqat shu yo'nalishda yuradigan turlar (narx ro'yxatidan). Ma'lumot yo'q bo'lsa — hammasi.
  const known = Object.keys(prices).length > 0;
  const visible = showAll || !known ? choices : choices.filter((item) => prices[item.type] || selected.includes(item.type));
  const hidden = choices.length - visible.length;
  for (const choice of visible) {
    const mark = selected.includes(choice.type) ? '☑️ ' : '';
    const price = prices[choice.type] ? ` · ${formatMoney(prices[choice.type], currency)}dan` : '';
    rows.push([Markup.button.callback(`${mark}${choice.label}${price}`, `wz:c:${choice.type}`)]);
  }
  if (hidden > 0) rows.push([Markup.button.callback(`➕ Boshqa vagon turlari (${hidden})`, 'wz:call')]);
  if (selected.length) rows.push([styled(Markup.button.callback(`➡️ Davom etish (${selected.length} ta tanlandi)`, 'wz:cok'), 'success')]);
  rows.push([Markup.button.callback('⬅️ Orqaga', 'wz:back'), cancelButton()]);
  return Markup.inlineKeyboard(rows);
}

/* ------------------- Aniq joy: qism / qavat / birga ----------------- */

export function sectionKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🛋 To\'rttalik', 'wz:sec:compartment'), Markup.button.callback('🚪 Bokovoy', 'wz:sec:side')],
    [Markup.button.callback('✅ Farqi yo\'q', 'wz:sec:any')],
    [Markup.button.callback('⬅️ Orqaga', 'wz:back'), cancelButton()],
  ]);
}

export function berthKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⬇️ Pastki', 'wz:brt:lower'), Markup.button.callback('⬆️ Yuqori', 'wz:brt:upper')],
    [Markup.button.callback('✅ Farqi yo\'q', 'wz:brt:any')],
    [Markup.button.callback('⬅️ Orqaga', 'wz:back'), cancelButton()],
  ]);
}

export function togetherKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🤝 Yonma-yon (bitta joyda)', 'wz:tg:compartment')],
    [Markup.button.callback('✅ Tarqoq bo\'lsa ham', 'wz:tg:any')],
    [Markup.button.callback('⬅️ Orqaga', 'wz:back'), cancelButton()],
  ]);
}

/* ----------------------------- Chipta soni ------------------------- */

export function qtyKeyboard() {
  return Markup.inlineKeyboard([
    [1, 2, 3, 4].map((n) => Markup.button.callback(String(n), `wz:q:${n}`)),
    [Markup.button.callback('⬅️ Orqaga', 'wz:back'), cancelButton()],
  ]);
}

/* --------------------------- Joy cheklovlari --------------------------- */

/** Konduktor (kirish eshigi) tomoni va hojatxona tomonidagi joylarni chiqarib tashlash */
export function avoidKeyboard(session = {}) {
  const mark = (on) => (on ? '☑️ ' : '⬜ ');
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${mark(session.noConductor)}🚪 Konduktor tomoni kerak emas`, 'wz:av:cond')],
    [Markup.button.callback(`${mark(session.noToilet)}🚻 Hojatxona tomoni kerak emas`, 'wz:av:wc')],
    [styled(Markup.button.callback('➡️ Davom etish', 'wz:avok'), 'success')],
    [Markup.button.callback('⬅️ Orqaga', 'wz:back'), cancelButton()],
  ]);
}

/* ------------------------------ Tasdiq ----------------------------- */

export function confirmKeyboard() {
  return Markup.inlineKeyboard([
    [styled(Markup.button.callback('✅ Kuzatuvni yoqish', 'wz:ok'), 'success')],
    [Markup.button.callback('⬅️ Orqaga', 'wz:back'), cancelButton()],
  ]);
}

/* -------------------- Kuzatuvni boshqarish tugmalari ---------------- */

export function manageKeyboard(watch, { buyUrl = null } = {}) {
  const rows = [];
  // Joy topilgan bo'lsa — sotib olish sahifasi (xorijiy yo'nalishda KTZ sayti)
  if (buyUrl) rows.push([styled(Markup.button.url('🎫 Sotib olish', buyUrl), 'success')]);
  const top = [];
  if (watch.status === 'ACTIVE') top.push(Markup.button.callback('⏸ To\'xtatish', `g:pause:${watch.id}`));
  if (watch.status === 'PAUSED' || watch.status === 'FOUND') top.push(Markup.button.callback('▶️ Davom', `g:resume:${watch.id}`));
  top.push(Markup.button.callback('🔄 Tekshirish', `g:check:${watch.id}`));
  rows.push(top);
  // Avto-bron tugmasi vaqtincha olib tashlandi (kod saqlanadi)
  rows.push([Markup.button.callback('✅ Chipta oldim', `g:got:${watch.id}`), Markup.button.callback('🗑 O\'chirish', `g:del:${watch.id}`)]);
  rows.push([Markup.button.callback('📋 Ro\'yxat', 'm:watches'), ...backToMenuRow()]);
  return Markup.inlineKeyboard(rows);
}

/** Chipta topilganda xabar ostidagi tugmalar */
export function foundKeyboard(watch, buyUrl, { accountUrl = '' } = {}) {
  // Bitta bosishda shu yo'nalish + sana tanlangan sahifa ochiladi
  const rows = [[styled(Markup.button.url('🎫 Sotib olish', buyUrl), 'success')]];
  if (accountUrl) rows.push([Markup.button.webApp('💳 Bron va to\'lov', accountUrl)]);
  rows.push([Markup.button.callback('✅ Chipta oldim', `g:got:${watch.id}`), Markup.button.callback('⏸ To\'xtatish', `g:pause:${watch.id}`)]);
  return Markup.inlineKeyboard(rows);
}

/* -------------------- Akkaunt va ma'lumotlar ----------------------- */

/**
 * Akkaunt ekranidagi tugmalar — hammasi inline, Web App ixtiyoriy.
 * @param status accountService.getAccountStatus natijasi
 * @param accountUrl Web App manzili ('' bo'lsa web_app tugmasi ko'rsatilmaydi)
 * @param payMethod {provider, phoneMasked} — to'lov usuli sozlanganmi
 */
export function accountKeyboard(status, accountUrl, { payMethod } = {}) {
  const rows = [];
  if (status?.connected) {
    rows.push([Markup.button.callback('👤 Yo\'lovchilar', 'pass:list'), Markup.button.callback('🧾 Bronlarim', 'm:orders')]);
    rows.push([Markup.button.callback(`💳 To'lov usuli${payMethod?.provider ? ' ✅' : ''}`, 'acc:pay')]);
    if (accountUrl) rows.push([Markup.button.webApp('🖥 To\'liq sahifa (Web App)', accountUrl)]);
    rows.push([Markup.button.callback('🔌 Akkauntni uzish', 'acc:disc')]);
  } else {
    rows.push([Markup.button.callback('🔗 Botda ulash', 'acc:connect')]);
    if (accountUrl) rows.push([Markup.button.webApp('🖥 Web App orqali ulash', accountUrl)]);
  }
  rows.push(backToMenuRow());
  return Markup.inlineKeyboard(rows);
}

/** Oqimni bekor qilish tugmasi (login/parol/yo'lovchi kiritishda) */
export function cancelFlowKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('❌ Bekor qilish', 'flow:cancel')]]);
}

/** Akkaunt ulashga rozilik (login va parol kiritilgach) */
export function connectConsentKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Roziman — ulash', 'acc:connect:go')],
    [Markup.button.callback('❌ Bekor', 'flow:cancel')],
  ]);
}

/** Akkauntni uzishni tasdiqlash */
export function disconnectConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔌 Ha, uzilsin', 'acc:disc:yes')],
    [Markup.button.callback('⬅️ Orqaga', 'm:account')],
  ]);
}

/* -------------------- Yo'lovchilar (inline) ------------------------ */

export function passengersKeyboard(passengers = []) {
  const rows = passengers.slice(0, 10).map((p) => [
    Markup.button.callback(`${p.label ? `${p.label} · ` : ''}${p.name}${p.categoryLabel ? ` (${p.categoryLabel})` : ''}`, 'noop'),
    Markup.button.callback('🗑', `pass:del:${p.id}`),
  ]);
  rows.push([Markup.button.callback('➕ Yo\'lovchi qo\'shish', 'pass:add')]);
  rows.push([Markup.button.callback('🔐 Akkaunt', 'm:account'), ...backToMenuRow()]);
  return Markup.inlineKeyboard(rows);
}

/** Yangi yo'lovchi: jinsini tanlash */
export function genderKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👨 Erkak', 'pass:g:M'), Markup.button.callback('👩 Ayol', 'pass:g:F')],
    [Markup.button.callback('❌ Bekor', 'flow:cancel')],
  ]);
}

/** Yangi yo'lovchi: viloyat tanlash (reserve'da regionId uchun) */
export function regionKeyboard() {
  const entries = Object.entries(REGIONS); // [["27","Toshkent sh."], ...]
  const rows = [];
  for (let i = 0; i < entries.length; i += 2) {
    rows.push(entries.slice(i, i + 2).map(([code, name]) => Markup.button.callback(name, `pass:r:${code}`)));
  }
  rows.push([Markup.button.callback('Bilmayman / keyin', 'pass:r:')]);
  rows.push([Markup.button.callback('❌ Bekor', 'flow:cancel')]);
  return Markup.inlineKeyboard(rows);
}

/** Yangi yo'lovchi: shifrlab saqlashga rozilik */
export function passengerConsentKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔒 Shifrlab saqlash', 'pass:save')],
    [Markup.button.callback('❌ Bekor', 'flow:cancel')],
  ]);
}

/* -------------------- To'lov usuli va to'lov ----------------------- */

/** Default to'lov usulini tanlash (Payme/Click) va telefon */
export function payMethodKeyboard(method = {}) {
  const mark = (p) => (method.provider === p ? ' ✅' : '');
  return Markup.inlineKeyboard([
    [Markup.button.callback(`Payme${mark('payme')}`, 'acc:pay:payme'), Markup.button.callback(`Click${mark('click')}`, 'acc:pay:click')],
    [Markup.button.callback(method.phoneMasked ? `📱 Telefon: ${method.phoneMasked}` : '📱 Telefonni kiritish', 'acc:payphone')],
    [Markup.button.callback('🔐 Akkaunt', 'm:account'), ...backToMenuRow()],
  ]);
}

/** Buyurtma uchun to'lov: Payme/Click tanlash */
export function orderPayKeyboard(orderId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Payme', `pay:go:${orderId}:payme`), Markup.button.callback('Click', `pay:go:${orderId}:click`)],
    [Markup.button.callback('⬅️ Bronlarim', 'm:orders')],
  ]);
}

/* -------------------------- Avto-bron ------------------------------ */

/** Kuzatuvda avto-bron holati va toggle */
export function autoBookKeyboard(watch, { ready } = {}) {
  const rows = [];
  if (watch.autoBook) {
    rows.push([Markup.button.callback('🤖 Avto-bron: YOQILGAN — o\'chirish', `ab:off:${watch.id}`)]);
  } else {
    rows.push([Markup.button.callback('🤖 Avto-bronni yoqish', `ab:on:${watch.id}`)]);
  }
  rows.push([Markup.button.callback('⬅️ Kuzatuv', `g:open:${watch.id}`), ...backToMenuRow()]);
  return Markup.inlineKeyboard(rows);
}

/** Bronlarim / buyurtmalar ekrani */
export function ordersKeyboard(status, accountUrl) {
  const rows = [];
  if (status?.connected) {
    if (accountUrl) rows.push([Markup.button.webApp('💳 To\'lash / boshqarish', accountUrl)]);
    rows.push([Markup.button.callback('🔄 Yangilash', 'm:orders')]);
  } else if (accountUrl) {
    rows.push([Markup.button.webApp('🔐 Akkauntni ulash', accountUrl)]);
  } else {
    rows.push([Markup.button.callback('🔐 Akkaunt', 'm:account')]);
  }
  rows.push(backToMenuRow());
  return Markup.inlineKeyboard(rows);
}

export default {
  langKeyboard,
  WELCOME, mainMenu, backToMenuRow, stationGrid, scopeKeyboard, intlStationGrid, avoidKeyboard, dateGrid, shortDate,
  carKeyboard, sectionKeyboard, berthKeyboard, togetherKeyboard, qtyKeyboard,
  confirmKeyboard, manageKeyboard, foundKeyboard, CAR_CHOICES,
  accountKeyboard, disconnectConfirmKeyboard, ordersKeyboard,
  cancelFlowKeyboard, connectConsentKeyboard, passengersKeyboard, genderKeyboard, regionKeyboard,
  passengerConsentKeyboard, payMethodKeyboard, orderPayKeyboard, autoBookKeyboard,
};
