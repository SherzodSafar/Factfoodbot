/**
 * Kuzatuv yaratish va boshqarish (Mini App ham, bot ham shu yerdan foydalanadi).
 */
import { Markup } from 'telegraf';
import WatchModel from '../models/Watch.js';
import { findStation } from './stations.js';
import { CAR_TYPES } from './carTypes.js';
import { normalizePrefs } from './seats.js';
import { getSettings } from './settings.js';
import { checkWatchNow } from './watcher.js';
import { describeWatch, dateLine, trainLine, typeLine, suggestionLine } from './format.js';
import { sendMessage, webAppReady, webAppUrl } from '../core/bot.js';
import { escapeHtml } from '../utils/text.js';
import { todayISO, addDays, isISODate, isTimeHM } from '../utils/dates.js';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

const MAX_DATES = 7;

/** Kelgan ma'lumotni tekshirish va bazaga mos ko'rinishga keltirish */
export function validateWatchInput(input = {}) {
  const settings = getSettings();
  const mode = input.mode === 'EXACT' ? 'EXACT' : 'ANY';

  const from = findStation(input.fromCode);
  const to = findStation(input.toCode);
  if (!from || !to) throw new ValidationError('Jo\'nash va borish stansiyasini tanlang');
  if (from.code === to.code) throw new ValidationError('Jo\'nash va borish stansiyasi bir xil bo\'lmasligi kerak');

  const today = todayISO();
  const lastDay = addDays(today, settings.maxDaysAhead);
  const rawDates = Array.isArray(input.dates) ? input.dates : [input.date];
  const dates = [...new Set(rawDates.filter(isISODate))].sort();
  if (!dates.length) throw new ValidationError('Sanani tanlang');
  if (dates.length > MAX_DATES) throw new ValidationError(`Bir martada ko'pi bilan ${MAX_DATES} ta sana tanlash mumkin`);
  if (dates.some((date) => date < today)) throw new ValidationError('O\'tib ketgan sanani tanlab bo\'lmaydi');
  if (dates.some((date) => date > lastDay)) {
    throw new ValidationError(`Sana ${settings.maxDaysAhead} kundan uzoq bo'lmasligi kerak`);
  }

  const carTypes = [...new Set((Array.isArray(input.carTypes) ? input.carTypes : []).filter((type) => CAR_TYPES[type]))];
  if (mode === 'EXACT' && carTypes.length !== 1) {
    throw new ValidationError('Aniq joy buyurtmasi uchun bitta vagon turini tanlang');
  }

  const prefs = normalizePrefs(input, mode === 'EXACT' ? carTypes[0] : undefined);

  const trainNumbers = [...new Set((Array.isArray(input.trainNumbers) ? input.trainNumbers : [])
    .map((number) => String(number).trim().slice(0, 12))
    .filter(Boolean))].slice(0, 10);

  const timeFrom = isTimeHM(input.timeFrom) ? input.timeFrom : null;
  const timeTo = isTimeHM(input.timeTo) ? input.timeTo : null;
  if (timeFrom && timeTo && timeFrom > timeTo) throw new ValidationError('Vaqt oralig\'i noto\'g\'ri');

  const maxPrice = Number(input.maxPrice) > 0 ? Math.round(Number(input.maxPrice)) : null;

  return {
    dates,
    base: {
      mode,
      fromCode: from.code,
      toCode: to.code,
      fromName: from.nameUz,
      toName: to.nameUz,
      carTypes,
      trainNumbers,
      quantity: prefs.quantity,
      timeFrom,
      timeTo,
      maxPrice,
      section: mode === 'EXACT' ? prefs.section : 'any',
      berth: mode === 'EXACT' ? prefs.berth : 'any',
      together: mode === 'EXACT' ? prefs.together : 'any',
      noToilet: mode === 'EXACT' ? prefs.noToilet : false,
    },
  };
}

