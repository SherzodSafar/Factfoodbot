/**
 * Bot handlerlari (yo'llari). Interfeys to'liq inline tugmalarda —
 * reply-klaviatura va Mini App ishlatilmaydi.
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
  bot.command('menu', botController.start);
  bot.command('watches', botController.myWatches);
  bot.command('account', botController.myAccount);
  bot.command('orders', botController.myOrders);

  bot.on('callback_query', botController.onCallback);
  bot.on(message('text'), botController.onText);

  bot.catch((error, ctx) => {
    console.error(`[bot] Xatolik (${ctx.updateType}):`, error.message);
  });

  return bot;
}

export default registerBotRoutes;
