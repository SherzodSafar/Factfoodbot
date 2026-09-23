/**
 * Kuzatuv xizmati (monitoring).
 *
 * Har N soniyada (standart 60) barcha faol kuzatuvlarni tekshiradi:
 *   1) bir xil yo'nalish+sana kuzatuvlari guruhlanadi — saytga bitta so'rov;
 *   2) aniq joy (EXACT) kuzatuvlari uchun faqat yetarli joyi bor poyezdlar tafsiloti so'raladi;
 *   3) yangi mos joy paydo bo'lsa — foydalanuvchiga darhol xabar yuboriladi.
 *
 * Takroriy xabarlarning oldini olish: bir xil joylar haqida qayta yozilmaydi,
 * yangi joylar haqida esa kamida "notifyCooldownMin" daqiqa oraliqda yoziladi.
 */
import { Markup } from 'telegraf';
import config from '../config/default.js';
import prisma, { isDatabaseReady } from '../database/connection.js';
import WatchModel from '../models/Watch.js';
import NotificationModel from '../models/Notification.js';
import { searchTrains, getTrainDetail } from '../core/railway.js';
import { sendMessage, webAppReady, webAppUrl } from '../core/bot.js';
import { evaluateWatch } from './matcher.js';
import { foundMessage } from './format.js';
import { getSettings } from './settings.js';
import { todayISO } from '../utils/dates.js';

// Hammasi sotilib, keyin yana paydo bo'lganda ham kamida shuncha kutiladi
// (sayt joyni to'lov uchun vaqtincha band qilib, keyin qaytarishi mumkin)
const MIN_GAP_MS = 2 * 60 * 1000;

const status = {
  state: 'stopped',
  lastCycle: null,
  nextRunAt: null,
  lastError: null,
  totalNotified: 0,
};

let timer = null;
let running = false;
let stopped = true;

/* ------------------------------------------------------------------ */
/*  Xabar tugmalari                                                    */
/* ------------------------------------------------------------------ */

export function watchKeyboard(watch) {
  const rows = [[Markup.button.url('🎫 eticket.railway.uz da sotib olish', config.railway.buyUrl)]];
  if (webAppReady()) {
    rows.push([Markup.button.webApp('📱 Joylarni ko\'rish', webAppUrl({ watch: watch.id }))]);
  }
  rows.push([
    Markup.button.callback('✅ Chipta oldim', `wf:${watch.id}`),
    Markup.button.callback('⏸ To\'xtatish', `wp:${watch.id}`),
  ]);
  return Markup.inlineKeyboard(rows);
}

function countSeats(result) {
  let total = 0;
  for (const item of result.items) {
    if (item.suggestions?.length) total += item.totalFitting || 0;
    else total += item.types.reduce((sum, car) => sum + car.free, 0);
  }
  return total;
}

/* ------------------------------------------------------------------ */
/*  Natijani saqlash va xabar berish                                   */
/* ------------------------------------------------------------------ */

/**
 * @param watch  kuzatuv (user bilan)
 * @param result evaluateWatch natijasi
 * @param options.notify         yangi joylar bo'lsa xabar yuborish
 * @param options.markNotified   xabar yubormasdan "foydalanuvchi ko'rdi" deb belgilash
 */
export async function applyResult(watch, result, { notify = true, markNotified = false } = {}) {
  const now = new Date();
  const settings = getSettings();
  const keys = result.keys || [];
  const previous = new Set(watch.lastKeys || []);
  const appeared = keys.filter((key) => !previous.has(key));
  const sinceLast = watch.lastNotifiedAt ? now - new Date(watch.lastNotifiedAt) : Infinity;
  const gap = previous.size === 0 ? MIN_GAP_MS : settings.notifyCooldownMin * 60_000;
  const shouldNotify = notify && appeared.length > 0 && sinceLast >= gap;

  // Kutish vaqti tugamagani uchun xabar berilmagan yangi joylar keyingi safar yana "yangi" bo'lib qoladi
  const nextKeys = shouldNotify || markNotified || appeared.length === 0 ? keys : keys.filter((key) => previous.has(key));

  const data = {
    lastCheckedAt: now,
    checksCount: { increment: 1 },
    lastKeys: nextKeys,
    lastResult: {
      checkedAt: now.toISOString(),
      found: result.items.length > 0,
      items: result.items.slice(0, 8),
      errors: (result.errors || []).slice(0, 3),
    },
    lastError: !result.items.length && result.errors?.length ? result.errors[0] : null,
  };
  if (result.items.length) data.lastFoundAt = now;

  let notified = false;
  if (shouldNotify && watch.user) {
    const text = foundMessage(watch, result, { buyUrl: config.railway.buyUrl });
    const delivered = await sendMessage(watch.user.telegramId, text, watchKeyboard(watch), {
      quietNight: watch.user.quietNight,
    });
    await NotificationModel.create({
      watchId: watch.id,
      userId: watch.userId,
      kind: 'found',
      text,
      seats: countSeats(result),
      delivered,
    });
    data.lastNotifiedAt = now;
    data.notifyCount = { increment: 1 };
    notified = delivered;
    if (delivered) status.totalNotified += 1;
  } else if (markNotified && result.items.length) {
    data.lastNotifiedAt = now;
  }

  const updated = await WatchModel.update(watch.id, data);
  return { watch: updated, notified };
}

