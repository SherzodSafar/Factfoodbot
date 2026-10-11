/**
 * Qozog'iston temir yo'li (KTZ) — bilet.railways.kz.
 *
 * Qidiruv sahifasi (GET) poyezdlar ro'yxatini HTML'da qaytaradi: har bir poyezd uchun
 * jo'nash/yetib borish vaqti va vagon turlari bo'yicha bo'sh joylar soni, eng arzon narx (tenge).
 * So'rovlar navbat bilan (oraliq 1,5 s) va qisqa keshlanadi.
 */
import { normalizeCarType, carTypeLabel } from '../services/carTypes.js';
import { normalizeSearch } from '../utils/text.js';

const BASE = 'https://bilet.railways.kz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const MIN_INTERVAL_MS = 1500;
const TIMEOUT_MS = 25_000;
const TITLES = { talgo: 'Talgo', skoriy: 'Tezyurar', passajirskiy: 'Yo\'lovchi' };

/** Saytdagi qidiruv sahifasi (foydalanuvchiga ham havola sifatida beriladi) */
export function ktzSearchUrl({ from, to, date }) {
  const [y, m, d] = String(date || '').split('-');
  return `${BASE}/sale/default/route/search?route_search_form%5BdepartureStation%5D=${encodeURIComponent(from)}`
    + `&route_search_form%5BarrivalStation%5D=${encodeURIComponent(to)}`
    + `&route_search_form%5BforwardDepartureDate%5D=${d}-${m}-${y}&_locale=ru`;
}

const decode = (text) => String(text || '')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
  .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(Number(dec)))
  .replace(/\s+/g, ' ').trim();

/** "17:53" yoki "1 д. 02:30" → daqiqa */
function parseDuration(text) {
  const match = String(text || '').match(/(?:(\d+)\s*[^\d\s:]+\.?\s*)?(\d{1,3}):(\d{2})/);
  if (!match) return null;
  return (Number(match[1]) || 0) * 1440 + Number(match[2]) * 60 + Number(match[3]);
}

/** "АЛМАТЫ 2" → "Алматы 2", "ТОШКЕНТ-ЙУЛО" → "Тошкент-Йуло" */
const titleCase = (text) => String(text || '').toLowerCase().replace(/(^|[\s-])(\S)/g, (_, sep, ch) => sep + ch.toUpperCase());

const addMinutes = (local, minutes) => new Date(Date.parse(`${local}:00Z`) + minutes * 60_000).toISOString().slice(0, 16);

