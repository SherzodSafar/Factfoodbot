/**
 * Bot logikasi — foydalanuvchi bilan muloqot.
 *
 * Imkoniyatlar:
 *   • /start — salomlashish va asosiy tugmalar
 *   • oddiy matn bilan tezkor qidiruv: "Toshkent Samarqand 25.09"
 *   • /watches — kuzatuvlar ro'yxati (to'xtatish / davom ettirish / o'chirish)
 *   • xabar ostidagi tugmalar: "Chipta oldim", "To'xtatish", "Kuzatish" ...
 */
import { Markup } from 'telegraf';
import config from '../config/default.js';
import UserModel from '../models/User.js';
import WatchModel from '../models/Watch.js';
import SearchLogModel from '../models/SearchLog.js';
import { searchTrains } from '../core/railway.js';
import { webAppReady, webAppUrl } from '../core/bot.js';
import { parseQuery } from '../services/queryParser.js';
import { searchReply, describeWatch, dateLine } from '../services/format.js';
import { createWatches, ValidationError } from '../services/watchService.js';
import { checkWatchNow, withLiveState } from '../services/watcher.js';
import { escapeHtml } from '../utils/text.js';

const STATUS_LABELS = {
  ACTIVE: '🟢 Faol',
  PAUSED: '⏸ To\'xtatilgan',
  FOUND: '✅ Topildi',
  EXPIRED: '⌛ Muddati o\'tgan',
  CANCELLED: '✖️ Bekor qilingan',
};

const MENU = {
  watches: '🔔 Kuzatuvlarim',
  help: '❓ Yordam',
  search: '🚆 Chipta qidirish',
};

/** Asosiy klaviatura */
function mainKeyboard() {
  const rows = [];
  if (webAppReady()) rows.push([Markup.button.webApp(MENU.search, config.bot.webAppUrl)]);
  rows.push([MENU.watches, MENU.help]);
  return Markup.keyboard(rows).resize();
}

async function ensureUser(ctx) {
  const user = await UserModel.upsertFromTelegram(ctx.from);
  if (user.isBlocked) {
    await ctx.reply('Kechirasiz, sizning hisobingiz vaqtincha cheklangan.');
    return null;
  }
  return user;
}

const EXAMPLES =
  '<b>Tezkor qidiruv</b> — shunchaki yozing:\n' +
  '• <code>Toshkent Samarqand ertaga</code>\n' +
  '• <code>Toshkent Buxoro 25.10</code>\n' +
  '• <code>Andijon Toshkent 3 noyabr</code>';

/** /start */
export async function start(ctx) {
  const user = await ensureUser(ctx);
  if (!user) return;

  const text =
    `Assalomu alaykum, <b>${escapeHtml(user.firstName)}</b>! 👋\n\n` +
    `Men — <b>${escapeHtml(config.appName)}</b> 🚆, poyezd chiptalari bo'yicha yordamchingiz.\n\n` +
    '🔍 <b>Hozir bor joylar</b> — qaysi poyezdda, qaysi vagonda qancha bo\'sh joy borligini ko\'rsataman\n' +
    '🔔 <b>Joy chiqsa xabar beraman</b> — kerakli kun va vagon turini ayting, chipta paydo bo\'lishi bilan yozaman\n' +
    '🎯 <b>Aniq joy</b> — kupe yoki bokovoy, pastki yoki yuqori, hammasi bitta joyda — aynan shuni kuzataman\n\n' +
    `${EXAMPLES}\n\n` +
    (webAppReady() ? 'Yoki pastdagi <b>🚆 Chipta qidirish</b> tugmasini bosing 👇' : '⚠️ <i>Ilova hali ulanmagan.</i>');

  await ctx.replyWithHTML(text, mainKeyboard());
}

/** /help */
export async function help(ctx) {
  await ctx.replyWithHTML(
    '<b>❓ Qanday foydalaniladi</b>\n\n' +
      `${EXAMPLES}\n\n` +
      '<b>Ilovada</b> (🚆 Chipta qidirish):\n' +
      '1) Yo\'nalish va sanani tanlang — barcha poyezdlar, vagon turlari, narxlar va joylar xaritasi\n' +
      '2) Joy bo\'lmasa — <b>🔔 Kuzatish</b>: kun, vagon turi va chiptalar sonini tanlang\n' +
      '3) <b>🎯 Aniq joy</b>: to\'rttalik yoki bokovoy, pastki yoki yuqori, hammasi bitta joyda yoki tarqoq\n\n' +
      '<b>Buyruqlar</b>\n' +
      '/search — ilovani ochish\n' +
      '/watches — kuzatuvlarim\n' +
      '/help — yordam\n\n' +
      'ℹ️ Bot chipta sotmaydi — joy topilganda xabar beradi, xarid rasmiy saytda: ' +
      `<a href="${config.railway.buyUrl}">eticket.railway.uz</a>`,
    { link_preview_options: { is_disabled: true } },
  );
}

