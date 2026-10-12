/**
 * Telegram xabarlari matnlari (HTML formatida).
 */
import config from '../config/default.js';
import { escapeHtml, formatMoney } from '../utils/text.js';
import { formatDateUz, formatDuration, relativeDayUz } from '../utils/dates.js';
import { carTypeLabel, carTypeEmoji } from './carTypes.js';
import { LAYOUTS } from './seats.js';
import { isIntlRoute } from './foreignStations.js';
import { uzsRate } from './exchangeRates.js';

/** Xorijiy narx yonida taxminiy so'm qiymati: " (≈ 237 000 so'm)" (kurs noma'lum bo'lsa — bo'sh) */
export function uzsHint(value, currency) {
  const rate = currency && currency !== 'UZS' ? uzsRate(currency) : null;
  return rate && value ? ` (≈ ${formatMoney(Math.round((value * rate) / 1000) * 1000)})` : '';
}

const SECTION_LABELS = { compartment: 'to\'rttalik', side: 'bokovoy' };
const BERTH_LABELS = { lower: 'pastki', upper: 'yuqori' };
const TOGETHER_LABELS = { compartment: 'hammasi bitta joyda', car: 'bitta vagonda', any: 'tarqoq bo\'lsa ham' };

/** "25-sentabr, payshanba (ertaga)" */
export function dateLine(iso) {
  const relative = relativeDayUz(iso);
  return `${formatDateUz(iso)}${relative ? ` (${relative})` : ''}`;
}

/** Kuzatuv talablarining qisqa tavsifi */
export function describeWatch(watch) {
  const parts = [];
  parts.push(watch.carTypes?.length ? watch.carTypes.map((type) => carTypeLabel(type)).join(', ') : 'istalgan vagon');
  parts.push(`${watch.quantity} ta chipta`);

  if (watch.mode === 'EXACT') {
    if (SECTION_LABELS[watch.section]) parts.push(SECTION_LABELS[watch.section]);
    if (BERTH_LABELS[watch.berth]) parts.push(BERTH_LABELS[watch.berth]);
    if (watch.quantity > 1) parts.push(TOGETHER_LABELS[watch.together] || '');
    if (watch.noConductor) parts.push('konduktor tomonida emas');
    if (watch.noToilet) parts.push('hojatxona yonida emas');
  }

  if (watch.trainNumbers?.length) parts.push(`poyezd: ${watch.trainNumbers.join(', ')}`);
  if (watch.timeFrom || watch.timeTo) parts.push(`jo'nash ${watch.timeFrom || '00:00'}–${watch.timeTo || '23:59'}`);
  if (watch.maxPrice) parts.push(`${formatMoney(watch.maxPrice)} gacha`);
  return parts.filter(Boolean).join(' · ');
}

/** "<b>764Ф Afrosiyob</b> · 07:28 → 09:38 (2 soat 10 daq)" */
export function trainLine(train) {
  const title = train.title && train.title !== 'Poyezd' ? ` ${escapeHtml(train.title)}` : '';
  const times = train.depTime ? ` · ${train.depTime} → ${train.arrTime || '?'}` : '';
  const duration = train.durationMin ? ` (${formatDuration(train.durationMin)})` : '';
  return `🚆 <b>${escapeHtml(train.number)}${title}</b>${times}${duration}`;
}

export function typeLine(car) {
  const price = car.minPrice ? ` · ${formatMoney(car.minPrice, car.currency)} dan${uzsHint(car.minPrice, car.currency)}` : '';
  return `${carTypeEmoji(car.type)} ${escapeHtml(car.label || carTypeLabel(car.type))}: <b>${car.free}</b> ta joy${price}`;
}

/** Joylar guruhi: "7-vagon: 9, 11 (3-bo'lim)" */
export function suggestionLine(suggestion) {
  return suggestion.parts
    .map((part) => {
      const layout = LAYOUTS[part.type];
      const unit = part.type === 'platskart' ? 'bo\'lim' : 'kupe';
      const bays = layout && part.bays?.length ? ` (${part.bays.join(', ')}-${unit})` : '';
      return `${escapeHtml(part.car)}-vagon: <b>${part.seats.join(', ')}</b>${bays}`;
    })
    .join(' + ');
}

/**
 * Chipta topilganda — to'g'ridan-to'g'ri qidiruv havolasi (yo'nalish + sana + poyezd
 * tanlangan sahifa). Shablon config.railway.searchUrl'dan olinadi.
 */
