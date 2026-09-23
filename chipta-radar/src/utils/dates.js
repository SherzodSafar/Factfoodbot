/**
 * Sana va vaqt bilan ishlash. Barcha hisob-kitoblar Toshkent vaqtida (UTC+5).
 * Sanalar "YYYY-MM-DD" ko'rinishida, vaqtlar "HH:MM" ko'rinishida saqlanadi.
 */

export const TZ_OFFSET_MIN = 300;

export const MONTHS_UZ = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

export const WEEKDAYS_UZ = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

const pad = (value) => String(value).padStart(2, '0');

/** Hozirgi Toshkent vaqti (UTC getterlari orqali o'qiladi) */
export function nowTashkent(now = Date.now()) {
  return new Date(now + TZ_OFFSET_MIN * 60_000);
}

/** Bugungi sana (Toshkent): "2026-09-25" */
export function todayISO(now = Date.now()) {
  return nowTashkent(now).toISOString().slice(0, 10);
}

/** Hozirgi vaqt (Toshkent): "14:05" */
export function nowTimeHM(now = Date.now()) {
  return nowTashkent(now).toISOString().slice(11, 16);
}

export function isISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Ikki sana orasidagi kunlar farqi (b - a) */
export function diffDays(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** "2026-09-25" → "25-sentabr, payshanba" */
export function formatDateUz(iso, { weekday = true, year = false } = {}) {
  if (!isISODate(iso)) return iso || '';
  const date = new Date(`${iso}T00:00:00Z`);
  let text = `${date.getUTCDate()}-${MONTHS_UZ[date.getUTCMonth()]}`;
  if (year) text += ` ${date.getUTCFullYear()}`;
  if (weekday) text += `, ${WEEKDAYS_UZ[date.getUTCDay()]}`;
  return text;
}

/** Bugun/ertaga/indinga bo'lsa shuni, aks holda sanani qaytaradi */
export function relativeDayUz(iso, now = Date.now()) {
  const diff = diffDays(todayISO(now), iso);
  if (diff === 0) return 'bugun';
  if (diff === 1) return 'ertaga';
  if (diff === 2) return 'indinga';
  return null;
}

/**
 * Sayt qaytargan sana-vaqtni "YYYY-MM-DDTHH:MM" ko'rinishiga keltirish.
 * Qo'llab-quvvatlanadi: "2026-09-25T07:28:00", "2026-09-25 07:28", "25.09.2026 07:28".
 */
export function parseLocalDateTime(value) {
  if (!value) return null;
  const text = String(value).trim();

  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}T${pad(match[4])}:${match[5]}`;

  match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})[T\s,]+(\d{1,2}):(\d{2})/);
  if (match) return `${match[3]}-${pad(match[2])}-${pad(match[1])}T${pad(match[4])}:${match[5]}`;

  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}T00:00`;

  return null;
}

/** Toshkent vaqtidagi "YYYY-MM-DDTHH:MM" → epoch (ms) */
export function localToEpoch(local) {
  if (!local) return NaN;
  const [datePart, timePart = '00:00'] = local.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - TZ_OFFSET_MIN * 60_000;
}

/** "13:18" yoki "1:02" yoki "13 soat 18 min" → daqiqalar */
export function parseDurationMin(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const text = String(value);
  const hm = text.match(/^(\d{1,3}):(\d{2})/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const numbers = text.match(/\d+/g);
  if (numbers?.length >= 2) return Number(numbers[0]) * 60 + Number(numbers[1]);
  if (numbers?.length === 1) return Number(numbers[0]);
  return null;
}

/** 130 → "2 soat 10 daq" */
export function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} daq`;
  return m ? `${h} soat ${m} daq` : `${h} soat`;
}

/** "HH:MM" to'g'rimi */
export function isTimeHM(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export default {
  todayISO, nowTimeHM, isISODate, addDays, diffDays, formatDateUz, relativeDayUz,
  parseLocalDateTime, localToEpoch, parseDurationMin, formatDuration, isTimeHM,
};
