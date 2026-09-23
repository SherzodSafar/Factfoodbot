/**
 * Bepul Render serveri 15 daqiqa jimlikdan keyin "uxlaydi" — shunda kuzatuv ham to'xtaydi.
 * Faol kuzatuvlar bor ekan, server har ~9 daqiqada o'z manziliga so'rov yuborib turadi.
 * Kuzatuv yo'q bo'lsa server bemalol uxlaydi (bepul soatlar tejaladi) —
 * foydalanuvchi botga yozishi bilan u yana uyg'onadi.
 */
import config from '../config/default.js';
import { isDatabaseReady } from '../database/connection.js';
import WatchModel from '../models/Watch.js';

const INTERVAL_MS = 9 * 60 * 1000;

const state = { enabled: false, lastPingAt: null, lastPingOk: null, activeWatches: 0 };

async function ping() {
  try {
    state.activeWatches = isDatabaseReady() ? await WatchModel.countActive() : 0;
    if (!state.activeWatches) return;
    const response = await fetch(`${config.bot.publicUrl}/api/health?source=keepalive`, {
      signal: AbortSignal.timeout(30_000),
    });
    state.lastPingAt = new Date().toISOString();
    state.lastPingOk = response.ok;
  } catch {
    state.lastPingAt = new Date().toISOString();
    state.lastPingOk = false;
  }
}

export function startKeepAlive() {
  if (!config.keepAlive || !config.bot.publicUrl.startsWith('https://')) return;
  state.enabled = true;
  const timer = setInterval(ping, INTERVAL_MS);
  timer.unref?.();
  console.log('✅ Uyg\'oq saqlash yoqildi (faol kuzatuvlar bo\'lganda)');
}

export function getKeepAliveStatus() {
  return { ...state };
}

export default { startKeepAlive, getKeepAliveStatus };