export function buildSearchUrl(watch, train = null) {
  // Saytlar yo'nalish sahifasiga to'g'ridan-to'g'ri havolani qo'llamaydi — bosh sahifa
  if (isIntlRoute(watch.fromCode, watch.toCode)) return 'https://bilet.railways.kz/';
  if (config.railway.buyUrl) return config.railway.buyUrl;
  const tpl = config.railway.searchUrl || config.railway.buyUrl;
  return tpl
    .replace(/\{from\}/g, encodeURIComponent(watch.fromCode || ''))
    .replace(/\{to\}/g, encodeURIComponent(watch.toCode || ''))
    .replace(/\{date\}/g, encodeURIComponent(watch.date || ''))
    .replace(/\{train\}/g, encodeURIComponent(train?.number || ''));
}

/** Chipta topilganda yuboriladigan xabar */
export function foundMessage(watch, result) {
  const head = watch.mode === 'EXACT' ? '🎯 <b>Siz kutgan joylar topildi!</b>' : '🎉 <b>Chipta paydo bo\'ldi!</b>';
  const lines = [
    head,
    '',
    `📍 <b>${escapeHtml(watch.fromName)} → ${escapeHtml(watch.toName)}</b>`,
    `📅 ${dateLine(watch.date)}`,
    `🔎 ${escapeHtml(describeWatch(watch))}`,
  ];

  for (const item of result.items.slice(0, 5)) {
    lines.push('', trainLine(item.train));
    for (const car of item.types.slice(0, 4)) lines.push(`   ${typeLine(car)}`);
    for (const suggestion of (item.suggestions || []).slice(0, 3)) lines.push(`   ✅ ${suggestionLine(suggestion)}`);
  }
  if (result.items.length > 5) lines.push('', `… va yana ${result.items.length - 5} ta poyezd`);

  lines.push('', '⚡️ Chiptalar tez tugaydi — hoziroq sotib oling!');
  const buyUrl = buildSearchUrl(watch, result.items[0]?.train);
  lines.push(`🎫 <a href="${escapeHtml(buyUrl)}">Sotib olish →</a>`);
  return lines.join('\n');
}

const PRICE_ORDER = ['sitting', 'platskart', 'kupe', 'sv', 'general'];
const typeRank = (type) => (PRICE_ORDER.indexOf(type) + 99) % 99;
/** "11.10.2026" */
const dotDate = (iso) => String(iso || '').split('-').reverse().join('.');
const amount = (value) => formatMoney(value).replace(/ so'm$/, '');

/** Joy qolmagan poyezd narxlari bitta qatorda (exact=false: yo'nalish bo'yicha eng arzon) */
function storedPriceLine({ prices = {}, exact = true } = {}) {
  const types = Object.keys(prices).sort((a, b) => typeRank(a) - typeRank(b));
  if (!types.length) return null;
  const list = types.map((type) => `${escapeHtml(carTypeLabel(type))} ${amount(prices[type])}`).join(' · ');
  return exact ? `  💰 ${list} so'm` : `  💰 <i>Yo'nalishda: ${list} so'm dan</i>`;
}

/**
 * Botdagi qidiruv javobi — ixcham ro'yxat.
 * pricesOf(train) → { prices, exact } — saqlangan narxlar (joy qolmagan poyezdlarda ko'rsatiladi).
 */
export function searchReply({ from, to, date, trains, pricesOf = null }) {
  const lines = [`🚆 <b>${escapeHtml(from)} → ${escapeHtml(to)}</b> — ${dotDate(date)}`];

  if (!trains.length) {
    lines.push('', 'Bu sanaga poyezd topilmadi. Boshqa sanani tanlab ko\'ring.');
    return lines.join('\n');
  }

  for (const train of trains.slice(0, 12)) {
    const title = train.title && train.title !== 'Poyezd' ? ` · ${escapeHtml(train.title)}` : '';
    lines.push('', `🚆 <b>${escapeHtml(train.number)}${title}</b>`);
    if (train.depTime) lines.push(`  🕐 ${train.depTime} → ${train.arrTime || '?'}`);
    const types = train.cars.filter((car) => car.free > 0);
    for (const car of types) {
      const price = car.minPrice ? ` · ${formatMoney(car.minPrice, car.currency)}${car.maxPrice > car.minPrice ? ' dan' : ''}${uzsHint(car.minPrice, car.currency)}` : '';
      lines.push(`  💺 ${escapeHtml(car.label || carTypeLabel(car.type))}: ${car.free} joy${price}`);
    }
    if (!types.length) {
      lines.push('  ❌ Joylar tugagan');
      const stored = pricesOf ? storedPriceLine(pricesOf(train)) : null;
      if (stored) lines.push(stored);
    }
  }
  if (trains.length > 12) lines.push('', `… va yana ${trains.length - 12} ta poyezd`);

  lines.push('', '🔔 Joy chiqishini kuzatish uchun «🔔 Joy chiqsa xabar ber»ni bosing.');
  return lines.join('\n');
}

export default { describeWatch, foundMessage, searchReply, trainLine, typeLine, suggestionLine, dateLine };
