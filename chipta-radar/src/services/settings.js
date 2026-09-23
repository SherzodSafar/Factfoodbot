/**
 * Admin Paneldan o'zgartiriladigan sozlamalar.
 * Bazada saqlanadi, xotirada keshlanadi. Baza bo'lmasa — standart qiymatlar.
 */
import config from '../config/default.js';
import prisma, { isDatabaseReady } from '../database/connection.js';
import { setMinInterval } from '../core/railway.js';

export const DEFAULTS = {
  watchIntervalSec: config.watcher.intervalSec,
  maxWatchesPerUser: config.watcher.maxWatchesPerUser,
  notifyCooldownMin: config.watcher.notifyCooldownMin,
  maxDaysAhead: config.watcher.maxDaysAhead,
  railwayMinIntervalMs: config.railway.minIntervalMs,
  watcherEnabled: config.watcher.enabled,
};

const LIMITS = {
  watchIntervalSec: [30, 1800],
  maxWatchesPerUser: [1, 100],
  notifyCooldownMin: [1, 240],
  maxDaysAhead: [1, 120],
  railwayMinIntervalMs: [300, 10_000],
};

let current = { ...DEFAULTS };

function sanitize(key, value) {
  if (key === 'watcherEnabled') return Boolean(value);
  const [min, max] = LIMITS[key] || [];
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return DEFAULTS[key];
  return Math.min(max, Math.max(min, number));
}

function apply() {
  setMinInterval(current.railwayMinIntervalMs);
}

/** Bazadan o'qish (server ishga tushganda) */
export async function loadSettings() {
  if (!isDatabaseReady()) {
    apply();
    return current;
  }
  const rows = await prisma.setting.findMany();
  const next = { ...DEFAULTS };
  for (const row of rows) {
    if (Object.hasOwn(DEFAULTS, row.key)) next[row.key] = sanitize(row.key, row.value);
  }
  current = next;
  apply();
  return current;
}

export function getSettings() {
  return current;
}

/** Bir nechta sozlamani saqlash */
export async function updateSettings(input = {}) {
  const changes = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (input[key] !== undefined) changes[key] = sanitize(key, input[key]);
  }
  for (const [key, value] of Object.entries(changes)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
  current = { ...current, ...changes };
  apply();
  return current;
}

export default { loadSettings, getSettings, updateSettings, DEFAULTS };
