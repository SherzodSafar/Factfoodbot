/**
 * Admin Panel uchun API logikasi:
 * kirish, statistika, kuzatuvlar, foydalanuvchilar, xabarlar, stansiyalar,
 * sayt holati, sinov qidiruvi, sozlamalar va e'lon yuborish.
 */
import prisma, { isDatabaseReady } from '../database/connection.js';
import { STATIONS } from '../services/stationData.js';
import UserModel from '../models/User.js';
import WatchModel, { WATCH_STATUSES } from '../models/Watch.js';
import NotificationModel from '../models/Notification.js';
import SearchLogModel from '../models/SearchLog.js';
import StationModel from '../models/Station.js';
import { createAdminToken, passwordMatches } from '../middlewares/auth.middleware.js';
import { searchTrains, getTrainDetail, getRailwayStatus, resetRailwaySession } from '../core/railway.js';
import { sendMessage } from '../core/bot.js';
import { getWatcherStatus, triggerSoon, checkWatchNow, withLiveState } from '../services/watcher.js';
import { getKeepAliveStatus } from '../services/keepAlive.js';
import { getSettings, updateSettings } from '../services/settings.js';
import { startBroadcast, getBroadcastStatus } from '../services/broadcast.js';
import { refreshStations, stationName, findStation } from '../services/stations.js';
import { summarizeCar } from '../services/seats.js';
import { todayISO, addDays, isISODate, TZ_OFFSET_MIN } from '../utils/dates.js';
import { escapeHtml } from '../utils/text.js';

const pageOf = (req) => Math.max(1, Math.round(Number(req.query.page) || 1));

/** Bugungi kun boshlanishi (Toshkent vaqti bo'yicha) — UTC Date */
function startOfTodayUtc() {
  return new Date(Date.parse(`${todayISO()}T00:00:00Z`) - TZ_OFFSET_MIN * 60_000);
}

/* ----------------------------- Kirish ----------------------------- */

export function login(req, res) {
  const { password } = req.body || {};
  if (!password || !passwordMatches(password)) {
    return res.status(401).json({ ok: false, error: 'Parol noto\'g\'ri' });
  }
  return res.json({ ok: true, token: createAdminToken() });
}

export function me(req, res) {
  res.json({ ok: true, role: 'admin' });
}

/* --------------------------- Statistika --------------------------- */

