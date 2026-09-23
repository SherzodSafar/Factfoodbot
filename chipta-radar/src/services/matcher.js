/**
 * Kuzatuvni poyezdlar ro'yxati bilan solishtirish.
 *
 * ANY  (kuzatuv)  — kerakli turdagi vagonda kamida N ta bo'sh joy bo'lsa yetarli.
 *                   Faqat poyezdlar ro'yxati kerak (saytga 1 ta so'rov).
 * EXACT (aniq)    — aniq joy raqamlari tekshiriladi: to'rttalik/bokovoy,
 *                   pastki/yuqori, hammasi bitta bo'limda yoki tarqoq.
 *                   Yetarli joy bor poyezdlar uchungina vagonlar tafsiloti so'raladi.
 */
import { briefTrain } from './trains.js';
import { matchCars, normalizePrefs } from './seats.js';
import { localToEpoch } from '../utils/dates.js';

// Jo'nashiga shuncha vaqt qolgan poyezdlarga chipta sotib olish imkoni deyarli yo'q
const DEPARTURE_MARGIN_MS = 15 * 60 * 1000;

export function prefsOfWatch(watch) {
  const type = watch.mode === 'EXACT' && watch.carTypes?.length === 1 ? watch.carTypes[0] : undefined;
  return normalizePrefs(
    {
      section: watch.section,
      berth: watch.berth,
      together: watch.together,
      noToilet: watch.noToilet,
      quantity: watch.quantity,
    },
    type,
  );
}

/** Poyezd raqami, jo'nash vaqti oralig'i va jo'nab ketganlik bo'yicha saralash */
export function filterTrainsForWatch(trains, watch, now = Date.now()) {
  return trains.filter((train) => {
    if (watch.trainNumbers?.length && !watch.trainNumbers.includes(train.number)) return false;
    if (train.departure && localToEpoch(train.departure) < now + DEPARTURE_MARGIN_MS) return false;
    if (watch.timeFrom && train.depTime && train.depTime < watch.timeFrom) return false;
    if (watch.timeTo && train.depTime && train.depTime > watch.timeTo) return false;
    return true;
  });
}

const typeAllowed = (watch, type) => !watch.carTypes?.length || watch.carTypes.includes(type);
const priceAllowed = (watch, price) => !watch.maxPrice || !price || price <= watch.maxPrice;

const briefType = (car) => ({ type: car.type, label: car.label, free: car.free, minPrice: car.minPrice });

/** ANY kuzatuv: faqat ro'yxat bo'yicha */
export function evaluateAnyWatch(watch, trains, now = Date.now()) {
  const items = [];
  const keys = [];

  for (const train of filterTrainsForWatch(trains, watch, now)) {
    const types = train.cars.filter(
      (car) => typeAllowed(watch, car.type) && priceAllowed(watch, car.minPrice) && car.free >= watch.quantity,
    );
    if (!types.length) continue;
    items.push({ train: briefTrain(train), types: types.map(briefType) });
    keys.push(...types.map((car) => `${train.number}|${car.type}`));
  }

  return { items, keys };
}

/**
 * EXACT kuzatuv: aniq joylar bo'yicha.
 * @param loadDetail async (train) => ({ cars })
 */
export async function evaluateExactWatch(watch, trains, loadDetail, now = Date.now()) {
  const prefs = prefsOfWatch(watch);
  const items = [];
  const keys = [];
  const errors = [];

  for (const train of filterTrainsForWatch(trains, watch, now)) {
    const summaries = train.cars.filter((car) => typeAllowed(watch, car.type) && priceAllowed(watch, car.minPrice));
    const free = summaries.reduce((sum, car) => sum + car.free, 0);
    // Umumiy bo'sh joy yetmasa — vagonlar tafsilotini so'rashning hojati yo'q
    if (free < prefs.quantity) continue;

    let detail;
    try {
      detail = await loadDetail(train);
    } catch (error) {
      errors.push(`${train.number}: ${error.message}`);
      continue;
    }

    const cars = (detail?.cars || []).filter(
      (car) => typeAllowed(watch, car.type) && car.places.length && priceAllowed(watch, car.price),
    );
    const match = matchCars(cars, prefs);
    if (!match.ok) continue;

    items.push({
      train: briefTrain(train),
      types: summaries.filter((car) => car.free > 0).map(briefType),
      suggestions: match.suggestions,
      totalFitting: match.totalFitting,
    });
    keys.push(...match.suggestions.map((s) => `${train.number}|${s.parts.map((part) => part.car).join('+')}`));
  }

  return { items, keys: [...new Set(keys)], errors };
}

export async function evaluateWatch(watch, trains, loadDetail, now = Date.now()) {
  if (watch.mode === 'EXACT') return evaluateExactWatch(watch, trains, loadDetail, now);
  return { ...evaluateAnyWatch(watch, trains, now), errors: [] };
}

export default { evaluateWatch, evaluateAnyWatch, evaluateExactWatch, filterTrainsForWatch, prefsOfWatch };
