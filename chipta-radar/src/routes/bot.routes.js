/**
 * Bot handlerlari (yo'llari) shu yerda ro'yxatdan o'tkaziladi.
 */
import { message } from 'telegraf/filters';
import { getBot } from '../core/bot.js';
import botController from '../controllers/botController.js';

/** Barcha bot handlerlarini ulash */
export async function registerBotRoutes() {
  const bot = getBot();
  if (!bot) {
    console.warn('⚠️  BOT_TOKEN berilmagan — bot ishga tushmadi.');
    return null;
  }

  bot.start(botController.start);
  bot.help(botController.help);
  bot.command('search', botController.openApp);
  bot.command('watches', botController.myWatches);

  bot.hears(botController.MENU.watches, botController.myWatches);
  bot.hears(botController.MENU.help, botController.help);

  bot.on('callback_query', botController.onCallback);
  bot.on(message('web_app_data'), botController.onWebAppData);
  bot.on(message('text'), botController.onText);

  bot.catch((error, ctx) => {
    console.error(`[bot] Xatolik (${ctx.updateType}):`, error.message);
  });

  return bot;
}

export default registerBotRoutes;
