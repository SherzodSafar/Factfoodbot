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
import { regionName, normalizeRegion } from '../services/personal.js';
import { searchReply, describeWatch, dateLine, trainLine, typeLine, suggestionLine } from '../services/format.js';
import { createWatches, ValidationError } from '../services/watchService.js';
import { checkWatchNow, withLiveState } from '../services/watcher.js';
import { getSettings } from '../services/settings.js';
import { parseQuery } from '../services/queryParser.js';
import { todayISO } from '../utils/dates.js';
import { escapeHtml, formatMoney } from '../utils/text.js';
import ui from '../services/botUi.js';
import wizard from '../services/botWizard.js';
import flow from '../services/botFlow.js';
import accountService from '../services/accountService.js';
import { accountWebAppUrl } from '../core/bot.js';

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
  '📋 <b>Kuzatuvlarim</b> — faol kuzatuvlarni boshqarish.\n' +
  '🔐 <b>Akkaunt</b> — eticket hisobini ulash, yo\'lovchilarni shifrlab saqlash (parol saqlanmaydi).\n' +
  '🧾 <b>Bronlarim</b> — buyurtmalar va bot ichida Payme/Click to\'lov so\'rovi.\n\n' +
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
/*  Akkaunt va ma'lumotlar                                              */
/* ------------------------------------------------------------------ */

async function accountScreen(ctx) {
  const user = await ensureUser(ctx);
  if (!user) return null;
  const [status, passengers, payMethod] = await Promise.all([
    accountService.getAccountStatus(user.id),
    accountService.listPassengers(user.id).catch(() => []),
    accountService.getPaymentMethod(user.id).catch(() => ({})),
  ]);
  const url = accountWebAppUrl();

  const lines = ['🔐 <b>Akkaunt va ma\'lumotlar</b>', '<i>Joy chiqqanda tez bron qilish uchun</i>', ''];
  if (!status.features.vaultReady) {
    lines.push('⚠️ Server shifrlash kaliti hali sozlanmagan — bu bo\'lim vaqtincha ishlamaydi.');
  } else if (!status.features.accountEnabled) {
    lines.push('⚠️ Akkaunt ulash xizmati vaqtincha o\'chirilgan.');
  } else if (status.connected) {
    const payLine = payMethod?.provider
      ? `💳 To'lov: ${payMethod.provider === 'payme' ? 'Payme' : 'Click'}${payMethod.phoneMasked ? ` · ${payMethod.phoneMasked}` : ''}`
      : '💳 To\'lov usuli sozlanmagan';
    lines.push(
      '✅ <b>Akkaunt ulangan</b>',
      `📱 ${escapeHtml(status.loginMasked || '')}`,
      `👤 Saqlangan yo'lovchilar: <b>${passengers.length}</b>`,
      payLine,
      '',
      '🔒 Parolingiz saqlanmaydi. To\'lovni har doim o\'zingiz tasdiqlaysiz.',
    );
  } else {
    if (status.status === 'EXPIRED') lines.push('⚠️ Kirish muddati tugagan — qaytadan ulang.', '');
    lines.push(
      'Bu yerda eticket.railway.uz hisobingizni ulaysiz, yo\'lovchilarni saqlaysiz va bron uchun to\'lov so\'rovini yuborasiz.',
      '',
      '🔒 Parol <b>saqlanmaydi</b>, faqat kirish tokeni <b>shifrlangan</b> holda saqlanadi.',
    );
  }
  return { text: lines.join('\n'), keyboard: ui.accountKeyboard(status, url, { payMethod }) };
}

async function showAccount(ctx) {
  const screen = await accountScreen(ctx);
  if (!screen) return undefined;
  if (ctx.callbackQuery) {
    try { await ctx.editMessageText(screen.text, HTML(screen.keyboard)); return undefined; } catch { /* yangi */ }
  }
  return ctx.replyWithHTML(screen.text, screen.keyboard);
}

