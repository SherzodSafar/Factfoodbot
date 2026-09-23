/**
 * Vagon ichidagi joylar sxemasi va joy tanlash mantig'i.
 *
 * Plaskartli vagon (54 o'rin):
 *   1–36  — to'rttalik bo'limlar (9 ta bo'lim × 4 o'rin), toq = pastki, juft = yuqori
 *   37–54 — bokovoy (yon) o'rinlar, toq = pastki, juft = yuqori;
 *           53/54 — 1-bo'lim qarshisida, 37/38 — 9-bo'lim qarshisida
 * Kupe vagon (36 o'rin): 9 ta kupe × 4 o'rin, toq = pastki, juft = yuqori
 * SV / Lyuks (18 o'rin): 9 ta kupe × 2 o'rin, hammasi pastki
 * O'rindiqli vagonlarda pastki/yuqori tushunchasi yo'q.
 */

export const LAYOUTS = {
  platskart: { bays: 9, perBay: 4, side: true, capacity: 54 },
  kupe: { bays: 9, perBay: 4, side: false, capacity: 36 },
  sv: { bays: 9, perBay: 2, side: false, capacity: 18 },
  lux: { bays: 9, perBay: 2, side: false, capacity: 18 },
};

export const SECTIONS = ['any', 'compartment', 'side'];
export const BERTHS = ['any', 'lower', 'upper'];
export const TOGETHER = ['any', 'car', 'compartment'];

/** Shu turdagi vagon uchun sxema (raqamlar sxemaga sig'masa — null) */
export function layoutFor(type, places = []) {
  const layout = LAYOUTS[type];
  if (!layout) return null;
  const max = places.length ? Math.max(...places) : 0;
  return max > layout.capacity ? null : layout;
}

/** Bitta joy haqida: qaysi bo'lim, to'rttalikmi yoki bokovoy, pastki yoki yuqori */
export function describeSeat(type, number) {
  const layout = LAYOUTS[type];
  if (!layout || !Number.isInteger(number) || number < 1 || number > layout.capacity) {
    return { number, bay: null, section: 'seat', berth: null };
  }
  if (layout.perBay === 2) {
    return { number, bay: Math.ceil(number / 2), section: 'compartment', berth: 'lower' };
  }
  if (number <= layout.bays * 4) {
    return {
      number,
      bay: Math.ceil(number / 4),
      section: 'compartment',
      berth: number % 2 === 1 ? 'lower' : 'upper',
    };
  }
  return {
    number,
    bay: Math.floor((layout.capacity - number) / 2) + 1,
    section: 'side',
    berth: number % 2 === 1 ? 'lower' : 'upper',
  };
}

/** Vagondagi bo'sh joylar statistikasi */
export function summarizeCar(type, places) {
  const summary = { total: places.length, lower: 0, upper: 0, sideLower: 0, sideUpper: 0 };
  if (!layoutFor(type, places)) return summary;
  for (const number of places) {
    const seat = describeSeat(type, number);
    if (seat.section === 'side') {
      if (seat.berth === 'lower') summary.sideLower += 1;
      else summary.sideUpper += 1;
    } else if (seat.berth === 'lower') {
      summary.lower += 1;
    } else if (seat.berth === 'upper') {
      summary.upper += 1;
    }
  }
  return summary;
}

/**
 * Mini App'dagi vagon xaritasi uchun bo'limlar ro'yxati.
 * main: [pastki, yuqori, pastki, yuqori], side: [pastki, yuqori]
 */
export function buildSeatMap(type, places) {
  const layout = layoutFor(type, places);
  if (!layout) return null;

  const bays = [];
  for (let bay = 1; bay <= layout.bays; bay += 1) {
    const main = layout.perBay === 2
      ? [bay * 2 - 1, bay * 2]
      : [bay * 4 - 3, bay * 4 - 2, bay * 4 - 1, bay * 4];
    const side = layout.side ? [layout.capacity - bay * 2 + 1, layout.capacity - bay * 2 + 2] : [];
    bays.push({ bay, main, side });
  }

  return { perBay: layout.perBay, side: layout.side, allLower: layout.perBay === 2, bays };
}

/** Kelgan sozlamalarni tekshirib, xavfsiz ko'rinishga keltirish */
export function normalizePrefs(input = {}, type) {
  const prefs = {
    section: SECTIONS.includes(input.section) ? input.section : 'any',
    berth: BERTHS.includes(input.berth) ? input.berth : 'any',
    together: TOGETHER.includes(input.together) ? input.together : 'any',
    noToilet: Boolean(input.noToilet),
    quantity: Math.min(10, Math.max(1, Math.round(Number(input.quantity) || 1))),
  };

  if (type) {
    const layout = LAYOUTS[type];
    if (!layout) {
      // O'rindiqli vagonlarda bo'lim va o'rin qavati yo'q
      prefs.section = 'any';
      prefs.berth = 'any';
      prefs.noToilet = false;
    } else {
      // Kupe/SV'da bokovoy yo'q — hamma joy to'rttalik (kupe) ichida
      if (!layout.side) prefs.section = 'any';
      // SV/Lyuks'da hamma o'rin pastki
      if (layout.perBay === 2) prefs.berth = 'any';
    }
  }
  return prefs;
}

/** Joy tanlangan talablarga mos keladimi */
export function seatFits(type, number, prefs) {
  const layout = LAYOUTS[type];
  if (!layout) return true;

  const seat = describeSeat(type, number);
  if (seat.bay === null) return prefs.section === 'any' && prefs.berth === 'any' && !prefs.noToilet;
  if (prefs.noToilet && (seat.bay === 1 || seat.bay === layout.bays)) return false;
  if (prefs.section === 'compartment' && seat.section === 'side') return false;
  if (prefs.section === 'side' && seat.section !== 'side') return false;
  if (prefs.berth !== 'any' && seat.berth !== prefs.berth) return false;
  return true;
}