/** Qidiruv sahifasidan poyezdlar (trains.js normalizeTrain ko'rinishida, narx — tenge) */
export function parseKtzTrains(html) {
  const parts = String(html || '').split(/<div class="train item result-card([^"]*)"/);
  const trains = [];
  for (let i = 1; i < parts.length; i += 2) {
    const extraClass = parts[i];
    const block = parts[i + 1] || '';
    if (/transfer/.test(extraClass)) continue; // o'tkazmali (ikki poyezdli) variantlar — kuzatilmaydi
    const direction = block.match(/data-direction="([^"]+)"/)?.[1];
    if (direction && direction !== 'forward') continue;
    const number = decode(block.match(/data-train="([^"]+)"/)?.[1]);
    const departure = block.match(/data-departure-date="(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/)?.[1];
    if (!number || !departure) continue;

    const durationMin = parseDuration(block.match(/result-card__arrow">\s*<span>([^<]+)<\/span>/)?.[1]);
    const hours = [...block.matchAll(/result-card__hour">\s*(\d{1,2}:\d{2})\s*</g)].map((match) => match[1].padStart(5, '0'));
    const arrival = durationMin ? addMinutes(departure, durationMin) : null;
    // "АЛМАТЫ 2 → ТОШКЕНТ-ЙУЛО" (data-title atributida HTML bor — ko'rinadigan matndan olinadi)
    const [fromStation = '', toStation = ''] = decode(block.match(/>\s*([^<>]+→[^<>]+?)\s*<\/span>/)?.[1]).split('→').map((part) => part.trim());
    // Chiqish va yetib borish bekati (shahar ichida bir nechta bekat bo'lishi mumkin)
    const [depStationName = '', arrStationName = ''] = [...block.matchAll(/result-card__station">([^<]*)</g)].map((match) => decode(match[1]));
    const brandRaw = decode(block.match(/<span>\s*&#x25cf;?\s*([^<]+)<\/span>/i)?.[1]);
    // Bir xil raqamli ikki poyezd bo'lishi mumkin (turli yo'nalishdan) — sarlavhada qayerdan-qayerga ham
    const routeLabel = [fromStation, toStation].filter(Boolean).map(titleCase).join(' → ');
    const brand = TITLES[normalizeSearch(brandRaw)] || brandRaw || 'Poyezd';
    const title = routeLabel ? `${brand} (${routeLabel})` : brand;

    const byType = new Map();
    for (const row of block.matchAll(/details-table-car-type">([^<]+)<\/td>\s*<td[^>]*seats-count">\s*(\d+)\s*<\/td>\s*<td[^>]*cost">([^<]*)</g)) {
      const rawLabel = decode(row[1]);
      const type = normalizeCarType(rawLabel) || 'other';
      const free = Number(row[2]) || 0;
      const price = Number(row[3].replace(/[^\d]/g, '')) || null;
      const entry = byType.get(type) || { type, label: carTypeLabel(type, rawLabel), rawLabel, free: 0, minPrice: null, maxPrice: null, classes: [], currency: 'KZT' };
      entry.free += free;
      if (price) {
        entry.minPrice = entry.minPrice ? Math.min(entry.minPrice, price) : price;
        entry.maxPrice = Math.max(entry.maxPrice || 0, price);
      }
      byType.set(type, entry);
    }
    const cars = [...byType.values()];
    const prices = cars.filter((car) => car.free > 0).map((car) => car.minPrice).filter(Boolean);

    trains.push({
      number,
      id: null,
      brand: brandRaw,
      kind: '',
      title,
      fromStation,
      toStation,
      depStationName,
      arrStationName,
      departure,
      arrival,
      depDate: departure.slice(0, 10),
      depTime: departure.slice(11, 16),
      arrDate: arrival ? arrival.slice(0, 10) : null,
      arrTime: hours[1] || (arrival ? arrival.slice(11, 16) : null),
      durationMin,
      cars,
      totalFree: cars.reduce((sum, car) => sum + car.free, 0),
      minPrice: prices.length ? Math.min(...prices) : null,
      currency: 'KZT',
      provider: 'ktz',
    });
  }
  return trains.sort((a, b) => a.departure.localeCompare(b.departure));
}

/* ------------------------- navbat va kesh ------------------------- */

let chain = Promise.resolve();
let lastAt = 0;
function queued(task) {
  const run = chain.then(async () => {
    const wait = lastAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try { return await task(); } finally { lastAt = Date.now(); }
  });
  chain = run.catch(() => {});
  return run;
}

const cache = new Map();
function cached(key, maxAgeMs, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.promise;
  const promise = loader();
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => cache.delete(key));
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return promise;
}

/** Poyezdlar ro'yxati: { trains } — railway.searchTrains bilan bir xil ko'rinish */
export function searchKtzTrains({ from, to, date }, { maxAgeMs = 60_000 } = {}) {
  return cached(`ktz:${from}:${to}:${date}`, maxAgeMs, () => queued(async () => {
    const res = await fetch(ktzSearchUrl({ from, to, date }), {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'ru-RU,ru;q=0.9' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch((error) => {
      throw new Error(`KTZ sayti javob bermadi (${error.name === 'TimeoutError' ? 'vaqt tugadi' : error.message})`);
    });
    const html = await res.text();
    if (!res.ok) throw new Error(`KTZ sayti xatosi: HTTP ${res.status}`);
    if (!html.includes('route_search_form')) throw new Error('KTZ sayti kutilmagan javob qaytardi');
    return { trains: parseKtzTrains(html) };
  }));
}

export default { ktzSearchUrl, parseKtzTrains, searchKtzTrains };
