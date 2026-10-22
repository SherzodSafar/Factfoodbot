// Telegram bot: buyruqlar, albomga yuklash, guruh va kanalni ulash, to'lovlar.
import { tg, tgUpload, mediaOf, downloadFile } from './telegram.js';
import { waitUntil } from '@vercel/functions';
const ai = () => import('./ai.js'); // og'ir SDK faqat kerak bo'lganda yuklanadi
import { importGraph, planGraph } from './tree.js';
import { t, normLang, LANGS } from './i18n.js';
import { randomQuote } from './quotes.js';
import { readJson, writeJson, deleteKey, listKeys } from './store.js';
import { signInvite, parseInvite } from './auth.js';
import { loadTree, mutateTree } from './tree.js';
import { getUser, updateUser } from './users.js';
import { loadAlbum, addToAlbum, addToPrivAlbum, canUpload, cleanName, mutateAlbum, albumAccess } from './album.js';
import { r2On } from './r2.js';
import { escapeHtml } from './notify.js';
import { upcomingText } from './events.js';

export const BOT = () => process.env.BOT_USERNAME || 'ShajaraAiBot';
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
  let lang = user?.lang || normLang(from.language_code);
  const text = (msg.text || '').trim();
  const cmd = text.startsWith('/') ? text.split(/[\s@]/)[0].toLowerCase() : null;

  if (cmd === '/start') {
    const payload = text.split(' ')[1] || '';
    if (!user) await updateUser(from.id, from, () => {});
    const q = randomQuote();
    let extra = '';
    const pinv = parseInvite(payload);
    const br = /^br_([a-z0-9]{6,20})_([A-Za-z0-9]{4,16})$/.exec(payload) || (payload.startsWith('d_') ? await (await import('./branch.js')).resolveDlg(payload) : null);
    if (br) {
      const tr = await loadTree(br[1]).catch(() => null);
      const b = tr?.branches?.[br[2]];
      const head = b && !b.revoked && tr.persons.find((p) => p.id === b.head);
      if (!head) return send(from.id, t(lang, 'Havola eskirgan yoki bekor qilingan.'));
      if (b.lang) lang = b.lang; // havola yuborilgan til
      return send(from.id, t(lang, '🌳 <b>{title}</b>\n\nSizdan <b>{name}</b> oilasi ma’lumotlarini to‘ldirib berish so‘ralmoqda: ismlar, tug‘ilgan sanalar, turmush o‘rtoqlari va farzandlari. Bu 5–10 daqiqa oladi.\n\nIlovada (savol-javob shaklida) yoki shu yerda bot bilan yozishib to‘ldirishingiz mumkin 👇', { title: escapeHtml(tr.title), name: escapeHtml(head.name) }),
        { reply_markup: { inline_keyboard: [[{ text: t(lang, '✍️ Ilovada to‘ldirish'), web_app: { url: `${URL_()}/?br=${br[1]}_${br[2]}` } }],
          [{ text: t(lang, '💬 Shu yerda to‘ldirish'), callback_data: `bc:go:${br[1]}_${br[2]}` }]] } });
    }
    if (pinv?.item) {
      return send(from.id, t(lang, '📸 Faylni ko‘rish uchun pastdagi tugmani bosing 👇'), { reply_markup: { inline_keyboard: [[{ text: t(lang, '👀 Ko‘rish'), web_app: { url: `${URL_()}/?inv=${payload}` } }]] } });
    }
    if (pinv?.inbox) {
      return send(from.id, t(lang, '🔔 Bildirishnomalarni ko‘rish uchun pastdagi tugmani bosing 👇'), { reply_markup: { inline_keyboard: [[{ text: t(lang, '👀 Ko‘rish'), web_app: { url: `${URL_()}/?inv=${payload}` } }]] } });
    }
    if (pinv?.media) {
      return send(from.id, t(lang, '💬 Izohlarni o‘qish uchun pastdagi tugmani bosing 👇'), { reply_markup: { inline_keyboard: [[{ text: t(lang, '💬 O‘qish'), web_app: { url: `${URL_()}/?inv=${payload}` } }]] } });
    }
    if (pinv?.person) {
      const tr = await loadTree(pinv.treeId).catch(() => null);
      const p = tr?.persons.find((x) => x.id === pinv.person);
      if (p) return send(from.id, `👤 <b>${escapeHtml(p.name)}</b>`, { reply_markup: { inline_keyboard: [[{ text: t(lang, '🌳 Shajarani ochish'), web_app: { url: `${URL_()}/?inv=${payload}` } }]] } });
    }
    if (pinv) extra = `?inv=${payload}`;
    else if (/^[a-z0-9_-]{4,40}$/i.test(payload)) extra = `?code=${encodeURIComponent(payload)}`;
    return send(from.id,
      `${t(lang, 'Assalomu alaykum, <b>{name}</b>! 🌿', { name: escapeHtml(from.first_name || '') })}\n\n` +
      `${t(lang, '<b>Shajara AI</b> — oilangiz shajarasini qurish, saqlash va avlodlarga yetkazish uchun.')}\n\n` +
      `${t(lang, "🌳 Jonli shajara daraxti\n👥 Qarindoshlar ro'yxati\n📸 Oilaviy albom (rasm, video, hujjat)\n🔔 Yangiliklar va tug'ilgan kun eslatmalari\n🔐 Maxfiy kodlar va taklif havolalari")}\n\n` +
      `<i>«${escapeHtml(q.t)}»</i>\n— ${escapeHtml(q.a)}\n\n` +
      t(lang, extra ? 'Sizni shajaraga taklif qilishdi — pastdagi tugmani bosing 👇' : 'Boshlash uchun pastdagi tugmani bosing 👇'),
      { reply_markup: appButton(lang, extra) });
  }
  // shox ma'lumotlarini bot yozishmasi orqali to'ldirish
  // shox to'ldirishda: daftar rasmi — AI odamlarni ajratadi
  if (user?.brchat && Date.now() - user.brchat < 3 * 864e5 && msg.photo) {
    const f = msg.photo[msg.photo.length - 1];
    const file = await downloadFile(f.file_id).catch(() => null);
    if (file) {
      const { chatMedia } = await import('./branch.js');
      if (await chatMedia(from, [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: file.buffer.toString('base64') } }])) return;
    }
  }
  if (user?.brchat && Date.now() - user.brchat < 3 * 864e5 && text && (!cmd || cmd === '/bekor' || cmd === '/cancel')) {
    const { chatText } = await import('./branch.js');
    if (await chatText(from, text)) return;
  }
  if (cmd === '/admin' && String(process.env.ADMIN_IDS || '').split(',').map((x) => x.trim()).includes(String(from.id))) {
    return send(from.id, '🛠 Admin panel', { reply_markup: { inline_keyboard: [[{ text: '🛠 Admin', web_app: { url: `${URL_()}/admin.html` } }]] } });
  }
  if (cmd === '/til' || cmd === '/lang' || cmd === '/language') return send(from.id, t(lang, 'Tilni tanlang:'), { reply_markup: LANG_KB });
  if (cmd === '/hikmat') {
    const q = randomQuote();
    return send(from.id, `📜 <i>«${escapeHtml(q.t)}»</i>\n\n— ${escapeHtml(q.a)}`);
  }
  if (cmd === '/privacy' || cmd === '/shartlar') {
    return send(from.id, `📄 ${t(lang, 'Maxfiylik siyosati va shartlar')}:\n${URL_()}/legal/privacy.html\n${URL_()}/legal/terms.html`);
  }
  if (cmd === '/yordam' || cmd === '/help') return send(from.id, `${t(lang, '<b>Qanday foydalaniladi?</b>')}\n\n${t(lang, 'HELP')}`, { reply_markup: appButton(lang) });
  if (cmd === '/bekor' || cmd === '/cancel') {
    await updateUser(from.id, from, (d) => { d.pending = null; });
    return send(from.id, t(lang, 'Bekor qilindi.'));
  }
  if (cmd === '/albom') return send(from.id, t(lang, 'Albomga qo‘shish uchun rasm/videoga javob tariqasida /albom yozing.').replace('/albom', '📎'));
  if (cmd === '/royxat' || cmd === '/import') {
    await updateUser(from.id, from, (d) => { d.aimode = { at: Date.now() }; d.pending = null; });
    return send(from.id, t(lang, 'AI_IMPORT_HELP'));
  }
  if (cmd === '/savol' || cmd === '/ai') {
    const q = text.replace(/^\S+\s*/, '');
    if (!q) return send(from.id, t(lang, 'Savolingizni yozing — masalan: «Albomga qanday rasm qo‘shaman?»'));
    return bg(aiAnswer(from, msg.chat.id, lang, q, user));
  }
  if (user?.aimode && Date.now() - user.aimode.at < 30 * 60e3 && (msg.document || msg.photo || (text && !cmd))) {
    return bg(aiImport(from, lang, msg));
  }

  const media = mediaOf(msg);
  if (media) return startUpload({ from, chatId: msg.chat.id, lang, msg, media });
  if (user?.pending && Date.now() - user.pending.at < PENDING_TTL && (text || cmd === '/skip')) return continueUpload({ from, chatId: msg.chat.id, lang, text, cmd });
  if (text && !cmd) return bg(aiAnswer(from, msg.chat.id, lang, text, user));
  return send(from.id, t(lang, 'Boshlash uchun pastdagi tugmani bosing 👇'), { reply_markup: appButton(lang) });
}

