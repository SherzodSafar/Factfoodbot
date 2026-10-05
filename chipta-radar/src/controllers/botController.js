/**
 * Bot logikasi — to'liq inline tugmalar bilan muloqot (Mini App va reply-klaviatura yo'q).
 *
 *   • /start — salomlashish va inline asosiy menyu
 *   • "➕ Kuzatuv qo'shish" — bosqichma-bosqich sehrgar (qayerdan → qayerga → sana →
 *     vagon turi → (aniq joy: qism/qavat) → chipta soni → tasdiq)
 *   • "🚆 Poyezd narxlari" — mashhur yo'nalishlar bo'yicha bugungi poyezdlar
 *   • "📋 Kuzatuvlarim" — ro'yxat, to'xtatish/davom/tekshirish/o'chirish
 *   • oddiy matn — tezkor qidiruv ("Toshkent Samarqand ertaga")
 */
import { Markup } from 'telegraf';
import config from '../config/default.js';
import UserModel from '../models/User.js';
import WatchModel from '../models/Watch.js';
import SearchLogModel from '../models/SearchLog.js';
import { searchTrains } from '../core/railway.js';
import { getBot } from '../core/bot.js';
import { stationName, searchStations } from '../services/stations.js';
import { POPULAR_ROUTES } from '../services/stationData.js';
import { carTypeLabel } from '../services/carTypes.js';
import { searchReply, describeWatch, dateLine, trainLine, typeLine, suggestionLine } from '../services/format.js';
import { createWatches, ValidationError } from '../services/watchService.js';
import { checkWatchNow, withLiveState } from '../services/watcher.js';
import { getSettings } from '../services/settings.js';
import { parseQuery } from '../services/queryParser.js';
import { todayISO } from '../utils/dates.js';
import { escapeHtml } from '../utils/text.js';
import ui from '../services/botUi.js';
import wizard from '../services/botWizard.js';

const STATUS = {
  ACTIVE: '🟢 Faol', PAUSED: '⏸ To\'xtatilgan', FOUND: '✅ Topildi',
  EXPIRED: '⌛ Muddati o\'tgan', CANCELLED: '✖️ Bekor qilingan',
};
const STATUS_DOT = { ACTIVE: '🟢', PAUSED: '⏸', FOUND: '✅', EXPIRED: '⌛', CANCELLED: '✖️' };

const HTML = (keyboard) => ({ parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...(keyboard || {}) });

async function ensureUser(ctx) {
  const user = await UserModel.upsertFromTelegram(ctx.from);
  if (user.isBlocked) {
    await ctx.reply('Kechirasiz, hisobingiz vaqtincha cheklangan.').catch(() => {});
    return null;
  }
  return user;
}

/* ------------------------------------------------------------------ */
/*  Asosiy menyu, /start, /help                                        */
/* ------------------------------------------------------------------ */

export async function start(ctx) {
  const user = await ensureUser(ctx);
  if (!user) return;
  wizard.clearSession(ctx.from.id);
  // Eski versiyadan qolgan pastki (reply) klaviaturani olib tashlaymiz — endi hammasi inline
  await ctx.reply(`Assalomu alaykum, ${user.firstName}! 👋`, Markup.removeKeyboard()).catch(() => {});
  await ctx.replyWithHTML(ui.WELCOME, ui.mainMenu());
}

async function showMenu(ctx) {
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(ui.WELCOME, HTML(ui.mainMenu()));
      return;
    } catch {
      /* edit bo'lmasa — yangi xabar */
    }
  }
  await ctx.replyWithHTML(ui.WELCOME, ui.mainMenu());
}

const HELP_TEXT =
  '<b>ℹ️ Qanday foydalaniladi</b>\n\n' +
  '➕ <b>Kuzatuv qo\'shish</b> — yo\'nalish, sana va vagon turini tanlaysiz. Chipta yo\'q bo\'lsa, ' +
  'joy chiqishi bilan darrov xabar beraman.\n' +
  '🎯 <b>Aniq joy</b> — Plaskart/Kupe tanlasangiz, pastki/yuqori yoki to\'rttalik/bokovoyni ham tanlash mumkin.\n' +
  '🚆 <b>Poyezd narxlari</b> — mashhur yo\'nalishlar bo\'yicha bugungi poyezdlar va narxlar.\n' +
  '📋 <b>Kuzatuvlarim</b> — faol kuzatuvlarni boshqarish.\n\n' +
  '<b>Tezkor qidiruv</b> — shunchaki yozing:\n' +
  '• <code>Toshkent Samarqand ertaga</code>\n' +
  '• <code>Andijon Toshkent 25.10</code>\n\n' +
  'ℹ️ Bot chipta sotmaydi — joy topilganda xabar beradi, xaridni rasmiy ' +
  `<a href="${config.railway.buyUrl}">eticket.railway.uz</a> saytida o'zingiz qilasiz.`;