const sameWatch = (a, b) =>
  a.mode === b.mode && a.fromCode === b.fromCode && a.toCode === b.toCode && a.date === b.date
  && a.quantity === b.quantity && a.section === b.section && a.berth === b.berth && a.together === b.together
  && a.noToilet === b.noToilet && a.maxPrice === b.maxPrice && a.timeFrom === b.timeFrom && a.timeTo === b.timeTo
  && [...a.carTypes].sort().join() === [...b.carTypes].sort().join()
  && [...a.trainNumbers].sort().join() === [...b.trainNumbers].sort().join();

/** Tasdiq xabari (Mini App yoki botda kuzatuv yaratilganda) */
function confirmationText(entries) {
  const first = entries[0].watch;
  const lines = [
    '🔔 <b>Kuzatuv yoqildi!</b>',
    '',
    `📍 <b>${escapeHtml(first.fromName)} → ${escapeHtml(first.toName)}</b>`,
    `🔎 ${escapeHtml(describeWatch(first))}`,
  ];

  for (const { watch, result, error } of entries) {
    lines.push('', `📅 <b>${dateLine(watch.date)}</b>`);
    if (error) {
      lines.push(`⚠️ Hozir tekshirib bo'lmadi: ${escapeHtml(error)}. Kuzatuv baribir ishlaydi.`);
    } else if (result?.items.length) {
      lines.push('✅ Hozirning o\'zida mos joylar bor:');
      for (const item of result.items.slice(0, 3)) {
        lines.push(trainLine(item.train));
        if (item.suggestions?.length) {
          for (const suggestion of item.suggestions.slice(0, 2)) lines.push(`   ✅ ${suggestionLine(suggestion)}`);
        } else {
          for (const car of item.types.slice(0, 3)) lines.push(`   ${typeLine(car)}`);
        }
      }
    } else {
      lines.push('⏳ Hozircha mos joy yo\'q — paydo bo\'lishi bilan darhol yozaman.');
    }
  }

  lines.push('', 'Men har daqiqada tekshirib turaman. To\'xtatish: /watches');
  return lines.join('\n');
}

/**
 * Kuzatuv(lar) yaratish: har bir sana uchun alohida kuzatuv.
 * Yaratilgach darhol tekshiriladi va foydalanuvchiga botda tasdiq yuboriladi.
 */
export async function createWatches(user, input, { sendConfirmation = true } = {}) {
  const { dates, base } = validateWatchInput(input);
  const settings = getSettings();

  const existing = await WatchModel.findByUser(user.id, { onlyOpen: true });
  const toCreate = dates.filter((date) => !existing.some((watch) => sameWatch(watch, { ...base, date })));
  const reused = existing.filter((watch) => dates.some((date) => sameWatch(watch, { ...base, date })));

  if (existing.length + toCreate.length > settings.maxWatchesPerUser) {
    throw new ValidationError(
      `Ko'pi bilan ${settings.maxWatchesPerUser} ta faol kuzatuv bo'lishi mumkin. Keraksizlarini o'chirib, qayta urinib ko'ring.`,
    );
  }

  const created = [];
  for (const date of toCreate) {
    created.push(await WatchModel.create({ ...base, date, userId: user.id }));
  }

  // To'xtatilgan bir xil kuzatuv bo'lsa — qayta yoqamiz
  for (const watch of reused) {
    if (watch.status === 'PAUSED') await WatchModel.update(watch.id, { status: 'ACTIVE' });
  }

  const entries = [];
  for (const watch of [...created, ...reused]) {
    try {
      const { result, watch: updated } = await checkWatchNow({ ...watch, user }, { notify: false, markNotified: true });
      entries.push({ watch: updated, result });
    } catch (error) {
      entries.push({ watch, result: null, error: error.message });
    }
  }
  entries.sort((a, b) => a.watch.date.localeCompare(b.watch.date));

  if (sendConfirmation && entries.length) {
    const buttons = [];
    if (webAppReady()) buttons.push([Markup.button.webApp('📱 Kuzatuvlarim', webAppUrl({ tab: 'watches' }))]);
    sendMessage(user.telegramId, confirmationText(entries), buttons.length ? Markup.inlineKeyboard(buttons) : {}, {
      quietNight: user.quietNight,
    }).catch(() => {});
  }

  return { entries, createdCount: created.length, reusedCount: reused.length };
}

export default { createWatches, validateWatchInput, ValidationError };
