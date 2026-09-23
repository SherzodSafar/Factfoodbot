/**
 * Vagon turlari.
 *
 * Sayt bir xil vagon turini turli yozuvda qaytaradi: poyezdlar ro'yxatida
 * "Plaskartli", vagonlar tafsilotida esa "Плацкартный". Shu sababli har bir
 * yozuv bitta "kanonik" kalitga keltiriladi — kuzatuvlar aynan shu kalit
 * bo'yicha solishtiriladi.
 */
import { normalizeSearch } from '../utils/text.js';

export const CAR_TYPES = {
  platskart: { label: 'Plaskartli', short: 'Plaskart', emoji: '🛏', berths: true },
  kupe: { label: 'Kupe', short: 'Kupe', emoji: '🚪', berths: true },
  sv: { label: 'SV (2 kishilik)', short: 'SV', emoji: '🛌', berths: true },
  lux: { label: 'Lyuks', short: 'Lyuks', emoji: '✨', berths: true },
  sitting: { label: 'O\'rindiqli', short: 'O\'rindiq', emoji: '💺', berths: false },
  business: { label: 'Biznes', short: 'Biznes', emoji: '💼', berths: false },
  vip: { label: 'VIP', short: 'VIP', emoji: '👑', berths: false },
  general: { label: 'Umumiy', short: 'Umumiy', emoji: '🚃', berths: false },
};

/** Kuzatuv shaklida ko'rsatiladigan tartib */
export const CAR_TYPE_ORDER = ['platskart', 'kupe', 'sitting', 'sv', 'lux', 'business', 'vip', 'general'];

// Sayt qaytaradigan yozuvlar (normallashtirilgan ko'rinishda)
const ALIASES = {
  platskart: ['platskartniy', 'platskarta', 'platskart', 'plaskartli', 'plackartli', 'platskartli', 'plaskart', 'reserved seat', 'plazkart'],
  kupe: ['kupe', 'coupe', 'compartment', 'kupeyniy'],
  sv: ['sv', 'sleeper', 'spalniy', 'myagkiy sv'],
  lux: ['lyuks', 'lux', 'luxury', 'lyuks sv', 'myagkiy'],
  sitting: [
    'sidyachiy', 'orindiqli', 'orindikli', 'sitting', 'seated', 'seat',
    'ekonom', 'economy', 'ekonom klass', 'turist', 'standart', 'standard',
  ],
  business: ['biznes', 'business', 'biznes klass', 'birinchi klass', 'first class', 'perviy klass'],
  vip: ['vip'],
  general: ['obshiy', 'umumiy', 'general', 'obshchiy'],
};

const LOOKUP = new Map();
for (const [key, list] of Object.entries(ALIASES)) {
  for (const alias of list) LOOKUP.set(alias, key);
}

/**
 * Har qanday yozuvni kanonik kalitga keltirish.
 * Noma'lum tur bo'lsa — normallashtirilgan matnning o'zi qaytadi.
 */
export function normalizeCarType(raw) {
  const key = normalizeSearch(raw);
  if (!key) return '';
  if (LOOKUP.has(key)) return LOOKUP.get(key);
  // "Плацкартный вагон", "Kupe (4 o'rinli)" kabi kengaytirilgan yozuvlar
  for (const [alias, type] of LOOKUP) {
    if (alias.length >= 4 && key.includes(alias)) return type;
  }
  return key.replace(/\s+/g, '-');
}

export function carTypeLabel(type, fallback) {
  return CAR_TYPES[type]?.label || fallback || type;
}

export function carTypeEmoji(type) {
  return CAR_TYPES[type]?.emoji || '🚃';
}

/** Bu turda pastki/yuqori o'rinlar bormi */
export function hasBerths(type) {
  return Boolean(CAR_TYPES[type]?.berths);
}

export function isKnownCarType(type) {
  return Object.hasOwn(CAR_TYPES, type);
}

export default { CAR_TYPES, CAR_TYPE_ORDER, normalizeCarType, carTypeLabel, carTypeEmoji, hasBerths, isKnownCarType };
