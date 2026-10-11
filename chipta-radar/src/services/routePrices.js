/**
 * Yo'nalishlar narxlari ro'yxati (bazada: Setting "routePrices").
 *
 * Narxlar kam o'zgaradi, sayt esa joy qolmagan vagon turini umuman ko'rsatmaydi. Shuning uchun:
 *  • Haftalik TO'LIQ tekshiruv (yakshanba 05:00): barcha stansiya juftliklari × 6 sana.
 *  • Kunlik YENGIL tekshiruv (05:00): faqat poyezd bor yo'nalishlar, bitta uzoq sana,
 *    qarama-qarshi yo'nalish ma'lum bo'lsa faqat bir tomoni (~3–5 daqiqa).
 *  • Qarama-qarshi yo'nalish: A→B narxi B→A'ning yetishmayotgan turlarini to'ldiradi.
 *  • Bepul o'rganish: kuzatuv va foydalanuvchi qidiruvlaridagi narxlar ham yoziladi
 *    (qo'shimcha so'rovsiz — faol yo'nalishlar doim yangi).
 * So'rovlar past ustuvorlikda — kuzatuv tekshiruvlariga xalal bermaydi.
 */
import prisma, { isDatabaseReady } from '../database/connection.js';
import config from '../config/default.js';
import { searchTrains, onSearchResult } from '../core/railway.js';
import { listStations } from './stations.js';
import { todayISO, addDays } from '../utils/dates.js';

const KEY = 'routePrices';
const VERSION = 2; // ko'rinish: routes["from-to"] = { t: { tur: so'm }, n: { poyezd: { tur: so'm } } }
const RUN_HOUR = 5; // har kuni 05:00 (Toshkent) dan keyin
const FULL_WEEKDAY = 0; // yakshanba — to'liq tekshiruv
const FULL_OFFSETS = [40, 25, 50, 12, 32, 5]; // uzoq sanalarda joy ko'p — hamma turning narxi chiqadi
const LIGHT_OFFSETS = [40];
const SAVE_EVERY = 25;

let data = { version: 0, updatedAt: null, day: null, fullDay: null, routes: {} };
let running = false;
let dirty = false;

const tashkentNow = () => new Date(Date.now() + config.timezoneOffsetMin * 60_000);
const tashkentDay = () => tashkentNow().toISOString().slice(0, 10);
const trainKey = (number) => String(number || '').replace(/\s+/g, '');

/** Poyezdlar ro'yxatidan har bir vagon turi uchun eng arzon narx (target'ga qo'shiladi) */
export function mergeMinPrices(target, trains) {
  for (const train of trains || []) {
    for (const car of train.cars || []) {
      if (car.minPrice && (!target[car.type] || car.minPrice < target[car.type])) target[car.type] = car.minPrice;
    }
  }
  return target;
}

/** Yo'nalish bo'yicha eng arzon narxlar: { tur: so'm } (bo'lmasa — bo'sh) */
export function getRoutePrices(from, to) {
  const route = data.routes[`${from}-${to}`];
  return route?.t || (route && !route.n ? route : {}); // eski (v1) yassi ko'rinish ham o'qiladi
}

/** Aniq poyezd narxlari; topilmasa — yo'nalishning eng arzon narxlari */
export function getTrainPrices(from, to, number) {
  const own = data.routes[`${from}-${to}`]?.n?.[trainKey(number)];
  return own && Object.keys(own).length ? own : getRoutePrices(from, to);
}

export function getRoutePricesStatus() {
  return { updatedAt: data.updatedAt, fullDay: data.fullDay, routes: Object.keys(data.routes).length, running };
}

/** Yo'nalish yozuvini v2 ko'rinishda olish (eski yassi ko'rinish — t ga o'tadi) */
function routeOf(key) {
  const current = data.routes[key];
  if (current?.n) return current;
  const route = { t: { ...(current || {}) }, n: {} };
  data.routes[key] = route;
  return route;
}

/** Kelgan poyezdlar narxini yozish: poyezd narxi yangilanadi, yo'nalish narxi qayta hisoblanadi */
function applyTrains(from, to, trains) {
  const priced = (trains || []).filter((train) => trainKey(train.number) && (train.cars || []).some((car) => car.minPrice));
  if (!priced.length) return false;
  const route = routeOf(`${from}-${to}`);
  for (const train of priced) {
    route.n[trainKey(train.number)] = { ...route.n[trainKey(train.number)], ...mergeMinPrices({}, [train]) };
  }
  const fresh = {};
  for (const prices of Object.values(route.n)) {
    for (const [type, price] of Object.entries(prices)) if (!fresh[type] || price < fresh[type]) fresh[type] = price;
  }
  route.t = { ...route.t, ...fresh }; // poyezdlarda ko'rinmagan (masalan, aks yo'nalishdan olingan) turlar qoladi
  dirty = true;
  return true;
}

