/**
 * Baza manzili yordamchilari.
 *
 * Chipta Radar jadvallari alohida "chipta_radar" sxemasida saqlanadi. Shunda bitta
 * Neon bazasidan boshqa loyiha (masalan, FactFood) ham foydalansa, `prisma db push`
 * uning jadvallariga (public sxemasi) umuman tegmaydi.
 */
export const DEFAULT_SCHEMA = 'chipta_radar';

/** Manzilga sxema qo'shish (manzilda allaqachon ?schema=... bo'lsa — o'zgarmaydi) */
export function withSchema(url, schema = process.env.DB_SCHEMA || DEFAULT_SCHEMA) {
  if (!url) return '';
  if (!schema || /[?&]schema=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}schema=${encodeURIComponent(schema)}`;
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
