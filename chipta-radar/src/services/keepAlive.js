/**
 * Bepul Render serveri 15 daqiqa jimlikdan keyin "uxlaydi" — shunda kuzatuv ham to'xtaydi.
 * Server DOIM har ~9 daqiqada o'z manziliga so'rov yuboradi — hech qachon uxlamaydi.
 */
import config from '../config/default.js';
import { getActiveWatchCount } from './watcher.js';

const INTERVAL_MS = 9 * 60 * 1000;

const state = { enabled: false, lastPingAt: null, lastPingOk: null, activeWatches: 0 };

async function ping() {
  try {
    // Kuzatuv xizmati xotirasidan — bazani uyg'otmaslik uchun
    state.activeWatches = getActiveWatchCount();
    // Doim ping — server hech qachon uxlamasin (kuzatuv bo'lmasa ham)
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
  console.log('✅ Uyg\'oq saqlash yoqildi (doim — har 9 daqiqada)');
}

export function getKeepAliveStatus() {
  return { ...state };
}

export default { startKeepAlive, getKeepAliveStatus };