// ---------------------------------------------------------------- AI yordamchi --
// Uzoq ishlarni javobdan keyin davom ettiramiz — Telegram webhook kutib qolmasin
function bg(promise) {
  const p = promise.catch((e) => console.error('ai', e));
  try { waitUntil(p); } catch {}
}

async function aiAnswer(from, chatId, lang, question, user) {
  // «yozmoqda…» belgisi 5 soniyada o'chadi — javob kelguncha yangilab turamiz
  const typing = () => tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
  typing();
  const timer = setInterval(typing, 4500);
  const history = (user?.ai || []).slice(-8);
  let answer;
  try {
    answer = await (await ai()).answerQuestion(question.slice(0, 2000), history, lang);
  } catch (e) {
    console.error('ai answer', e);
    return send(chatId, t(lang, 'AI yordamchi hozir javob bera olmadi. Keyinroq urinib ko‘ring yoki /yordam ni bosing.'));
  } finally {
    clearInterval(timer);
  }
  // avval kesib, keyin ekranlaymiz — aks holda HTML belgisi o'rtasidan kesilib xabar umuman yuborilmaydi
  const extra = chatId === from.id ? { reply_markup: appButton(lang) } : {};
  const r = await send(chatId, escapeHtml(answer.slice(0, 3800)), extra);
  if (!r?.ok) await tg('sendMessage', { chat_id: chatId, text: answer.slice(0, 4000), ...extra });
  if (chatId === from.id) await updateUser(from.id, from, (d) => { d.ai = [...(d.ai || []), { role: 'user', content: question.slice(0, 1000) }, { role: 'assistant', content: answer.slice(0, 2000) }].slice(-8); });
}