export async function help(ctx) {
  const keyboard = Markup.inlineKeyboard([ui.backToMenuRow()]);
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(HELP_TEXT, HTML(keyboard));
      return;
    } catch { /* yangi xabar */ }
  }
  await ctx.replyWithHTML(HELP_TEXT, keyboard);
}

async function showReferral(ctx) {
  const username = getBot()?.botInfo?.username;
  const link = username ? `https://t.me/${username}` : '';
  const text =
    '👥 <b>Do\'stlaringizni taklif qiling</b>\n\n' +
    'Chipta topishda qiynalayotgan tanishlaringizga shu botni ulashing — ' +
    'ularga ham joy chiqishi bilan xabar beraman.\n\n' +
    (link ? `🔗 <code>${link}</code>` : '');
  const rows = [];
  if (link) rows.push([Markup.button.url('📤 Ulashish', `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Poyezd chiptasi kuzatuvchi bot 🚆')}`)]);
  rows.push(ui.backToMenuRow());
  const keyboard = Markup.inlineKeyboard(rows);
  if (ctx.callbackQuery) {
    try { await ctx.editMessageText(text, HTML(keyboard)); return; } catch { /* yangi */ }
  }
  await ctx.replyWithHTML(text, keyboard);
}

/* ------------------------------------------------------------------ */
/*  Sehrgar: ko'rinish                                                 */
/* ------------------------------------------------------------------ */

function summary(session) {
  const lines = [`📍 <b>${escapeHtml(stationName(session.fromCode))} → ${escapeHtml(stationName(session.toCode))}</b>`];
  if (session.date) lines.push(`📅 ${dateLine(session.date)}`);
  if (session.carType) lines.push(`🚆 ${session.carType === 'any' ? 'Istalgan vagon turi' : carTypeLabel(session.carType)}`);
  const seat = [];
  if (session.section && session.section !== 'any') seat.push(session.section === 'compartment' ? 'to\'rttalik' : 'bokovoy');
  if (session.berth && session.berth !== 'any') seat.push(session.berth === 'lower' ? 'pastki' : 'yuqori');
  if (seat.length) lines.push(`🎯 ${seat.join(', ')}`);
  if (session.quantity) lines.push(`👥 ${session.quantity} ta chipta${session.together === 'compartment' ? ' (yonma-yon)' : ''}`);
  return lines.join('\n');
}

function renderStep(session) {
  const max = getSettings().maxDaysAhead;
  switch (session.step) {
    case 'from':
      return { text: '🚉 <b>Qayerdan jo\'naysiz?</b>\nTugmadan tanlang yoki bekat nomini yozing (masalan: <i>Nukus</i>).', kb: ui.stationGrid('wz:f', { page: session.fromPage || 0 }) };
    case 'to':
      return { text: `✅ Jo'nash: <b>${escapeHtml(stationName(session.fromCode))}</b>\n\n🏁 <b>Qayerga borasiz?</b>\nTugmadan tanlang yoki yozing.`, kb: ui.stationGrid('wz:t', { page: session.toPage || 0, excludeCode: session.fromCode }) };
    case 'date':
      return { text: `${summary(session)}\n\n📅 <b>Qaysi kunga?</b>`, kb: ui.dateGrid(session.dateOffset || 0, max) };
    case 'car':
      return { text: `${summary(session)}\n\n🚆 <b>Qanday joy kerak?</b>\n<i>(O'rindiqli — Afrosiyob/Sharq; Plaskart, Kupe, Lyuks/SV — uzoq yo'nalishlarda)</i>`, kb: ui.carKeyboard() };
    case 'section':
      return { text: `${summary(session)}\n\n🛋 <b>Qaysi qism?</b>`, kb: ui.sectionKeyboard() };
    case 'berth':
      return { text: `${summary(session)}\n\n🛏 <b>Qaysi o'rin?</b>`, kb: ui.berthKeyboard() };
    case 'qty':
      return { text: `${summary(session)}\n\n👥 <b>Nechta chipta kerak?</b>`, kb: ui.qtyKeyboard() };
    case 'together':
      return { text: `${summary(session)}\n\n🤝 <b>Joylar qanday bo'lsin?</b>`, kb: ui.togetherKeyboard() };
    case 'confirm':
      return { text: `🔔 <b>Kuzatuvni tasdiqlang</b>\n\n${summary(session)}\n\nJoy chiqishi bilan darrov xabar beraman.`, kb: ui.confirmKeyboard() };
    default:
      return { text: ui.WELCOME, kb: ui.mainMenu() };
  }
}