async function showOrders(ctx) {
  const user = await ensureUser(ctx);
  if (!user) return undefined;
  const url = accountWebAppUrl();
  const status = await accountService.getAccountStatus(user.id);

  const lines = ['🧾 <b>Mening bronlarim</b>', ''];
  if (!status.connected) {
    lines.push('Buyurtmalarni ko\'rish uchun avval eticket akkauntingizni ulang.');
    const keyboard = ui.ordersKeyboard(status, url);
    if (ctx.callbackQuery) { try { await ctx.editMessageText(lines.join('\n'), HTML(keyboard)); return undefined; } catch { /* yangi */ } }
    return ctx.replyWithHTML(lines.join('\n'), keyboard);
  }

  const payButtons = [];
  try {
    const orders = await accountService.listOrders(user.id);
    if (!orders.length) {
      lines.push('Faol buyurtma topilmadi.', '', 'Chipta topilganda kuzatuv xabaridan yoki saytdan bron qiling.');
    } else {
      for (const order of orders.slice(0, 10)) {
        const paid = !order.payable;
        const route = [order.from, order.to].filter(Boolean).join(' → ');
        lines.push(
          `${paid ? '✅' : '⏳'} <b>№ ${escapeHtml(order.orderId)}</b>${order.amount ? ` · ${formatMoney(order.amount)}` : ''}`,
          `   ${escapeHtml(order.trainNumber || '')}${route ? ` · ${escapeHtml(route)}` : ''}${order.date ? ` · ${escapeHtml(order.date)}` : ''}${paid ? '' : ' · <i>to\'lov kutilmoqda</i>'}`,
        );
        if (order.payable) payButtons.push([Markup.button.callback(`💳 № ${order.orderId} to'lash`, `pay:o:${order.orderId}`)]);
      }
      if (payButtons.length) lines.push('', '💳 To\'lov so\'rovi uchun buyurtmani tanlang:');
    }
  } catch (error) {
    lines.push(`⚠️ Buyurtmalarni olib bo'lmadi: ${escapeHtml(error.message)}`);
  }
  const base = ui.ordersKeyboard(status, url);
  const keyboard = payButtons.length
    ? Markup.inlineKeyboard([...payButtons, ...base.reply_markup.inline_keyboard])
    : base;
  if (ctx.callbackQuery) { try { await ctx.editMessageText(lines.join('\n'), HTML(keyboard)); return undefined; } catch { /* yangi */ } }
  return ctx.replyWithHTML(lines.join('\n'), keyboard);
}

async function disconnectAccount(ctx) {
  const user = await ensureUser(ctx);
  if (!user) return ctx.answerCbQuery();
  await accountService.disconnectAccount(user.id, { wipePassengers: false });
  flow.clearFlow(ctx.from.id);
  await ctx.answerCbQuery('Akkaunt uzildi');
  return showAccount(ctx);
}

/* -------- Inline akkaunt ulash (login/parol botda) ---------------- */

async function startConnect(ctx) {
  const user = await ensureUser(ctx);
  if (!user) return ctx.answerCbQuery();
  const status = await accountService.getAccountStatus(user.id);
  if (!status.features.accountEnabled) return ctx.answerCbQuery('Xizmat vaqtincha o\'chirilgan', { show_alert: true });
  flow.startFlow(ctx.from.id, 'acc', 'login', {});
  await ctx.answerCbQuery();
  const text = '🔗 <b>eticket.railway.uz akkauntini ulash</b>\n\n1) Telefon raqami yoki emailingizni yuboring.\n\n<i>Masalan:</i> <code>+998 90 123 45 67</code>  <i>yoki</i>  <code>misol@gmail.com</code>';
  try { await ctx.editMessageText(text, HTML(ui.cancelFlowKeyboard())); } catch { await ctx.replyWithHTML(text, ui.cancelFlowKeyboard()); }
}