/** /search — ilovani ochish */
export async function openApp(ctx) {
  if (!webAppReady()) {
    return ctx.replyWithHTML(`Ilova hali ulanmagan. Hozircha matn bilan qidiring:\n\n${EXAMPLES}`);
  }
  return ctx.reply(
    'Qidiruvni boshlash uchun tugmani bosing 👇',
    Markup.inlineKeyboard([Markup.button.webApp('🚆 Chipta qidirish', config.bot.webAppUrl)]),
  );
}

/* ------------------------------------------------------------------ */
/*  Kuzatuvlar ro'yxati                                                */
/* ------------------------------------------------------------------ */

function watchText(row) {
  const watch = withLiveState(row);
  const last = watch.lastResult;
  let state = '';
  if (watch.status === 'ACTIVE') {
    if (last?.found) state = '\n   ✅ Hozir mos joy bor!';
    else if (watch.lastError) state = `\n   ⚠️ ${escapeHtml(watch.lastError)}`;
    else if (watch.lastCheckedAt) state = '\n   ⏳ Hozircha mos joy yo\'q';
  }
  return (
    `<b>#${watch.id}</b> ${STATUS_LABELS[watch.status] || watch.status} · ${watch.mode === 'EXACT' ? '🎯 Aniq' : '🔔 Kuzatuv'}\n` +
    `   📍 ${escapeHtml(watch.fromName)} → ${escapeHtml(watch.toName)}\n` +
    `   📅 ${dateLine(watch.date)}\n` +
    `   🔎 ${escapeHtml(describeWatch(watch))}${state}`
  );
}

function watchButtons(watch) {
  const row = [];
  if (watch.status === 'ACTIVE') row.push(Markup.button.callback('⏸ To\'xtatish', `wp:${watch.id}`));
  if (watch.status === 'PAUSED' || watch.status === 'FOUND') row.push(Markup.button.callback('▶️ Davom', `wr:${watch.id}`));
  row.push(Markup.button.callback('🔄 Tekshirish', `wc:${watch.id}`));
  row.push(Markup.button.callback('🗑', `wd:${watch.id}`));
  return Markup.inlineKeyboard([row]);
}

export async function myWatches(ctx) {
  const user = await ensureUser(ctx);
  if (!user) return;

  const watches = (await WatchModel.findByUser(user.id)).filter((watch) => ['ACTIVE', 'PAUSED', 'FOUND'].includes(watch.status));
  if (!watches.length) {
    const extra = webAppReady()
      ? Markup.inlineKeyboard([Markup.button.webApp('🔔 Kuzatuv qo\'shish', webAppUrl({ open: 'watch' }))])
      : {};
    return ctx.replyWithHTML(
      'Sizda hali kuzatuvlar yo\'q.\n\nChipta topilmasa — kuzatuvga qo\'ying, joy chiqishi bilan xabar beraman 🔔',
      extra,
    );
  }

  await ctx.replyWithHTML(`<b>🔔 Kuzatuvlaringiz</b> (${watches.length} ta)`);
  for (const watch of watches.slice(0, 10)) {
    await ctx.replyWithHTML(watchText(watch), watchButtons(watch));
  }
  if (watches.length > 10) {
    await ctx.reply(`… va yana ${watches.length - 10} ta. Hammasini ilovada ko'ring.`);
  }
}

/* ------------------------------------------------------------------ */
/*  Tugmalar (callback)                                                */
/* ------------------------------------------------------------------ */

async function ownedWatch(ctx, id) {
  const user = await UserModel.findByTelegramId(ctx.from.id);
  if (!user) return null;
  return WatchModel.findOwned(id, user.id).then((watch) => (watch ? { watch, user } : null));
}