/** Sehrgar xabarini chiqarish: callback bo'lsa — tahrir, matn bo'lsa — yangi xabar */
async function showStep(ctx, session) {
  const { text, kb } = renderStep(session);
  if (ctx.callbackQuery) {
    try {
      const message = await ctx.editMessageText(text, HTML(kb));
      session.chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat?.id;
      session.msgId = message === true ? ctx.callbackQuery.message?.message_id : message.message_id;
      return;
    } catch { /* yangi xabar bilan */ }
  }
  const message = await ctx.replyWithHTML(text, kb);
  session.chatId = message.chat.id;
  session.msgId = message.message_id;
}

/** Matn kiritilgandan keyin saqlangan sehrgar xabarini yangilash */
async function editStoredStep(ctx, session) {
  const { text, kb } = renderStep(session);
  if (session.chatId && session.msgId) {
    try {
      await ctx.telegram.editMessageText(session.chatId, session.msgId, undefined, text, HTML(kb));
      return;
    } catch { /* yangi xabar */ }
  }
  const message = await ctx.replyWithHTML(text, kb);
  session.chatId = message.chat.id;
  session.msgId = message.message_id;
}

/* ------------------------------------------------------------------ */
/*  Sehrgar: tugma bosildi                                             */
/* ------------------------------------------------------------------ */

async function onWizard(ctx, rest) {
  const [action, value] = rest;
  const user = await ensureUser(ctx);
  if (!user) return ctx.answerCbQuery();

  let session = wizard.getSession(ctx.from.id);

  // Varaqlash (sahifa/sana) — sessiya bo'lmasa ham yangisini ochadi
  if (action === 'fp') {
    session = wizard.patchSession(ctx.from.id, { step: 'from', fromPage: Number(value) || 0 });
    await ctx.answerCbQuery();
    return showStep(ctx, session);
  }
  if (action === 'tp') {
    session = wizard.patchSession(ctx.from.id, { step: 'to', toPage: Number(value) || 0 });
    await ctx.answerCbQuery();
    return showStep(ctx, session);
  }
  if (action === 'dp') {
    session = wizard.patchSession(ctx.from.id, { step: 'date', dateOffset: Number(value) || 0 });
    await ctx.answerCbQuery();
    return showStep(ctx, session);
  }

  if (action === 'back') {
    wizard.goBack(ctx.from.id);
    session = wizard.getSession(ctx.from.id);
    await ctx.answerCbQuery();
    if (!session) return showMenu(ctx);
    return showStep(ctx, session);
  }

  if (!session) {
    await ctx.answerCbQuery('Sehrgar muddati tugadi, qaytadan boshlang', { show_alert: true });
    return showMenu(ctx);
  }

  if (action === 'f') {
    session = wizard.patchSession(ctx.from.id, { fromCode: value, step: 'to' });
    await ctx.answerCbQuery();
    return showStep(ctx, session);
  }
  if (action === 't') {
    if (value === session.fromCode) return ctx.answerCbQuery('Jo\'nash va borish bir xil bo\'lmasin');
    session = wizard.patchSession(ctx.from.id, { toCode: value, step: 'date' });
    await ctx.answerCbQuery();
    return showStep(ctx, session);
  }
  if (action === 'd') {
    session = wizard.patchSession(ctx.from.id, { date: value, step: 'car' });
    await ctx.answerCbQuery();
    return showStep(ctx, session);
  }
  if (action === 'c') {
    const next = value === 'platskart' ? 'section' : value === 'kupe' ? 'berth' : 'qty';
    session = wizard.patchSession(ctx.from.id, { carType: value, section: 'any', berth: 'any', step: next });
    await ctx.answerCbQuery();
    return showStep(ctx, session);
  }
  if (action === 'sec') {
    session = wizard.patchSession(ctx.from.id, { section: value, step: 'berth' });
    await ctx.answerCbQuery();
    return showStep(ctx, session);
  }
  if (action === 'brt') {
    session = wizard.patchSession(ctx.from.id, { berth: value, step: 'qty' });
    await ctx.answerCbQuery();
    return showStep(ctx, session);
  }
  if (action === 'q') {
    const quantity = Math.min(4, Math.max(1, Number(value) || 1));
    const needTogether = wizard.isExact({ ...session, quantity }) && quantity > 1;
    session = wizard.patchSession(ctx.from.id, { quantity, together: 'any', step: needTogether ? 'together' : 'confirm' });
    await ctx.answerCbQuery();
    return showStep(ctx, session);
  }
  if (action === 'tg') {
    session = wizard.patchSession(ctx.from.id, { together: value, step: 'confirm' });
    await ctx.answerCbQuery();
    return showStep(ctx, session);
  }
  if (action === 'ok') {
    return finishWizard(ctx, user, session);
  }

  return ctx.answerCbQuery();
}