async function finishConnect(ctx) {
  const user = await ensureUser(ctx);
  if (!user) return ctx.answerCbQuery();
  const active = flow.getFlow(ctx.from.id);
  if (!active || active.type !== 'acc' || !active.data.login || !active.data.password) {
    await ctx.answerCbQuery('Ma\'lumot to\'liq emas, qaytadan boshlang', { show_alert: true });
    return showAccount(ctx);
  }
  await ctx.answerCbQuery('Ulanmoqda...');
  try {
    await accountService.connectAccount(user.id, { login: active.data.login, password: active.data.password, consent: true });
    flow.clearFlow(ctx.from.id);
    return showAccount(ctx);
  } catch (error) {
    flow.clearFlow(ctx.from.id);
    const msg = error instanceof ValidationError ? error.message : 'Ulab bo\'lmadi. Qaytadan urinib ko\'ring.';
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔁 Qaytadan', 'acc:connect')], ui.backToMenuRow()]);
    try { await ctx.editMessageText(`⚠️ ${escapeHtml(msg)}`, HTML(keyboard)); } catch { await ctx.replyWithHTML(`⚠️ ${escapeHtml(msg)}`, keyboard); }
    return undefined;
  }
}

/* -------- Inline to'lov usuli (default provider + telefon) --------- */

async function showPayMethod(ctx) {
  const user = await ensureUser(ctx);
  if (!user) return ctx.answerCbQuery();
  const status = await accountService.getAccountStatus(user.id);
  if (!status.connected) { await ctx.answerCbQuery('Avval akkauntni ulang', { show_alert: true }); return showAccount(ctx); }
  const method = await accountService.getPaymentMethod(user.id);
  const text =
    '💳 <b>To\'lov usuli</b>\n\n' +
    'Avto-bron va tezkor to\'lov uchun to\'lov tizimi va telefon raqamini sozlang. ' +
    'So\'rov shu ilovaga yuboriladi, to\'lovni o\'zingiz tasdiqlaysiz.\n\n' +
    `Hozir: <b>${method.provider ? (method.provider === 'payme' ? 'Payme' : 'Click') : '—'}</b>${method.phoneMasked ? ` · ${escapeHtml(method.phoneMasked)}` : ''}`;
  await ctx.answerCbQuery();
  try { await ctx.editMessageText(text, HTML(ui.payMethodKeyboard(method))); } catch { await ctx.replyWithHTML(text, ui.payMethodKeyboard(method)); }
}

async function setPayProvider(ctx, provider) {
  const user = await ensureUser(ctx);
  if (!user) return ctx.answerCbQuery();
  try {
    await accountService.setPaymentMethod(user.id, { provider });
    await ctx.answerCbQuery(`${provider === 'payme' ? 'Payme' : 'Click'} tanlandi`);
  } catch (error) {
    return ctx.answerCbQuery(error.message, { show_alert: true });
  }
  return showPayMethod(ctx);
}

async function startPayPhone(ctx) {
  const user = await ensureUser(ctx);
  if (!user) return ctx.answerCbQuery();
  flow.startFlow(ctx.from.id, 'payphone', 'phone', {});
  await ctx.answerCbQuery();
  const text = '📱 Payme/Click\'ga bog\'langan telefon raqamini yuboring.\n\n<i>Masalan:</i> <code>90 123 45 67</code>';
  try { await ctx.editMessageText(text, HTML(ui.cancelFlowKeyboard())); } catch { await ctx.replyWithHTML(text, ui.cancelFlowKeyboard()); }
}

/* -------- Inline yo'lovchilar ------------------------------------- */

async function showPassengers(ctx) {
  const user = await ensureUser(ctx);
  if (!user) return ctx.answerCbQuery();
  const passengers = await accountService.listPassengers(user.id).catch(() => []);
  const lines = ['👤 <b>Saqlangan yo\'lovchilar</b>', ''];
  if (!passengers.length) lines.push('Hali yo\'lovchi qo\'shilmagan.');
  else for (const p of passengers) lines.push(`• ${p.label ? `<b>${escapeHtml(p.label)}</b> · ` : ''}${escapeHtml(p.name)} · ${escapeHtml(p.doc)}${p.categoryLabel ? ` · ${p.categoryLabel}` : ''}`);
  lines.push('', '🔒 Ma\'lumotlar shifrlangan, faqat niqoblangan ko\'rinishda.');
  const keyboard = ui.passengersKeyboard(passengers);
  if (ctx.callbackQuery) { await ctx.answerCbQuery(); try { await ctx.editMessageText(lines.join('\n'), HTML(keyboard)); return undefined; } catch { /* yangi */ } }
  return ctx.replyWithHTML(lines.join('\n'), keyboard);
}