/** Bitta bo'limda talablarga mos keladigan eng ko'p o'rinlar soni */
export function bayCapacity(type, prefs) {
  const layout = LAYOUTS[type];
  if (!layout) return 0;

  if (layout.perBay === 2) return prefs.berth === 'upper' ? 0 : 2;

  let main = 4;
  let side = layout.side ? 2 : 0;
  if (prefs.section === 'compartment') side = 0;
  if (prefs.section === 'side') main = 0;
  if (prefs.berth !== 'any') {
    main /= 2;
    side /= 2;
  }
  return main + side;
}

/** Afzal joylar: avval pastki, keyin to'rttalik, keyin raqam bo'yicha */
function pickBest(type, seats, count) {
  const score = (number) => {
    const seat = describeSeat(type, number);
    return (seat.section === 'side' ? 2 : 0) + (seat.berth === 'upper' ? 1 : 0);
  };
  return [...seats]
    .sort((a, b) => score(a) - score(b) || a - b)
    .slice(0, count)
    .sort((a, b) => a - b);
}

function baysOf(type, seats) {
  return [...new Set(seats.map((number) => describeSeat(type, number).bay).filter(Boolean))].sort((a, b) => a - b);
}

/**
 * Bitta vagonda talablarga mos guruhlarni topish.
 * together = 'compartment' → bitta bo'lim (kerak bo'lsa yonma-yon bo'limlar)
 * together = 'car' | 'any' → vagondagi istalgan mos joylar
 */
export function findSeatGroups(car, prefs, limit = 3) {
  const fitting = car.places.filter((number) => seatFits(car.type, number, prefs)).sort((a, b) => a - b);
  const quantity = prefs.quantity;
  if (fitting.length < quantity) return { fitting, groups: [] };

  if (prefs.together !== 'compartment') {
    const seats = pickBest(car.type, fitting, quantity);
    return { fitting, groups: [{ seats, bays: baysOf(car.type, seats) }] };
  }

  const layout = LAYOUTS[car.type];
  const groups = [];

  if (!layout) {
    // O'rindiqli: ketma-ket raqamli joylar (yonma-yon o'tirish uchun)
    for (let i = 0; i + quantity <= fitting.length && groups.length < limit; i += 1) {
      const slice = fitting.slice(i, i + quantity);
      if (slice[slice.length - 1] - slice[0] === quantity - 1) {
        groups.push({ seats: slice, bays: [] });
        i += quantity - 1;
      }
    }
    return { fitting, groups };
  }

  const capacity = bayCapacity(car.type, prefs);
  if (!capacity) return { fitting, groups: [] };

  const byBay = new Map();
  for (const number of fitting) {
    const { bay } = describeSeat(car.type, number);
    if (!bay) continue;
    if (!byBay.has(bay)) byBay.set(bay, []);
    byBay.get(bay).push(number);
  }

  const maxSpan = Math.ceil(quantity / capacity);
  for (let span = 1; span <= maxSpan && !groups.length; span += 1) {
    for (let start = 1; start + span - 1 <= layout.bays && groups.length < limit; start += 1) {
      const seats = [];
      for (let bay = start; bay < start + span; bay += 1) seats.push(...(byBay.get(bay) || []));
      if (seats.length >= quantity) {
        const chosen = pickBest(car.type, seats, quantity);
        groups.push({ seats: chosen, bays: baysOf(car.type, chosen) });
        start += span - 1;
      }
    }
  }

  return { fitting, groups };
}

/**
 * Bir nechta vagon bo'yicha moslik.
 * @returns {{ok:boolean, totalFitting:number, suggestions:Array, fittingByCar:Array}}
 *   suggestions: [{ parts: [{ car: '07', seats: [9, 11], bays: [3] }] }]
 */
export function matchCars(cars, prefs, { limit = 3 } = {}) {
  const perCar = cars.map((car) => ({ car, ...findSeatGroups(car, prefs, limit) }));
  const totalFitting = perCar.reduce((sum, item) => sum + item.fitting.length, 0);
  const fittingByCar = perCar
    .filter((item) => item.fitting.length)
    .map((item) => ({ car: item.car.number, type: item.car.type, seats: item.fitting }));

  let suggestions = [];

  if (prefs.together === 'any') {
    if (totalFitting >= prefs.quantity) {
      const single = perCar.find((item) => item.groups.length);
      if (single) {
        suggestions = [{ parts: [{ car: single.car.number, type: single.car.type, ...single.groups[0] }] }];
      } else {
        // Bitta vagonda yetmaydi — bir nechta vagondan yig'amiz
        let remaining = prefs.quantity;
        const parts = [];
        const sorted = [...perCar].sort((a, b) => b.fitting.length - a.fitting.length);
        for (const item of sorted) {
          if (!remaining) break;
          if (!item.fitting.length) continue;
          const seats = pickBest(item.car.type, item.fitting, Math.min(remaining, item.fitting.length));
          parts.push({ car: item.car.number, type: item.car.type, seats, bays: baysOf(item.car.type, seats) });
          remaining -= seats.length;
        }
        suggestions = [{ parts }];
      }
    }
  } else {
    suggestions = perCar
      .flatMap((item) => item.groups.map((group) => ({ parts: [{ car: item.car.number, type: item.car.type, ...group }] })))
      .slice(0, limit);
  }

  return { ok: suggestions.length > 0, totalFitting, suggestions, fittingByCar };
}

export default {
  LAYOUTS, layoutFor, describeSeat, summarizeCar, buildSeatMap,
  normalizePrefs, seatFits, bayCapacity, findSeatGroups, matchCars,
};
