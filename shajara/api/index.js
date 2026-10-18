// Shajara iBot — yagona API funksiyasi (Vercel Serverless).
// Barcha /api/* so'rovlari vercel.json orqali shu yerga keladi.
import { verifyToken, signToken, verifyInitData, hashCode, normalizeCode, rateLimit } from '../lib/auth.js';
import { readJson, getFile, deleteKey, listKeys } from '../lib/store.js';
import {
  HttpError, findTreeByCode, loadTree, createTree, mutateTree, publicTree, addPerson, updatePerson,
  deletePerson, savePhoto, changeSettings, todaysEvents,
} from '../lib/tree.js';
import { tg, sendDocument } from '../lib/telegram.js';
import { randomQuote } from '../lib/quotes.js';

const PUBLIC_URL = () => (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const BOT_USERNAME = () => process.env.BOT_USERNAME || 'Shajara_iBot';

async function readBody(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, data, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (Buffer.isBuffer(data)) return res.end(data);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
}

function tgUser(req) {
  return verifyInitData(req.headers['x-init-data']);
}

function who(req) {
  const u = tgUser(req);
  if (!u) return null;
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? '@' + u.username : null);
}

/** Bearer token → shajara va rol. need='edit' bo'lsa tahrir huquqi talab qilinadi. */
async function auth(req, need = 'view') {
  const h = String(req.headers.authorization || '');
  const tok = verifyToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!tok) throw new HttpError(401, 'Qaytadan kirish kodi kiriting');
  if (need === 'edit' && tok.role !== 'edit') throw new HttpError(403, 'Tahrirlash uchun maxsus kod kerak');
  return tok;
}

async function authTree(req, need) {
  const tok = await auth(req, need);
  const tree = await loadTree(tok.treeId);
  if ((tree.ver || 1) !== tok.ver) throw new HttpError(401, "Kodlar o'zgargan. Qaytadan kiring");
  return { tok, tree };
}

function checkVer(tree, tok) {
  if ((tree.ver || 1) !== tok.ver) throw new HttpError(401, "Kodlar o'zgargan. Qaytadan kiring");
}

// ---------------------------------------------------------------- Bot ----
function appButton(extra = '') {
  return { inline_keyboard: [[{ text: '🌳 Shajarani ochish', web_app: { url: PUBLIC_URL() + '/' + extra } }]] };
}

