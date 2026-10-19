// Telegram bot: buyruqlar, albomga yuklash, guruh va kanalni ulash, to'lovlar.
import { tg, mediaOf } from './telegram.js';
import { t, normLang, LANGS } from './i18n.js';
import { randomQuote } from './quotes.js';
import { readJson, writeJson, deleteKey } from './store.js';
import { signInvite, parseInvite } from './auth.js';
import { loadTree, mutateTree } from './tree.js';
import { getUser, updateUser } from './users.js';
import { loadAlbum, addToAlbum, canUpload, cleanName } from './album.js';
import { escapeHtml } from './notify.js';
import { upcomingText } from './events.js';

export const BOT = () => process.env.BOT_USERNAME || 'Shajara_iBot';
const URL_ = () => (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const PENDING_TTL = 60 * 60e3;
export const chatKey = (id) => `chats/${id}.json`;
export const linkKey = (code) => `links/${code}.json`;

const appButton = (lang, q = '') => ({ inline_keyboard: [[{ text: t(lang, '🌳 Shajarani ochish'), web_app: { url: `${URL_()}/${q}` } }]] });
const LANG_KB = {
  inline_keyboard: [
    [{ text: "🇺🇿 O'zbekcha", callback_data: 'lang:uz' }, { text: '🇺🇿 Ўзбекча', callback_data: 'lang:uzc' }],
    [{ text: '🇷🇺 Русский', callback_data: 'lang:ru' }, { text: '🇬🇧 English', callback_data: 'lang:en' }],
  ],
};

const send = (chat_id, text, extra = {}) => tg('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });

export async function handleUpdate(u) {
  if (u.pre_checkout_query) return onPreCheckout(u.pre_checkout_query);
  if (u.callback_query) return onCallback(u.callback_query);
  if (u.my_chat_member) return onMembership(u.my_chat_member);
  if (u.channel_post) return onChannelPost(u.channel_post);
  const msg = u.message;
  if (!msg) return;
  if (msg.successful_payment) return onPaid(msg);
  if (msg.chat.type === 'private') return onPrivate(msg);
  if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') return onGroup(msg);
}

// ---------------------------------------------------------------- shaxsiy chat --
async function onPrivate(msg) {
  const from = msg.from;
  const user = await getUser(from.id);
  const lang = user?.lang || normLang(from.language_code);
  const text = (msg.text || '').trim();
  const cmd = text.startsWith('/') ? text.split(/[\s@]/)[0].toLowerCase() : null;

  if (cmd === '/start') {
    const payload = text.split(' ')[1] || '';
    if (!user) await updateUser(from.id, from, () => {});
    const q = randomQuote();
    let extra = '';
    if (parseInvite(payload)) extra = `?inv=${payload}`;
    else if (/^[a-z0-9_-]{4,40}$/i.test(payload)) extra = `?code=${encodeURIComponent(payload)}`;
    return send(from.id,
      `${t(lang, 'Assalomu alaykum, <b>{name}</b>! 🌿', { name: escapeHtml(from.first_name || '') })}\n\n` +
      `${t(lang, '<b>Shajara iBot</b> — oilangiz shajarasini qurish, saqlash va avlodlarga yetkazish uchun.')}\n\n` +
      `${t(lang, "🌳 Jonli shajara daraxti\n👥 Qarindoshlar ro'yxati\n📸 Oilaviy albom (rasm, video, hujjat)\n🔔 Yangiliklar va tug'ilgan kun eslatmalari\n🔐 Maxfiy kodlar va taklif havolalari")}\n\n` +
      `<i>«${escapeHtml(q.t)}»</i>\n— ${escapeHtml(q.a)}\n\n` +
      t(lang, extra ? 'Sizni shajaraga taklif qilishdi — pastdagi tugmani bosing 👇' : 'Boshlash uchun pastdagi tugmani bosing 👇'),
      { reply_markup: appButton(lang, extra) });
  }
  if (cmd === '/admin' && String(process.env.ADMIN_IDS || '').split(',').map((x) => x.trim()).includes(String(from.id))) {
    return send(from.id, '🛠 Admin panel', { reply_markup: { inline_keyboard: [[{ text: '🛠 Admin', web_app: { url: `${URL_()}/admin.html` } }]] } });
  }
  if (cmd === '/til' || cmd === '/lang' || cmd === '/language') return send(from.id, t(lang, 'Tilni tanlang:'), { reply_markup: LANG_KB });
  if (cmd === '/hikmat') {
    const q = randomQuote();
    return send(from.id, `📜 <i>«${escapeHtml(q.t)}»</i>\n\n— ${escapeHtml(q.a)}`);
  }
  if (cmd === '/yordam' || cmd === '/help') return send(from.id, `${t(lang, '<b>Qanday foydalaniladi?</b>')}\n\n${t(lang, 'HELP')}`, { reply_markup: appButton(lang) });
  if (cmd === '/bekor' || cmd === '/cancel') {
    await updateUser(from.id, from, (d) => { d.pending = null; });
    return send(from.id, t(lang, 'Bekor qilindi.'));
  }
  if (cmd === '/albom') return send(from.id, t(lang, 'Albomga qo‘shish uchun rasm/videoga javob tariqasida /albom yozing.').replace('/albom', '📎'));

  const media = mediaOf(msg);
  if (media) return startUpload({ from, chatId: msg.chat.id, lang, msg, media });
  if (user?.pending && Date.now() - user.pending.at < PENDING_TTL && (text || cmd === '/skip')) return continueUpload({ from, chatId: msg.chat.id, lang, text, cmd });
  return send(from.id, t(lang, 'Boshlash uchun pastdagi tugmani bosing 👇'), { reply_markup: appButton(lang) });
}

// ---------------------------------------------------------------- guruh --
async function onGroup(msg) {
  const from = msg.from;
  const text = (msg.text || '').trim();
  const cmd = text.startsWith('/') ? text.split(/[\s@]/)[0].toLowerCase() : null;
  const link = (await readJson(chatKey(msg.chat.id)))?.data;
  const lang = link?.lang || (await getUser(from.id))?.lang || normLang(from.language_code);

  if (cmd === '/ulash' || cmd === '/link') return linkChat(msg.chat, text.split(/\s+/)[1], from, lang);
  if (cmd === '/start' && !link && text.split(/\s+/)[1]) return linkChat(msg.chat, text.split(/\s+/)[1], from, lang);
  if (!cmd) {
    // bot savoliga javob (izoh yoki albom nomi)
    if (msg.reply_to_message?.from?.username === BOT()) {
      const user = await getUser(from.id);
      if (user?.pending?.chat === msg.chat.id) return continueUpload({ from, chatId: msg.chat.id, lang, text, cmd, replyTo: msg.message_id });
    }
    return;
  }
  if (cmd === '/hikmat') {
    const q = randomQuote();
    return send(msg.chat.id, `📜 <i>«${escapeHtml(q.t)}»</i>\n\n— ${escapeHtml(q.a)}`);
  }
  if (cmd === '/skip' || cmd === '/bekor' || cmd === '/cancel') {
    const user = await getUser(from.id);
    if (user?.pending?.chat === msg.chat.id) return continueUpload({ from, chatId: msg.chat.id, lang, text, cmd, replyTo: msg.message_id });
    return;
  }
  if (!link) {
    if (['/shajara', '/albom', '/tugilgan'].includes(cmd)) {
      return send(msg.chat.id, t(lang, 'Bu guruh hali shajaraga ulanmagan. Ilovada «Guruhni ulash» kodini oling va shu yerga /ulash KOD yuboring.'));
    }
    return;
  }
  const tree = await loadTree(link.treeId).catch(() => null);
  if (!tree) return;
  if (cmd === '/shajara' || cmd === '/start') {
    const inv = signInvite(tree.id, tree.ver || 1);
    return send(msg.chat.id, `🌳 <b>${escapeHtml(tree.title)}</b>`, {
      reply_markup: { inline_keyboard: [[{ text: t(lang, '🌳 Shajarani ochish'), url: `https://t.me/${BOT()}?start=${inv}` }]] },
    });
  }
  if (cmd === '/tugilgan') return send(msg.chat.id, upcomingText(tree, lang));
  if (cmd === '/albom') {
    const src = msg.reply_to_message;
    const media = src && mediaOf(src);
    if (!media) return send(msg.chat.id, t(lang, 'Albomga qo‘shish uchun rasm/videoga javob tariqasida /albom yozing.'), { reply_to_message_id: msg.message_id });
    const caption = cleanName(text.replace(/^\/\S+\s*/, ''), 900) || src.caption || null;
    return startUpload({ from, chatId: msg.chat.id, lang, msg: { ...src, caption }, media, tree, replyTo: msg.message_id });
  }
}

// ---------------------------------------------------------------- albomga yuklash --
async function startUpload({ from, chatId, lang, msg, media, tree, replyTo }) {
  const user = await getUser(from.id);
  const treeId = tree?.id || user?.active;
  if (!treeId) return send(chatId, t(lang, 'Avval ilovada shajarangizni oching — so‘ng fayllarni shu yerga yuboring.'), { reply_markup: chatId > 0 ? appButton(lang) : undefined });
  tree = tree || (await loadTree(treeId).catch(() => null));
  if (!tree) return;
  if (!tree.channel) return send(chatId, t(lang, 'Albom uchun avval shajara tahrirchisi albom kanalini ulashi kerak (ilovada: Ko‘proq → Albom kanali).'), { reply_to_message_id: replyTo });
  if (!canUpload(tree, String(from.id), null)) return send(chatId, t(lang, 'Bu shajara albomiga fayl qo‘shishga ruxsatingiz yo‘q.'), { reply_to_message_id: replyTo });

  const group = msg.media_group_id || null;
  const { result: isNew } = await updateUser(from.id, from, (d) => {
    const p = d.pending;
    const fresh = p && p.treeId === treeId && p.chat === chatId && Date.now() - p.at < 5 * 60e3 && p.stage === 'pick';
    if (fresh && (group ? p.group === group : true) && p.items.length < 50) {
      p.items.push(media);
      if (msg.caption && !p.caption) p.caption = msg.caption;
      return false;
    }
    d.pending = { treeId, chat: chatId, items: [media], caption: msg.caption || null, group, stage: 'pick', at: Date.now() };
    return true;
  });
  if (!isNew) return;
  const doc = await loadAlbum(treeId);
  const rows = doc.albums.slice(-8).reverse().map((a) => [{ text: `📁 ${a.name}`, callback_data: `alb:${a.id}:${from.id}` }]);
  rows.push([{ text: t(lang, '➕ Yangi albom'), callback_data: `alb:new:${from.id}` }, { text: t(lang, '✖️ Bekor qilish'), callback_data: `alb:x:${from.id}` }]);
  return send(chatId, t(lang, '📁 <b>{tree}</b>\nQaysi albomga qo‘shamiz?', { tree: escapeHtml(tree.title) }), {
    reply_markup: { inline_keyboard: rows }, reply_to_message_id: replyTo,
  });
}

async function continueUpload({ from, chatId, lang, text, cmd, replyTo }) {
  const user = await getUser(from.id);
  const p = user?.pending;
  if (!p) return;
  if (cmd === '/bekor' || cmd === '/cancel') {
    await updateUser(from.id, from, (d) => { d.pending = null; });
    return send(chatId, t(lang, 'Bekor qilindi.'));
  }
  if (p.stage === 'newalbum') {
    const name = cleanName(text);
    if (!name || cmd) return;
    await updateUser(from.id, from, (d) => { d.pending.albumName = name; d.pending.stage = d.pending.caption ? 'done' : 'caption'; });
    if (!p.caption) return askCaption(chatId, lang, replyTo);
    return finishUpload(from, chatId, lang);
  }
  if (p.stage === 'caption') {
    await updateUser(from.id, from, (d) => { d.pending.caption = cmd === '/skip' ? null : cleanName(text, 900); d.pending.stage = 'done'; });
    return finishUpload(from, chatId, lang);
  }
}

const askCaption = (chatId, lang, replyTo) =>
  send(chatId, t(lang, '✍️ Fayl(lar)ga izoh yozing — kim, qachon, qayerda? (o‘tkazib yuborish: /skip)'), {
    reply_markup: { force_reply: true, selective: true }, reply_to_message_id: replyTo,
  });

async function finishUpload(from, chatId, lang) {
  const { result: p } = await updateUser(from.id, from, (d) => {
    const cur = d.pending;
    d.pending = null;
    return cur;
  });
  if (!p) return;
  const tree = await loadTree(p.treeId).catch(() => null);
  if (!tree) return;
  try {
    const r = await addToAlbum(tree, {
      albumId: p.albumId, albumName: p.albumName, caption: p.caption, media: p.items,
      by: { id: String(from.id), name: [from.first_name, from.last_name].filter(Boolean).join(' ') },
    });
    return send(chatId, t(lang, '✅ {n} ta fayl «{album}» albomiga qo‘shildi.', { n: r.count, album: escapeHtml(r.album.name) }), {
      reply_markup: chatId > 0 ? appButton(lang, '?tab=album') : undefined,
    });
  } catch (e) {
    return send(chatId, e.status === 402 ? `⭐ ${e.message}` : '⚠️ ' + (e.message || 'Xatolik'));
  }
}

// ---------------------------------------------------------------- tugmalar --
async function onCallback(cq) {
  const from = cq.from;
  const data = cq.data || '';
  const answer = (text) => tg('answerCallbackQuery', { callback_query_id: cq.id, text });
  const user = await getUser(from.id);
  const lang = user?.lang || normLang(from.language_code);

  if (data.startsWith('lang:')) {
    const l = data.slice(5);
    if (!LANGS.includes(l)) return answer();
    await updateUser(from.id, from, (d) => { d.lang = l; });
    await answer(t(l, 'Til o‘zgartirildi ✅'));
    return tg('editMessageText', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: t(l, 'Til o‘zgartirildi ✅') });
  }
  if (data.startsWith('alb:')) {
    const [, what, owner] = data.split(':');
    if (owner !== String(from.id)) return answer(t(lang, 'Bu tugma siz uchun emas.'));
    const chatId = cq.message.chat.id;
    const del = () => tg('deleteMessage', { chat_id: chatId, message_id: cq.message.message_id });
    if (!user?.pending) return answer(), del();
    await answer();
    await del();
    if (what === 'x') {
      await updateUser(from.id, from, (d) => { d.pending = null; });
      return send(chatId, t(lang, 'Bekor qilindi.'));
    }
    if (what === 'new') {
      await updateUser(from.id, from, (d) => { d.pending.stage = 'newalbum'; d.pending.at = Date.now(); });
      return send(chatId, t(lang, 'Yangi albom nomini yozing (masalan: To‘y 2024):'), { reply_markup: { force_reply: true, selective: true } });
    }
    await updateUser(from.id, from, (d) => { d.pending.albumId = what; d.pending.stage = d.pending.caption ? 'done' : 'caption'; d.pending.at = Date.now(); });
    if (!user.pending.caption) return askCaption(chatId, lang);
    return finishUpload(from, chatId, lang);
  }
  return answer();
}

// ---------------------------------------------------------------- guruh/kanalni ulash --
async function linkChat(chat, code, from, lang) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const rec = c && (await readJson(linkKey(c)))?.data;
  if (!rec || rec.exp < Date.now()) return send(chat.id, t(lang, 'Kod noto‘g‘ri yoki muddati o‘tgan.'));
  const isChannel = chat.type === 'channel';
  if ((rec.kind === 'channel') !== isChannel) return send(chat.id, t(lang, 'Kod noto‘g‘ri yoki muddati o‘tgan.'));
  await deleteKey(linkKey(c));
  let invite = null;
  if (isChannel) {
    const r = await tg('exportChatInviteLink', { chat_id: chat.id });
    invite = r.ok ? r.result : null;
  }
  const { data: tree } = await mutateTree(rec.treeId, (tr) => {
    if (isChannel) tr.channel = { id: chat.id, title: chat.title || '', invite };
    else {
      tr.groups = (tr.groups || []).filter((g) => g.id !== chat.id);
      tr.groups.push({ id: chat.id, title: chat.title || '', lang });
    }
  });
  await writeJson(chatKey(chat.id), { treeId: rec.treeId, kind: isChannel ? 'channel' : 'group', lang });
  return send(chat.id, t(lang, isChannel ? '✅ Kanal «{tree}» albomi uchun ulandi. Barcha fayllar shu kanalda saqlanadi.' : '✅ Guruh «{tree}» shajarasiga ulandi. Endi albom va yangiliklar shu yerga ham keladi.', { tree: escapeHtml(tree.title) }));
}

