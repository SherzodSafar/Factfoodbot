/**
 * Telegram bot instansiyasi (Telegraf) va xabar yuborish yordamchilari.
 */
import { Telegraf } from 'telegraf';
import config from '../config/default.js';
import UserModel from '../models/User.js';

let bot = null;

/** Bot nusxasini olish (bir marta yaratiladi) */
export function getBot() {
  if (!config.bot.token) return null;
  if (!bot) bot = new Telegraf(config.bot.token);
  return bot;
}

/** Toshkent vaqti bilan 23:00–07:00 oralig'imi */
function isNight() {
  const hour = new Date(Date.now() + config.timezoneOffsetMin * 60_000).getUTCHours();
  return hour >= 23 || hour < 7;
}

/**
 * Foydalanuvchiga xabar yuborish.
 * Foydalanuvchi botni bloklagan bo'lsa — bazada belgilanadi va keyin xabar yuborilmaydi.
 * @returns {Promise<boolean>} yetkazildimi
 */
export async function sendMessage(telegramId, text, extra = {}, { quietNight = false } = {}) {
  const instance = getBot();
  if (!instance) return false;

  try {
    await instance.telegram.sendMessage(String(telegramId), text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(quietNight && isNight() ? { disable_notification: true } : {}),
      ...extra,
    });
    return true;
  } catch (error) {
    const code = error?.response?.error_code;
    if (code === 403 || /bot was blocked|user is deactivated|chat not found/i.test(error.message)) {
      await UserModel.markBotBlocked(telegramId).catch(() => {});
    }
    console.error(`[bot] Xabar yuborilmadi (${telegramId}):`, error.message);
    return false;
  }
}

/** Mini App tugmasi (URL parametrlari bilan) */
export function webAppUrl(params = {}) {
  if (!config.bot.webAppUrl) return '';
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  const text = query.toString();
  return text ? `${config.bot.webAppUrl}/?${text}` : config.bot.webAppUrl;
}

export function webAppReady() {
  return config.bot.webAppUrl.startsWith('https://');
}

export const BOT_COMMANDS = [
  { command: 'start', description: 'Botni ishga tushirish' },
  { command: 'search', description: 'Chipta qidirish (ilova)' },
  { command: 'watches', description: 'Mening kuzatuvlarim' },
  { command: 'help', description: 'Yordam va misollar' },
];

/**
 * Telegram tomonidagi bot profilini sozlash:
 *  - "Menu" tugmasini Mini App'ga bog'lash
 *  - buyruqlar ro'yxati va qisqa tavsif
 */
export async function syncBotProfile() {
  const instance = getBot();
  if (!instance) return false;

  try {
    await instance.telegram.setMyCommands(BOT_COMMANDS);
    await instance.telegram
      .callApi('setMyShortDescription', {
        short_description: 'Poyezd chiptalari: bo\'sh joylar, kuzatuv va aniq joy buyurtmasi 🚆',
      })
      .catch(() => {});
    await instance.telegram
      .callApi('setMyDescription', {
        description:
          'Chipta Radar — O\'zbekiston temir yo\'llari chiptalari yordamchisi.\n\n' +
          '🔍 Hozir qaysi poyezdda, qaysi vagonda qancha bo\'sh joy borligini ko\'rsatadi\n' +
          '🔔 Chipta yo\'q bo\'lsa — joy chiqishi bilan xabar beradi\n' +
          '🎯 Aniq joyni kuzatadi: kupe yoki bokovoy, pastki yoki yuqori, hammasi bitta joyda',
      })
      .catch(() => {});

    if (webAppReady()) {
      await instance.telegram.setChatMenuButton({
        menuButton: { type: 'web_app', text: '🚆 Chiptalar', web_app: { url: config.bot.webAppUrl } },
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

export default { getBot, sendMessage, syncBotProfile, webAppUrl, webAppReady };
