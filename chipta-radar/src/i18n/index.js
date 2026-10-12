/**
 * Bot tarjima qatlami. Kod matnlarni o'zbekcha (lotin) yozadi; Telegram'ga ketayotgan har bir
 * xabar, tugma va bildirishnoma foydalanuvchi tiliga o'giriladi:
 *   uz  — o'zgarmaydi, uzc — kirillga transliteratsiya,
 *   ru/en — uzun matnlar (texts.js), raqamli iboralar (RULES), iboralar lug'ati (phrases.js), bekat nomlari.
 * Til foydalanuvchi bazasida (User.lang) saqlanadi va Android ilova bilan sinxronlanadi.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { Telegram } from 'telegraf';
import prisma, { isDatabaseReady } from '../database/connection.js';
import { toCyrillic } from './translit.js';
import { PHRASES } from './phrases.js';
import { TEXTS } from './texts.js';
import { listStations } from '../services/stations.js';
import { KTZ_STATIONS } from '../services/foreignStations.js';

export const LANGS = ['uz', 'uzc', 'ru', 'en'];
export const LANG_LABELS = { uz: '🇺🇿 O\'zbekcha', uzc: '🇺🇿 Ўзбекча (кирилл)', ru: '🇷🇺 Русский', en: '🇬🇧 English' };
/** Shu belgili payload yoki tugma tarjima qilinmaydi (masalan, admin e'loni, til tanlash tugmalari) */
export const NO_I18N = Symbol('no-i18n');

export const normLang = (value) => (LANGS.includes(value) ? value : 'uz');

const RAW = '\u2063';
const RAW_RE = /\u2063([^\u2063]*)\u2063/g;
/** Foydalanuvchi yozgan matn (ism, e'lon) — tarjima qilinmaydi */
export const raw = (value) => `${RAW}${String(value ?? '').replaceAll(RAW, '')}${RAW}`;

/* ----------------------------- Til keshi ----------------------------- */

const langs = new Map(); // telegramId → til (faqat 'uz' dan farqlilari)
const als = new AsyncLocalStorage(); // joriy update: { userId, lang }

export function userLang(telegramId) {
  return telegramId === undefined || telegramId === null ? 'uz' : langs.get(String(telegramId)) || 'uz';
}

export function currentLang() {
  return als.getStore()?.lang || 'uz';
}

/** Tilni saqlash (kesh + baza). Joriy update shu foydalanuvchiniki bo'lsa — darhol kuchga kiradi */
export async function saveUserLang(telegramId, lang) {
  const id = String(telegramId);
  const value = normLang(lang);
  if (value === 'uz') langs.delete(id);
  else langs.set(id, value);
  const store = als.getStore();
  if (store?.userId === id) store.lang = value;
  if (isDatabaseReady()) await prisma.user.updateMany({ where: { telegramId: id }, data: { lang: value } });
  return value;
}

/** Ishga tushganda: 'uz' dan boshqa tilni tanlaganlar keshga */
export async function loadUserLangs() {
  if (!isDatabaseReady()) return 0;
  const rows = await prisma.user.findMany({ where: { NOT: { lang: 'uz' } }, select: { telegramId: true, lang: true } });
  for (const row of rows) if (normLang(row.lang) !== 'uz') langs.set(row.telegramId, normLang(row.lang));
  return rows.length;
}

/* ------------------------------ Qoidalar ------------------------------ */

const AP = "['ʻ‘’`]";
const ruPlural = (n, forms) => {
  const a = n % 10;
  const b = n % 100;
  return forms[a === 1 && b !== 11 ? 0 : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 1 : 2];
};
const count = (n, ru, en) => ({ ru: `${n} ${ruPlural(Number(n), ru)}`, en: `${n} ${Number(n) === 1 ? en[0] : en[1]}` });