/* ------------------------------------------------------------------ */
/*  Bitta kuzatuvni darhol tekshirish                                   */
/* ------------------------------------------------------------------ */

export async function evaluateNow(watch, { priority = 'high' } = {}) {
  const query = { from: watch.fromCode, to: watch.toCode, date: watch.date };
  const { trains } = await searchTrains(query, { priority, maxAgeMs: 15_000 });
  const loadDetail = (train) =>
    getTrainDetail({ ...query, trainNumber: train.number, trainId: train.id }, { priority, maxAgeMs: 15_000 });
  return evaluateWatch(watch, trains, loadDetail);
}

/** Foydalanuvchi "Tekshirish" tugmasini bosganda */
export async function checkWatchNow(watch, { notify = false, markNotified = true } = {}) {
  const result = await evaluateNow(watch);
  const applied = await applyResult(watch, result, { notify, markNotified });
  return { result, watch: applied.watch, notified: applied.notified };
}

/* ------------------------------------------------------------------ */
/*  Davriy tekshiruv sikli                                             */
/* ------------------------------------------------------------------ */

async function markGroupError(watches, error) {
  await prisma.watch
    .updateMany({
      where: { id: { in: watches.map((watch) => watch.id) } },
      data: { lastError: error.message.slice(0, 300), lastCheckedAt: new Date() },
    })
    .catch(() => {});
}

export async function runCycle() {
  if (!isDatabaseReady()) return null;
  const settings = getSettings();
  if (!settings.watcherEnabled) {
    status.state = 'disabled';
    return null;
  }

  status.state = 'running';
  const startedAt = Date.now();
  const today = todayISO();
  await WatchModel.expireBefore(today);
  const watches = await WatchModel.findForWatcher(today);

  const groups = new Map();
  for (const watch of watches) {
    const key = `${watch.fromCode}|${watch.toCode}|${watch.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(watch);
  }

  const summary = { watches: watches.length, groups: groups.size, checked: 0, found: 0, notified: 0, errors: 0 };
  const detailCache = new Map();

  for (const [key, list] of groups) {
    if (stopped) break;
    const { fromCode: from, toCode: to, date } = list[0];

    let trains;
    try {
      ({ trains } = await searchTrains({ from, to, date }, { priority: 'low', maxAgeMs: 20_000 }));
    } catch (error) {
      summary.errors += 1;
      await markGroupError(list, error);
      // Sayt cheklov qo'ygan bo'lsa — siklni to'xtatamiz, keyingisida davom etadi
      if (error.code === 'COOLDOWN' || error.code === 'RATE_LIMITED') break;
      continue;
    }

    const loadDetail = (train) => {
      const detailKey = `${key}|${train.number}`;
      if (!detailCache.has(detailKey)) {
        detailCache.set(
          detailKey,
          getTrainDetail({ from, to, date, trainNumber: train.number, trainId: train.id }, { priority: 'low', maxAgeMs: 20_000 }),
        );
      }
      return detailCache.get(detailKey);
    };

    for (const watch of list) {
      try {
        const result = await evaluateWatch(watch, trains, loadDetail);
        const applied = await applyResult(watch, result, { notify: true });
        summary.checked += 1;
        if (result.items.length) summary.found += 1;
        if (applied.notified) summary.notified += 1;
      } catch (error) {
        summary.errors += 1;
        console.error(`[watcher] Kuzatuv #${watch.id}:`, error.message);
      }
    }
  }

  const finishedAt = Date.now();
  status.lastCycle = {
    ...summary,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - startedAt,
  };
  status.state = 'idle';
  if (summary.notified) {
    console.log(`[watcher] ${summary.checked} ta kuzatuv tekshirildi, ${summary.notified} ta xabar yuborildi`);
  }
  return status.lastCycle;
}

function schedule(delay) {
  clearTimeout(timer);
  status.nextRunAt = new Date(Date.now() + delay).toISOString();
  timer = setTimeout(tick, delay);
  timer.unref?.();
}

async function tick() {
  if (stopped) return;
  if (running) {
    schedule(5_000);
    return;
  }
  running = true;
  const started = Date.now();
  try {
    await runCycle();
    status.lastError = null;
  } catch (error) {
    status.lastError = error.message;
    status.state = 'error';
    console.error('[watcher] Sikl xatoligi:', error.message);
  } finally {
    running = false;
  }
  const interval = getSettings().watchIntervalSec * 1000;
  schedule(Math.max(5_000, interval - (Date.now() - started)));
}

export function startWatcher() {
  if (!stopped) return;
  stopped = false;
  status.state = 'idle';
  schedule(8_000);
  console.log(`✅ Kuzatuv xizmati ishga tushdi (har ${getSettings().watchIntervalSec} soniyada)`);
}

export function stopWatcher() {
  stopped = true;
  clearTimeout(timer);
  status.state = 'stopped';
  status.nextRunAt = null;
}

/** Yangi kuzatuv qo'shilganda navbatdagi siklni tezlashtirish */
export function triggerSoon() {
  if (!stopped && !running) schedule(3_000);
}

export function getWatcherStatus() {
  return { ...status, running, intervalSec: getSettings().watchIntervalSec, enabled: getSettings().watcherEnabled };
}

export default { startWatcher, stopWatcher, runCycle, checkWatchNow, evaluateNow, applyResult, triggerSoon, getWatcherStatus, watchKeyboard };