async function finishWizard(ctx, user, session) {
  const exact = wizard.isExact(session);
  const input = {
    mode: exact ? 'EXACT' : 'ANY',
    fromCode: session.fromCode,
    toCode: session.toCode,
    dates: [session.date],
    quantity: session.quantity || 1,
    carTypes: session.carType && session.carType !== 'any' ? [session.carType] : [],
    section: session.section || 'any',
    berth: session.berth || 'any',
    together: session.together || 'any',
    noToilet: false,
  };

  try {
    await ctx.answerCbQuery('Kuzatuv yoqilmoqda...');
    const { entries, createdCount, reusedCount } = await createWatches(user, input, { sendConfirmation: false });
    wizard.clearSession(ctx.from.id);

    const first = entries[0];
    const lines = [
      createdCount ? '✅ <b>Kuzatuv qo\'shildi!</b>' : (reusedCount ? '🔁 <b>Bu kuzatuv allaqachon bor — qayta yoqildi.</b>' : '✅ <b>Tayyor.</b>'),
      '',
      summary(session),
      '',
    ];
    if (first?.result?.items?.length) {
      lines.push('🎉 <b>Hozirning o\'zida mos joy bor!</b>');
      for (const item of first.result.items.slice(0, 3)) {
        lines.push(trainLine(item.train));
        if (item.suggestions?.length) for (const s of item.suggestions.slice(0, 2)) lines.push(`   ✅ ${suggestionLine(s)}`);
        else for (const car of item.types.slice(0, 3)) lines.push(`   ${typeLine(car)}`);
      }
      lines.push('', `🎫 Sotib olish: <a href="${config.railway.buyUrl}">eticket.railway.uz</a>`);
    } else {
      lines.push('⏳ Hozircha mos joy yo\'q — paydo bo\'lishi bilan darrov xabar beraman 🔔');
    }

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('➕ Yana kuzatuv', 'm:add'), Markup.button.callback('📋 Kuzatuvlarim', 'm:watches')],
      ui.backToMenuRow(),
    ]);
    try {
      await ctx.editMessageText(lines.join('\n'), HTML(keyboard));
    } catch {
      await ctx.replyWithHTML(lines.join('\n'), keyboard);
    }
  } catch (error) {
    const message = error instanceof ValidationError ? error.message : 'Xatolik yuz berdi, qayta urinib ko\'ring';
    if (!(error instanceof ValidationError)) console.error('[bot] sehrgar:', error.message);
    await ctx.answerCbQuery(message, { show_alert: true }).catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/*  Kuzatuvlarim                                                        */
/* ------------------------------------------------------------------ */

function watchDetailText(row) {
  const watch = withLiveState(row);
  const last = watch.lastResult;
  let state = '';
  if (watch.status === 'ACTIVE') {
    if (last?.found) state = '\n\n✅ <b>Hozir mos joy bor!</b>';
    else if (watch.lastError) state = `\n\n⚠️ ${escapeHtml(watch.lastError)}`;
    else if (watch.lastCheckedAt) state = '\n\n⏳ Hozircha mos joy yo\'q';
  }
  return (
    `${STATUS[watch.status] || watch.status} · ${watch.mode === 'EXACT' ? '🎯 Aniq joy' : '🔔 Kuzatuv'}\n\n` +
    `📍 <b>${escapeHtml(watch.fromName)} → ${escapeHtml(watch.toName)}</b>\n` +
    `📅 ${dateLine(watch.date)}\n` +
    `🔎 ${escapeHtml(describeWatch(watch))}` +
    `${state}\n\n<i>${watch.checksCount || 0} marta tekshirildi</i>`
  );
}

async function showWatchList(ctx) {
  const user = await ensureUser(ctx);
  if (!user) return;
  const watches = (await WatchModel.findByUser(user.id)).filter((w) => ['ACTIVE', 'PAUSED', 'FOUND'].includes(w.status));

  if (!watches.length) {
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('➕ Kuzatuv qo\'shish', 'm:add')], ui.backToMenuRow()]);
    const text = 'Sizda hali kuzatuvlar yo\'q.\n\nChipta topilmasa — kuzatuvga qo\'ying, joy chiqishi bilan xabar beraman 🔔';
    if (ctx.callbackQuery) { try { await ctx.editMessageText(text, HTML(keyboard)); return; } catch { /* yangi */ } }
    return ctx.replyWithHTML(text, keyboard);
  }

  const rows = watches.slice(0, 20).map((w) => [
    Markup.button.callback(`${STATUS_DOT[w.status] || ''} ${w.fromName}→${w.toName} · ${ui.shortDate(w.date)}`, `g:open:${w.id}`),
  ]);
  rows.push([Markup.button.callback('➕ Yangi', 'm:add'), ...ui.backToMenuRow()]);
  const keyboard = Markup.inlineKeyboard(rows);
  const text = `📋 <b>Kuzatuvlaringiz</b> (${watches.length} ta)\nBatafsil ko'rish uchun tanlang:`;
  if (ctx.callbackQuery) { try { await ctx.editMessageText(text, HTML(keyboard)); return; } catch { /* yangi */ } }
  return ctx.replyWithHTML(text, keyboard);
}

