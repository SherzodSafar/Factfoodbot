/** Formatlash yordamchilari (Toshkent vaqti) */
const TZ = 300;
const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];

const local = (value) => new Date(new Date(value).getTime() + TZ * 60_000).toISOString();

/** "24-sen, 14:05" */
export function formatDateTime(value) {
  if (!value) return '—';
  const iso = local(value);
  return `${Number(iso.slice(8, 10))}-${MONTHS[Number(iso.slice(5, 7)) - 1]}, ${iso.slice(11, 16)}`;
}

/** "2026-09-24" → "24-sen" */
export function formatDay(iso) {
  if (!iso) return '—';
  return `${Number(iso.slice(8, 10))}-${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

export function formatPrice(value) {
  if (!value) return '—';
  return `${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;
}

export function timeAgo(value) {
  if (!value) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds} s oldin`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} daq oldin`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} soat oldin`;
  return `${Math.round(hours / 24)} kun oldin`;
}

export function formatUptime(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h} soat ${m} daq` : `${m} daq`;
}

export const CAR_TYPES = {
  platskart: 'Plaskartli', kupe: 'Kupe', sv: 'SV', lux: 'Lyuks', sitting: 'O\'rindiqli',
  business: 'Biznes', vip: 'VIP', general: 'Umumiy',
};

export const WATCH_STATUS = {
  ACTIVE: { label: 'Faol', cls: 'badge--green' },
  PAUSED: { label: 'To\'xtatilgan', cls: 'badge--amber' },
  FOUND: { label: 'Topildi', cls: 'badge--blue' },
  EXPIRED: { label: 'Muddati o\'tgan', cls: 'badge--soft' },
  CANCELLED: { label: 'Bekor qilingan', cls: 'badge--red' },
};

const SECTION = { compartment: 'to\'rttalik', side: 'bokovoy' };
const BERTH = { lower: 'pastki', upper: 'yuqori' };
const TOGETHER = { compartment: 'bitta joyda', car: 'bitta vagonda', any: 'tarqoq' };

export function describeWatch(watch) {
  const parts = [watch.carTypes?.length ? watch.carTypes.map((type) => CAR_TYPES[type] || type).join(', ') : 'istalgan vagon', `${watch.quantity} ta`];
  if (watch.mode === 'EXACT') {
    if (SECTION[watch.section]) parts.push(SECTION[watch.section]);
    if (BERTH[watch.berth]) parts.push(BERTH[watch.berth]);
    if (watch.quantity > 1) parts.push(TOGETHER[watch.together]);
    if (watch.noToilet) parts.push('hojatxonasiz');
  }
  if (watch.trainNumbers?.length) parts.push(`poyezd ${watch.trainNumbers.join(', ')}`);
  if (watch.timeFrom || watch.timeTo) parts.push(`${watch.timeFrom || '00:00'}–${watch.timeTo || '23:59'}`);
  if (watch.maxPrice) parts.push(`≤ ${formatPrice(watch.maxPrice)}`);
  return parts.join(' · ');
}

export function userName(user) {
  if (!user) return '—';
  return [user.firstName, user.lastName].filter(Boolean).join(' ');
}
