/**
 * Botdagi admin panel (/admin).
 *
 * Kirish: ADMIN_TELEGRAM_IDS (vergul bilan) yoki bir marta "/admin <veb admin paroli>" —
 * shundan keyin Telegram ID bazada saqlanadi (Setting "botAdmins") va parol so'ralmaydi.
 * Standart parol (admin123) bilan kirish o'chirilgan.
 */
import { Markup } from 'telegraf';
import { raw } from '../i18n/index.js';
import config from '../config/default.js';
import prisma, { isDatabaseReady } from '../database/connection.js';
import UserModel from '../models/User.js';
import WatchModel from '../models/Watch.js';
import NotificationModel from '../models/Notification.js';
import SearchLogModel from '../models/SearchLog.js';
import { passwordMatches } from '../middlewares/auth.middleware.js';
import { getWatcherStatus, triggerSoon, waitCycle } from '../services/watcher.js';
import { getRailwayStatus } from '../core/railway.js';
import { getSettings, updateSettings } from '../services/settings.js';
import { startBroadcast, getBroadcastStatus } from '../services/broadcast.js';
import { getRoutePricesStatus } from '../services/routePrices.js';
import { uzsRate } from '../services/exchangeRates.js';
import { stationName } from '../services/stations.js';
import { escapeHtml } from '../utils/text.js';
import { listVoices, findVoice, addVoice, setActiveVoice, removeVoice } from '../services/appVoices.js';

const KEY = 'botAdmins';
const HTML = (kb) => ({ parse_mode: 'HTML', ...kb });
let admins = null;
const attempts = new Map(); // noto'g'ri parol urinishlari (1 soatda 5 ta)
const pending = new Map(); // e'lon matni kutilmoqda / tasdiqlanmoqda

async function loadAdmins() {
  if (admins) return admins;
  admins = new Set(String(process.env.ADMIN_TELEGRAM_IDS || '').split(',').map((id) => id.trim()).filter(Boolean));
  try {
    const row = isDatabaseReady() ? await prisma.setting.findUnique({ where: { key: KEY } }) : null;
    for (const id of row?.value?.ids || []) admins.add(String(id));
  } catch { /* faqat ADMIN_TELEGRAM_IDS */ }
  return admins;
}

export async function isBotAdmin(id) {
  return id ? (await loadAdmins()).has(String(id)) : false;
}

