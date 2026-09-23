/**
 * Botga yozilgan oddiy matndan qidiruvni tushunish:
 *   "Toshkent Samarqand 25.09"
 *   "toshkent - buxoro ertaga"
 *   "Ташкент Самарканд 3 октября"
 */
import { findStationsInText } from './stations.js';
import { normalizeSearch } from '../utils/text.js';
import { todayISO, addDays, isISODate } from '../utils/dates.js';

const MONTH_PREFIXES = [
  [1, ['yanv', 'jan']],
  [2, ['fev', 'feb']],
  [3, ['mart', 'mar']],
  [4, ['apr']],
  [5, ['may', 'mai']],
  [6, ['iyun', 'jun']],
  [7, ['iyul', 'jul']],
  [8, ['avg', 'aug']],
  [9, ['sent', 'sen', 'sep']],
  [10, ['okt', 'oct']],
  [11, ['noy', 'nov']],
  [12, ['dek', 'dec']],
];

function monthFromWord(word) {
  if (!word || word.length < 3) return null;
  for (const [month, prefixes] of MONTH_PREFIXES) {
    if (prefixes.some((prefix) => word.startsWith(prefix))) return month;
  }
  return null;
}

const pad = (value) => String(value).padStart(2, '0');

/** Kun va oydan eng yaqin kelajakdagi sanani yasash */
function buildDate(day, month, year, today) {
  const d = Number(day);
  const m = Number(month);
  if (!d || !m || d > 31 || m > 12) return null;

  if (year) {
    const y = Number(year) < 100 ? 2000 + Number(year) : Number(year);
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    return isISODate(iso) ? iso : null;
  }

  const currentYear = Number(today.slice(0, 4));
  for (const y of [currentYear, currentYear + 1]) {
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    if (isISODate(iso) && iso >= today) return iso;
  }
  return null;
}

/** Matndan sanani ajratib olish. Topilmasa — null */
export function parseDateFromText(text, now = Date.now()) {
  const today = todayISO(now);
  const raw = String(text || '');
  const words = normalizeSearch(raw).split(' ');

  if (words.some((word) => ['indinga', 'poslezavtra', 'indin'].includes(word))) return addDays(today, 2);
  if (words.some((word) => ['ertaga', 'zavtra', 'tomorrow', 'ertag'].includes(word))) return addDays(today, 1);
  if (words.some((word) => ['bugun', 'segodnya', 'today'].includes(word))) return today;

  // 25.09 / 25.09.2026 / 25/09 / 25-09-26 / 2026-09-25
  const iso = raw.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return buildDate(iso[3], iso[2], iso[1], today);

  const numeric = raw.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
  if (numeric) return buildDate(numeric[1], numeric[2], numeric[3], today);

  // "25 sentabr", "3 oktyabrya"
  for (let i = 0; i < words.length - 1; i += 1) {
    if (/^\d{1,2}$/.test(words[i])) {
      const month = monthFromWord(words[i + 1]);
      if (month) {
        const year = /^\d{4}$/.test(words[i + 2] || '') ? words[i + 2] : null;
        return buildDate(words[i], month, year, today);
      }
    }
  }
  // "sentabr 25"
  for (let i = 0; i < words.length - 1; i += 1) {
    const month = monthFromWord(words[i]);
    if (month && /^\d{1,2}$/.test(words[i + 1])) return buildDate(words[i + 1], month, null, today);
  }

  // Faqat kun: "Toshkent Buxoro 28" — shu oy yoki keyingi oy ("2 ta", "3 kishi" hisobga olinmaydi)
  const COUNT_WORDS = ['ta', 'kishi', 'chipta', 'odam', 'dona', 'bilet', 'bileta', 'biletov', 'mest', 'mesta', 'joy'];
  const lone = words.find((word, i) => /^\d{1,2}$/.test(word) && !COUNT_WORDS.includes(words[i + 1]));
  if (lone) {
    const month = Number(today.slice(5, 7));
    return buildDate(lone, month, null, today) || buildDate(lone, month === 12 ? 1 : month + 1, null, today);
  }

  return null;
}

/**
 * To'liq so'rovni tahlil qilish.
 * @returns {{ok:boolean, from?:object, to?:object, date?:string, dateGiven?:boolean, reason?:string}}
 */
export function parseQuery(text, now = Date.now()) {
  const found = findStationsInText(text);
  if (found.length < 2) {
    return {
      ok: false,
      reason: found.length === 1 ? 'one-station' : 'no-station',
      from: found[0]?.station || null,
    };
  }

  const date = parseDateFromText(text, now);
  return {
    ok: true,
    from: found[0].station,
    to: found[1].station,
    date: date || todayISO(now),
    dateGiven: Boolean(date),
  };
}

export default { parseQuery, parseDateFromText };
