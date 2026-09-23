/**
 * Mini App (foydalanuvchilar) uchun API logikasi:
 * stansiyalar, poyezdlar qidiruvi, vagonlar/joylar xaritasi va kuzatuvlar.
 */
import config from '../config/default.js';
import WatchModel from '../models/Watch.js';
import UserModel from '../models/User.js';
import NotificationModel from '../models/Notification.js';
import SearchLogModel from '../models/SearchLog.js';
import { searchTrains, getTrainDetail } from '../core/railway.js';
import { listStations, findStation } from '../services/stations.js';
import { POPULAR_ROUTES } from '../services/stationData.js';
import { CAR_TYPES, CAR_TYPE_ORDER } from '../services/carTypes.js';
import { summarizeCar, buildSeatMap, matchCars, normalizePrefs, seatFits } from '../services/seats.js';
import { getSettings } from '../services/settings.js';
import { createWatches, ValidationError } from '../services/watchService.js';
import { checkWatchNow } from '../services/watcher.js';
import { todayISO, addDays, isISODate } from '../utils/dates.js';

/* ------------------------------------------------------------------ */
/*  Yordamchilar                                                       */
/* ------------------------------------------------------------------ */

function badRequest(res, message) {
  return res.status(400).json({ ok: false, error: message });
}

/** Qidiruv parametrlarini tekshirish */
function parseRouteQuery(query) {
  const from = findStation(query.from);
  const to = findStation(query.to);
  if (!from || !to) return { error: 'Stansiyalarni tanlang' };
  if (from.code === to.code) return { error: 'Jo\'nash va borish stansiyasi bir xil' };

  const date = String(query.date || '');
  if (!isISODate(date)) return { error: 'Sana noto\'g\'ri' };
  const today = todayISO();
  if (date < today) return { error: 'Bu sana o\'tib ketgan' };
  if (date > addDays(today, getSettings().maxDaysAhead)) {
    return { error: `Chiptalar ko'pi bilan ${getSettings().maxDaysAhead} kun oldin sotiladi` };
  }
  return { from, to, date };
}

/** Sayt xatoligini foydalanuvchiga tushunarli javobga aylantirish */
function railwayErrorResponse(res, error) {
  const status = error.code === 'COOLDOWN' || error.code === 'RATE_LIMITED' ? 429 : 502;
  return res.status(status).json({ ok: false, error: error.message, code: error.code || 'RAILWAY_ERROR' });
}

