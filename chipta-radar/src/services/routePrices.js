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
const RUN_HOUR = 5; // har kuni 05:00 (Toshkent) dan keyin yangilanadi
const OFFSETS = [20, 10, 35, 5]; // kunlar: narx topilmasa keyingisi sinaladi
const SAVE_EVERY = 25; // har 25 yo'nalishda bazaga saqlash (qayta ishga tushsa ham yo'qolmaydi)

let data = { updatedAt: null, day: null, routes: {} };
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

/** Saqlangan narxlar: { tur: so'm } (bo'lmasa — bo'sh) */
export function getRoutePrices(from, to) {
  return data.routes[`${from}-${to}`] || {};
}

export function getRoutePricesStatus() {
  return { updatedAt: data.updatedAt, routes: Object.keys(data.routes).length, running };
}

async function save() {
  if (!isDatabaseReady()) return;
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: data }, update: { value: data } });
}

/** Bitta yo'nalish: hamma ko'ringan vagon turlarining narxi topilguncha bir necha sana sinaladi */
async function collectPair(from, to) {
  const prices = {};
  let empty = 0;
  for (const offset of OFFSETS) {
    let trains;
    try {
      ({ trains } = await searchTrains({ from, to, date: addDays(todayISO(), offset) }, { priority: 'low', maxAgeMs: 60 * 60_000 }));
    } catch {
      continue;
    }
    if (!trains?.length) {
      if (++empty >= 2) break; // bu yo'nalishda poyezd yo'q
      continue;
    }
    mergeMinPrices(prices, trains);
    const seen = new Set(trains.flatMap((train) => (train.cars || []).map((car) => car.type)));
    if ([...seen].every((type) => prices[type])) break; // hamma turning narxi bor
  }
  return prices;
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
        if (Object.keys(prices).length) {
          data.routes[`${from}-${to}`] = prices; // eski narx o'rniga yangisi; topilmasa eskisi qoladi
          found += 1;
        }
        if (++done % SAVE_EVERY === 0) await save().catch(() => {});
      }
    }
    data.updatedAt = new Date().toISOString();
    data.day = tashkentDay();
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
    if ((due || !data.updatedAt) && !running) refreshRoutePrices();
  };
  setTimeout(tick, 60_000).unref?.(); // ishga tushgach 1 daqiqadan keyin (ro'yxat yo'q bo'lsa darhol yig'iladi)
  setInterval(tick, 10 * 60_000).unref?.();
  console.log(`✅ Narxlar ro'yxati: ${Object.keys(data.routes).length} yo'nalish (har kuni ${RUN_HOUR}:00 da yangilanadi)`);
}

export default { getRoutePrices, getRoutePricesStatus, refreshRoutePrices, startRoutePrices, mergeMinPrices };