const PASS_PROMPTS = {
  first: '👤 <b>Yangi yo\'lovchi</b>\n\n1/6 — Ismni yuboring (hujjatdagidek):',
  last: '2/6 — Familiyani yuboring:',
  doc: '3/6 — Pasport yoki ID seriya va raqamini yuboring:\n<i>Masalan:</i> <code>AA1234567</code>',
  birth: '4/6 — Tug\'ilgan sanani yuboring:\n<i>Format:</i> <code>YYYY-MM-DD</code> (masalan <code>1990-05-01</code>)',
};

async function startPassengerAdd(ctx) {
  const user = await ensureUser(ctx);
  if (!user) return ctx.answerCbQuery();
  if (!user) return undefined;
  const status = await accountService.getAccountStatus(user.id);
  if (!status.features.passengersEnabled) return ctx.answerCbQuery('Shifrlash kaliti sozlanmagan', { show_alert: true });
  flow.startFlow(ctx.from.id, 'pass', 'first', {});
  await ctx.answerCbQuery();
  try { await ctx.editMessageText(PASS_PROMPTS.first, HTML(ui.cancelFlowKeyboard())); } catch { await ctx.replyWithHTML(PASS_PROMPTS.first, ui.cancelFlowKeyboard()); }
}

function passengerSummary(data) {
  return [
    '👤 <b>Yangi yo\'lovchi</b>',
    '',
    `Ism: <b>${escapeHtml(data.firstName)}</b>`,
    `Familiya: <b>${escapeHtml(data.lastName)}</b>`,
    `Hujjat: <b>${escapeHtml(data.docNumber)}</b>`,
    `Tug'ilgan sana: <b>${escapeHtml(data.birthDate)}</b>`,
    `Jinsi: <b>${data.gender === 'F' ? 'Ayol' : 'Erkak'}</b>`,
    `Viloyat: <b>${data.region ? escapeHtml(regionName(data.region)) : 'ko\'rsatilmagan'}</b>`,
    '',
    '🔒 Shifrlab saqlanadi. Tasdiqlang:',
  ].join('\n');
}

async function setPassengerGender(ctx, gender) {
  const active = flow.getFlow(ctx.from.id);
  if (!active || active.type !== 'pass') return ctx.answerCbQuery();
  flow.patchFlow(ctx.from.id, { step: 'region', data: { gender } });
  await ctx.answerCbQuery();
  const text = '6/6 — Yo\'lovchining <b>viloyati</b>ni tanlang (pasport bo\'yicha). Bron qilishda kerak bo\'ladi:';
  try { await ctx.editMessageText(text, HTML(ui.regionKeyboard())); } catch { await ctx.replyWithHTML(text, ui.regionKeyboard()); }
}

async function setPassengerRegion(ctx, code) {
  const active = flow.getFlow(ctx.from.id);
  if (!active || active.type !== 'pass') return ctx.answerCbQuery();
  flow.patchFlow(ctx.from.id, { step: 'confirm', data: { region: normalizeRegion(code) } });
  await ctx.answerCbQuery();
  const updated = flow.getFlow(ctx.from.id);
  try { await ctx.editMessageText(passengerSummary(updated.data), HTML(ui.passengerConsentKeyboard())); } catch { await ctx.replyWithHTML(passengerSummary(updated.data), ui.passengerConsentKeyboard()); }
}

async function savePassenger(ctx) {
  const user = await ensureUser(ctx);
  if (!user) return ctx.answerCbQuery();
  const active = flow.getFlow(ctx.from.id);
  if (!active || active.type !== 'pass') { await ctx.answerCbQuery('Muddati tugadi', { show_alert: true }); return showPassengers(ctx); }
  await ctx.answerCbQuery('Saqlanmoqda...');
  try {
    await accountService.addPassenger(user.id, { ...active.data, consent: true });
    flow.clearFlow(ctx.from.id);
    return showPassengers(ctx);
  } catch (error) {
    const msg = error instanceof ValidationError ? error.message : 'Saqlab bo\'lmadi';
    return ctx.answerCbQuery(msg, { show_alert: true });
  }
}

