/**
 * Bot handlerlari (yo'llari) shu yerda ro'yxatdan o'tkaziladi.
 */
import { message } from 'telegraf/filters';
import { getBot } from '../core/bot.js';
import botController from '../controllers/botController.js';

/** Barcha bot handlerlarini ulash va botni ishga tushirish */
export async function registerBotRoutes() {
  const bot = getBot();
  if (!bot) {
    console.warn('[bot] BOT_TOKEN topilmadi — bot ishga tushmadi.');
    return null;
  }

  bot.start(botController.start);
  bot.help(botController.help);
  bot.command('menu', botController.openApp);
  bot.command('myorders', botController.myOrders);

  bot.hears('📜 Mening buyurtmalarim', botController.myOrders);
  bot.hears('🍕 Buyurtma berish', botController.openApp);

  bot.on(message('contact'), botController.onContact);
  bot.on(message('web_app_data'), botController.onWebAppData);
  bot.on(message('text'), botController.onText);

  bot.catch((error, ctx) => {
    console.error(`[bot] Xatolik (${ctx.updateType}):`, error.message);
  });

  return bot;
}

export default registerBotRoutes;