async function dailySeries(table, days = 14) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT to_char((created_at + interval '${TZ_OFFSET_MIN} minutes')::date, 'YYYY-MM-DD') AS day, count(*)::int AS count
     FROM ${table}
     WHERE created_at >= now() - interval '${days} days'
     GROUP BY 1 ORDER BY 1`,
  );
  const map = new Map(rows.map((row) => [row.day, Number(row.count)]));
  const today = todayISO();
  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = addDays(today, -i);
    series.push({ day, count: map.get(day) || 0 });
  }
  return series;
}

function systemStatus() {
  return {
    database: isDatabaseReady() ? 'ok' : 'not-ready',
    railway: getRailwayStatus(),
    watcher: getWatcherStatus(),
    keepAlive: getKeepAliveStatus(),
    broadcast: getBroadcastStatus(),
    uptimeSec: Math.round(process.uptime()),
    today: todayISO(),
  };
}

export async function stats(req, res, next) {
  // Baza hali ulanmagan bo'lsa ham tizim holatini ko'rsatamiz
  if (!isDatabaseReady()) return res.json({ ok: true, stats: null, system: systemStatus() });

  try {
    const since = startOfTodayUtc();
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);

    const [
      usersTotal, usersToday, usersActive, byStatus,
      notifyTotal, notifyToday, searchesTotal, searchesToday, popular,
      usersDaily, searchesDaily, notificationsDaily,
    ] = await Promise.all([
      UserModel.count(),
      UserModel.count({ createdAt: { gte: since } }),
      UserModel.count({ lastSeenAt: { gte: weekAgo } }),
      WatchModel.groupByStatus(),
      NotificationModel.count({ kind: 'found' }),
      NotificationModel.count({ kind: 'found', createdAt: { gte: since } }),
      SearchLogModel.count(),
      SearchLogModel.count({ createdAt: { gte: since } }),
      SearchLogModel.popularRoutes({ since: new Date(Date.now() - 30 * 86_400_000), take: 8 }),
      dailySeries('users'),
      dailySeries('search_logs'),
      dailySeries('notifications'),
    ]);

    const watches = Object.fromEntries(WATCH_STATUSES.map((status) => [status, 0]));
    for (const row of byStatus) watches[row.status] = row._count._all;

    res.json({
      ok: true,
      stats: {
        users: { total: usersTotal, today: usersToday, active7d: usersActive },
        watches,
        notifications: { total: notifyTotal, today: notifyToday },
        searches: { total: searchesTotal, today: searchesToday },
        popularRoutes: popular.map((route) => ({
          ...route,
          fromName: stationName(route.fromCode),
          toName: stationName(route.toCode),
        })),
        daily: { users: usersDaily, searches: searchesDaily, notifications: notificationsDaily },
      },
      system: systemStatus(),
    });
  } catch (error) {
    next(error);
  }
}

/* -------------------------- Kuzatuvlar ---------------------------- */

export async function listWatches(req, res, next) {
  try {
    const data = await WatchModel.list({ status: req.query.status, q: String(req.query.q || '').trim(), page: pageOf(req) });
    res.json({ ok: true, ...data, items: data.items.map(withLiveState) });
  } catch (error) {
    next(error);
  }
}

export async function updateWatch(req, res, next) {
  try {
    const { status } = req.body || {};
    if (!WATCH_STATUSES.includes(status)) return res.status(400).json({ ok: false, error: 'Holat noto\'g\'ri' });
    const data = { status };
    if (status === 'ACTIVE') data.lastKeys = [];
    const watch = await WatchModel.update(req.params.id, data);
    res.json({ ok: true, watch });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ ok: false, error: 'Kuzatuv topilmadi' });
    next(error);
  }
}

export async function deleteWatch(req, res, next) {
  try {
    await WatchModel.remove(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ ok: false, error: 'Kuzatuv topilmadi' });
    next(error);
  }
}

export async function checkWatch(req, res, next) {
  try {
    const watch = await WatchModel.findById(req.params.id);
    if (!watch) return res.status(404).json({ ok: false, error: 'Kuzatuv topilmadi' });
    const { watch: updated, result } = await checkWatchNow(watch, { notify: false, markNotified: false });
    res.json({ ok: true, watch: updated, found: result.items.length });
  } catch (error) {
    if (error.name === 'RailwayError') return res.status(502).json({ ok: false, error: error.message });
    next(error);
  }
}

/* ------------------------- Foydalanuvchilar ------------------------ */

export async function listUsers(req, res, next) {
  try {
    const data = await UserModel.list({ q: String(req.query.q || '').trim(), page: pageOf(req) });
    res.json({ ok: true, ...data });
  } catch (error) {
    next(error);
  }
}

export async function updateUser(req, res, next) {
  try {
    const { isBlocked } = req.body || {};
    if (isBlocked === undefined) return res.status(400).json({ ok: false, error: 'O\'zgarish yo\'q' });
    const user = await UserModel.update(req.params.id, { isBlocked: Boolean(isBlocked) });
    if (user.isBlocked) await WatchModel.pauseAllForUser(user.id);
    res.json({ ok: true, user });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ ok: false, error: 'Foydalanuvchi topilmadi' });
    next(error);
  }
}

export async function messageUser(req, res, next) {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ ok: false, error: 'Xabar matnini kiriting' });
    const user = await UserModel.findById(req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: 'Foydalanuvchi topilmadi' });

    const body = `📩 <b>Administratordan xabar</b>\n\n${escapeHtml(text)}`;
    const delivered = await sendMessage(user.telegramId, body);
    await NotificationModel.create({ userId: user.id, kind: 'admin', text: body, delivered });
    if (!delivered) return res.status(502).json({ ok: false, error: 'Xabar yetib bormadi (foydalanuvchi botni to\'xtatgan bo\'lishi mumkin)' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

/* ---------------------------- Xabarlar ---------------------------- */

export async function listNotifications(req, res, next) {
  try {
    const data = await NotificationModel.list({ page: pageOf(req), kind: req.query.kind || undefined });
    res.json({ ok: true, ...data });
  } catch (error) {
    next(error);
  }
}

/* --------------------------- Stansiyalar -------------------------- */

export async function listStations(req, res, next) {
  try {
    // Baza ulanmagan bo'lsa — boshlang'ich ro'yxat (sinov qidiruvi ishlashi uchun)
    if (!isDatabaseReady()) return res.json({ ok: true, stations: STATIONS, readOnly: true });
    res.json({ ok: true, stations: await StationModel.findAll() });
  } catch (error) {
    next(error);
  }
}

export async function createStation(req, res, next) {
  try {
    const code = String(req.body?.code || '').trim();
    const nameUz = String(req.body?.nameUz || '').trim();
    if (!/^\d{7}$/.test(code)) return res.status(400).json({ ok: false, error: 'Stansiya kodi 7 xonali raqam bo\'lishi kerak (masalan 2900000)' });
    if (!nameUz) return res.status(400).json({ ok: false, error: 'Stansiya nomini kiriting' });
    if (await StationModel.findByCode(code)) return res.status(409).json({ ok: false, error: 'Bu kodli stansiya allaqachon bor' });

    const station = await StationModel.create({ ...req.body, code, nameUz });
    await refreshStations();
    res.status(201).json({ ok: true, station });
  } catch (error) {
    next(error);
  }
}

export async function updateStation(req, res, next) {
  try {
    const station = await StationModel.update(req.params.code, req.body || {});
    await refreshStations();
    res.json({ ok: true, station });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ ok: false, error: 'Stansiya topilmadi' });
    next(error);
  }
}

export async function deleteStation(req, res, next) {
  try {
    await StationModel.remove(req.params.code);
    await refreshStations();
    res.json({ ok: true });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ ok: false, error: 'Stansiya topilmadi' });
    next(error);
  }
}

/* ------------------------- Sayt va sinov -------------------------- */

/** Sinov qidiruvi: sayt javobi to'g'ri kelayotganini tekshirish uchun */
export async function testSearch(req, res, next) {
  try {
    const from = String(req.body?.from || '').trim();
    const to = String(req.body?.to || '').trim();
    const date = isISODate(req.body?.date) ? req.body.date : addDays(todayISO(), 1);
    if (!/^\d{7}$/.test(from) || !/^\d{7}$/.test(to)) {
      return res.status(400).json({ ok: false, error: 'Stansiya kodlari 7 xonali bo\'lishi kerak' });
    }

    const started = Date.now();
    const { trains, fetchedAt, cached } = await searchTrains({ from, to, date }, { maxAgeMs: 0 });
    SearchLogModel.record({ fromCode: from, toCode: to, date, source: 'admin', trains: trains.length, withSeats: trains.filter((t) => t.totalFree > 0).length });

    let detail = null;
    const withSeats = trains.find((train) => train.totalFree > 0);
    if (req.body?.detail && withSeats) {
      const result = await getTrainDetail({ from, to, date, trainNumber: withSeats.number, trainId: withSeats.id }, { maxAgeMs: 0 });
      detail = {
        trainNumber: withSeats.number,
        cars: result.cars.map((car) => ({ ...car, summary: summarizeCar(car.type, car.places) })),
      };
    }

    res.json({
      ok: true,
      query: { from, to, date, fromName: findStation(from)?.nameUz || from, toName: findStation(to)?.nameUz || to },
      tookMs: Date.now() - started,
      fetchedAt,
      cached,
      trains,
      detail,
    });
  } catch (error) {
    if (error.name === 'RailwayError') {
      return res.status(502).json({ ok: false, error: error.message, code: error.code, sample: getRailwayStatus().lastSample });
    }
    next(error);
  }
}

export function railwayReset(req, res) {
  resetRailwaySession();
  res.json({ ok: true, railway: getRailwayStatus() });
}

export function runWatcherNow(req, res) {
  triggerSoon();
  res.json({ ok: true, watcher: getWatcherStatus() });
}

/* --------------------------- Sozlamalar --------------------------- */

export function getSettingsHandler(req, res) {
  res.json({ ok: true, settings: getSettings() });
}

export async function updateSettingsHandler(req, res, next) {
  try {
    const settings = await updateSettings(req.body || {});
    res.json({ ok: true, settings });
  } catch (error) {
    next(error);
  }
}

/* ------------------------------ E'lon ------------------------------ */

export async function broadcast(req, res, next) {
  try {
    const text = String(req.body?.text || '').trim();
    if (text.length < 3) return res.status(400).json({ ok: false, error: 'E\'lon matnini kiriting' });
    if (text.length > 3500) return res.status(400).json({ ok: false, error: 'Matn juda uzun (3500 belgigacha)' });
    const status = await startBroadcast(`📢 ${escapeHtml(text)}`);
    res.json({ ok: true, broadcast: status });
  } catch (error) {
    if (/hali yuborilmoqda/.test(error.message)) return res.status(409).json({ ok: false, error: error.message });
    next(error);
  }
}

export function broadcastStatus(req, res) {
  res.json({ ok: true, broadcast: getBroadcastStatus() });
}

export default {
  login, me, stats,
  listWatches, updateWatch, deleteWatch, checkWatch,
  listUsers, updateUser, messageUser,
  listNotifications,
  listStations, createStation, updateStation, deleteStation,
  testSearch, railwayReset, runWatcherNow,
  getSettingsHandler, updateSettingsHandler,
  broadcast, broadcastStatus,
};
