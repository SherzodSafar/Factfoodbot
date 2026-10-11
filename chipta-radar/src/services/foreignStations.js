/**
 * Xorijiy yo'nalishlar bekatlari.
 *
 * Hozircha Qozog'iston temir yo'li (KTZ, bilet.railways.kz) — Olmaota–Toshkent Talgo poyezdi
 * yo'nalishidagi bekatlar. Kodlar KTZ'ning bekat qidiruvidan olingan (Express tizimi kodlari,
 * Toshkent kodi O'zbekiston temir yo'li bilan bir xil).
 */
import { normalizeSearch } from '../utils/text.js';

export const KTZ_STATIONS = [
  { code: '2700000', nameUz: 'Olmaota', nameRu: 'Алматы', nameEn: 'Almaty', country: 'KZ', aliases: ['Алматы', 'Almaty', 'Olma-ota', 'Алма-Ата', 'Almati'] },
  { code: '2700710', nameUz: 'Taroz', nameRu: 'Тараз', nameEn: 'Taraz', country: 'KZ', aliases: ['Тараз', 'Taraz', 'Jambul', 'Жамбыл'] },
  { code: '2700770', nameUz: 'Shimkent', nameRu: 'Шымкент', nameEn: 'Shymkent', country: 'KZ', aliases: ['Шымкент', 'Shymkent', 'Chimkent', 'Чимкент'] },
];

/** Xorijiy poyezdlar to'xtaydigan O'zbekiston bekatlari */
export const INTL_UZ_STATIONS = [
  { code: '2900000', nameUz: 'Toshkent', nameRu: 'Ташкент', nameEn: 'Tashkent', country: 'UZ', aliases: ['Тошкент', 'Ташкент', 'Tashkent'] },
];

export const isKtzCode = (code) => String(code || '').startsWith('27');
/** Yo'nalish xorijiymi (KTZ orqali qidiriladi) */
export const isIntlRoute = (from, to) => isKtzCode(from) || isKtzCode(to);

export function intlStations() {
  return [...INTL_UZ_STATIONS, ...KTZ_STATIONS];
}

/** Jo'nash bekatiga qarab borish mumkin bo'lgan bekatlar (boshqa davlat) */
export function intlDestinations(from) {
  return isKtzCode(from) ? INTL_UZ_STATIONS : KTZ_STATIONS;
}

export function findForeignStation(code) {
  return KTZ_STATIONS.find((station) => station.code === String(code)) || null;
}

/** Nomi bo'yicha (lotin/kirill) — berilgan ro'yxatdan */
export function matchIntlStation(text, list = intlStations()) {
  const query = normalizeSearch(text);
  if (!query) return null;
  const names = (station) => [station.nameUz, station.nameRu, station.nameEn, ...(station.aliases || [])].map(normalizeSearch);
  return list.find((station) => names(station).includes(query))
    || list.find((station) => names(station).some((name) => name.startsWith(query) || query.startsWith(name)))
    || null;
}

export default { KTZ_STATIONS, INTL_UZ_STATIONS, isKtzCode, isIntlRoute, intlStations, intlDestinations, findForeignStation, matchIntlStation };
