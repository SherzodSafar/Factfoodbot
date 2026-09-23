/**
 * Admin Paneldan barcha foydalanuvchilarga e'lon yuborish.
 * Telegram cheklovlariga rioya qilish uchun sekundiga ~20 ta xabar.
 */
import UserModel from '../models/User.js';
import NotificationModel from '../models/Notification.js';
import { sendMessage } from '../core/bot.js';

const state = { running: false, total: 0, sent: 0, failed: 0, startedAt: null, finishedAt: null, preview: '' };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function getBroadcastStatus() {
  return { ...state };
}

export async function startBroadcast(text) {
  if (state.running) throw new Error('Oldingi e\'lon hali yuborilmoqda');
  const users = await UserModel.findReachable();

  Object.assign(state, {
    running: true,
    total: users.length,
    sent: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    preview: text.slice(0, 120),
  });

  (async () => {
    for (const user of users) {
      const delivered = await sendMessage(user.telegramId, text);
      if (delivered) state.sent += 1;
      else state.failed += 1;
      await NotificationModel.create({ userId: user.id, kind: 'broadcast', text, delivered }).catch(() => {});
      await sleep(50);
    }
    state.running = false;
    state.finishedAt = new Date().toISOString();
  })().catch((error) => {
    state.running = false;
    state.finishedAt = new Date().toISOString();
    console.error('[broadcast]', error.message);
  });

  return getBroadcastStatus();
}

export default { startBroadcast, getBroadcastStatus };
