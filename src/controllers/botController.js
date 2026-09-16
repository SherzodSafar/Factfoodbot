/**
 * Bot logikasi — mijoz bilan muloqot.
 * Adminlarga xabar yuborilmaydi: barcha buyurtmalar Admin Panelda ko'rinadi.
 */
import { Markup } from 'telegraf';
import config from '../config/default.js';
import UserModel from '../models/User.js';
import OrderModel from '../models/Order.js';

const money = (value) => `${Number(value || 0).toLocaleString('ru-RU').replace(/ /g, ' ')} so'm`;

const STATUS_LABELS = {
  PENDING: '🕐 Kutilmoqda',
  DELIVERED: '✅ Yetkazildi',
  CANCELLED: '❌ Bekor qilindi',
};

/** Mini App manzili tayyorligini tekshirish */
function webAppReady() {
  return config.bot.webAppUrl.startsWith('https://');
}

/** Asosiy klaviatura */
function mainKeyboard(user) {
  const rows = [];

  if (webAppReady()) {
    rows.push([Markup.button.webApp('🍕 Buyurtma berish', config.bot.webAppUrl)]);
  }

  rows.push(['📜 Mening buyurtmalarim']);

  if (!user?.phone) {
    rows.push([Markup.button.contactRequest('📱 Telefon raqamni yuborish')]);
  }

  return Markup.keyboard(rows).resize();
}

/** /start buyrug'i */
export async function start(ctx) {
  const user = await UserModel.upsertFromTelegram(ctx.from);

  const greeting =
    `Assalomu alaykum, <b>${user.firstName}</b>! 👋\n\n` +
    'Siz <b>FactFood</b> — tezkor pizza yetkazib berish xizmatidasiz 🍕\n\n' +
    'Pastdagi tugma orqali ilovani oching, sevimli pizzangizni tanlang va ' +
    'buyurtma bering. Kuryerimiz 30–40 daqiqada yetkazib beradi.';

  const warning = webAppReady()
    ? ''
    : '\n\n⚠️ <i>Mini App hali ulanmagan. Terminalda ngrok\'ni yoqib, ' +
      '"npm run ngrok:link" buyrug\'ini bajaring.</i>';

  await ctx.replyWithHTML(greeting + warning, mainKeyboard(user));
}

/** /help buyrug'i */
export async function help(ctx) {
  await ctx.replyWithHTML(
    '<b>Yordam</b>\n\n' +
      '/start — botni qayta ishga tushirish\n' +
      '/menu — ilovani ochish\n' +
      '/myorders — buyurtmalarim tarixi\n\n' +
      'Savollar bo\'lsa shu chatga yozing, operatorlarimiz javob beradi.',
  );
}

/** Ilovani ochish tugmasi */
export async function openApp(ctx) {
  if (!webAppReady()) {
    return ctx.reply('Mini App hali sozlanmagan. Iltimos, biroz kuting.');
  }
  return ctx.reply(
    'Ilovani ochish uchun tugmani bosing 👇',
    Markup.inlineKeyboard([Markup.button.webApp('🍕 Menyuni ochish', config.bot.webAppUrl)]),
  );
}

/** Telefon raqamni qabul qilish */
export async function onContact(ctx) {
  const contact = ctx.message?.contact;
  if (!contact) return;

  const user = await UserModel.upsertFromTelegram(ctx.from);
  await UserModel.updatePhone(user.id, contact.phone_number);

  await ctx.replyWithHTML(
    `Rahmat! Raqamingiz saqlandi: <b>${contact.phone_number}</b> ✅`,
    mainKeyboard({ ...user, phone: contact.phone_number }),
  );
}

/** Buyurtmalar tarixi */
export async function myOrders(ctx) {
  const user = await UserModel.findByTelegramId(ctx.from.id);
  const orders = user ? await OrderModel.findByUser(user.id) : [];

  if (!orders.length) {
    return ctx.reply('Sizda hali buyurtmalar yo\'q. Birinchi buyurtmangizni bering! 🍕');
  }

  const text = orders
    .slice(0, 10)
    .map((order) => {
      const items = (Array.isArray(order.items) ? order.items : [])
        .map((item) => `   • ${item.name} × ${item.quantity}`)
        .join('\n');
      const date = new Date(order.createdAt).toLocaleString('uz-UZ', { dateStyle: 'short', timeStyle: 'short' });
      return `<b>#${order.id}</b> — ${STATUS_LABELS[order.status] || order.status}\n${items}\n   💰 ${money(order.total)} · ${date}`;
    })
    .join('\n\n');

  await ctx.replyWithHTML(`<b>📜 Sizning buyurtmalaringiz</b>\n\n${text}`);
}

/**
 * Mini App `sendData` orqali ma'lumot yuborsa shu yerga tushadi.
 * (Asosiy buyurtma API orqali ketadi, bu zaxira yo'l.)
 */
export async function onWebAppData(ctx) {
  await ctx.replyWithHTML(config.messages.orderAccepted);
}

/** Boshqa matnlar */
export async function onText(ctx) {
  await ctx.reply(
    'Buyurtma berish uchun pastdagi 🍕 tugmasini bosing yoki /start deb yozing.',
  );
}

export default { start, help, openApp, onContact, myOrders, onWebAppData, onText };