async function addAdmin(id) {
  const set = await loadAdmins();
  set.add(String(id));
  const value = { ids: [...set] };
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

/* ------------------------------ Ekranlar ------------------------------ */

const back = () => [Markup.button.callback('⬅️ Admin panel', 'adm:menu')];

function menu() {
  return {
    text: '🛠 <b>Admin panel</b>\n\nBot holati, statistika, sozlamalar va e\'lonlar.',
    kb: Markup.inlineKeyboard([
      [Markup.button.callback('📊 Statistika', 'adm:stats'), Markup.button.callback('🩺 Tizim holati', 'adm:sys')],
      [Markup.button.callback('⚙️ Sozlamalar', 'adm:set'), Markup.button.callback('📢 E\'lon yuborish', 'adm:bc')],
      [Markup.button.callback('🔊 Ovozli xabarlar (ilova)', 'adm:voice')],
      [Markup.button.callback('🔄 Kuzatuvlarni hozir tekshirish', 'adm:run')],
      [Markup.button.callback('🏠 Asosiy menyu', 'm:home')],
    ]),
  };
}

async function stats() {
  if (!isDatabaseReady()) return { text: '⚠️ Baza ulanmagan.', kb: Markup.inlineKeyboard([back()]) };
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [users, usersToday, active, byStatus, found, foundToday, searchesToday, popular] = await Promise.all([
    UserModel.count(),
    UserModel.count({ createdAt: { gte: today } }),
    UserModel.count({ lastSeenAt: { gte: weekAgo } }),
    WatchModel.groupByStatus(),
    NotificationModel.count({ kind: 'found' }),
    NotificationModel.count({ kind: 'found', createdAt: { gte: today } }),
    SearchLogModel.count({ createdAt: { gte: today } }),
    SearchLogModel.popularRoutes({ since: new Date(Date.now() - 30 * 86_400_000), take: 5 }),
  ]);
  const watches = Object.fromEntries(byStatus.map((row) => [row.status, row._count._all]));
  const lines = [
    '📊 <b>Statistika</b>',
    '',
    `👥 Foydalanuvchilar: <b>${users}</b> (bugun +${usersToday}, 7 kunda faol: ${active})`,
    `🔔 Kuzatuvlar: faol <b>${watches.ACTIVE || 0}</b>, to'xtatilgan ${watches.PAUSED || 0}, topilgan ${watches.FOUND || 0}`,
    `🎉 Chipta topildi xabarlari: <b>${found}</b> (bugun ${foundToday})`,
    `🔎 Bugungi qidiruvlar: ${searchesToday}`,
  ];
  if (popular.length) {
    lines.push('', '🚆 <b>Mashhur yo\'nalishlar (30 kun):</b>');
    for (const route of popular) lines.push(`• ${escapeHtml(stationName(route.fromCode))} → ${escapeHtml(stationName(route.toCode))} — ${route.count}`);
  }
  return { text: lines.join('\n'), kb: Markup.inlineKeyboard([[Markup.button.callback('🔄 Yangilash', 'adm:stats')], back()]) };
}

const ago = (iso) => (iso ? `${Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))} daq oldin` : '—');

function system() {
  const watcher = getWatcherStatus();
  const railway = getRailwayStatus();
  const prices = getRoutePricesStatus();
  const rate = uzsRate('KZT');
  const text = [
    '🩺 <b>Tizim holati</b>',
    '',
    `🔔 Kuzatuvchi: ${watcher.enabled ? '✅ yoqilgan' : '⛔️ o\'chirilgan'}, har ${watcher.intervalSec} s, ${watcher.cachedWatches} ta faol kuzatuv`,
    `   Oxirgi aylanish: ${ago(watcher.lastCycle?.finishedAt || watcher.lastCycle?.at)}${watcher.lastError ? ` · ⚠️ ${escapeHtml(watcher.lastError)}` : ''}`,
    `🚆 eticket.railway.uz: ${railway.state === 'ok' ? '✅ ishlayapti' : railway.state === 'cooldown' ? '⏸ tanaffusda' : `⚠️ ${railway.state}`}`
      + `, navbat ${railway.queue.high + railway.queue.low}`,
    `💰 Narxlar ro'yxati: ${prices.routes} yo'nalish, yangilangan ${ago(prices.updatedAt)}${prices.running ? ' (hozir yangilanmoqda)' : ''}`,
    `💱 Kurs: ${rate ? `1 tenge = ${rate.toFixed(2)} so'm` : 'olinmagan'}`,
    `⏱ Server ishlayapti: ${Math.round(process.uptime() / 3600)} soat`,
  ].join('\n');
  return { text, kb: Markup.inlineKeyboard([[Markup.button.callback('🔄 Yangilash', 'adm:sys')], back()]) };
}

const ADJUST = {
  watchIntervalSec: { label: '⏱ Tekshirish oralig\'i', unit: 'soniya', step: 30, hint: 'bot kuzatuvlarni necha soniyada bir tekshiradi' },
  maxDaysAhead: { label: '📅 Necha kun oldinga', unit: 'kun', step: 5, hint: 'kuzatuv uchun eng uzoq sana' },
  maxWatchesPerUser: { label: '👤 Bir kishiga kuzatuv', unit: 'ta', step: 5, hint: 'bitta foydalanuvchining faol kuzatuvlari chegarasi' },
  notifyCooldownMin: { label: '🔁 Qayta xabar oralig\'i', unit: 'daq', step: 5, hint: 'bir xil joy haqida qayta xabar berishdan oldin kutish' },
};

/** Sozlamalar: nomi va qiymati alohida to'liq qatorda (kichik ekranda ham kesilmaydi), ostida ➖/➕ */
function settings() {
  const current = getSettings();
  const value = (key) => `${current[key]} ${ADJUST[key].unit}`;
  const rows = [[Markup.button.callback(`🔔 Kuzatuvchi: ${current.watcherEnabled ? '✅ yoqilgan' : '⛔️ o\'chirilgan'}`, 'adm:s:watcherEnabled:t')]];
  for (const [key, item] of Object.entries(ADJUST)) {
    rows.push([Markup.button.callback(`${item.label}: ${value(key)}`, 'noop')]);
    rows.push([
      Markup.button.callback(`➖ ${item.step} ${item.unit}`, `adm:s:${key}:-`),
      Markup.button.callback(`➕ ${item.step} ${item.unit}`, `adm:s:${key}:+`),
    ]);
  }
  rows.push(back());
  const lines = [
    '⚙️ <b>Sozlamalar</b>',
    '',
    ...Object.entries(ADJUST).map(([key, item]) => `${item.label}: <b>${value(key)}</b> — ${item.hint}.`),
    '',
    '➖/➕ bilan o\'zgartiring — darhol kuchga kiradi.',
  ];
  return { text: lines.join('\n'), kb: Markup.inlineKeyboard(rows) };
}

/** Ilova qo'ng'irog'idagi ovozli xabarlar: ro'yxat, faolini tanlash, eshitish, o'chirish */
async function voices() {
  const { activeId, items } = await listVoices();
  const lines = [
    '🔊 <b>Qo\'ng\'iroqdagi ovozli xabar</b>',
    '',
    'Ilova qo\'ng\'iroq ko\'tarilganda faol ovozni eshittiradi (✅ — faol).',
    '',
    `${activeId ? '▫️' : '✅'} Standart ovoz (ilovaning o'zida)`,
    ...items.map((item, i) => `${item.id === activeId ? '✅' : '▫️'} ${i + 1}. ${escapeHtml(item.name)}${item.duration ? ` · ${item.duration} s` : ''}`),
  ];
  const rows = items.map((item, i) => [
    Markup.button.callback(`${item.id === activeId ? '✅' : '☑️'} ${i + 1}-ni faol qilish`, `adm:vact:${item.id}`),
    Markup.button.callback('▶️', `adm:vplay:${item.id}`),
    Markup.button.callback('🗑', `adm:vdel:${item.id}`),
  ]);
  rows.push([Markup.button.callback(`${activeId ? '☑️' : '✅'} Standart ovozni faol qilish`, 'adm:vact:default')]);
  rows.push([Markup.button.callback('➕ Yangi ovoz qo\'shish', 'adm:vadd')]);
  rows.push(back());
  return { text: lines.join('\n'), kb: Markup.inlineKeyboard(rows) };
}

async function show(ctx, screen) {
  const { text, kb } = await screen;
  if (ctx.callbackQuery) {
    try { await ctx.editMessageText(text, HTML(kb)); return; } catch { /* yangi xabar */ }
  }
  await ctx.replyWithHTML(text, kb);
}

/* ------------------------------ Handlerlar ------------------------------ */

/** /admin — admin bo'lsa menyu; aks holda "/admin <parol>" bilan bir marta kirish */
export async function adminCommand(ctx) {
  const id = String(ctx.from.id);
  if (await isBotAdmin(id)) return show(ctx, menu());
  const password = ctx.message?.text?.split(/\s+/).slice(1).join(' ').trim();
  if (!password) return ctx.reply('🔐 Admin panelga kirish: /admin <veb admin paroli>');
  await ctx.deleteMessage().catch(() => {}); // parol chatda qolmasin
  if (config.admin.password === 'admin123') return ctx.reply('⛔️ Standart parol bilan kirish o\'chirilgan. Serverda ADMIN_PASSWORD o\'rnating.');
  const tries = attempts.get(id) || { count: 0, since: Date.now() };
  if (Date.now() - tries.since > 3_600_000) Object.assign(tries, { count: 0, since: Date.now() });
  if (tries.count >= 5) return ctx.reply('⛔️ Juda ko\'p urinish. 1 soatdan keyin qayta urinib ko\'ring.');
  if (!passwordMatches(password)) {
    tries.count += 1;
    attempts.set(id, tries);
    return ctx.reply('❌ Parol noto\'g\'ri.');
  }
  await addAdmin(id);
  await ctx.reply('✅ Siz admin sifatida qo\'shildingiz. Endi /admin parolsiz ochiladi.');
  return show(ctx, menu());
}

/** adm:* tugmalari */
export async function adminCallback(ctx, [action, key, op]) {
  if (!(await isBotAdmin(ctx.from.id))) return ctx.answerCbQuery('Faqat admin uchun', { show_alert: true });
  if (action === 'run') {
    // Barcha faol kuzatuvlarni 60 soniyani kutmasdan hozir tekshiradi; tugagach — natija
    const started = Date.now();
    triggerSoon();
    await ctx.answerCbQuery('🔄 Kuzatuvlar tekshiruvi boshlandi');
    waitCycle(started)
      .then((cycle) => ctx.reply(cycle
        ? `✅ Tekshiruv tugadi: ${cycle.checked} ta kuzatuv tekshirildi · joy bor: ${cycle.found} · yuborilgan xabar: ${cycle.notified}${cycle.errors ? ` · xatolar: ${cycle.errors}` : ''}`
        : '⏳ Tekshiruv hali tugamadi — natija kuzatuv kartalarida ko\'rinadi.'))
      .catch(() => {});
    return undefined;
  }
  if (action === 's') {
    const current = getSettings();
    const patch = op === 't'
      ? { [key]: !current[key] }
      : { [key]: Number(current[key]) + (op === '+' ? 1 : -1) * (ADJUST[key]?.step || 1) };
    await updateSettings(patch).catch(() => {});
    await ctx.answerCbQuery('Saqlandi');
    return show(ctx, settings());
  }
  if (action === 'bc') {
    pending.set(String(ctx.from.id), { step: 'text' });
    await ctx.answerCbQuery();
    return show(ctx, { text: '📢 <b>E\'lon</b>\n\nBarcha foydalanuvchilarga yuboriladigan matnni yozing.', kb: Markup.inlineKeyboard([back()]) });
  }
  if (action === 'bcgo') {
    const draft = pending.get(String(ctx.from.id));
    pending.delete(String(ctx.from.id));
    if (!draft?.text) return ctx.answerCbQuery('Matn topilmadi');
    try {
      await startBroadcast(`📢 ${escapeHtml(draft.text)}`);
      await ctx.answerCbQuery('Yuborilmoqda...');
    } catch (error) {
      return ctx.answerCbQuery(error.message, { show_alert: true });
    }
    return show(ctx, broadcastScreen());
  }
  if (action === 'bcst') {
    await ctx.answerCbQuery();
    return show(ctx, broadcastScreen());
  }
  if (action === 'vact') {
    await setActiveVoice(key === 'default' ? null : key);
    await ctx.answerCbQuery('✅ Faol ovoz o\'zgardi — ilovalar bir daqiqada yangilaydi');
    return show(ctx, voices());
  }
  if (action === 'vdel') {
    await removeVoice(key);
    await ctx.answerCbQuery('O\'chirildi');
    return show(ctx, voices());
  }
  if (action === 'vplay') {
    const item = await findVoice(key);
    await ctx.answerCbQuery();
    if (!item) return null;
    return (item.kind === 'voice' ? ctx.replyWithVoice(item.fileId) : ctx.replyWithAudio(item.fileId))
      .catch(() => ctx.replyWithDocument(item.fileId).catch(() => {}));
  }
  if (action === 'vadd') {
    pending.set(String(ctx.from.id), { step: 'voice' });
    await ctx.answerCbQuery();
    return show(ctx, {
      text: '🎙 <b>Yangi ovoz</b>\n\nOvozli xabar yozib yuboring yoki audio fayl (mp3) jo\'nating.\n'
        + 'Masalan: «Assalomu alaykum! Chipta topuvchi botda siz so\'ragan chipta paydo bo\'ldi. Tezroq kirib, sotib oling!»\n\n'
        + '<i>MP3 hamma telefonda ishlaydi; Telegram ovozli xabari — Android 10 va yangisida (eskisida standart ovoz).</i>',
      kb: Markup.inlineKeyboard([[Markup.button.callback('⬅️ Ovozlar', 'adm:voice')]]),
    });
  }
  await ctx.answerCbQuery();
  if (action === 'voice') return show(ctx, voices());
  if (action === 'stats') return show(ctx, stats());
  if (action === 'sys') return show(ctx, system());
  if (action === 'set') return show(ctx, settings());
  pending.delete(String(ctx.from.id));
  return show(ctx, menu());
}

function broadcastScreen() {
  const state = getBroadcastStatus();
  const text = `📢 <b>E'lon</b>\n\n${state.running ? '⏳ Yuborilmoqda' : '✅ Tugadi'}: ${state.sent}/${state.total} (xato: ${state.failed})`;
  return { text, kb: Markup.inlineKeyboard([[Markup.button.callback('🔄 Yangilash', 'adm:bcst')], back()]) };
}

/** Admin e'lon matnini yozayotgan bo'lsa — qabul qiladi (true qaytaradi) */
export async function adminText(ctx, text) {
  const draft = pending.get(String(ctx.from.id));
  if (draft?.step !== 'text' || !(await isBotAdmin(ctx.from.id))) return false;
  if (text.length < 3 || text.length > 3500) {
    await ctx.reply('Matn 3–3500 belgi bo\'lsin. Qaytadan yozing.');
    return true;
  }
  pending.set(String(ctx.from.id), { step: 'confirm', text });
  await ctx.replyWithHTML(
    `📢 <b>Ko'rinishi:</b>\n\n📢 ${raw(escapeHtml(text))}\n\nBarcha foydalanuvchilarga yuborilsinmi?`,
    Markup.inlineKeyboard([
      [{ ...Markup.button.callback('✅ Yuborish', 'adm:bcgo'), style: 'success' }],
      [{ ...Markup.button.callback('❌ Bekor', 'adm:menu'), style: 'danger' }],
    ]),
  );
  return true;
}

/** Admin ovoz yuklayotgan bo'lsa — ovozli xabar / audio / audio-hujjatni saqlaydi */
export async function adminMedia(ctx) {
  const id = String(ctx.from?.id || '');
  if (pending.get(id)?.step !== 'voice' || !(await isBotAdmin(id))) return;
  const { voice, audio, document } = ctx.message || {};
  const file = voice || audio || (document?.mime_type?.startsWith('audio/') ? document : null);
  if (!file) return ctx.reply('Ovozli xabar yoki audio fayl yuboring.');
  pending.delete(id);
  const item = await addVoice({
    fileId: file.file_id,
    kind: voice ? 'voice' : 'audio',
    mime: file.mime_type || (voice ? 'audio/ogg' : 'audio/mpeg'),
    duration: file.duration,
    name: audio?.title || document?.file_name || audio?.file_name || `Ovozli xabar ${new Date().toLocaleDateString('uz-UZ')}`,
  });
  return ctx.replyWithHTML(`✅ <b>Ovoz saqlandi:</b> ${escapeHtml(item.name)}${item.duration ? ` · ${item.duration} s` : ''}`, Markup.inlineKeyboard([
    [{ ...Markup.button.callback('✅ Faol qilish', `adm:vact:${item.id}`), style: 'success' }],
    [Markup.button.callback('🔊 Ovozlar ro\'yxati', 'adm:voice')],
  ]));
}

export default { adminCommand, adminCallback, adminText, adminMedia, isBotAdmin };