async function handleUpdate(update) {
  const msg = update.message;
  if (!msg?.text || msg.chat?.type !== 'private') return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const name = msg.from?.first_name || 'qadrdon';

  if (text.startsWith('/start')) {
    const payload = text.split(' ')[1] || '';
    const q = randomQuote();
    const extra = /^[a-z0-9_-]{4,40}$/i.test(payload) ? `?code=${encodeURIComponent(payload)}` : '';
    await tg('sendMessage', {
      chat_id: chatId,
      parse_mode: 'HTML',
      text:
        `Assalomu alaykum, <b>${escapeHtml(name)}</b>! 🌿\n\n` +
        `<b>Shajara iBot</b> — oilangiz shajarasini qurish, saqlash va avlodlarga yetkazish uchun.\n\n` +
        `🌳 Jonli shajara daraxti\n👥 Qarindoshlar ro'yxati va qidiruv\n📸 Har bir inson uchun surat\n🎂 Tug'ilgan kun eslatmalari\n🔐 Kirish va tahrir uchun alohida maxfiy kodlar\n\n` +
        `<i>«${escapeHtml(q.t)}»</i>\n— ${escapeHtml(q.a)}\n\n` +
        (extra ? 'Sizga shajara havolasi ulashildi — pastdagi tugmani bosing 👇' : 'Boshlash uchun pastdagi tugmani bosing 👇'),
      reply_markup: appButton(extra),
    });
    return;
  }
  if (text.startsWith('/hikmat')) {
    const q = randomQuote();
    await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: `📜 <i>«${escapeHtml(q.t)}»</i>\n\n— ${escapeHtml(q.a)}` });
    return;
  }
  if (text.startsWith('/yordam') || text.startsWith('/help')) {
    await tg('sendMessage', {
      chat_id: chatId,
      parse_mode: 'HTML',
      text:
        '<b>Qanday foydalaniladi?</b>\n\n' +
        '1️⃣ Ilovani oching va <b>shajara kodini</b> kiriting — daraxt va ro‘yxatni ko‘rasiz.\n' +
        '2️⃣ Yoki <b>yangi shajara</b> yarating: nom, kirish kodi va tahrir kodini o‘zingiz belgilaysiz.\n' +
        '3️⃣ Tahrirlash uchun 🔒 belgisini bosib <b>tahrir kodini</b> kiriting — shunda odam qo‘shish, surat qo‘yish mumkin.\n' +
        '4️⃣ Kirish kodini qarindoshlaringizga yuboring — ular faqat ko‘ra oladi.\n\n' +
        'Buyruqlar: /start · /hikmat · /yordam',
      reply_markup: appButton(),
    });
    return;
  }
  await tg('sendMessage', {
    chat_id: chatId,
    text: 'Shajarangiz ilovada 🌳 Pastdagi tugma orqali oching.',
    reply_markup: appButton(),
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}

async function setupBot() {
  const url = PUBLIC_URL();
  const out = {};
  out.webhook = await tg('setWebhook', {
    url: url + '/api/webhook',
    secret_token: webhookSecret(),
    allowed_updates: ['message'],
    drop_pending_updates: true,
  });
  out.menu = await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Shajara', web_app: { url: url + '/' } } });
  out.commands = await tg('setMyCommands', {
    commands: [
      { command: 'start', description: 'Shajarani ochish' },
      { command: 'hikmat', description: 'Qondoshlik haqida hikmat' },
      { command: 'yordam', description: 'Qanday foydalaniladi' },
    ],
  });
  out.desc = await tg('setMyDescription', {
    description:
      'Shajara iBot — oilangiz shajarasini quring: jonli daraxt, qarindoshlar ro‘yxati, suratlar va tug‘ilgan kun eslatmalari. Ildizini bilgan — adashmas. 🌳',
  });
  out.short = await tg('setMyShortDescription', { short_description: 'Oila shajarasi — jonli daraxt va qarindoshlar ro‘yxati 🌳' });
  return out;
}

function webhookSecret() {
  return hashCode('webhook:' + (process.env.BOT_TOKEN || '')).slice(0, 48);
}

// ---------------------------------------------------------------- Router --
async function route(req, res) {
  const url = new URL(req.url, 'http://x');
  let path = url.searchParams.get('route') ?? url.pathname.replace(/^\/api\/?/, '');
  path = path.replace(/^\/+|\/+$/g, '');
  const m = req.method;
  const parts = path.split('/');

  if (path === 'health') return send(res, 200, { ok: true, storage: process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : 'local' });

  // Kirish kodi bilan shajarani ochish
  if (path === 'open' && m === 'POST') {
    const body = await readBody(req);
    if (!rateLimit('open:' + clientIp(req), 15)) throw new HttpError(429, "Juda ko'p urinish. 10 daqiqadan so'ng qayta urinib ko'ring");
    const tree = await findTreeByCode(body.code);
    if (!tree) {
      await new Promise((r) => setTimeout(r, 500));
      throw new HttpError(404, "Bunday kodli shajara topilmadi");
    }
    const role = 'view';
    const u = tgUser(req);
    return send(res, 200, { token: signToken({ treeId: tree.id, role, ver: tree.ver || 1 }), tree: publicTree(tree, role, u?.id) });
  }

  if (path === 'create' && m === 'POST') {
    const body = await readBody(req);
    if (!rateLimit('create:' + clientIp(req), 10, 60 * 60e3)) throw new HttpError(429, "Juda ko'p shajara yaratildi. Keyinroq urinib ko'ring");
    const tree = await createTree({ ...body, persons: null, meta: null, who: who(req) });
    return send(res, 200, { token: signToken({ treeId: tree.id, role: 'edit', ver: tree.ver }), tree: publicTree(tree, 'edit') });
  }

  if (path === 'tree' && m === 'GET') {
    const { tok, tree } = await authTree(req);
    return send(res, 200, { tree: publicTree(tree, tok.role, tgUser(req)?.id) });
  }

  if (path === 'unlock' && m === 'POST') {
    const body = await readBody(req);
    const tok = await auth(req);
    if (!rateLimit('unlock:' + clientIp(req), 10)) throw new HttpError(429, "Juda ko'p urinish. 10 daqiqadan so'ng qayta urinib ko'ring");
    const tree = await loadTree(tok.treeId);
    checkVer(tree, tok);
    if (hashCode(normalizeCode(body.code)) !== tree.editHash) {
      await new Promise((r) => setTimeout(r, 500));
      throw new HttpError(403, "Tahrir kodi noto'g'ri");
    }
    return send(res, 200, { token: signToken({ treeId: tree.id, role: 'edit', ver: tree.ver || 1 }), tree: publicTree(tree, 'edit', tgUser(req)?.id) });
  }

  // Shaxslar
  if (parts[0] === 'person') {
    const tok = await auth(req, 'edit');
    const actor = who(req);
    if (parts.length === 1 && m === 'POST') {
      const body = await readBody(req);
      const r = await mutateTree(tok.treeId, (t) => (checkVer(t, tok), addPerson(t, body, actor)));
      return send(res, 200, { person: r.result, tree: publicTree(r.data, 'edit', tgUser(req)?.id) });
    }
    const pid = parts[1];
    if (parts.length === 2 && m === 'PATCH') {
      const body = await readBody(req);
      const r = await mutateTree(tok.treeId, (t) => (checkVer(t, tok), updatePerson(t, pid, body, actor)));
      return send(res, 200, { person: r.result, tree: publicTree(r.data, 'edit', tgUser(req)?.id) });
    }
    if (parts.length === 2 && m === 'DELETE') {
      const r = await mutateTree(tok.treeId, (t) => (checkVer(t, tok), deletePerson(t, pid, actor)));
      if (r.result.photo) await deleteKey(`photos/${tok.treeId}/${r.result.photo}`);
      return send(res, 200, { tree: publicTree(r.data, 'edit', tgUser(req)?.id) });
    }
    if (parts[2] === 'photo' && (m === 'POST' || m === 'DELETE')) {
      const body = m === 'POST' ? await readBody(req) : {};
      const file = m === 'POST' ? await savePhoto(tok.treeId, pid, body.data) : null;
      let old = null;
      const r = await mutateTree(tok.treeId, (t) => {
        checkVer(t, tok);
        const p = t.persons.find((x) => x.id === pid);
        if (!p) throw new HttpError(404, 'Shaxs topilmadi');
        old = p.photo;
        p.photo = file;
        t.updatedAt = new Date().toISOString();
        t.log = t.log || [];
        t.log.unshift({ at: t.updatedAt, who: actor || 'Tahrirchi', action: file ? 'photo' : 'photo-del', name: p.name });
      });
      if (old && old !== file) await deleteKey(`photos/${tok.treeId}/${old}`);
      return send(res, 200, { tree: publicTree(r.data, 'edit', tgUser(req)?.id) });
    }
  }

  if (path === 'settings' && m === 'PATCH') {
    const tok = await auth(req, 'edit');
    const body = await readBody(req);
    const r = await mutateTree(tok.treeId, async (t) => (checkVer(t, tok), changeSettings(t, body, who(req))));
    const token = signToken({ treeId: tok.treeId, role: 'edit', ver: r.data.ver || 1 });
    return send(res, 200, { token, tree: publicTree(r.data, 'edit', tgUser(req)?.id) });
  }

  // Tug'ilgan kun eslatmalariga obuna
  if (path === 'subscribe' && m === 'POST') {
    const tok = await auth(req);
    const body = await readBody(req);
    const u = tgUser(req);
    if (!u) throw new HttpError(400, 'Bu funksiya faqat Telegram ichida ishlaydi');
    const r = await mutateTree(tok.treeId, (t) => {
      checkVer(t, tok);
      const s = new Set(t.subscribers || []);
      if (body.on) s.add(u.id);
      else s.delete(u.id);
      t.subscribers = [...s];
    });
    if (body.on) {
      await tg('sendMessage', {
        chat_id: u.id,
        parse_mode: 'HTML',
        text: `🔔 <b>${escapeHtml(r.data.title)}</b> uchun eslatmalar yoqildi.\nQarindoshlaringizning tug‘ilgan kunlari va xotira kunlarida xabar beraman.`,
      });
    }
    return send(res, 200, { subscribed: !!body.on });
  }

  // Zaxira nusxani Telegram chatga yuborish
  if (path === 'export' && m === 'POST') {
    const tok = await auth(req, 'edit');
    const u = tgUser(req);
    if (!u) throw new HttpError(400, 'Bu funksiya faqat Telegram ichida ishlaydi');
    const tree = await loadTree(tok.treeId);
    checkVer(tree, tok);
    const out = { meta: { ...tree.meta, title: tree.title, updated: tree.updatedAt }, persons: tree.persons };
    const day = new Date().toISOString().slice(0, 10);
    const j = await sendDocument(u.id, `shajara-${day}.json`, Buffer.from(JSON.stringify(out, null, 1)),
      `💾 <b>${escapeHtml(tree.title)}</b> — zaxira nusxa (${tree.persons.length} kishi, ${day})`);
    if (!j.ok) throw new HttpError(500, 'Yuborib bo‘lmadi. Avval botga /start yozing');
    return send(res, 200, { ok: true });
  }

  // Suratlar (maxfiy do'kondan proksi orqali)
  if (parts[0] === 'photo' && parts.length === 3 && m === 'GET') {
    const tok = verifyToken(url.searchParams.get('t'));
    if (!tok || tok.treeId !== parts[1]) throw new HttpError(401, 'Ruxsat yo‘q');
    if (!/^[a-z0-9-]+\.(jpg|png|webp)$/i.test(parts[2])) throw new HttpError(400, 'Fayl nomi noto‘g‘ri');
    const f = await getFile(`photos/${parts[1]}/${parts[2]}`);
    if (!f) throw new HttpError(404, 'Surat topilmadi');
    return send(res, 200, f.buffer, { 'content-type': f.contentType, 'cache-control': 'private, max-age=31536000, immutable' });
  }

  // Telegram webhook
  if (path === 'webhook' && m === 'POST') {
    if (req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret()) return send(res, 401, { ok: false });
    const update = await readBody(req);
    try {
      await handleUpdate(update);
    } catch (e) {
      console.error('webhook', e);
    }
    return send(res, 200, { ok: true });
  }

  // Har kuni: tug'ilgan kun va xotira kunlari eslatmalari
  if (path === 'cron') {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, 'Ruxsat yo‘q');
    const keys = await listKeys('trees/');
    let sent = 0;
    for (const key of keys) {
      const t = (await readJson(key))?.data;
      if (!t?.subscribers?.length) continue;
      const { births, memorials } = todaysEvents(t);
      if (!births.length && !memorials.length) continue;
      let text = `🌳 <b>${escapeHtml(t.title)}</b>\n`;
      if (births.length) {
        text += '\n🎂 <b>Bugun tug‘ilgan kun:</b>\n' + births.map((b) => `• ${escapeHtml(b.name)} — ${b.age} yosh`).join('\n');
        text += '\n\nTabriklashni unutmang — bir qo‘ng‘iroq ham qondoshlikni mustahkamlaydi. 💚';
      }
      if (memorials.length) {
        text += '\n\n🕯 <b>Xotira kuni:</b>\n' + memorials.map((x) => `• ${escapeHtml(x.name)} — vafotiga ${x.years} yil`).join('\n');
        text += '\n\nAlloh rahmatiga olgan bo‘lsin. Duo bilan yod eting.';
      }
      for (const chatId of t.subscribers) {
        const j = await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text, reply_markup: appButton() });
        if (j.ok) sent++;
      }
    }
    return send(res, 200, { ok: true, sent });
  }

  // Ma'mur: tayyor JSON'dan shajara yaratish
  if (path === 'admin/import' && m === 'POST') {
    if (!process.env.ADMIN_KEY || req.headers['x-admin-key'] !== process.env.ADMIN_KEY) throw new HttpError(401, 'Ruxsat yo‘q');
    const body = await readBody(req);
    const src = body.data || {};
    const tree = await createTree({
      title: body.title || src.meta?.title || 'Shajara',
      description: body.description || '',
      viewCode: body.viewCode,
      editCode: body.editCode,
      persons: src.persons,
      meta: { root_id: src.meta?.root_id || src.persons?.[0]?.id, next_id: src.meta?.next_id },
      who: 'Import',
    });
    return send(res, 200, { ok: true, id: tree.id, persons: tree.persons.length });
  }

  if (path === 'setup') {
    if (!process.env.ADMIN_KEY || url.searchParams.get('key') !== process.env.ADMIN_KEY) throw new HttpError(401, 'Ruxsat yo‘q');
    return send(res, 200, await setupBot());
  }

  throw new HttpError(404, 'Topilmadi');
}

export default async function handler(req, res) {
  try {
    await route(req, res);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    if (e instanceof SyntaxError) return send(res, 400, { error: "So'rov noto'g'ri" });
    console.error(e);
    send(res, 500, { error: 'Serverda xatolik. Birozdan so‘ng qayta urinib ko‘ring' });
  }
}

