/**
 * Stansiyalar: xotirada keshlangan ro'yxat, qidiruv va matndan topish.
 * Qidiruv lotin, kirill va ruscha yozuvlarni tushunadi
 * ("Toshkent", "Тошкент", "Ташкент", "Tashkent" — hammasi bitta stansiya).
 */
import prisma, { isDatabaseReady } from '../database/connection.js';
import { STATIONS } from './stationData.js';
import { normalizeSearch, searchSkeleton } from '../utils/text.js';

let stations = STATIONS.map((station) => ({ ...station, isActive: true }));
let index = buildIndex(stations);

function buildIndex(list) {
  return list.map((station) => {
    const names = [station.nameUz, station.nameRu, station.nameEn, ...(station.aliases || [])].filter(Boolean);
    return {
      station,
      keys: [...new Set(names.map(normalizeSearch).filter(Boolean))],
      skeletons: [...new Set(names.map(searchSkeleton).filter(Boolean))],
    };
  });
}

/** Bazadan qayta yuklash (server ishga tushganda va admin o'zgartirganda) */
export async function refreshStations() {
  if (!isDatabaseReady()) return stations;
  const rows = await prisma.station.findMany({ orderBy: [{ sortOrder: 'asc' }, { nameUz: 'asc' }] });
  if (rows.length) {
    stations = rows;
    index = buildIndex(rows.filter((row) => row.isActive));
  }
  return stations;
}

/** Faol stansiyalar (Mini App uchun) */
export function listStations() {
  return index.map((item) => ({
    code: item.station.code,
    nameUz: item.station.nameUz,
    nameRu: item.station.nameRu,
    region: item.station.region,
    isPopular: item.station.isPopular,
    aliases: item.station.aliases || [],
  }));
}

export function findStation(code) {
  return index.find((item) => item.station.code === String(code))?.station || null;
}

export function stationName(code) {
  return findStation(code)?.nameUz || String(code);
}

/** Nom bo'yicha qidiruv (eng mosi birinchi) */
export function searchStations(query, limit = 10) {
  const q = normalizeSearch(query);
  if (!q) return [];
  const skeleton = searchSkeleton(query);

  const scored = [];
  for (const item of index) {
    let score = 0;
    for (const key of item.keys) {
      if (key === q) score = Math.max(score, 100);
      else if (key.startsWith(q)) score = Math.max(score, 80);
      else if (key.includes(q)) score = Math.max(score, 50);
    }
    for (const key of item.skeletons) {
      if (key === skeleton) score = Math.max(score, 90);
      else if (key.startsWith(skeleton)) score = Math.max(score, 70);
    }
    if (score) scored.push({ score, station: item.station });
  }

  return scored
    .sort((a, b) => b.score - a.score || (a.station.sortOrder ?? 100) - (b.station.sortOrder ?? 100))
    .slice(0, limit)
    .map((item) => item.station);
}

/**
 * Matn ichidan stansiyalarni topish (bot uchun):
 * "Toshkent Samarqand 25.09" → [Toshkent, Samarqand]
 * Qaytaradi: [{ station, start, end }] — matndagi o'rni bo'yicha tartiblangan.
 */
export function findStationsInText(text) {
  const normalized = ` ${normalizeSearch(text)} `;
  const skeleton = ` ${searchSkeleton(text)} `;
  const found = [];

  for (const item of index) {
    let best = null;
    const tryKeys = (keys, haystack) => {
      for (const key of keys) {
        if (key.length < 3) continue;
        const position = haystack.indexOf(` ${key} `);
        if (position !== -1 && (!best || key.length > best.length)) {
          best = { start: position, length: key.length };
        }
      }
    };
    tryKeys(item.keys, normalized);
    if (!best) tryKeys(item.skeletons, skeleton);
    if (best) found.push({ station: item.station, start: best.start, end: best.start + best.length });
  }

  // Bir-birining ichiga tushgan topilmalardan uzunrog'ini qoldiramiz
  // ("Toshkent janubiy" topilsa, "Toshkent" alohida hisoblanmaydi)
  const result = found
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .filter((item, i, list) => !list.some((other, j) => j !== i
      && other.start <= item.start && other.end >= item.end
      && (other.end - other.start) > (item.end - item.start)));

  const seen = new Set();
  return result.filter((item) => {
    if (seen.has(item.station.code)) return false;
    seen.add(item.station.code);
    return true;
  });
}

export default { refreshStations, listStations, findStation, stationName, searchStations, findStationsInText };
