/**
 * Matn bilan ishlash yordamchilari: HTML xavfsizligi, narx formati,
 * kirill → lotin transliteratsiyasi va qidiruv uchun normallashtirish.
 */

/** Telegram HTML xabarlari uchun xavfsiz matn */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 270000 → "270 000 so'm" */
export function formatMoney(value) {
  const number = Math.round(Number(value) || 0);
  return `${String(number).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;
}

const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y',
  к: 'k', қ: 'q', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ў: 'o',
  ф: 'f', х: 'x', ҳ: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e',
  ю: 'yu', я: 'ya',
};

/**
 * Qidiruv uchun matnni normallashtirish:
 *  - kichik harf, kirill → lotin
 *  - tutuq belgilari (' ʻ ʼ ‘ ’ `) olib tashlanadi
 *  - ortiqcha belgilar bo'sh joyga aylanadi
 */
export function normalizeSearch(value) {
  const lower = String(value ?? '').toLowerCase();
  let out = '';
  for (const char of lower) out += CYRILLIC[char] ?? char;
  return out
    .replace(/['ʻʼ‘’`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * "Skelet" — o'xshash tovushlarni birlashtiradi, shunda
 * "Tashkent" = "Toshkent", "Bukhara" = "Buxoro", "Karshi" = "Qarshi" topiladi.
 */
export function searchSkeleton(value) {
  return normalizeSearch(value)
    .replace(/kh/g, 'x')
    .replace(/q/g, 'k')
    .replace(/h/g, 'x')
    .replace(/o/g, 'a')
    .replace(/w/g, 'v')
    .replace(/(.)\1+/g, '$1')
    .replace(/\s+/g, ' ');
}

/** Raqamni so'z bilan: 1 → "1 ta" */
export function plural(count, word) {
  return `${count} ta ${word}`;
}

export default { escapeHtml, formatMoney, normalizeSearch, searchSkeleton, plural };