async function aiImport(from, lang, msg) {
  const chatId = msg.chat.id;
  await updateUser(from.id, from, (d) => { d.aimode = null; });
  let content;
  if (msg.document || msg.photo) {
    const doc = msg.document;
    const f = doc || msg.photo[msg.photo.length - 1];
    if (f.file_size > 20 * 1024 * 1024) return send(chatId, t(lang, 'Fayl juda katta (20 MB dan oshmasin).'));
    const file = await downloadFile(f.file_id);
    if (!file) return send(chatId, t(lang, 'Faylni yuklab bo‘lmadi.'));
    const { fileToContent } = await ai();
    content = doc ? fileToContent(file.buffer, doc.file_name || file.path, doc.mime_type || '') : fileToContent(file.buffer, 'photo.jpg', 'image/jpeg');
    if (msg.caption) content?.push({ type: 'text', text: `Foydalanuvchi izohi: ${msg.caption}` });
  } else content = [{ type: 'text', text: msg.text }];
  if (!content) return send(chatId, t(lang, 'Bu formatni o‘qib bo‘lmaydi. Faylni .xlsx, .docx, .pdf, .csv yoki rasm qilib yuboring.'));
  const wait = await send(chatId, t(lang, '⏳ AI faylni tahlil qilmoqda… Bu 1-2 daqiqa olishi mumkin.'));
  let res;
  try {
    res = await (await ai()).extractFamily(content, lang);
  } catch (e) {
    console.error('ai import', e);
    return send(chatId, t(lang, 'AI faylni tahlil qila olmadi. Boshqa formatda yuborib ko‘ring.'));
  } finally {
    if (wait?.result) tg('deleteMessage', { chat_id: chatId, message_id: wait.result.message_id });
  }
  if (!res.rows.length) return send(chatId, t(lang, 'Fayldan odamlar ro‘yxati topilmadi.'));
  await updateUser(from.id, from, (d) => { d.aiImport = { rows: res.rows.slice(0, 2000), at: Date.now() }; });
  const user = await getUser(from.id);
  const kb = [];
  const notes = [];
  for (const [id, role] of Object.entries(user?.trees || {}).slice(0, 8)) {
    if (role !== 'edit') continue;
    const tr = await loadTree(id).catch(() => null);
    if (!tr || tr.members?.[String(from.id)]?.role !== 'edit') continue;
    // shajarada borlar qayta qo'shilmaydi — tugmada faqat yangilar soni
    const plan = planGraph(tr, res.rows);
    if (plan.matched.size) notes.push(t(lang, '«{title}»da {m} tasi allaqachon bor — qayta qo‘shilmaydi.', { title: escapeHtml(tr.title), m: plan.matched.size }));
    if (plan.newCount) kb.push([{ text: `✅ «${tr.title}» ${t(lang, 'ga qo‘shish')} (+${plan.newCount})`, callback_data: `aimp:${id}` }]);
  }
  const caption = `📋 ${t(lang, '{n} kishi topildi.', { n: res.rows.length })}\n${escapeHtml(res.summary).slice(0, 500)}${notes.length ? '\n' + notes.join('\n') : ''}\n\n` +
    t(lang, kb.length ? 'Faylni tekshiring. Hammasi to‘g‘ri bo‘lsa — pastdagi tugma bilan shajarangizga qo‘shing yoki ilovada «Fayldan qo‘shish» orqali yuklang.' : 'Bu faylni ilovada tahrir rejimida «+ → Fayldan qo‘shish» orqali yuklang.');
  return tgUpload('sendDocument', { chat_id: chatId, caption: caption.slice(0, 1020), parse_mode: 'HTML', reply_markup: kb.length ? { inline_keyboard: kb } : undefined }, 'document', Buffer.from((await ai()).rowsToCsv(res.rows)), 'shajara.csv', 'text/csv');
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
  if (cmd === '/savol' || cmd === '/ai') {
    const q = text.replace(/^\S+\s*/, '');
    if (q) return bg(aiAnswer(from, msg.chat.id, lang, q, null));
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
      reply_markup: { inline_keyboard: [[{ text: t(lang, '🌳 Shajarani ochish'), url: `https://t.me/${BOT()}?startapp=${inv}` }]] },
    });
  }
  if (cmd === '/tugilgan') {
    const inv = signInvite(tree.id, tree.ver || 1);
    return send(msg.chat.id, upcomingText(tree, lang, (pid) => `https://t.me/${BOT()}?startapp=${inv}_${pid}`));
  }
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
  // yopiq oilaviy albomlar — faqat a'zosiga va faqat shaxsiy chatda (guruhda nomi ham ko'rinmasin)
  const priv = chatId > 0 && r2On() ? doc.albums.filter((a) => a.priv && albumAccess(tree, a, String(from.id))) : [];
  const rows = [...priv.map((a) => [{ text: `🔒 ${a.name}`, callback_data: `alb:${a.id}:${from.id}` }]),
    ...doc.albums.filter((a) => !a.priv).slice(-8).reverse().map((a) => [{ text: `📁 ${a.name}`, callback_data: `alb:${a.id}:${from.id}` }])];
  rows.push([{ text: t(lang, '➕ Yangi albom'), callback_data: `alb:new:${from.id}` }, { text: t(lang, '✖️ Bekor qilish'), callback_data: `alb:x:${from.id}` }]);
  // Telegram «rasm» sifatida yuborilganini siqadi — asl sifat faqat «fayl» sifatida saqlanadi
  const hint = media.type === 'photo' ? '\n\n' + t(lang, '💡 Rasm siqilgan holda keldi. Asl sifatda saqlash uchun uni «Fayl» sifatida yuboring (📎 → Fayl).') : '';
  return send(chatId, t(lang, '📁 <b>{tree}</b>\nQaysi albomga qo‘shamiz?', { tree: escapeHtml(tree.title) }) + hint, {
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
  const by = { id: String(from.id), name: [from.first_name, from.last_name].filter(Boolean).join(' ') };
  const pa = p.albumId && (await loadAlbum(tree.id)).albums.find((a) => a.id === p.albumId && a.priv);
  if (pa) {
    // yopiq albom: fayl R2 omboriga ko'chiriladi (katta video bir-ikki daqiqa olishi mumkin) — webhook kutib qolmasin
    const wait = await send(chatId, t(lang, '⏳ «{album}» yopiq albomiga yuklanmoqda…', { album: escapeHtml(pa.name) }));
    return bg((async () => {
      let text;
      try {
        const r = await addToPrivAlbum(tree, { albumId: pa.id, caption: p.caption, media: p.items, by });
        text = t(lang, '✅ {n} ta fayl «{album}» albomiga qo‘shildi.', { n: r.count, album: escapeHtml(r.album.name) });
      } catch (e) {
        text = '⚠️ ' + escapeHtml(e.message || 'Xatolik');
      }
      const mid = wait?.result?.message_id;
      if (mid) await tg('editMessageText', { chat_id: chatId, message_id: mid, text, parse_mode: 'HTML', reply_markup: appButton(lang, '?tab=album') });
      else await send(chatId, text, { reply_markup: appButton(lang, '?tab=album') });
    })());
  }
  try {
    const r = await addToAlbum(tree, {
      albumId: p.albumId, albumName: p.albumName, caption: p.caption, media: p.items, by,
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

  if (data.startsWith('bc:')) return (await import('./branch.js')).chatCallback(cq, lang);
  if (data.startsWith('lang:')) {
    const l = data.slice(5);
    if (!LANGS.includes(l)) return answer();
    await updateUser(from.id, from, (d) => { d.lang = l; });
    await answer(t(l, 'Til o‘zgartirildi ✅'));
    return tg('editMessageText', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: t(l, 'Til o‘zgartirildi ✅') });
  }
  if (data.startsWith('aimp:')) {
    const treeId = data.slice(5);
    const rows = user?.aiImport?.rows;
    if (!rows?.length || Date.now() - user.aiImport.at > 24 * 3600e3) return answer(t(lang, 'Ma’lumot eskirgan. Faylni qayta yuboring.'));
    const tr = await loadTree(treeId).catch(() => null);
    if (!tr || tr.members?.[String(from.id)]?.role !== 'edit') return answer(t(lang, 'Ruxsat yo‘q'));
    try {
      const r = await mutateTree(treeId, (x) => importGraph(x, rows, from.first_name || 'AI'));
      await updateUser(from.id, from, (d) => { d.aiImport = null; });
      await answer('✅');
      tg('editMessageReplyMarkup', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } });
      const { created, matched } = r.result;
      return send(cq.message.chat.id, `✅ ${t(lang, '{n} kishi «{title}» shajarasiga qo‘shildi.', { n: created, title: escapeHtml(tr.title) })}` +
        (matched ? `\n${t(lang, '{m} tasi allaqachon bor edi — ularga bog‘landi.', { m: matched })}` : ''), { reply_markup: appButton(lang) });
    } catch (e) {
      return answer(String(e.message || e).slice(0, 190));
    }
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
    // yangi bot albom kanaliga admin qilindi — fayl identifikatorlarini shu bot uchun yangilaymiz
    if (status === 'administrator' && chat.type === 'channel' && linked?.data?.treeId) bg(refreshAlbumFiles(linked.data.treeId, cm.from?.id));
    if (!linked && chat.type !== 'channel') await send(chat.id, t(lang, 'Salom! Meni shajaraga ulash uchun ilovadan kod oling va shu yerga /ulash KOD yuboring.'));
  }
}

/**
 * Bot almashganda albom fayllarining file_id'lari eskiradi (har bot uchun alohida). Kanaldagi har bir postni
 * tahrirchining shaxsiy chatiga ovozsiz forward qilib, yangi file_id olamiz va forwardni darhol o'chiramiz.
 */
export async function refreshAlbumFiles(treeId, notifyUid) {
  const tree = await loadTree(treeId).catch(() => null);
  if (!tree) return 0;
  const target = notifyUid || tree.owner || String(process.env.ADMIN_IDS || '').split(',')[0];
  if (!target) return 0;
  const doc = await loadAlbum(treeId);
  const me = (await tg('getMe', {})).result?.id;
  const fresh = {};
  for (const it of doc.items) {
    if (!it.ch?.msg || it.bot === me) continue;
    const r = await tg('forwardMessage', { chat_id: target, from_chat_id: it.ch.chat, message_id: it.ch.msg, disable_notification: true });
    if (!r.ok) continue;
    const m = mediaOf(r.result);
    if (m) fresh[it.id] = { fileId: m.fileId, thumbId: m.thumbId || null };
    await tg('deleteMessage', { chat_id: target, message_id: r.result.message_id });
    await new Promise((ok) => setTimeout(ok, 60));
  }
  const n = Object.keys(fresh).length;
  if (n) {
    await mutateAlbum(treeId, (d) => {
      for (const x of d.items) if (fresh[x.id]) Object.assign(x, fresh[x.id], { bot: me });
    });
  }
  await send(target, `✅ ${t('uz', 'Albom yangi botga ko‘chirildi: {n} ta fayl.', { n })}`).catch(() => {});
  return n;
}

// ---------------------------------------------------------------- eski botni (@Shajara_iBot) uzish --
/**
 * Bir martalik: OLD_BOT_TOKEN bo'lsa — eski botning webhook'i o'chiriladi, menyu/buyruqlar tozalanadi,
 * shajaralarning kanal va guruhlaridan chiqib ketadi. Natija `sys/oldbot-off.json` ga yoziladi.
 */
export async function oldBotOff() {
  const tok = process.env.OLD_BOT_TOKEN;
  if (!tok || (await readJson('sys/oldbot-off.json').catch(() => null))) return null;
  const call = (m, b = {}) => fetch(`https://api.telegram.org/bot${tok}/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })
    .then((r) => r.json()).catch((e) => ({ ok: false, description: String(e?.message || e) }));
  const out = { at: new Date().toISOString(), me: (await call('getMe')).result?.username || null };
  out.webhook = (await call('deleteWebhook', { drop_pending_updates: true })).ok;
  out.menu = (await call('setChatMenuButton', { menu_button: { type: 'default' } })).ok;
  out.commands = (await call('deleteMyCommands')).ok;
  let left = 0;
  for (const key of await listKeys('trees/')) {
    const tr = (await readJson(key).catch(() => null))?.data;
    for (const id of [tr?.channel?.id, ...(tr?.groups || []).map((g) => g.id)].filter(Boolean)) if ((await call('leaveChat', { chat_id: id })).ok) left++;
  }
  out.left = left;
  await writeJson('sys/oldbot-off.json', out);
  console.log('oldbot off', out);
  return out;
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
    await tg('setMyName', { name: 'Shajara AI', language_code: lc });
    await tg('setMyShortDescription', { language_code: lc, short_description: t(lang, 'BOT_SHORT') });
    await tg('setMyDescription', { language_code: lc, description: t(lang, 'BOT_ABOUT') });
  }
  for (const lang of ['uz', 'ru', 'en']) {
    const lc = lang === 'uz' ? undefined : lang;
    await tg('setMyCommands', {
      language_code: lc,
      commands: [
        { command: 'start', description: t(lang, 'Shajarani ochish') },
        { command: 'til', description: t(lang, 'Tilni tanlash') },
        { command: 'hikmat', description: t(lang, 'Qondoshlik haqida hikmat') },
        { command: 'yordam', description: t(lang, 'Qanday foydalaniladi') },
        { command: 'royxat', description: t(lang, 'AI ro‘yxat (fayldan)') },
        { command: 'savol', description: t(lang, 'AI yordamchiga savol') },
        { command: 'privacy', description: t(lang, 'Maxfiylik siyosati va shartlar') },
      ],
    });
    await tg('setMyCommands', {
      language_code: lc, scope: { type: 'all_group_chats' },
      commands: [
        { command: 'shajara', description: t(lang, 'Shajarani ochish') },
        { command: 'albom', description: t(lang, 'Albomga fayl qo‘shish') },
        { command: 'tugilgan', description: '🎂' },
        { command: 'savol', description: '🤖 AI' },
        { command: 'hikmat', description: t(lang, 'Qondoshlik haqida hikmat') },
      ],
    });
  }
  out.desc = await tg('setMyDescription', {
    description: 'Shajara AI — oilangiz shajarasi: jonli daraxt, qarindoshlar ro‘yxati, oilaviy albom, bildirishnomalar va tug‘ilgan kun eslatmalari. 🌳',
  });
  out.short = await tg('setMyShortDescription', { short_description: 'Oila shajarasi va oilaviy albom 🌳' });
  return out;
}