async function deletePassengerBot(ctx, id) {
  const user = await ensureUser(ctx);
  if (!user) return ctx.answerCbQuery();
  try { await accountService.removePassenger(user.id, id); await ctx.answerCbQuery('O\'chirildi'); }
  catch (error) { await ctx.answerCbQuery(error.message, { show_alert: true }); }
  return showPassengers(ctx);
}

/* -------- Inline buyurtma to'lovi --------------------------------- */

async function startOrderPay(ctx, orderId) {
  const user = await ensureUser(ctx);
  if (!user) return ctx.answerCbQuery();
  const method = await accountService.getPaymentMethod(user.id);
  await ctx.answerCbQuery();
  const hint = method.phoneMasked ? `\n\nTelefon: <b>${escapeHtml(method.phoneMasked)}</b> (sozlamalardan o'zgartirish mumkin)` : '\n\n⚠️ Telefon sozlanmagan — Akkaunt → To\'lov usulidan kiriting.';
  const text = `💳 <b>№ ${escapeHtml(orderId)}</b> uchun to'lov usulini tanlang:${hint}`;
  try { await ctx.editMessageText(text, HTML(ui.orderPayKeyboard(orderId))); } catch { await ctx.replyWithHTML(text, ui.orderPayKeyboard(orderId)); }
}

async function doOrderPay(ctx, orderId, provider) {
  const user = await ensureUser(ctx);
  if (!user) return ctx.answerCbQuery();
  const method = await accountService.getPaymentMethod(user.id);
  if (!method.phone) { await ctx.answerCbQuery('Avval telefonni sozlang', { show_alert: true }); return showPayMethod(ctx); }
  await ctx.answerCbQuery('So\'rov yuborilmoqda...');
  try {
    await accountService.requestPayment(user.id, { orderId, provider, phone: method.phone, consent: true });
    const text = `✅ <b>${provider === 'payme' ? 'Payme' : 'Click'}</b> ilovangizga to'lov so'rovi yuborildi (${escapeHtml(method.phoneMasked || '')}).\n\nIlovada tasdiqlang. Bron ~10 daqiqada to'lanmasa bekor bo'ladi.`;
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🧾 Bronlarim', 'm:orders'), ...ui.backToMenuRow()]]);
    try { await ctx.editMessageText(text, HTML(keyboard)); } catch { await ctx.replyWithHTML(text, keyboard); }
  } catch (error) {
    const msg = error instanceof ValidationError ? error.message : 'To\'lov so\'rovini yuborib bo\'lmadi';
    await ctx.answerCbQuery(msg, { show_alert: true }).catch(() => {});
  }
  return undefined;
}

/* -------- Inline avto-bron sozlamasi ------------------------------ */

async function showAutoBook(ctx, watchId) {
  const user = await ensureUser(ctx);
  if (!user) return ctx.answerCbQuery();
  const watch = await WatchModel.findOwned(watchId, user.id);
  if (!watch) return ctx.answerCbQuery('Kuzatuv topilmadi', { show_alert: true });
  const status = await accountService.getAccountStatus(user.id);

  const lines = ['🤖 <b>Avtomatik bron</b>', '', `📍 ${escapeHtml(watch.fromName)} → ${escapeHtml(watch.toName)} · ${dateLine(watch.date)}`, ''];
  lines.push(
    'Joy chiqishi bilan bot <b>o\'zi joyni band qiladi</b> (eticketda saqlangan yo\'lovchingiz bilan) ',
    'va <b>to\'lov so\'rovini Payme/Click\'ga</b> saqlangan raqamingizga yuboradi. Siz ilovada tasdiqlaysiz — joy ~12 daqiqa ushlanadi.',
    '',
  );
  if (!status.connected) {
    lines.push('⚠️ Avval eticket akkauntingizni ulang (🔐 Akkaunt).');
  } else {
    const pm = await accountService.getPaymentMethod(user.id).catch(() => ({ provider: null, phoneMasked: null }));
    const provName = pm.provider === 'payme' ? 'Payme' : pm.provider === 'click' ? 'Click' : null;
    if (provName && pm.phoneMasked) {
      lines.push(`💳 To'lov: <b>${provName}</b> · ${escapeHtml(pm.phoneMasked)}`);
    } else {
      lines.push('💳 To\'lov uchun telefon raqami saqlanmagan — "Akkaunt → To\'lov usuli" dan Click (yoki Payme) raqamingizni saqlang. (Saqlanmasa bot joyni band qiladi, to\'lovni o\'zingiz qilasiz.)');
    }
    lines.push('');
    if (watch.autoBook) {
      lines.push('✅ <b>Avto-bron yoqilgan.</b>', `Holat: ${escapeHtml(watch.autoBookStatus || 'kutilmoqda')}`);
    } else {
      lines.push(`Yoqish uchun eticketda kamida <b>${watch.quantity}</b> ta yo'lovchi saqlangan bo'lishi kerak. "Yoqish" ni bosganda tekshiraman.`);
    }
  }
  await ctx.answerCbQuery();
  try { await ctx.editMessageText(lines.join('\n'), HTML(ui.autoBookKeyboard(watch))); } catch { await ctx.replyWithHTML(lines.join('\n'), ui.autoBookKeyboard(watch)); }
}