async function ownedWatch(ctx, id) {
  const user = await UserModel.findByTelegramId(ctx.from.id);
  if (!user) return null;
  const watch = await WatchModel.findOwned(id, user.id);
  return watch ? { watch, user } : null;
}

async function showWatchDetail(ctx, id) {
  const found = await ownedWatch(ctx, id);
  if (!found) return ctx.answerCbQuery('Kuzatuv topilmadi', { show_alert: true });
  await ctx.answerCbQuery().catch(() => {});
  try {
    await ctx.editMessageText(watchDetailText(found.watch), HTML(ui.manageKeyboard(found.watch)));
  } catch {
    await ctx.replyWithHTML(watchDetailText(found.watch), ui.manageKeyboard(found.watch));
  }
}

async function onManage(ctx, action, id) {
  const found = await ownedWatch(ctx, id);
  if (!found) return ctx.answerCbQuery('Kuzatuv topilmadi', { show_alert: true });
  const { watch, user } = found;

  if (action === 'open') return showWatchDetail(ctx, id);

  if (action === 'pause') {
    const updated = await WatchModel.update(watch.id, { status: 'PAUSED' });
    await ctx.answerCbQuery('⏸ To\'xtatildi');
    return ctx.editMessageReplyMarkup(ui.manageKeyboard(updated).reply_markup).catch(() => {});
  }
  if (action === 'resume') {
    const updated = await WatchModel.update(watch.id, { status: 'ACTIVE', lastKeys: [] });
    await ctx.answerCbQuery('▶️ Davom etmoqda');
    return ctx.editMessageReplyMarkup(ui.manageKeyboard(updated).reply_markup).catch(() => {});
  }
  if (action === 'got') {
    await WatchModel.update(watch.id, { status: 'FOUND' });
    await ctx.answerCbQuery('Tabriklaymiz! Oq yo\'l! 🎉');
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('📋 Kuzatuvlarim', 'm:watches'), ...ui.backToMenuRow()]]);
    return ctx.editMessageReplyMarkup(keyboard.reply_markup).catch(() => {});
  }
  if (action === 'del') {
    await WatchModel.update(watch.id, { status: 'CANCELLED' });
    await ctx.answerCbQuery('🗑 O\'chirildi');
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('📋 Kuzatuvlarim', 'm:watches'), ...ui.backToMenuRow()]]);
    return ctx.editMessageText('🗑 Kuzatuv o\'chirildi.', HTML(keyboard)).catch(() => {});
  }
  if (action === 'check') {
    await ctx.answerCbQuery('🔄 Tekshirilmoqda...');
    try {
      const { watch: updated } = await checkWatchNow({ ...watch, user }, { notify: false, markNotified: true });
      return ctx.editMessageText(watchDetailText(updated), HTML(ui.manageKeyboard(updated))).catch(() => {});
    } catch (error) {
      return ctx.answerCbQuery(`Xatolik: ${error.message}`, { show_alert: true }).catch(() => {});
    }
  }
  return ctx.answerCbQuery();
}

