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

/**
 * Telegram tomonidagi bot profilini sozlash:
 *  - "Menu" tugmasini Mini App'ga bog'lash
 *  - buyruqlar ro'yxatini o'rnatish
 * Server har ishga tushganda avtomatik bajariladi — qo'lda hech narsa qilish shart emas.
 */
export async function syncBotProfile() {
  const instance = getBot();
  if (!instance) return false;

  const commands = [
    { command: 'start', description: 'Botni ishga tushirish' },
    { command: 'menu', description: 'Menyuni ochish' },
    { command: 'myorders', description: 'Mening buyurtmalarim' },
    { command: 'help', description: 'Yordam' },
  ];

  try {
    await instance.telegram.setMyCommands(commands);

    if (config.bot.webAppUrl.startsWith('https://')) {
      await instance.telegram.setChatMenuButton({
        menuButton: {
          type: 'web_app',
          text: '🍕 Menyu',
          web_app: { url: config.bot.webAppUrl },
        },
      });
      console.log(`✅ Telegram "Menu" tugmasi ulandi: ${config.bot.webAppUrl}`);
    } else {
      console.log('⚠️  WEBAPP_URL berilmagan — "Menu" tugmasi sozlanmadi');
    }
    return true;
  } catch (error) {
    console.error('[bot] Profilni sozlab bo\'lmadi:', error.message);
    return false;
  }
}

export default { getBot, sendMessage, syncBotProfile };
