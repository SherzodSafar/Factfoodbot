/**
 * Bot interfeysi — faqat inline tugmalar (reply-klaviatura va Mini App ishlatilmaydi).
 *
 * Bu yerda faqat klaviatura va qisqa matn yordamchilari (toza funksiyalar, test qilsa bo'ladi).
 * Holat (sehrgar) va yuborish mantig'i botController.js da.
 */
import { Markup } from 'telegraf';
import { listStations } from './stations.js';
import { todayISO, addDays, isISODate, diffDays, MONTHS_UZ, WEEKDAYS_UZ } from '../utils/dates.js';

/* --------------------------- Asosiy menyu --------------------------- */

export const WELCOME =
  '🚉 <b>Temir yo\'l chiptasi kuzatuvchi botiga xush kelibsiz!</b>\n\n' +
  'Men siz uchun belgilangan yo\'nalishda bo\'sh joy paydo bo\'lishini doimiy kuzataman ' +
  'va topilishi bilan darrov xabar beraman.\n\n' +
  'Quyidagi menyudan tanlang 👇';

export function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ Kuzatuv qo\'shish', 'm:add')],
    [Markup.button.callback('🚆 Poyezd narxlari', 'm:prices'), Markup.button.callback('📋 Kuzatuvlarim', 'm:watches')],
    [Markup.button.callback('🔐 Akkaunt', 'm:account'), Markup.button.callback('🧾 Bronlarim', 'm:orders')],
    [Markup.button.callback('👥 Do\'stlarni taklif qilish', 'm:ref'), Markup.button.callback('ℹ️ Yordam', 'm:help')],
  ]);
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
 */
export function stationGrid(prefix, { page = 0, excludeCode = null } = {}) {
  const all = listStations().filter((station) => station.code !== excludeCode);
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

  rows.push([Markup.button.callback('❌ Bekor qilish', 'm:home')]);
  return Markup.inlineKeyboard(rows);
}

/* ------------------------------ Sanalar ---------------------------- */

const DATE_WINDOW = 15; // bir ekranda ko'rsatiladigan kunlar

/** "5-okt, Du" */
export function shortDate(iso) {
  if (!isISODate(iso)) return iso || '';
  const date = new Date(`${iso}T00:00:00Z`);
  const month = MONTHS_UZ[date.getUTCMonth()].slice(0, 3);
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

  rows.push([Markup.button.callback('❌ Bekor qilish', 'm:home')]);
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

export function carKeyboard() {
  const rows = [];
  for (let i = 0; i < CAR_CHOICES.length; i += 2) {
    rows.push(CAR_CHOICES.slice(i, i + 2).map((choice) => Markup.button.callback(choice.label, `wz:c:${choice.type}`)));
  }
  rows.push([Markup.button.callback('⬅️ Orqaga', 'wz:back'), Markup.button.callback('❌ Bekor', 'm:home')]);
  return Markup.inlineKeyboard(rows);
}

/* ------------------- Aniq joy: qism / qavat / birga ----------------- */

export function sectionKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🛋 To\'rttalik', 'wz:sec:compartment'), Markup.button.callback('🚪 Bokovoy', 'wz:sec:side')],
    [Markup.button.callback('✅ Farqi yo\'q', 'wz:sec:any')],
    [Markup.button.callback('⬅️ Orqaga', 'wz:back'), Markup.button.callback('❌ Bekor', 'm:home')],
  ]);
}

export function berthKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⬇️ Pastki', 'wz:brt:lower'), Markup.button.callback('⬆️ Yuqori', 'wz:brt:upper')],
    [Markup.button.callback('✅ Farqi yo\'q', 'wz:brt:any')],
    [Markup.button.callback('⬅️ Orqaga', 'wz:back'), Markup.button.callback('❌ Bekor', 'm:home')],
  ]);
}

export function togetherKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🤝 Yonma-yon (bitta joyda)', 'wz:tg:compartment')],
    [Markup.button.callback('✅ Tarqoq bo\'lsa ham', 'wz:tg:any')],
    [Markup.button.callback('⬅️ Orqaga', 'wz:back'), Markup.button.callback('❌ Bekor', 'm:home')],
  ]);
}

/* ----------------------------- Chipta soni ------------------------- */

export function qtyKeyboard() {
  return Markup.inlineKeyboard([
    [1, 2, 3, 4].map((n) => Markup.button.callback(String(n), `wz:q:${n}`)),
    [Markup.button.callback('⬅️ Orqaga', 'wz:back'), Markup.button.callback('❌ Bekor', 'm:home')],
  ]);
}

/* ------------------------------ Tasdiq ----------------------------- */

export function confirmKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Kuzatuvni yoqish', 'wz:ok')],
    [Markup.button.callback('⬅️ Orqaga', 'wz:back'), Markup.button.callback('❌ Bekor', 'm:home')],
  ]);
}

/* -------------------- Kuzatuvni boshqarish tugmalari ---------------- */

export function manageKeyboard(watch) {
  const rows = [];
  const top = [];
  if (watch.status === 'ACTIVE') top.push(Markup.button.callback('⏸ To\'xtatish', `g:pause:${watch.id}`));
  if (watch.status === 'PAUSED' || watch.status === 'FOUND') top.push(Markup.button.callback('▶️ Davom', `g:resume:${watch.id}`));
  top.push(Markup.button.callback('🔄 Tekshirish', `g:check:${watch.id}`));
  rows.push(top);
  rows.push([Markup.button.callback(`🤖 Avto-bron: ${watch.autoBook ? 'YOQILGAN' : 'o\'chiq'}`, `ab:${watch.id}`)]);
  rows.push([Markup.button.callback('✅ Chipta oldim', `g:got:${watch.id}`), Markup.button.callback('🗑 O\'chirish', `g:del:${watch.id}`)]);
  rows.push([Markup.button.callback('📋 Ro\'yxat', 'm:watches'), ...backToMenuRow()]);
  return Markup.inlineKeyboard(rows);
}

/** Chipta topilganda xabar ostidagi tugmalar */
export function foundKeyboard(watch, buyUrl, { accountUrl = '' } = {}) {
  const rows = [[Markup.button.url('🎫 eticket.railway.uz da sotib olish', buyUrl)]];
  // Akkaunt ulangan bo'lsa — bron/to'lov sahifasini ochish mumkin
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
  WELCOME, mainMenu, backToMenuRow, stationGrid, dateGrid, shortDate,
  carKeyboard, sectionKeyboard, berthKeyboard, togetherKeyboard, qtyKeyboard,
  confirmKeyboard, manageKeyboard, foundKeyboard, CAR_CHOICES,
  accountKeyboard, disconnectConfirmKeyboard, ordersKeyboard,
  cancelFlowKeyboard, connectConsentKeyboard, passengersKeyboard, genderKeyboard,
  passengerConsentKeyboard, payMethodKeyboard, orderPayKeyboard, autoBookKeyboard,
};