async function onChannelPost(post) {
  const text = (post.text || '').trim();
  if (/^\/(ulash|link)\b/i.test(text)) {
    await tg('deleteMessage', { chat_id: post.chat.id, message_id: post.message_id });
    return linkChat(post.chat, text.split(/\s+/)[1], null, 'uz');
  }
  // Kanalga to'g'ridan-to'g'ri joylangan media ham albomga tushadi. Izohdagi #teg — albom nomi.
  const media = mediaOf(post);
  if (!media) return;
  const link = (await readJson(chatKey(post.chat.id)))?.data;
  if (!link || link.kind !== 'channel') return;
  const tree = await loadTree(link.treeId).catch(() => null);
  if (!tree) return;
  const cap = post.caption || '';
  const tag = /#([\p{L}\p{N}_]+)/u.exec(cap);
  await addToAlbum(tree, {
    inChannel: true,
    albumName: tag ? tag[1].replace(/_/g, ' ') : 'Kanal', caption: cap.replace(/#[\p{L}\p{N}_]+/gu, '').trim() || null,
    media: [{ ...media, ch: { chat: post.chat.id, msg: post.message_id } }], by: { id: null, name: post.author_signature || post.chat.title || '' },
  }).catch(() => {});
}

async function onMembership(cm) {
  const chat = cm.chat;
  const status = cm.new_chat_member?.status;
  const lang = normLang(cm.from?.language_code);
  if (status === 'left' || status === 'kicked') {
    const link = (await readJson(chatKey(chat.id)))?.data;
    if (!link) return;
    await deleteKey(chatKey(chat.id));
    await mutateTree(link.treeId, (tr) => {
      if (tr.channel?.id === chat.id) tr.channel = null;
      tr.groups = (tr.groups || []).filter((g) => g.id !== chat.id);
    }).catch(() => {});
    return;
  }
  if ((status === 'member' || status === 'administrator') && chat.type !== 'private') {
    const linked = await readJson(chatKey(chat.id));
    if (!linked && chat.type !== 'channel') await send(chat.id, t(lang, 'Salom! Meni shajaraga ulash uchun ilovadan kod oling va shu yerga /ulash KOD yuboring.'));
  }
}

// ---------------------------------------------------------------- to'lovlar (Telegram Stars) --
export const PLANS = {
  month: { days: 31, stars: () => Number(process.env.PRICE_MONTH || 99) },
  year: { days: 366, stars: () => Number(process.env.PRICE_YEAR || 799) },
};

async function onPreCheckout(q) {
  const [, treeId, plan] = String(q.invoice_payload || '').split(':');
  const ok = !!PLANS[plan] && !!(await loadTree(treeId).catch(() => null));
  return tg('answerPreCheckoutQuery', { pre_checkout_query_id: q.id, ok, error_message: ok ? undefined : 'Shajara topilmadi' });
}

async function onPaid(msg) {
  const p = msg.successful_payment;
  const [, treeId, plan] = String(p.invoice_payload || '').split(':');
  if (!PLANS[plan]) return;
  const { data: tree } = await mutateTree(treeId, (tr) => {
    const base = tr.premiumUntil && new Date(tr.premiumUntil) > new Date() ? new Date(tr.premiumUntil) : new Date();
    tr.premiumUntil = new Date(base.getTime() + PLANS[plan].days * 864e5).toISOString();
    tr.payments = [...(tr.payments || []), { at: new Date().toISOString(), by: String(msg.from.id), stars: p.total_amount, plan, charge: p.telegram_payment_charge_id }].slice(-50);
  });
  const lang = (await getUser(msg.from.id))?.lang || 'uz';
  return send(msg.chat.id, t(lang, '⭐ Premium faollashtirildi: {until} gacha. Rahmat!', { until: tree.premiumUntil.slice(0, 10) }));
}

export async function setupBot() {
  const url = URL_();
  const out = {};
  const { webhookSecret } = await import('./events.js');
  await tg('deleteWebhook', { drop_pending_updates: false });
  out.webhook = await tg('setWebhook', {
    url: url + '/api/webhook', secret_token: webhookSecret(), drop_pending_updates: false,
    allowed_updates: ['message', 'callback_query', 'channel_post', 'my_chat_member', 'pre_checkout_query'],
  });
  out.menu = await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Shajara', web_app: { url: url + '/' } } });
  for (const lang of ['uz', 'ru', 'en']) {
    const lc = lang === 'uz' ? undefined : lang;
    await tg('setMyCommands', {
      language_code: lc,
      commands: [
        { command: 'start', description: t(lang, 'Shajarani ochish') },
        { command: 'til', description: t(lang, 'Tilni tanlash') },
        { command: 'hikmat', description: t(lang, 'Qondoshlik haqida hikmat') },
        { command: 'yordam', description: t(lang, 'Qanday foydalaniladi') },
      ],
    });
    await tg('setMyCommands', {
      language_code: lc, scope: { type: 'all_group_chats' },
      commands: [
        { command: 'shajara', description: t(lang, 'Shajarani ochish') },
        { command: 'albom', description: t(lang, 'Albomga fayl qo‘shish') },
        { command: 'tugilgan', description: '🎂' },
        { command: 'hikmat', description: t(lang, 'Qondoshlik haqida hikmat') },
      ],
    });
  }
  out.desc = await tg('setMyDescription', {
    description: 'Shajara iBot — oilangiz shajarasi: jonli daraxt, qarindoshlar ro‘yxati, oilaviy albom, bildirishnomalar va tug‘ilgan kun eslatmalari. 🌳',
  });
  out.short = await tg('setMyShortDescription', { short_description: 'Oila shajarasi va oilaviy albom 🌳' });
  return out;
}
