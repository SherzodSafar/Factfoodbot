/**
 * Telegram bot instansiyasi (Telegraf) va xabar yuborish yordamchilari.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { Telegraf } from 'telegraf';
import config, { ROOT_DIR } from '../config/default.js';
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

/**
 * "Akkaunt va ma'lumotlar" Web App sahifasi (backendning o'zi beradi: /app/account).
 * Telegram web_app tugmasi faqat https manzilni qabul qiladi.
 */
export function accountWebAppUrl() {
  const base = config.bot.publicUrl;
  return base.startsWith('https://') ? `${base}/app/account` : '';
}

/** Web App (account sahifasi) tugmasini ko'rsatsa bo'ladimi */
export function accountWebAppReady() {
  return accountWebAppUrl() !== '';
}

export const BOT_COMMANDS = [
  { command: 'start', description: 'Asosiy menyu' },
  { command: 'watches', description: 'Mening kuzatuvlarim' },
  { command: 'account', description: 'Akkaunt va ma\'lumotlar' },
  { command: 'orders', description: 'Bronlarim va to\'lov' },
  { command: 'help', description: 'Yordam' },
];

/**
 * Telegram tomonidagi bot profilini sozlash:
 *  - "Menu" tugmasi — oddiy buyruqlar ro'yxati (Mini App emas, hammasi inline)
 *  - buyruqlar ro'yxati va qisqa tavsif
 */
/** Botda profil rasmi bo'lmasa — assets/bot-avatar.jpg bir marta qo'yiladi */
async function ensureBotAvatar(instance) {
  const me = instance.botInfo || (await instance.telegram.getMe());
  const photos = await instance.telegram.getUserProfilePhotos(me.id, 0, 1);
  if (photos.total_count > 0) return; // rasm allaqachon bor — qayta yuklanmaydi
  const image = await fs.readFile(path.join(ROOT_DIR, 'assets', 'bot-avatar.jpg'));
  const form = new FormData();
  form.append('photo', JSON.stringify({ type: 'static', photo: 'attach://avatar' }));
  form.append('avatar', new Blob([image], { type: 'image/jpeg' }), 'avatar.jpg');
  const response = await fetch(`https://api.telegram.org/bot${config.bot.token}/setMyProfilePhoto`, { method: 'POST', body: form });
  const data = await response.json().catch(() => ({}));
  console.log(data.ok ? '✅ Bot avatari qo\'yildi' : `⚠️ Bot avatari qo'yilmadi: ${data.description || response.status}`);
}

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

    // "Menu" tugmasi — buyruqlar ro'yxati (Mini App ishlatilmaydi)
    await instance.telegram.setChatMenuButton({ menuButton: { type: 'commands' } }).catch(() => {});
    console.log('✅ Telegram "Menu" tugmasi — buyruqlar ro\'yxati (inline interfeys)');
    await ensureBotAvatar(instance).catch((error) => console.warn('[bot] Avatar:', error.message));
    return true;
  } catch (error) {
    console.error('[bot] Profilni sozlab bo\'lmadi:', error.message);
    return false;
  }
}

export default { getBot, sendMessage, syncBotProfile, webAppUrl, webAppReady, accountWebAppUrl, accountWebAppReady };
