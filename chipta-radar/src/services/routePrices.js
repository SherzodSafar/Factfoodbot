/**
 * Yo'nalishlar narxlari ro'yxati.
 *
 * Har kuni ertalab (Toshkent vaqti bilan RUN_HOUR da) barcha stansiya juftliklari bo'yicha
 * har bir vagon turining eng arzon narxi yig'iladi va bazada saqlanadi (Setting: "routePrices").
 * Kuzatuv qo'shishda narx shu ro'yxatdan DARHOL olinadi — saytni kutish shart emas.
 * Joy qolmagan sanada sayt narx bermaydi, shuning uchun bir necha sana sinaladi.
 * So'rovlar past ustuvorlikda — kuzatuv tekshiruvlariga xalal bermaydi.
 */
import prisma, { isDatabaseReady } from '../database/connection.js';
import config from '../config/default.js';
import { searchTrains } from '../core/railway.js';
import { listStations } from './stations.js';
import { todayISO, addDays } from '../utils/dates.js';

const KEY = 'routePrices';
const VERSION = 2; // 2: poyezd bo'yicha narxlar + barcha sanalar (o'zgarsa — darhol qayta yig'iladi)
const RUN_HOUR = 5; // har kuni 05:00 (Toshkent) dan keyin yangilanadi
// Sayt joy qolmagan vagon turini umuman ko'rsatmaydi — shuning uchun HAMMA sanalar tekshiriladi.
// Uzoq sanalarda joy ko'p bo'ladi (hamma turning narxi chiqadi).
const OFFSETS = [40, 25, 50, 12, 32, 5];
const SAVE_EVERY = 25; // har 25 yo'nalishda bazaga saqlash (qayta ishga tushsa ham yo'qolmaydi)

// routes["from-to"] = { t: { tur: so'm }, n: { poyezdRaqami: { tur: so'm } } }
let data = { version: 0, updatedAt: null, day: null, routes: {} };
let running = false;

const tashkentNow = () => new Date(Date.now() + config.timezoneOffsetMin * 60_000);
const tashkentDay = () => tashkentNow().toISOString().slice(0, 10);

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
  const route = data.routes[`${from}-${to}`];
  const own = route?.n?.[String(number || '').replace(/\s+/g, '')];
  return own && Object.keys(own).length ? own : getRoutePrices(from, to);
}

export function getRoutePricesStatus() {
  return { updatedAt: data.updatedAt, routes: Object.keys(data.routes).length, running };
}

async function save() {
  if (!isDatabaseReady()) return;
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: data }, update: { value: data } });
}

/** Bitta yo'nalish: barcha sanalardan yo'nalish va har bir poyezd bo'yicha eng arzon narxlar */
async function collectPair(from, to) {
  const t = {};
  const n = {};
  let tried = 0;
  for (const offset of OFFSETS) {
    tried += 1;
    let trains = [];
    try {
      ({ trains } = await searchTrains({ from, to, date: addDays(todayISO(), offset) }, { priority: 'low', maxAgeMs: 60 * 60_000 }));
    } catch { /* keyingi sana */ }
    mergeMinPrices(t, trains);
    for (const train of trains || []) {
      const number = String(train.number || '').replace(/\s+/g, '');
      if (number) n[number] = mergeMinPrices(n[number] || {}, [train]);
    }
    if (tried >= 3 && !Object.keys(t).length) break; // 3 sanada ham narx yo'q — bu yo'nalishda poyezd yo'q
  }
  for (const number of Object.keys(n)) if (!Object.keys(n[number]).length) delete n[number];
  return { t, n };
}

export async function refreshRoutePrices() {
  if (running) return;
  running = true;
  const started = Date.now();
  let found = 0;
  try {
    const codes = listStations().map((station) => station.code);
    let done = 0;
    for (const from of codes) {
      for (const to of codes) {
        if (from === to) continue;
        const prices = await collectPair(from, to);
        if (Object.keys(prices.t).length) {
          data.routes[`${from}-${to}`] = prices; // eski narx o'rniga yangisi; topilmasa eskisi qoladi
          found += 1;
        }
        if (++done % SAVE_EVERY === 0) await save().catch(() => {});
      }
    }
    data.updatedAt = new Date().toISOString();
    data.day = tashkentDay();
    data.version = VERSION;
    await save().catch(() => {});
    console.log(`✅ Narxlar ro'yxati yangilandi: ${found} yo'nalish, ${Math.round((Date.now() - started) / 60_000)} daq`);
  } catch (error) {
    console.error('[narxlar] Yangilab bo\'lmadi:', error.message);
  } finally {
    running = false;
  }
}

/** Server ishga tushganda: bazadan yuklash va kunlik jadvalni boshlash */
export async function startRoutePrices() {
  try {
    const row = isDatabaseReady() ? await prisma.setting.findUnique({ where: { key: KEY } }) : null;
    if (row?.value?.routes) data = { ...data, ...row.value };
  } catch { /* bo'sh ro'yxat bilan */ }

  const tick = () => {
    const due = data.day !== tashkentDay() && tashkentNow().getUTCHours() >= RUN_HOUR;
    // Ro'yxat yo'q yoki eski versiya — darhol (eski narxlar yig'ish tugaguncha ishlatilaveradi)
    if ((due || !data.updatedAt || data.version !== VERSION) && !running) refreshRoutePrices();
  };
  setTimeout(tick, 60_000).unref?.(); // ishga tushgach 1 daqiqadan keyin (ro'yxat yo'q bo'lsa darhol yig'iladi)
  setInterval(tick, 10 * 60_000).unref?.();
  console.log(`✅ Narxlar ro'yxati: ${Object.keys(data.routes).length} yo'nalish (har kuni ${RUN_HOUR}:00 da yangilanadi)`);
}

export default { getRoutePrices, getTrainPrices, getRoutePricesStatus, refreshRoutePrices, startRoutePrices, mergeMinPrices };
