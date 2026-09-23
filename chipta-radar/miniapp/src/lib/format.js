/** Ko'rsatish uchun formatlash yordamchilari (Toshkent vaqti) */

export const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
export const MONTHS_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
export const WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
export const WEEKDAYS_SHORT = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];

const TZ_OFFSET_MIN = 300;

export function todayISO() {
  return new Date(Date.now() + TZ_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function diffDays(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const parts = (iso) => {
  const date = new Date(`${iso}T00:00:00Z`);
  return { day: date.getUTCDate(), month: date.getUTCMonth(), year: date.getUTCFullYear(), weekday: date.getUTCDay() };
};

/** "25-sentabr, juma" */
export function formatDate(iso, { weekday = true } = {}) {
  if (!iso) return '';
  const p = parts(iso);
  return `${p.day}-${MONTHS[p.month]}${weekday ? `, ${WEEKDAYS[p.weekday]}` : ''}`;
}

/** "25-sen" */
export function formatDateShort(iso) {
  if (!iso) return '';
  const p = parts(iso);
  return `${p.day}-${MONTHS_SHORT[p.month]}`;
}

export function weekdayShort(iso) {
  return WEEKDAYS_SHORT[parts(iso).weekday];
}

export function dayNumber(iso) {
  return parts(iso).day;
}

export function monthShort(iso) {
  return MONTHS_SHORT[parts(iso).month];
}

/** "bugun" / "ertaga" / "indinga" yoki null */
export function relativeDay(iso) {
  const diff = diffDays(todayISO(), iso);
  if (diff === 0) return 'Bugun';
  if (diff === 1) return 'Ertaga';
  if (diff === 2) return 'Indinga';
  return null;
}

/** "Ertaga, 25-sentabr" yoki "25-sentabr, juma" */
export function friendlyDate(iso) {
  const relative = relativeDay(iso);
  return relative ? `${relative}, ${formatDate(iso, { weekday: false })}` : formatDate(iso);
}

/** 270000 → "270 000 so'm" */
export function formatPrice(value) {
  if (!value) return '';
  return `${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;
}

/** 130 → "2 soat 10 daq" */
export function formatDuration(minutes) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} daq`;
  return m ? `${h} s ${m} daq` : `${h} soat`;
}

/** "3 daqiqa oldin" */
export function timeAgo(value) {
  if (!value) return '';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 45) return 'hozirgina';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} daqiqa oldin`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} soat oldin`;
  return `${Math.round(hours / 24)} kun oldin`;
}

/** Toshkent vaqtidagi soat: "14:05" */
export function formatClock(value) {
  if (!value) return '';
  return new Date(new Date(value).getTime() + TZ_OFFSET_MIN * 60_000).toISOString().slice(11, 16);
}

export function formatDateTime(value) {
  if (!value) return '';
  const local = new Date(new Date(value).getTime() + TZ_OFFSET_MIN * 60_000).toISOString();
  return `${formatDateShort(local.slice(0, 10))}, ${local.slice(11, 16)}`;
}

/** Keyingi kunga o'tadimi: "+1" belgisi uchun */
export function arrivalShift(train) {
  if (!train.arrDate || !train.departure) return 0;
  return diffDays(train.departure.slice(0, 10), train.arrDate);
}

export const SECTION_LABELS = { compartment: 'To\'rttalik', side: 'Bokovoy', any: 'Farqi yo\'q' };
export const BERTH_LABELS = { lower: 'Pastki', upper: 'Yuqori', any: 'Farqi yo\'q' };
export const TOGETHER_LABELS = { compartment: 'Hammasi bitta joyda', car: 'Bitta vagonda', any: 'Tarqoq' };

export const STATUS_LABELS = {
  ACTIVE: 'Faol',
  PAUSED: 'To\'xtatilgan',
  FOUND: 'Topildi',
  EXPIRED: 'Muddati o\'tgan',
  CANCELLED: 'Bekor qilingan',
};