function publicWatch(watch) {
  return {
    id: watch.id,
    mode: watch.mode,
    fromCode: watch.fromCode,
    toCode: watch.toCode,
    fromName: watch.fromName,
    toName: watch.toName,
    date: watch.date,
    carTypes: watch.carTypes,
    trainNumbers: watch.trainNumbers,
    quantity: watch.quantity,
    timeFrom: watch.timeFrom,
    timeTo: watch.timeTo,
    maxPrice: watch.maxPrice,
    section: watch.section,
    berth: watch.berth,
    together: watch.together,
    noToilet: watch.noToilet,
    status: watch.status,
    lastCheckedAt: watch.lastCheckedAt,
    lastFoundAt: watch.lastFoundAt,
    lastNotifiedAt: watch.lastNotifiedAt,
    lastResult: watch.lastResult,
    lastError: watch.lastError,
    checksCount: watch.checksCount,
    notifyCount: watch.notifyCount,
    createdAt: watch.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/*  Boshlang'ich ma'lumotlar                                           */
/* ------------------------------------------------------------------ */

export async function bootstrap(req, res, next) {
  try {
    const settings = getSettings();
    const [watchesCount, recent] = await Promise.all([
      WatchModel.countActiveByUser(req.user.id),
      SearchLogModel.recentForUser(req.user.id),
    ]);

    res.json({
      ok: true,
      appName: config.appName,
      user: {
        id: req.user.id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        username: req.user.username,
        quietNight: req.user.quietNight,
        createdAt: req.user.createdAt,
      },
      isDev: Boolean(req.isDev),
      today: todayISO(),
      maxDaysAhead: settings.maxDaysAhead,
      maxWatches: settings.maxWatchesPerUser,
      watchesCount,
      stations: listStations(),
      popularRoutes: POPULAR_ROUTES.filter(([from, to]) => findStation(from) && findStation(to)).map(([from, to]) => ({ from, to })),
      recent: recent.filter((item) => findStation(item.fromCode) && findStation(item.toCode)),
      carTypes: CAR_TYPE_ORDER.map((type) => ({ type, ...CAR_TYPES[type] })),
      buyUrl: config.railway.buyUrl,
    });
  } catch (error) {
    next(error);
  }
}

export function stations(req, res) {
  res.json({ ok: true, stations: listStations() });
}

/* ------------------------------------------------------------------ */
/*  1-usul: hozir bor joylar                                           */
/* ------------------------------------------------------------------ */

export async function search(req, res, next) {
  const parsed = parseRouteQuery(req.query);
  if (parsed.error) return badRequest(res, parsed.error);
  const { from, to, date } = parsed;

  try {
    const result = await searchTrains({ from: from.code, to: to.code, date });
    SearchLogModel.record({
      userId: req.user.id,
      fromCode: from.code,
      toCode: to.code,
      date,
      source: 'app',
      trains: result.trains.length,
      withSeats: result.trains.filter((train) => train.totalFree > 0).length,
    });

    return res.json({
      ok: true,
      from: { code: from.code, name: from.nameUz },
      to: { code: to.code, name: to.nameUz },
      date,
      trains: result.trains,
      fetchedAt: result.fetchedAt,
      cached: result.cached,
    });
  } catch (error) {
    SearchLogModel.record({ userId: req.user.id, fromCode: from.code, toCode: to.code, date, source: 'app', ok: false });
    if (error.name === 'RailwayError') return railwayErrorResponse(res, error);
    return next(error);
  }
}

/** Bitta poyezd: vagonlar, bo'sh joy raqamlari, xarita va (ixtiyoriy) moslik */
export async function train(req, res, next) {
  const parsed = parseRouteQuery(req.query);
  if (parsed.error) return badRequest(res, parsed.error);
  const trainNumber = String(req.query.number || '').trim().slice(0, 12);
  if (!trainNumber) return badRequest(res, 'Poyezd raqami ko\'rsatilmagan');

  const { from, to, date } = parsed;
  try {
    const detail = await getTrainDetail({
      from: from.code,
      to: to.code,
      date,
      trainNumber,
      trainId: req.query.id || null,
    });

    const cars = detail.cars.map((car) => ({
      ...car,
      summary: summarizeCar(car.type, car.places),
      map: buildSeatMap(car.type, car.places),
    }));

    const types = [];
    for (const car of cars) {
      let entry = types.find((item) => item.type === car.type);
      if (!entry) {
        entry = { type: car.type, label: car.label, free: 0, cars: 0, minPrice: null };
        types.push(entry);
      }
      entry.free += car.free;
      entry.cars += 1;
      if (car.price && (!entry.minPrice || car.price < entry.minPrice)) entry.minPrice = car.price;
    }

    // Aniq joy talablari berilgan bo'lsa — mos joylarni belgilaymiz
    let match = null;
    const matchType = String(req.query.type || '');
    if (matchType && CAR_TYPES[matchType]) {
      const prefs = normalizePrefs(
        {
          section: req.query.section,
          berth: req.query.berth,
          together: req.query.together,
          quantity: req.query.quantity,
          noToilet: ['1', 'true', 'yes'].includes(String(req.query.noToilet)),
        },
        matchType,
      );
      const sameType = cars.filter((car) => car.type === matchType);
      const result = matchCars(sameType, prefs);
      match = {
        prefs,
        ok: result.ok,
        suggestions: result.suggestions,
        fitting: Object.fromEntries(
          sameType.map((car) => [car.number, car.places.filter((number) => seatFits(car.type, number, prefs))]),
        ),
      };
    }

    return res.json({ ok: true, trainNumber, cars, types, match, fetchedAt: detail.fetchedAt, cached: detail.cached });
  } catch (error) {
    if (error.name === 'RailwayError') return railwayErrorResponse(res, error);
    return next(error);
  }
}

/* ------------------------------------------------------------------ */
/*  2- va 3-usul: kuzatuvlar                                           */
/* ------------------------------------------------------------------ */

export async function listWatches(req, res, next) {
  try {
    const watches = await WatchModel.findByUser(req.user.id);
    res.json({ ok: true, watches: watches.map(publicWatch) });
  } catch (error) {
    next(error);
  }
}

export async function getWatch(req, res, next) {
  try {
    const watch = await WatchModel.findOwned(req.params.id, req.user.id);
    if (!watch || watch.status === 'CANCELLED') return res.status(404).json({ ok: false, error: 'Kuzatuv topilmadi' });
    const notifications = await NotificationModel.findByWatch(watch.id, 10);
    res.json({
      ok: true,
      watch: publicWatch(watch),
      notifications: notifications.map((item) => ({ id: item.id, createdAt: item.createdAt, seats: item.seats, delivered: item.delivered })),
    });
  } catch (error) {
    next(error);
  }
}

export async function createWatch(req, res, next) {
  try {
    const { entries, createdCount, reusedCount } = await createWatches(req.user, req.body || {});
    res.status(201).json({
      ok: true,
      createdCount,
      reusedCount,
      watches: entries.map(({ watch, result, error }) => ({
        ...publicWatch(watch),
        now: result ? { found: result.items.length > 0, items: result.items.slice(0, 5) } : null,
        checkError: error || null,
      })),
    });
  } catch (error) {
    if (error instanceof ValidationError) return badRequest(res, error.message);
    next(error);
  }
}

export async function updateWatch(req, res, next) {
  try {
    const watch = await WatchModel.findOwned(req.params.id, req.user.id);
    if (!watch || watch.status === 'CANCELLED') return res.status(404).json({ ok: false, error: 'Kuzatuv topilmadi' });

    const { status } = req.body || {};
    if (!['ACTIVE', 'PAUSED', 'FOUND'].includes(status)) return badRequest(res, 'Holat noto\'g\'ri');
    if (status === 'ACTIVE' && watch.date < todayISO()) return badRequest(res, 'Bu kuzatuvning sanasi o\'tib ketgan');

    const data = { status };
    if (status === 'ACTIVE' && watch.status !== 'ACTIVE') {
      // Qayta yoqilganda — hozir bor joylar haqida ham yana xabar beriladi
      data.lastKeys = [];
      data.lastNotifiedAt = null;
    }
    const updated = await WatchModel.update(watch.id, data);
    res.json({ ok: true, watch: publicWatch(updated) });
  } catch (error) {
    next(error);
  }
}

export async function deleteWatch(req, res, next) {
  try {
    const watch = await WatchModel.findOwned(req.params.id, req.user.id);
    if (!watch) return res.status(404).json({ ok: false, error: 'Kuzatuv topilmadi' });
    await WatchModel.update(watch.id, { status: 'CANCELLED' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function checkWatch(req, res, next) {
  try {
    const watch = await WatchModel.findOwned(req.params.id, req.user.id);
    if (!watch || watch.status === 'CANCELLED') return res.status(404).json({ ok: false, error: 'Kuzatuv topilmadi' });
    if (watch.date < todayISO()) return badRequest(res, 'Bu kuzatuvning sanasi o\'tib ketgan');

    const { watch: updated } = await checkWatchNow({ ...watch, user: req.user }, { notify: false, markNotified: true });
    res.json({ ok: true, watch: publicWatch(updated) });
  } catch (error) {
    if (error.name === 'RailwayError') return railwayErrorResponse(res, error);
    next(error);
  }
}

/* ------------------------------------------------------------------ */
/*  Profil                                                             */
/* ------------------------------------------------------------------ */

export async function profile(req, res, next) {
  try {
    const [watches, notifications, searches] = await Promise.all([
      WatchModel.findByUser(req.user.id),
      NotificationModel.count({ userId: req.user.id, kind: 'found' }),
      SearchLogModel.count({ userId: req.user.id }),
    ]);
    res.json({
      ok: true,
      stats: {
        watches: watches.length,
        active: watches.filter((watch) => watch.status === 'ACTIVE').length,
        found: watches.filter((watch) => watch.status === 'FOUND').length,
        notifications,
        searches,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const data = {};
    if (req.body?.quietNight !== undefined) data.quietNight = Boolean(req.body.quietNight);
    const user = Object.keys(data).length ? await UserModel.update(req.user.id, data) : req.user;
    res.json({ ok: true, user: { id: user.id, firstName: user.firstName, quietNight: user.quietNight } });
  } catch (error) {
    next(error);
  }
}

export default {
  bootstrap, stations, search, train,
  listWatches, getWatch, createWatch, updateWatch, deleteWatch, checkWatch,
  profile, updateProfile,
};