const NOUNS = {
  'faol kuzatuv': [['активное отслеживание', 'активных отслеживания', 'активных отслеживаний'], ['active alert', 'active alerts']],
  kuzatuv: [['отслеживание', 'отслеживания', 'отслеживаний'], ['alert', 'alerts']],
  chipta: [['билет', 'билета', 'билетов'], ['ticket', 'tickets']],
  poyezd: [['поезд', 'поезда', 'поездов'], ['train', 'trains']],
  joy: [['место', 'места', 'мест'], ['seat', 'seats']],
  sana: [['дата', 'даты', 'дат'], ['date', 'dates']],
  xabar: [['сообщение', 'сообщения', 'сообщений'], ['message', 'messages']],
  "yo'lovchi": [['пассажир', 'пассажира', 'пассажиров'], ['passenger', 'passengers']],
  "yo'nalish": [['направление', 'направления', 'направлений'], ['route', 'routes']],
};
const nounKey = (word) => word.replace(/['ʻ‘’`]/g, "'");

const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const MONTHS_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'];
const DAYS_SHORT = ['yak', 'dus', 'ses', 'cho', 'pay', 'jum', 'sha'];
const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const RU_MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const RU_DAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EN_DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const NUM = '(\\d{1,3}(?: \\d{3})*(?:[.,]\\d+)?)';
const CUR = { ru: { som: 'сум', tenge: 'тенге' }, en: { som: 'UZS', tenge: 'KZT' } };
const cur = (lang, word) => CUR[lang][/^so/.test(word) ? 'som' : 'tenge'];
const END = '(?![\\p{L}\\p{N}])';

/** [regex, (lang, ...guruhlar) → matn]. Tartib muhim: aniqroq qoida birinchi */
const RULES = [
  [`Bir martada ko${AP}pi bilan (\\d+) ta sana tanlash mumkin`, (l, n) => (l === 'ru' ? `За один раз можно выбрать не более ${n} дат` : `You can pick at most ${n} dates at once`)],
  [`Ko${AP}pi bilan (\\d+) ta faol kuzatuv bo${AP}lishi mumkin`, (l, n) => (l === 'ru' ? `Можно иметь не более ${n} активных отслеживаний` : `You can have at most ${n} active alerts`)],
  [`Sana (\\d+) kundan uzoq bo${AP}lmasligi kerak`, (l, n) => (l === 'ru' ? `Дата должна быть не позже чем через ${n} дн.` : `The date must be within ${n} days`)],
  [`va yana (\\d+) ta poyezd`, (l, n) => (l === 'ru' ? `и ещё ${count(n, NOUNS.poyezd[0], NOUNS.poyezd[1]).ru}` : `and ${n} more ${Number(n) === 1 ? 'train' : 'trains'}`)],
  [`Taxminan (\\d+) daqiqadan so${AP}ng qayta urinib ko${AP}ring`, (l, n) => (l === 'ru' ? `Попробуйте снова примерно через ${n} мин` : `Try again in about ${n} min`)],
  [`(\\d+) marta tekshirildi`, (l, n) => (l === 'ru' ? `Проверено ${n} ${ruPlural(Number(n), ['раз', 'раза', 'раз'])}` : `Checked ${n} ${Number(n) === 1 ? 'time' : 'times'}`)],
  [`(\\d+) ta tanlandi`, (l, n) => (l === 'ru' ? `выбрано: ${n}` : `${n} selected`)],
  [`(\\d+)-ni faol qilish`, (l, n) => (l === 'ru' ? `Сделать №${n} активным` : `Make #${n} active`)],
  [`(\\d+) daq oldin`, (l, n) => (l === 'ru' ? `${n} мин назад` : `${n} min ago`)],
  // Sanalar: "5-okt, ses" (tugma) va "14-oktabr"
  [`(\\d{1,2})-(${MONTHS_SHORT.join('|')}), (${DAYS_SHORT.join('|')})${END}`, (l, d, m, w) => {
    const mi = MONTHS_SHORT.indexOf(m);
    const wi = DAYS_SHORT.indexOf(w);
    return l === 'ru' ? `${d} ${RU_MONTHS_SHORT[mi]}, ${RU_DAYS_SHORT[wi]}` : `${EN_DAYS_SHORT[wi]}, ${EN_MONTHS[mi].slice(0, 3)} ${d}`;
  }],
  [`(\\d{1,2})-(${MONTHS.join('|')})${END}`, (l, d, m) => (l === 'ru' ? `${d} ${RU_MONTHS[MONTHS.indexOf(m)]}` : `${d} ${EN_MONTHS[MONTHS.indexOf(m)]}`)],
  // Pul: "120 000 so'm dan", "500 000 so'm gacha", "12 000 tenge"
  [`${NUM} (so${AP}m|tenge) ?dan${END}`, (l, n, c) => (l === 'ru' ? `от ${n} ${cur(l, c)}` : `from ${n} ${cur(l, c)}`)],
  [`${NUM} (so${AP}m|tenge) ?gacha${END}`, (l, n, c) => (l === 'ru' ? `до ${n} ${cur(l, c)}` : `up to ${n} ${cur(l, c)}`)],
  [`${NUM} (so${AP}m|tenge)${END}`, (l, n, c) => `${n} ${cur(l, c)}`],
  [`(so${AP}m)${END}`, (l) => cur(l, 'som')],
  // Vaqt
  [`(\\d+) soat (\\d+) daq${END}`, (l, h, m) => (l === 'ru' ? `${h} ч ${m} мин` : `${h} h ${m} min`)],
  [`(\\d+) soat${END}`, (l, h) => (l === 'ru' ? `${h} ч` : `${h} h`)],
  [`(\\d+) (?:daq|daqiqa)${END}`, (l, m) => (l === 'ru' ? `${m} мин` : `${m} min`)],
  [`(\\d+) kun${END}`, (l, n) => count(n, ['день', 'дня', 'дней'], ['day', 'days'])[l]],
  // Vagon va bo'lim raqamlari: "7-vagon", "3, 4-bo'lim"
  [`(\\d+(?:, \\d+)*)-(bo${AP}lim|kupe)${END}`, (l, n, unit) => {
    const bay = /^bo/.test(unit);
    return l === 'ru' ? `${bay ? 'отсек' : 'купе'} ${n}` : `${bay ? 'bay' : 'compartment'} ${n}`;
  }],
  [`(\\w+)-vagon${END}`, (l, n) => (l === 'ru' ? `вагон ${n}` : `car ${n}`)],
  // Sanoq: "3 ta chipta", "12 joy", "(5 ta)"
  [`(\\d+) (?:ta )?(${Object.keys(NOUNS).map((key) => key.replace(/'/g, AP)).join('|')})${END}`, (l, n, word) => {
    const [ru, en] = NOUNS[nounKey(word)];
    return count(n, ru, en)[l];
  }],
  [`(\\d+) ta${END}`, (l, n) => n],
].map(([source, fn]) => [new RegExp(source, 'gu'), fn]);

/* ------------------------------ Lug'at ------------------------------ */

const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normApos = (value) => value.replace(/['ʻ‘’`]/g, "'");
const lowerFirst = (value) => value.charAt(0).toLowerCase() + value.slice(1);
const isUpper = (ch) => ch !== ch.toLowerCase();
const isLower = (ch) => ch !== ch.toUpperCase();

function keyPattern(key, exact) {
  const body = escapeRe(key).replace(/'/g, AP);
  const first = key.charAt(0);
  if (exact || !(isUpper(first) || isLower(first))) return body;
  return `[${first.toUpperCase()}${first.toLowerCase()}]${body.slice(1)}`;
}

let index = null;

function buildIndex(stations) {
  const map = new Map();
  const keys = [];
  const add = (key, ru, en, exact) => {
    if (!key || !ru || !en) return;
    const norm = exact ? normApos(key) : lowerFirst(normApos(key));
    if (map.has(norm)) return;
    map.set(norm, { key, ru, en });
    keys.push({ key, pattern: keyPattern(key, exact) });
  };
  for (const [uz, ru, en] of PHRASES) add(uz, ru, en, false);
  for (const station of stations) add(station.nameUz, station.nameRu, station.nameEn, true);
  keys.sort((a, b) => b.key.length - a.key.length);
  const re = new RegExp(`(?<![\\p{L}\\p{N}'ʻ‘’\`])(?:${keys.map((item) => item.pattern).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  return { re, map, size: stations.length };
}

function getIndex() {
  let stations = [];
  try { stations = [...listStations(), ...KTZ_STATIONS]; } catch { stations = [...KTZ_STATIONS]; }
  if (!index || index.size !== stations.length) index = buildIndex(stations);
  return index;
}

/** Tarjimaning birinchi harfini manba matniga moslash ("Kupe" ↔ "kupe") */
function fitCase(found, key, out) {
  const a = found.charAt(0);
  const b = key.charAt(0);
  if (a === b || !out) return out;
  if (isUpper(a)) return out.charAt(0).toUpperCase() + out.slice(1);
  if (isLower(a) && !/^(I\b|I'|\p{Lu}{2})/u.test(out)) return out.charAt(0).toLowerCase() + out.slice(1);
  return out;
}

const BLOCKS = Object.values(TEXTS).sort((a, b) => b.uz.length - a.uz.length);
const MASK = /\u0001(\d+)\u0001/g;

function translatePlain(text, lang, keep) {
  const mask = (value) => `\u0001${keep.push(value) - 1}\u0001`;
  let out = text.replace(/https?:\/\/\S+/g, mask);
  for (const [re, fn] of RULES) out = out.replace(re, (...args) => mask(fn(lang, ...args.slice(1, -2))));
  const { re, map } = getIndex();
  return out.replace(re, (found) => {
    const norm = normApos(found);
    const entry = map.get(norm) || map.get(lowerFirst(norm));
    return entry ? fitCase(found, entry.key, entry[lang]) : found;
  });
}

/**
 * Matnni tilga o'girish. html=true — HTML teglari ichi o'zgarmaydi.
 * Tarjima topilmagan so'zlar o'zbekcha qoladi (xato bermaydi).
 */
export function translate(text, lang, { html = false } = {}) {
  if (typeof text !== 'string' || !text) return text;
  if (lang === 'uz' || !LANGS.includes(lang)) return text.includes(RAW) ? text.replaceAll(RAW, '') : text;
  const keep = [];
  let source = text.replace(RAW_RE, (_, inner) => `\u0001${keep.push(inner) - 1}\u0001`);
  if (lang === 'uzc') return unmask(toCyrillic(source), keep);
  for (const block of BLOCKS) {
    if (source.includes(block.uz)) source = source.split(block.uz).join(`\u0001${keep.push(block[lang]) - 1}\u0001`);
  }
  const parts = html ? source.split(/(<[^>]*>)/) : [source];
  return unmask(parts.map((part, i) => (i % 2 ? part : translatePlain(part, lang, keep))).join(''), keep);
}

function unmask(text, keep) {
  let out = text;
  for (let guard = 0; guard < 3 && out.includes('\u0001'); guard += 1) out = out.replace(MASK, (_, i) => keep[Number(i)]);
  return out;
}

/* ------------------------- Telegram so'rovlari ------------------------- */

function localizeMarkup(markup, lang) {
  if (!markup || typeof markup !== 'object') return markup;
  const rows = (list) => list.map((row) => row.map((button) => {
    if (typeof button === 'string') return translate(button, lang);
    if (!button || button[NO_I18N] || typeof button.text !== 'string') return button;
    return { ...button, text: translate(button.text, lang) };
  }));
  const out = { ...markup };
  if (Array.isArray(markup.inline_keyboard)) out.inline_keyboard = rows(markup.inline_keyboard);
  if (Array.isArray(markup.keyboard)) out.keyboard = rows(markup.keyboard);
  return out;
}

export function localizePayload(payload, lang) {
  if (!payload || payload[NO_I18N]) return payload;
  const html = payload.parse_mode === 'HTML';
  const out = { ...payload };
  if (typeof out.text === 'string') out.text = translate(out.text, lang, { html });
  if (typeof out.caption === 'string') out.caption = translate(out.caption, lang, { html });
  if (out.reply_markup) out.reply_markup = localizeMarkup(out.reply_markup, lang);
  return out;
}

/** Kimga ketayotgani bo'yicha til: chat_id (shaxsiy chat) yoki joriy update egasi */
function payloadLang(method, payload) {
  const chat = payload.chat_id;
  if (method !== 'answerCallbackQuery' && chat !== undefined && chat !== null && /^\d+$/.test(String(chat))) return userLang(chat);
  return currentLang();
}

let patched = false;

/** Botga ulash: barcha chiquvchi so'rovlar tarjima qilinadi, har bir update o'z tili bilan ishlaydi */
export function installI18n(bot) {
  if (!patched) {
    patched = true;
    const original = Telegram.prototype.callApi;
    Telegram.prototype.callApi = function callApi(method, payload, options) {
      let body = payload;
      if (body && typeof body === 'object' && !body[NO_I18N]) {
        const lang = payloadLang(method, body);
        if (lang !== 'uz' || [body.text, body.caption].some((value) => typeof value === 'string' && value.includes(RAW))) {
          try {
            body = localizePayload(body, lang);
          } catch (error) {
            console.warn('[i18n]', error.message);
          }
        }
      }
      return original.call(this, method, body, options);
    };
  }
  bot.use((ctx, next) => {
    const userId = ctx.from?.id === undefined ? null : String(ctx.from.id);
    return als.run({ userId, lang: userLang(userId) }, next);
  });
}

/** Tugmani tarjimadan himoyalash (til nomlari kabi) */
export function keepButton(button) {
  return Object.assign(button, { [NO_I18N]: true });
}

export default { LANGS, LANG_LABELS, NO_I18N, raw, translate, installI18n, userLang, saveUserLang, loadUserLangs, keepButton, normLang };