/* ------------------------------------------------------------------ */
/*  Poyezd narxlari (mashhur yo'nalishlar)                             */
/* ------------------------------------------------------------------ */

async function showPrices(ctx) {
  const rows = POPULAR_ROUTES.slice(0, 10).map(([from, to]) => [
    Markup.button.callback(`${stationName(from)} → ${stationName(to)}`, `pr:${from}:${to}`),
  ]);
  rows.push(ui.backToMenuRow());
  const text = '🚆 <b>Poyezd narx va jadvali</b>\n\nYo\'nalishni tanlang — bugungi poyezdlar, vaqtlar va narxlarni ko\'rsataman.';
  if (ctx.callbackQuery) { try { await ctx.editMessageText(text, HTML(Markup.inlineKeyboard(rows))); return; } catch { /* yangi */ } }
  return ctx.replyWithHTML(text, Markup.inlineKeyboard(rows));
}

async function showRoutePrices(ctx, from, to) {
  const user = await ensureUser(ctx);
  if (!user) return;
  await ctx.answerCbQuery('Qidirilmoqda...').catch(() => {});
  const date = todayISO();
  try {
    const { trains } = await searchTrains({ from, to, date });
    SearchLogModel.record({ userId: user.id, fromCode: from, toCode: to, date, source: 'bot', trains: trains.length, withSeats: trains.filter((t) => t.totalFree > 0).length });
    const reply = searchReply({ from: stationName(from), to: stationName(to), date, trains });
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔔 Joy chiqsa xabar ber', `qw:${from}:${to}:${date}`)],
      [Markup.button.callback('⬅️ Yo\'nalishlar', 'm:prices'), ...ui.backToMenuRow()],
    ]);
    try { await ctx.editMessageText(reply, HTML(keyboard)); } catch { await ctx.replyWithHTML(reply, keyboard); }
  } catch (error) {
    await ctx.answerCbQuery(`Hozir ma'lumot olib bo'lmadi: ${error.message}`, { show_alert: true }).catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/*  Callback yo'naltirgich                                             */
/* ------------------------------------------------------------------ */

export async function onCallback(ctx) {
  const data = ctx.callbackQuery?.data || '';
  const [prefix, ...rest] = data.split(':');

  try {
    if (prefix === 'noop') return ctx.answerCbQuery();

    if (prefix === 'm') {
      const section = rest[0];
      if (section === 'home') { await ctx.answerCbQuery(); wizard.clearSession(ctx.from.id); return showMenu(ctx); }
      if (section === 'add') {
        await ctx.answerCbQuery();
        const session = wizard.startSession(ctx.from.id);
        return showStep(ctx, session);
      }
      if (section === 'watches') { await ctx.answerCbQuery(); return showWatchList(ctx); }
      if (section === 'prices') { await ctx.answerCbQuery(); return showPrices(ctx); }
      if (section === 'help') { await ctx.answerCbQuery(); return help(ctx); }
      if (section === 'ref') { await ctx.answerCbQuery(); return showReferral(ctx); }
      return ctx.answerCbQuery();
    }

    if (prefix === 'wz') return onWizard(ctx, rest);

    if (prefix === 'g') {
      const [action, id] = rest;
      return onManage(ctx, action, id);
    }

    if (prefix === 'pr') {
      const [from, to] = rest;
      return showRoutePrices(ctx, from, to);
    }

    // Tezkor kuzatuv: qw:<from>:<to>:<date>
    if (prefix === 'qw') {
      const user = await ensureUser(ctx);
      if (!user) return ctx.answerCbQuery();
      const [fromCode, toCode, date] = rest;
      await ctx.answerCbQuery('Kuzatuv yoqilmoqda...');
      await createWatches(user, { mode: 'ANY', fromCode, toCode, dates: [date], quantity: 1, carTypes: [] });
      return ctx.reply('🔔 Kuzatuv yoqildi — joy chiqishi bilan xabar beraman.', Markup.inlineKeyboard([[Markup.button.callback('📋 Kuzatuvlarim', 'm:watches'), ...ui.backToMenuRow()]])).catch(() => {});
    }

    return ctx.answerCbQuery();
  } catch (error) {
    const message = error instanceof ValidationError ? error.message : 'Xatolik yuz berdi';
    if (!(error instanceof ValidationError)) console.error('[bot] callback:', error.message);
    return ctx.answerCbQuery(message, { show_alert: true }).catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/*  Oddiy matn — sehrgarda stansiya nomi yoki tezkor qidiruv          */
/* ------------------------------------------------------------------ */

export async function onText(ctx) {
  const text = ctx.message?.text?.trim() || '';
  if (!text || text.startsWith('/')) return;

  const user = await ensureUser(ctx);
  if (!user) return;

  // Sehrgarda stansiya bosqichida bo'lsa — nomdan topamiz
  const session = wizard.getSession(ctx.from.id);
  if (session && (session.step === 'from' || session.step === 'to')) {
    const match = searchStations(text, 1)[0];
    if (!match) return ctx.replyWithHTML('Bunday bekat topilmadi. Boshqacha yozib ko\'ring yoki tugmadan tanlang.');
    if (session.step === 'from') {
      wizard.patchSession(ctx.from.id, { fromCode: match.code, step: 'to' });
    } else {
      if (match.code === session.fromCode) return ctx.reply('Jo\'nash va borish bir xil bo\'lmasin. Boshqa bekat yozing.');
      wizard.patchSession(ctx.from.id, { toCode: match.code, step: 'date' });
    }
    return editStoredStep(ctx, wizard.getSession(ctx.from.id));
  }

  // Aks holda — tezkor qidiruv
  const query = parseQuery(text);
  if (!query.ok) {
    const hint = query.reason === 'one-station'
      ? `Faqat bitta bekat tushundim: <b>${escapeHtml(query.from.nameUz)}</b>. Qayerga borasiz?\n\n`
      : 'Qidirish uchun jo\'nash va borish shaharlarini yozing yoki menyudan tanlang.\n\n';
    return ctx.replyWithHTML(`${hint}Masalan: <code>Toshkent Samarqand ertaga</code>`, ui.mainMenu());
  }

  await ctx.sendChatAction('typing').catch(() => {});
  const { from, to, date } = query;
  try {
    const { trains } = await searchTrains({ from: from.code, to: to.code, date });
    SearchLogModel.record({ userId: user.id, fromCode: from.code, toCode: to.code, date, source: 'bot', trains: trains.length, withSeats: trains.filter((t) => t.totalFree > 0).length });
    const reply = searchReply({ from: from.nameUz, to: to.nameUz, date, trains });
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔔 Joy chiqsa xabar ber', `qw:${from.code}:${to.code}:${date}`)],
      [Markup.button.callback('➕ Aniq kuzatuv', 'm:add'), ...ui.backToMenuRow()],
    ]);
    await ctx.replyWithHTML(reply, keyboard);
  } catch (error) {
    SearchLogModel.record({ userId: user.id, fromCode: from.code, toCode: to.code, date, source: 'bot', ok: false });
    await ctx.replyWithHTML(`⚠️ Hozir ma'lumot olib bo'lmadi: ${escapeHtml(error.message)}\n\nBirozdan so'ng qayta urinib ko'ring.`);
  }
}

export default { start, help, myWatches: showWatchList, onCallback, onText };
