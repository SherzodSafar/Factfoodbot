/**
 * eticket.railway.uz javoblarini loyihaning yagona ko'rinishiga keltirish.
 *
 * Sayt javoblaridagi maydon nomlari vaqti-vaqti bilan o'zgarishi mumkin,
 * shuning uchun har bir qiymat bir nechta ehtimoliy nomdan izlanadi.
 * Kutilgan tuzilma umuman topilmasa — xatolik beriladi (aks holda
 * "poyezd yo'q" degan noto'g'ri javob chiqib qolardi).
 */
import { normalizeCarType, carTypeLabel, CAR_TYPE_ORDER } from './carTypes.js';
import { parseLocalDateTime, parseDurationMin, localToEpoch } from '../utils/dates.js';

export class UnexpectedShapeError extends Error {
  constructor(message, sample) {
    super(message);
    this.name = 'UnexpectedShapeError';
    this.sample = sample;
  }
}

const clean = (value) => (value === undefined || value === null ? '' : String(value).trim());

/** "270 000", "270000.00", 270000 → 270000 */
export function parsePrice(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object') {
    return parsePrice(value.tariff ?? value.price ?? value.cost ?? value.sum ?? value.amount);
  }
  const number = Number(String(value).replace(/[\s ]/g, '').replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function toInt(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (Array.isArray(value)) return value.length;
  const number = Number.parseInt(String(value).replace(/\s/g, ''), 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * Bo'sh joy raqamlarini o'qish.
 * Qo'llab-quvvatlanadi: [38, 44], ["038", "044"], [{number: 38}], "1,2,5-8".
 */
export function parsePlaces(value) {
  const out = new Set();

  const addToken = (token) => {
    const text = String(token).trim();
    const range = text.match(/^(\d{1,3})\D{0,3}-\s*(\d{1,3})/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (b >= a && b - a < 120) for (let n = a; n <= b; n += 1) out.add(n);
      return;
    }
    const single = text.match(/^(\d{1,3})/);
    if (single) out.add(Number(single[1]));
  };

  const walk = (item) => {
    if (item === undefined || item === null) return;
    if (typeof item === 'number') {
      if (Number.isInteger(item) && item > 0) out.add(item);
    } else if (typeof item === 'string') {
      item.split(/[,;\s]+/).filter(Boolean).forEach(addToken);
    } else if (Array.isArray(item)) {
      item.forEach(walk);
    } else if (typeof item === 'object') {
      walk(item.number ?? item.seatNumber ?? item.place ?? item.placeNumber ?? item.seat);
    }
  };

  walk(value);
  return [...out].filter((n) => n > 0 && n < 1000).sort((a, b) => a - b);
}

const typeRank = (type) => {
  const index = CAR_TYPE_ORDER.indexOf(type);
  return index === -1 ? 99 : index;
};

/* ------------------------------------------------------------------ */
/*  Poyezdlar ro'yxati                                                 */
/* ------------------------------------------------------------------ */

function extractTrainArray(json) {
  const candidates = [
    json?.data?.directions?.forward?.trains,
    json?.directions?.forward?.trains,
    json?.data?.directions?.forward?.trainList,
    json?.data?.trains,
    json?.trains,
  ];
  for (const list of candidates) {
    if (Array.isArray(list)) return list;
  }
  // "trains" kaliti umuman yo'q, lekin yo'nalish bor — demak shu sanada poyezd yo'q
  const forward = json?.data?.directions?.forward ?? json?.directions?.forward;
  if (forward && typeof forward === 'object') return [];
  return null;
}

function normalizeTariffs(car) {
  const raw = car.tariffs ?? car.tariffList ?? car.prices ?? (car.tariff !== undefined ? [car.tariff] : []);
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((item) => ({
      price: parsePrice(item),
      cls: clean(item?.classService ?? item?.class ?? item?.serviceClass ?? item?.classServiceType ?? ''),
      free: toInt(item?.freeSeats ?? item?.free ?? 0),
    }))
    .filter((item) => item.price);
}

function normalizeTrain(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const number = clean(raw.number ?? raw.trainNumber ?? raw.train_number);
  if (!number) return null;

  const departure = parseLocalDateTime(raw.departureDate ?? raw.departure ?? raw.depDateTime ?? raw.depDate);
  const arrival = parseLocalDateTime(raw.arrivalDate ?? raw.arrival ?? raw.arvDateTime ?? raw.arvDate);

  let durationMin = parseDurationMin(raw.timeOnWay ?? raw.travelTime ?? raw.duration);
  if (!durationMin && departure && arrival) {
    durationMin = Math.round((localToEpoch(arrival) - localToEpoch(departure)) / 60_000) || null;
  }

  const sub = raw.subRoute ?? raw.route ?? {};
  const carsRaw = raw.cars ?? raw.places?.cars ?? raw.carTypes ?? [];
  const byType = new Map();

  for (const car of Array.isArray(carsRaw) ? carsRaw : []) {
    const rawType = clean(car?.type ?? car?.typeShow ?? car?.carType ?? car?.name);
    const type = normalizeCarType(rawType) || 'other';
    const tariffs = normalizeTariffs(car ?? {});
    const free = toInt(car?.freeSeats ?? car?.free ?? car?.freePlaces ?? car?.seats);

    const entry = byType.get(type) || {
      type,
      label: carTypeLabel(type, rawType),
      rawLabel: rawType,
      free: 0,
      tariffs: [],
    };
    entry.free += free;
    entry.tariffs.push(...tariffs);
    byType.set(type, entry);
  }

  const cars = [...byType.values()]
    .map((entry) => {
      const prices = entry.tariffs.map((item) => item.price).filter(Boolean);
      return {
        type: entry.type,
        label: entry.label,
        rawLabel: entry.rawLabel,
        free: entry.free,
        minPrice: prices.length ? Math.min(...prices) : null,
        maxPrice: prices.length ? Math.max(...prices) : null,
        classes: [...new Set(entry.tariffs.map((item) => item.cls).filter(Boolean))],
      };
    })
    .sort((a, b) => typeRank(a.type) - typeRank(b.type));

  const withSeats = cars.filter((car) => car.free > 0);
  const prices = withSeats.map((car) => car.minPrice).filter(Boolean);
  const brand = clean(raw.brand);
  const kind = clean(raw.type ?? raw.category ?? raw.trainType);

  return {
    number,
    id: raw.trainId ?? raw.id ?? null,
    brand,
    kind,
    title: brand || kind || 'Poyezd',
    fromStation: clean(sub.depStationName ?? raw.depStationName ?? raw.stationFrom),
    toStation: clean(sub.arvStationName ?? raw.arvStationName ?? raw.stationTo),
    departure,
    arrival,
    depDate: departure ? departure.slice(0, 10) : null,
    depTime: departure ? departure.slice(11, 16) : null,
    arrDate: arrival ? arrival.slice(0, 10) : null,
    arrTime: arrival ? arrival.slice(11, 16) : null,
    durationMin: durationMin || null,
    cars,
    totalFree: cars.reduce((sum, car) => sum + car.free, 0),
    minPrice: prices.length ? Math.min(...prices) : null,
  };
}

/** Poyezdlar ro'yxati javobini normallashtirish */
export function normalizeTrainList(json) {
  const list = extractTrainArray(json);
  if (list === null) {
    throw new UnexpectedShapeError(
      'Sayt javobi kutilgan ko\'rinishda emas (poyezdlar ro\'yxati topilmadi)',
      JSON.stringify(json)?.slice(0, 600),
    );
  }
  return list
    .map(normalizeTrain)
    .filter(Boolean)
    .sort((a, b) => String(a.departure).localeCompare(String(b.departure)));
}

/* ------------------------------------------------------------------ */
/*  Bitta poyezd vagonlari va bo'sh joylari                            */
/* ------------------------------------------------------------------ */

export function normalizeTrainDetail(json) {
  const train = json?.data?.train ?? json?.train ?? json?.data;
  const groups = train?.carGroup ?? train?.carGroups ?? train?.cars;
  if (!Array.isArray(groups)) {
    throw new UnexpectedShapeError(
      'Sayt javobi kutilgan ko\'rinishda emas (vagonlar ro\'yxati topilmadi)',
      JSON.stringify(json)?.slice(0, 600),
    );
  }

  const cars = [];
  for (const group of groups) {
    const rawType = clean(group?.type ?? group?.typeShow);
    const type = normalizeCarType(group?.type) || normalizeCarType(group?.typeShow) || 'other';
    const label = carTypeLabel(type, clean(group?.typeShow) || rawType);
    const cls = clean(group?.services?.type ?? group?.classService ?? group?.serviceClass);
    const groupPrice = parsePrice(group?.tariff ?? group?.price ?? group?.tariffs?.[0]);

    // Ba'zi javoblarda guruh o'rniga to'g'ridan-to'g'ri vagon keladi
    const list = Array.isArray(group?.cars) ? group.cars : [group];

    for (const car of list) {
      const places = parsePlaces(car?.places ?? car?.seats ?? car?.freePlaces ?? car?.placeList);
      const number = clean(car?.number ?? car?.carNumber ?? car?.num);
      if (!number && !places.length) continue;
      cars.push({
        number: number || '?',
        type,
        label,
        cls: clean(car?.classService ?? car?.services?.type) || cls,
        places,
        free: places.length || toInt(car?.freeSeats),
        price: parsePrice(car?.tariff ?? car?.price) ?? groupPrice,
      });
    }
  }

  return cars.sort((a, b) => {
    const byType = typeRank(a.type) - typeRank(b.type);
    if (byType) return byType;
    return (Number.parseInt(a.number, 10) || 0) - (Number.parseInt(b.number, 10) || 0);
  });
}

/** Mijozga yuboriladigan qisqa ko'rinish */
export function briefTrain(train) {
  return {
    number: train.number,
    id: train.id,
    title: train.title,
    brand: train.brand,
    departure: train.departure,
    arrival: train.arrival,
    depTime: train.depTime,
    arrTime: train.arrTime,
    arrDate: train.arrDate,
    durationMin: train.durationMin,
  };
}

export default { normalizeTrainList, normalizeTrainDetail, parsePlaces, parsePrice, briefTrain, UnexpectedShapeError };
