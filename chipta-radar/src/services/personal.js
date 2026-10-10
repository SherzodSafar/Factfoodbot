/**
 * Shaxsiy ma'lumotlar: yo'lovchi va login tekshiruvi, niqoblash, yosh toifasi.
 * Toza funksiyalar (baza va tarmoqsiz) — test qilsa bo'ladi.
 */
import { ValidationError } from '../utils/errors.js';
import { isISODate, todayISO } from '../utils/dates.js';

/** Shu yoshgacha — bola chiptasi (tug'ilgan sanadan avtomatik aniqlanadi) */
export const CHILD_AGE = 16;

export const GENDERS = { M: 'Erkak', F: 'Ayol' };

/** O'zbekiston viloyatlari (eticket reserve `regionId` kodi → nomi) */
export const REGIONS = {
  27: 'Toshkent sh.',
  26: 'Toshkent vil.',
  3: 'Andijon',
  6: 'Buxoro',
  8: 'Jizzax',
  10: 'Qashqadaryo',
  12: 'Navoiy',
  14: 'Namangan',
  18: 'Samarqand',
  22: 'Surxondaryo',
  24: 'Sirdaryo',
  30: "Farg'ona",
  33: 'Xorazm',
  35: "Qoraqalpog'iston",
};

/** "3" yoki "03" → "03" (ikki xonali kod); noto'g'ri bo'lsa '' */
export function normalizeRegion(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const code = String(Number(raw)); // "03" → "3"
  return REGIONS[code] ? code.padStart(2, '0') : '';
}

/** Viloyat kodining nomi ("03" → "Andijon") */
export function regionName(code) {
  return REGIONS[String(Number(code))] || '';
}

