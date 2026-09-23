/**
 * Baza manzili yordamchilari.
 *
 * Chipta Radar jadvallari alohida "chipta_radar" sxemasida saqlanadi. Shunda bitta
 * Neon bazasidan boshqa loyiha (masalan, FactFood) ham foydalansa, `prisma db push`
 * uning jadvallariga (public sxemasi) umuman tegmaydi.
 */
export const DEFAULT_SCHEMA = 'chipta_radar';

/** Manzilga parametr qo'shish (manzilda allaqachon bo'lsa — o'zgarmaydi) */
function addParam(url, key, value) {
  if (!url || !value || new RegExp(`[?&]${key}=`).test(url)) return url || '';
  return `${url}${url.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;
}

/** Manzilga sxema qo'shish (manzilda allaqachon ?schema=... bo'lsa — o'zgarmaydi) */
export function withSchema(url, schema = process.env.DB_SCHEMA || DEFAULT_SCHEMA) {
  return addParam(url, 'schema', schema);
}

/**
 * Server (Prisma Client) uchun manzil.
 * Neon bazasi 5 daqiqa so'rovsiz qolsa "uxlaydi" va ochiq ulanishlarni uzadi. Uzilgan
 * ulanish qayta ishlatilsa "Server has closed the connection" xatosi chiqadi, shuning uchun
 * 2 daqiqadan ko'p bo'sh turgan ulanish tashlab yuboriladi. Uxlagan bazani uyg'otishga
 * esa 15 soniyagacha kutiladi.
 */
export function runtimeUrl(url) {
  let result = withSchema(url);
  result = addParam(result, 'max_idle_connection_lifetime', '120');
  result = addParam(result, 'connect_timeout', '15');
  return result;
}

/**
 * Neon "pooler" (PgBouncer) orqali jadval yaratib bo'lmaydi, shuning uchun
 * jadvallarni yaratish/o'zgartirishda to'g'ridan-to'g'ri ulanish ishlatiladi:
 * ep-xxx-pooler.neon.tech  →  ep-xxx.neon.tech
 */
export function directUrl(url) {
  if (process.env.DIRECT_URL) return withSchema(process.env.DIRECT_URL);
  return url ? url.replace('-pooler.', '.') : url;
}
