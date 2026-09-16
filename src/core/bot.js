/**
 * Telegram bot instansiyasi (Telegraf).
 * Bot localhost'da "long polling" rejimida ishlaydi — webhook shart emas.
 */
import { Telegraf } from 'telegraf';
import config from '../config/default.js';

let bot = null;

/** Bot nusxasini olish (bir marta yaratiladi) */
export function getBot() {
  if (!config.bot.token) return null;
  if (!bot) {
    bot = new Telegraf(config.bot.token);
  }
  return bot;
}

/**
 * Mijozga oddiy xabar yuborish.
 * Xatolik bo'lsa ham dastur to'xtamaydi (masalan mijoz botni bloklagan bo'lsa).
 */
export async function sendMessage(telegramId, text, extra = {}) {
  const instance = getBot();
  if (!instance) return false;

  try {
    await instance.telegram.sendMessage(String(telegramId), text, {
      parse_mode: 'HTML',
      ...extra,
    });
    return true;
  } catch (error) {
    console.error(`[bot] Xabar yuborilmadi (${telegramId}):`, error.message);
    return false;
  }
}

export default { getBot, sendMessage };