/** Qarama-qarshi yo'nalish: A→B narxlari B→A'ning yetishmayotgan turlarini to'ldiradi (va aksincha) */
function mirrorReverse() {
  for (const key of Object.keys(data.routes)) {
    const [a, b] = key.split('-');
    const source = getRoutePrices(a, b);
    if (!Object.keys(source).length) continue;
    const target = routeOf(`${b}-${a}`);
    for (const [type, price] of Object.entries(source)) if (!target.t[type]) target.t[type] = price;
  }
}

async function save() {
  if (!isDatabaseReady()) return;
  dirty = false;
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: data }, update: { value: data } });
}

/** Bitta yo'nalish uchun berilgan sanalarni tekshirish; narx topilsa true */
async function collectPair(from, to, offsets) {
  let found = false;
  let tried = 0;
  for (const offset of offsets) {
    tried += 1;
    let trains = [];
    try {
      ({ trains } = await searchTrains({ from, to, date: addDays(todayISO(), offset) }, { priority: 'low', maxAgeMs: 60 * 60_000 }));
    } catch { /* keyingi sana */ }
    if (applyTrains(from, to, trains)) found = true;
    if (tried >= 3 && !found) break; // 3 sanada ham narx yo'q — bu yo'nalishda poyezd yo'q
  }
  return found;
}

export async function refreshRoutePrices({ full = false } = {}) {
  if (running) return;
  running = true;
  const started = Date.now();
  let found = 0;
  try {
    let pairs;
    if (full) {
      const codes = listStations().map((station) => station.code);
      pairs = codes.flatMap((a) => codes.filter((b) => b !== a).map((b) => [a, b]));
    } else {
      // Faqat poyezd bor yo'nalishlar; aks yo'nalishi ham ma'lum bo'lsa — faqat bir tomoni
      pairs = Object.keys(data.routes)
        .map((key) => key.split('-'))
        .filter(([a, b]) => a < b || !data.routes[`${b}-${a}`]);
    }
    let done = 0;
    for (const [from, to] of pairs) {
      if (await collectPair(from, to, full ? FULL_OFFSETS : LIGHT_OFFSETS)) found += 1;
      if (++done % SAVE_EVERY === 0) await save().catch(() => {});
    }
    mirrorReverse();
    Object.assign(data, { updatedAt: new Date().toISOString(), day: tashkentDay(), version: VERSION });
    if (full) data.fullDay = tashkentDay();
    await save().catch(() => {});
    const minutes = Math.round((Date.now() - started) / 60_000);
    console.log(`✅ Narxlar ro'yxati yangilandi (${full ? 'to\'liq' : 'kunlik'}): ${found}/${pairs.length} yo'nalish, ${minutes} daq`);
  } catch (error) {
    console.error('[narxlar] Yangilab bo\'lmadi:', error.message);
  } finally {
    running = false;
  }
}

/** Server ishga tushganda: bazadan yuklash, bepul o'rganishni ulash va jadvalni boshlash */
export async function startRoutePrices() {
  try {
    const row = isDatabaseReady() ? await prisma.setting.findUnique({ where: { key: KEY } }) : null;
    if (row?.value?.routes) data = { ...data, ...row.value };
  } catch { /* bo'sh ro'yxat bilan */ }
  if (!data.fullDay && data.version === VERSION) data.fullDay = data.day; // v2 yig'ishi to'liq bo'lgan

  onSearchResult(({ from, to, trains }) => applyTrains(from, to, trains));

  const tick = () => {
    if (running) return;
    if (!data.updatedAt || data.version !== VERSION) {
      refreshRoutePrices({ full: true });
    } else if (data.day !== tashkentDay() && tashkentNow().getUTCHours() >= RUN_HOUR) {
      refreshRoutePrices({ full: tashkentNow().getUTCDay() === FULL_WEEKDAY });
    } else if (dirty) {
      save().catch(() => {}); // bepul o'rganilgan narxlar
    }
  };
  setTimeout(tick, 60_000).unref?.();
  setInterval(tick, 10 * 60_000).unref?.();
  console.log(`✅ Narxlar ro'yxati: ${Object.keys(data.routes).length} yo'nalish (har kuni ${RUN_HOUR}:00 — kunlik, yakshanba — to'liq)`);
}

export default { getRoutePrices, getTrainPrices, getRoutePricesStatus, refreshRoutePrices, startRoutePrices, mergeMinPrices };