const NAME_RE = /^[\p{L}][\p{L}'ʻʼ‘’`\- ]{0,39}$/u;

/** "  anvarjon " → "ANVARJON" (lotin va kirill, tutuq belgisi va chiziqcha mumkin) */
export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** "aa 1234567" → "AA1234567" */
export function normalizeDoc(value) {
  return String(value ?? '').toUpperCase().replace(/[\s.]/g, '');
}

/** To'liq yillar soni (onDate kuni) */
export function ageOn(birthDate, onDate = todayISO()) {
  if (!isISODate(birthDate) || !isISODate(onDate)) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = onDate.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

/** 'adult' | 'child' — safar kuni yoshiga qarab */
export function passengerCategory(birthDate, onDate = todayISO()) {
  const age = ageOn(birthDate, onDate);
  return age !== null && age < CHILD_AGE ? 'child' : 'adult';
}

export const CATEGORY_LABELS = { adult: 'katta', child: 'bola' };

/**
 * Yangi yo'lovchi ma'lumotlarini tekshirish.
 * @returns {{label:string, firstName:string, lastName:string, docNumber:string, birthDate:string, gender:'M'|'F', citizenship:string}}
 */
export function validatePassengerInput(input = {}, { today = todayISO() } = {}) {
  const label = String(input.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);

  const firstName = normalizeName(input.firstName);
  const lastName = normalizeName(input.lastName);
  if (!firstName) throw new ValidationError('Ismni kiriting');
  if (!lastName) throw new ValidationError('Familiyani kiriting');
  if (!NAME_RE.test(firstName) || !NAME_RE.test(lastName)) {
    throw new ValidationError('Ism va familiyani hujjatdagidek, faqat harflar bilan yozing');
  }

  const docNumber = normalizeDoc(input.docNumber);
  if (!docNumber) throw new ValidationError('Pasport yoki ID seriya va raqamini kiriting');
  if (!/^[A-Z0-9][A-Z0-9№-]{4,19}$/.test(docNumber)) {
    throw new ValidationError('Hujjat raqami noto\'g\'ri. Masalan: AA1234567');
  }

  const birthDate = String(input.birthDate ?? '').trim();
  if (!isISODate(birthDate)) throw new ValidationError('Tug\'ilgan sanani tanlang');
  const age = ageOn(birthDate, today);
  if (age === null || birthDate > today) throw new ValidationError('Tug\'ilgan sana kelajakda bo\'lishi mumkin emas');
  if (age > 120) throw new ValidationError('Tug\'ilgan sana noto\'g\'ri');

  const gender = String(input.gender ?? '').toUpperCase();
  if (!GENDERS[gender]) throw new ValidationError('Jinsini tanlang');

  const citizenship = /^[A-Z]{3}$/.test(String(input.citizenship ?? '')) ? input.citizenship : 'UZB';
  const region = normalizeRegion(input.region); // ixtiyoriy — bo'sh bo'lishi mumkin

  return { label, firstName, lastName, docNumber, birthDate, gender, citizenship, region };
}

/* ------------------------------------------------------------------ */
/*  Niqoblash (botda va Web App'da faqat shu ko'rinish chiqadi)        */
/* ------------------------------------------------------------------ */

/** "ANVARJON", "ISMOILOV" → "ANVA**** I." */
export function maskName(firstName, lastName = '') {
  const first = String(firstName || '');
  const visible = Math.max(1, Math.ceil(first.length / 2));
  const head = `${first.slice(0, visible)}${'*'.repeat(Math.max(0, first.length - visible))}`;
  const initial = String(lastName || '').trim().charAt(0);
  return initial ? `${head} ${initial}.` : head;
}

/** "AA1234567" → "AA*****67" */
export function maskDoc(doc) {
  const text = String(doc || '');
  if (text.length <= 4) return '*'.repeat(text.length);
  return `${text.slice(0, 2)}${'*'.repeat(text.length - 4)}${text.slice(-2)}`;
}

/** Telefon raqami: 9 yoki 12 xonali (998...) → "998901234567"; aks holda null */
export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (/^\d{9}$/.test(digits)) return `998${digits}`;
  if (/^998\d{9}$/.test(digits)) return digits;
  return null;
}

/** "998901234567" → "+998 90 123 45 67" */
export function formatPhone(digits) {
  const d = String(digits || '');
  if (!/^998\d{9}$/.test(d)) return d;
  return `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
}

/** Login (telefon yoki email) niqobi: "+998 90 *** ** 67" yoki "a***r@gmail.com" */
export function maskLogin(login) {
  const text = String(login || '').trim();
  const phone = normalizePhone(text);
  if (phone && !text.includes('@')) return `+998 ${phone.slice(3, 5)} *** ** ${phone.slice(10)}`;
  const at = text.indexOf('@');
  if (at > 0) {
    const name = text.slice(0, at);
    const masked = name.length <= 2 ? `${name.charAt(0)}***` : `${name.charAt(0)}***${name.slice(-1)}`;
    return `${masked}${text.slice(at)}`;
  }
  return text.length <= 4 ? '****' : `${text.slice(0, 2)}***${text.slice(-2)}`;
}

/**
 * eticket'ga yuboriladigan login: bo'sh joy va chiziqchalar olib tashlanadi,
 * 9 xonali raqamga 998 qo'shiladi. Email o'zgarmaydi.
 */
export function normalizeLogin(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.includes('@')) return text.toLowerCase();
  const compact = text.replace(/[\s()-]/g, '');
  if (/^\d{9}$/.test(compact)) return `998${compact}`;
  return compact;
}

/** Bazadagi yo'lovchi + ochilgan ma'lumotdan ko'rsatish uchun ko'rinish */
export function publicPassenger(row, secret = null, onDate = todayISO()) {
  const category = secret?.birthDate ? passengerCategory(secret.birthDate, onDate) : null;
  return {
    id: row.id,
    label: row.label || '',
    name: row.nameMasked,
    doc: row.docMasked,
    category,
    categoryLabel: category ? CATEGORY_LABELS[category] : null,
    gender: secret?.gender || null,
    region: secret?.region || null,
    regionName: secret?.region ? regionName(secret.region) : null,
    locked: !secret,
    createdAt: row.createdAt,
  };
}

export default {
  CHILD_AGE, GENDERS, REGIONS, CATEGORY_LABELS, normalizeName, normalizeDoc, normalizeRegion, regionName,
  ageOn, passengerCategory, validatePassengerInput, maskName, maskDoc, maskLogin, normalizePhone, formatPhone, normalizeLogin, publicPassenger,
};