export async function onCallback(ctx) {
  const data = ctx.callbackQuery?.data || '';
  const [action, rawId, ...rest] = data.split(':');

  try {
    // Tezkor kuzatuv: qw:<from>:<to>:<date>
    if (action === 'qw') {
      const user = await ensureUser(ctx);
      if (!user) return ctx.answerCbQuery();
      const [toCode, date] = rest;
      await ctx.answerCbQuery('Kuzatuv yoqilmoqda...');
      await createWatches(user, { mode: 'ANY', fromCode: rawId, toCode, dates: [date], quantity: 1, carTypes: [] });
      return;
    }

    const found = await ownedWatch(ctx, rawId);
    if (!found) return ctx.answerCbQuery('Kuzatuv topilmadi', { show_alert: true });
    const { watch, user } = found;

    if (action === 'wp') {
      const updated = await WatchModel.update(watch.id, { status: 'PAUSED' });
      await ctx.answerCbQuery('⏸ Kuzatuv to\'xtatildi');
      return ctx.editMessageReplyMarkup(watchButtons(updated).reply_markup).catch(() => {});
    }

    if (action === 'wr') {
      const updated = await WatchModel.update(watch.id, { status: 'ACTIVE', lastKeys: [] });
      await ctx.answerCbQuery('▶️ Kuzatuv davom etmoqda');
      return ctx.editMessageReplyMarkup(watchButtons(updated).reply_markup).catch(() => {});
    }

    if (action === 'wf') {
      await WatchModel.update(watch.id, { status: 'FOUND' });
      await ctx.answerCbQuery('Tabriklaymiz! Oq yo\'l! 🎉');
      await ctx.editMessageReplyMarkup(undefined).catch(() => {});
      return ctx.replyWithHTML(
        `🎉 Ajoyib! <b>#${watch.id}</b> kuzatuv yakunlandi.\nOq yo'l, ${escapeHtml(user.firstName)}! 🚆`,
      );
    }

    if (action === 'wd') {
      await WatchModel.update(watch.id, { status: 'CANCELLED' });
      await ctx.answerCbQuery('🗑 O\'chirildi');
      return ctx.editMessageText(`🗑 <s>#${watch.id} kuzatuv o'chirildi</s>`, { parse_mode: 'HTML' }).catch(() => {});
    }

    if (action === 'wc') {
      await ctx.answerCbQuery('🔄 Tekshirilmoqda...');
      const { result } = await checkWatchNow({ ...watch, user }, { notify: false, markNotified: true });
      const text = result.items.length
        ? `✅ <b>#${watch.id}</b>: hozir ${result.items.length} ta poyezdda mos joy bor! Batafsil — ilovada.`
        : `⏳ <b>#${watch.id}</b>: hozircha mos joy yo'q. Kuzatishda davom etaman.`;
      const extra = result.items.length && webAppReady()
        ? Markup.inlineKeyboard([Markup.button.webApp('📱 Joylarni ko\'rish', webAppUrl({ watch: watch.id }))])
        : {};
      return ctx.replyWithHTML(text, extra);
    }

    return ctx.answerCbQuery();
  } catch (error) {
    const message = error instanceof ValidationError ? error.message : 'Xatolik yuz berdi, qayta urinib ko\'ring';
    if (!(error instanceof ValidationError)) console.error('[bot] callback:', error.message);
    return ctx.answerCbQuery(message, { show_alert: true }).catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/*  Oddiy matn — tezkor qidiruv                                        */
/* ------------------------------------------------------------------ */

export async function onText(ctx) {
  const text = ctx.message?.text?.trim() || '';
  if (text.startsWith('/')) return help(ctx);

  const user = await ensureUser(ctx);
  if (!user) return;

  const query = parseQuery(text);
  if (!query.ok) {
    const hint = query.reason === 'one-station'
      ? `Faqat bitta stansiya tushundim: <b>${escapeHtml(query.from.nameUz)}</b>. Qayerga borasiz?\n\n`
      : 'Qidirish uchun jo\'nash va borish shaharlarini yozing.\n\n';
    return ctx.replyWithHTML(hint + EXAMPLES, mainKeyboard());
  }

  await ctx.sendChatAction('typing').catch(() => {});

  const { from, to, date } = query;
  try {
    const { trains } = await searchTrains({ from: from.code, to: to.code, date });
    SearchLogModel.record({
      userId: user.id,
      fromCode: from.code,
      toCode: to.code,
      date,
      source: 'bot',
      trains: trains.length,
      withSeats: trains.filter((train) => train.totalFree > 0).length,
    });

    const reply = searchReply({ from: from.nameUz, to: to.nameUz, date, trains });
    const buttons = [];
    if (webAppReady()) {
      buttons.push([Markup.button.webApp('🗺 Joylar xaritasi va batafsil', webAppUrl({ from: from.code, to: to.code, date }))]);
    }
    buttons.push([Markup.button.callback('🔔 Joy chiqsa xabar ber', `qw:${from.code}:${to.code}:${date}`)]);

    await ctx.replyWithHTML(reply, Markup.inlineKeyboard(buttons));
  } catch (error) {
    SearchLogModel.record({ userId: user.id, fromCode: from.code, toCode: to.code, date, source: 'bot', ok: false });
    await ctx.replyWithHTML(
      `⚠️ Hozir ma'lumot olib bo'lmadi: ${escapeHtml(error.message)}\n\nBirozdan so'ng qayta urinib ko'ring.`,
    );
  }
}

/** Mini App'dan keladigan ma'lumot (zaxira yo'l) */
export async function onWebAppData(ctx) {
  await ctx.reply('Qabul qilindi ✅');
}

export default { start, help, openApp, myWatches, onCallback, onText, onWebAppData, MENU };