async function toggleAutoBook(ctx, watchId, on) {
  const user = await ensureUser(ctx);
  if (!user) return ctx.answerCbQuery();
  try {
    await accountService.setAutoBook(user.id, watchId, { enabled: on });
    await ctx.answerCbQuery(on ? '🤖 Avto-bron yoqildi' : 'Avto-bron o\'chirildi');
  } catch (error) {
    return ctx.answerCbQuery(error.message, { show_alert: true });
  }
  return showAutoBook(ctx, watchId);
}

async function cancelFlow(ctx) {
  flow.clearFlow(ctx.from.id);
  await ctx.answerCbQuery('Bekor qilindi');
  return showAccount(ctx);
}

/* -------- Faol oqimda matn kiritilganda --------------------------- */

async function handleFlowText(ctx, active, text) {
  const id = ctx.from.id;

  if (active.type === 'acc') {
    if (active.step === 'login') {
      flow.patchFlow(id, { step: 'password', data: { login: text } });
      await ctx.deleteMessage().catch(() => {});
      return ctx.replyWithHTML('2) Endi <b>parolingizni</b> yuboring.\n\n🔒 Parol saqlanmaydi va xabaringiz darhol o\'chiriladi.', ui.cancelFlowKeyboard());
    }
    if (active.step === 'password') {
      flow.patchFlow(id, { step: 'consent', data: { password: text } });
      await ctx.deleteMessage().catch(() => {});
      const d = flow.getFlow(id)?.data || {};
      const masked = d.login ? escapeHtml(d.login) : '';
      return ctx.replyWithHTML(
        `Ulashga tayyor:\n📱 <b>${masked}</b>\n\n`
        + '«Botga o\'z nomimdan eticket.railway.uz da joy bron qilishga ruxsat beraman. Parolim saqlanmasligini va faqat kirish tokeni shifrlangan holda saqlanishini tushundim.»',
        ui.connectConsentKeyboard(),
      );
    }
    return undefined;
  }

  if (active.type === 'payphone') {
    try {
      const user = await ensureUser(ctx);
      if (!user) return undefined;
      const method = await accountService.setPaymentMethod(user.id, { phone: text });
      flow.clearFlow(id);
      return ctx.replyWithHTML(`✅ Telefon saqlandi: <b>${escapeHtml(method.phoneMasked || '')}</b>`, Markup.inlineKeyboard([[Markup.button.callback('💳 To\'lov usuli', 'acc:pay'), Markup.button.callback('🔐 Akkaunt', 'm:account')]]));
    } catch (error) {
      const msg = error instanceof ValidationError ? error.message : 'Saqlab bo\'lmadi';
      return ctx.replyWithHTML(`⚠️ ${escapeHtml(msg)}`, ui.cancelFlowKeyboard());
    }
  }

  if (active.type === 'pass') {
    const order = ['first', 'last', 'doc', 'birth'];
    const field = { first: 'firstName', last: 'lastName', doc: 'docNumber', birth: 'birthDate' };
    const step = active.step;
    if (order.includes(step)) {
      // Oddiy validatsiya: sana bosqichida ISO tekshiramiz
      if (step === 'birth' && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return ctx.replyWithHTML('Sana formati noto\'g\'ri. <code>YYYY-MM-DD</code> ko\'rinishida yuboring (masalan 1990-05-01).', ui.cancelFlowKeyboard());
      }
      flow.patchFlow(id, { data: { [field[step]]: text } });
      const nextIndex = order.indexOf(step) + 1;
      if (nextIndex < order.length) {
        const nextStep = order[nextIndex];
        flow.patchFlow(id, { step: nextStep });
        return ctx.replyWithHTML(PASS_PROMPTS[nextStep], ui.cancelFlowKeyboard());
      }
      // birth to'ldirildi → jins tanlash
      flow.patchFlow(id, { step: 'gender' });
      return ctx.replyWithHTML('5/6 — Jinsini tanlang:', ui.genderKeyboard());
    }
    return undefined;
  }

  return undefined;
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
      if (section === 'account') { await ctx.answerCbQuery(); return showAccount(ctx); }
      if (section === 'orders') { await ctx.answerCbQuery('Yuklanmoqda...'); return showOrders(ctx); }
      if (section === 'help') { await ctx.answerCbQuery(); return help(ctx); }
      if (section === 'ref') { await ctx.answerCbQuery(); return showReferral(ctx); }
      return ctx.answerCbQuery();
    }

    if (prefix === 'wz') return onWizard(ctx, rest);

    if (prefix === 'acc') {
      const action = rest[0];
      if (action === 'connect' && rest[1] === 'go') return finishConnect(ctx);
      if (action === 'connect') return startConnect(ctx);
      if (action === 'pay' && (rest[1] === 'payme' || rest[1] === 'click')) return setPayProvider(ctx, rest[1]);
      if (action === 'pay') return showPayMethod(ctx);
      if (action === 'payphone') return startPayPhone(ctx);
      if (action === 'disc' && rest[1] !== 'yes') {
        await ctx.answerCbQuery();
        try { await ctx.editMessageText('🔌 <b>Akkauntni uzasizmi?</b>\n\nKirish tokeni o\'chiriladi. Saqlangan yo\'lovchilar qoladi.', HTML(ui.disconnectConfirmKeyboard())); } catch { /* yangi */ }
        return undefined;
      }
      if (action === 'disc' && rest[1] === 'yes') return disconnectAccount(ctx);
      return ctx.answerCbQuery();
    }

    if (prefix === 'pass') {
      const action = rest[0];
      if (action === 'list') return showPassengers(ctx);
      if (action === 'add') return startPassengerAdd(ctx);
      if (action === 'g') return setPassengerGender(ctx, rest[1]);
      if (action === 'r') return setPassengerRegion(ctx, rest[1] || '');
      if (action === 'save') return savePassenger(ctx);
      if (action === 'del') return deletePassengerBot(ctx, rest[1]);
      return ctx.answerCbQuery();
    }

    if (prefix === 'pay') {
      const action = rest[0];
      if (action === 'o') return startOrderPay(ctx, rest[1]);
      if (action === 'go') return doOrderPay(ctx, rest[1], rest[2]);
      return ctx.answerCbQuery();
    }

    if (prefix === 'ab') {
      const action = rest[0];
      if (action === 'on') return toggleAutoBook(ctx, rest[1], true);
      if (action === 'off') return toggleAutoBook(ctx, rest[1], false);
      return showAutoBook(ctx, action); // ab:<watchId>
    }

    if (prefix === 'flow' && rest[0] === 'cancel') return cancelFlow(ctx);

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

  // Faol inline oqim (akkaunt ulash, yo'lovchi qo'shish, to'lov telefoni) matn kutmoqda
  const active = flow.getFlow(ctx.from.id);
  if (active) return handleFlowText(ctx, active, text);

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

export default { start, help, myWatches: showWatchList, myAccount: showAccount, myOrders: showOrders, onCallback, onText };
