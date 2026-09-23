/**
 * Telegram xabarlari matnlari (HTML formatida).
 */
import { escapeHtml, formatMoney } from '../utils/text.js';
import { formatDateUz, formatDuration, relativeDayUz } from '../utils/dates.js';
import { carTypeLabel, carTypeEmoji } from './carTypes.js';
import { LAYOUTS } from './seats.js';

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
    if (watch.noToilet) parts.push('hojatxona yonidagisiz');
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
  const price = car.minPrice ? ` · ${formatMoney(car.minPrice)} dan` : '';
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

/** Chipta topilganda yuboriladigan xabar */
export function foundMessage(watch, result, { buyUrl } = {}) {
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
  if (buyUrl) lines.push(`🎫 <a href="${escapeHtml(buyUrl)}">eticket.railway.uz</a>`);
  return lines.join('\n');
}

/** Botdagi tezkor qidiruv javobi */
export function searchReply({ from, to, date, trains }) {
  const lines = [`🚆 <b>${escapeHtml(from)} → ${escapeHtml(to)}</b>`, `📅 ${dateLine(date)}`, ''];

  if (!trains.length) {
    lines.push('Bu sanaga poyezd topilmadi. Boshqa sanani tanlab ko\'ring.');
    return lines.join('\n');
  }

  const withSeats = trains.filter((train) => train.totalFree > 0);
  trains.slice(0, 12).forEach((train, i) => {
    lines.push(`${i + 1}) ${trainLine(train)}`);
    const types = train.cars.filter((car) => car.free > 0);
    if (types.length) {
      for (const car of types) lines.push(`     ${typeLine(car)}`);
    } else {
      lines.push('     ❌ Joy qolmagan');
    }
  });
  if (trains.length > 12) lines.push(`… va yana ${trains.length - 12} ta poyezd`);

  lines.push('', `Jami: <b>${trains.length}</b> ta poyezd, <b>${withSeats.length}</b> tasida joy bor.`);
  return lines.join('\n');
}

export default { describeWatch, foundMessage, searchReply, trainLine, typeLine, suggestionLine, dateLine };
