// Shajara iBot — yagona API funksiyasi (Vercel Serverless).
// Barcha /api/* so'rovlari vercel.json orqali shu yerga keladi.
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import {
  verifyToken, signToken, verifyInitData, hashCode, normalizeCode, rateLimit, signInvite, parseInvite, checkInvite,
  signMedia, verifyMedia, randomCode, randomId,
} from '../lib/auth.js';
import { readJson, writeJson, getFile, deleteKey, listKeys } from '../lib/store.js';
import {
  HttpError, findTreeByCode, loadTree, createTree, mutateTree, publicTree, addPerson, updatePerson, deletePerson,
  savePhoto, changeSettings, upsertMember, importRows, replacePersons, importGraph, planGraph,
  undoImport, findDuplicates, mergePersons,
} from '../lib/tree.js';
import { tg, tgUpload, sendDocument, sendStored, mediaOf, downloadFile, fetchFilePart } from '../lib/telegram.js';
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', m4v: 'video/mp4', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', pdf: 'application/pdf' };
import { handleUpdate, setupBot, BOT, PLANS, chatKey, linkKey } from '../lib/bot.js';
import { webhookSecret, todayText } from '../lib/events.js';
import { notify, escapeHtml } from '../lib/notify.js';
import { updateUser, getUser } from '../lib/users.js';
import { waitUntil } from '@vercel/functions';
import { loadAlbum, mutateAlbum, publicAlbum, addToAlbum, canUpload, cleanName, ensureAlbum } from '../lib/album.js';
import { t, LANGS } from '../lib/i18n.js';

const PUBLIC_URL = () => (process.env.PUBLIC_URL || '').replace(/\/$/, '');
// Bulutda (BOT_TOKEN bor) barcha so'rovlar Telegram imzosi bilan bo'lishi shart.
const REQUIRE_TG = () => !!process.env.BOT_TOKEN && process.env.REQUIRE_TG !== 'off';

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
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
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
}

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
const nameOf = (u) => (u ? [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? '@' + u.username : 'Telegram') : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tgUser(req) {
  const u = verifyInitData(req.headers['x-init-data']);
  if (!u && REQUIRE_TG()) throw new HttpError(401, 'Ilovani Telegram ichida oching');
  return u;
}

/** Kod terish urinishlari: 6 marta xato → 15 daqiqa kutish (foydalanuvchi bo'yicha, server nusxasidan qat'i nazar). */
async function guardAttempts(user, ip) {
  if (!rateLimit('code:' + ip, 20)) throw new HttpError(429, "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring");
  if (!user) return;
  const u = await getUser(user.id);
  if (u?.fails?.until > Date.now()) throw new HttpError(429, "Juda ko'p xato urinish. 15 daqiqadan so'ng qayta urinib ko'ring");
}
async function failAttempt(user) {
  await sleep(400);
  if (!user) return;
  await updateUser(user.id, user, (d) => {
    const f = d.fails && d.fails.at > Date.now() - 15 * 60e3 ? d.fails : { n: 0 };
    f.n++;
    f.at = Date.now();
    if (f.n >= 6) f.until = Date.now() + 15 * 60e3;
    d.fails = f;
  });
}

/** Foydalanuvchini shajara a'zosi sifatida yozib qo'yish (o'zgarish bo'lsagina saqlanadi). */
async function remember(tree, user, role) {
  if (!user) return tree;
  const uid = String(user.id);
  if ((tree.banned || []).includes(uid)) throw new HttpError(403, 'Sizga bu shajaraga kirish taqiqlangan');
  const ud = await getUser(user.id);
  const lang = ud?.lang || null;
  const probe = structuredClone(tree.members?.[uid] || null);
  const tmp = { members: { [uid]: probe }, owner: tree.owner };
  if (!probe) delete tmp.members[uid];
  if (upsertMember(tmp, user, role, lang) || (!tree.owner && tmp.owner)) {
    const r = await mutateTree(tree.id, (tr) => { upsertMember(tr, user, role, lang); });
    tree = r.data;
  }
  if (ud?.active !== tree.id || ud?.trees?.[tree.id] !== role) {
    await updateUser(user.id, user, (d) => { d.active = tree.id; d.trees = { ...(d.trees || {}), [tree.id]: role }; });
  }
  return tree;
}

function roleOf(tree, tok, uid) {
  if (tok.role === 'edit') return 'edit';
  return uid && tree.members?.[uid]?.role === 'edit' ? 'edit' : 'view';
}

/** Token + Telegram foydalanuvchisi → shajara va rol. */
async function authTree(req, need = 'view') {
  const h = String(req.headers.authorization || '');
  const tok = verifyToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!tok) throw new HttpError(401, 'Qaytadan kirish kodi kiriting');
  const user = tgUser(req);
  if (tok.uid && user && String(user.id) !== String(tok.uid)) throw new HttpError(401, 'Qaytadan kiring');
  const tree = await loadTree(tok.treeId);
  if ((tree.ver || 1) !== tok.ver) throw new HttpError(401, "Kodlar o'zgargan. Qaytadan kiring");
  const uid = user ? String(user.id) : null;
  if (uid && (tree.banned || []).includes(uid)) throw new HttpError(403, 'Sizga bu shajaraga kirish taqiqlangan');
  const role = roleOf(tree, tok, uid);
  if (need === 'edit' && role !== 'edit') throw new HttpError(403, 'Tahrirlash uchun maxsus kod kerak');
  if (need === 'owner' && !(uid && (tree.owner === uid || !tree.owner) && role === 'edit')) throw new HttpError(403, 'Bu amal faqat shajara egasi uchun');
  return { tok, tree, user, uid, role };
}

const checkVer = (tree, tok) => {
  if ((tree.ver || 1) !== tok.ver) throw new HttpError(401, "Kodlar o'zgargan. Qaytadan kiring");
};

function out(tree, role, uid) {
  const p = publicTree(tree, role, uid ? String(uid) : null);
  p.photoSig = signMedia('p:' + tree.id);
  p.invite = `https://t.me/${BOT()}?start=${signInvite(tree.id, tree.ver || 1)}`;
  return p;
}

const session = (tree, role, uid) => ({ token: signToken({ treeId: tree.id, role, ver: tree.ver || 1, uid }), tree: out(tree, role, uid) });

// ---------------------------------------------------------------- Router --
async function route(req, res) {
  const url = new URL(req.url, 'http://x');
  let path = url.searchParams.get('route') ?? url.pathname.replace(/^\/api\/?/, '');
  path = path.replace(/^\/+|\/+$/g, '');
  const m = req.method;
  const parts = path.split('/');

  if (path === 'health') return send(res, 200, { ok: true, storage: process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : 'local' });

  // ---- Kirish
  if (path === 'open' && m === 'POST') {
    const body = await readBody(req);
    const user = tgUser(req);
    await guardAttempts(user, clientIp(req));
    let tree = await findTreeByCode(body.code);
    if (!tree) {
      await failAttempt(user);
      throw new HttpError(404, 'Bunday kodli shajara topilmadi');
    }
    tree = await remember(tree, user, 'view');
    const role = roleOf(tree, { role: 'view' }, user && String(user.id));
    return send(res, 200, session(tree, role, user?.id));
  }
  if (path === 'join' && m === 'POST') {
    const body = await readBody(req);
    const user = tgUser(req);
    const inv = parseInvite(body.inv);
    const tree0 = inv && (await loadTree(inv.treeId).catch(() => null));
    if (!tree0 || !checkInvite(inv, tree0.ver || 1)) throw new HttpError(404, 'Taklif havolasi eskirgan. Yangisini so‘rang');
    const tree = await remember(tree0, user, 'view');
    return send(res, 200, session(tree, roleOf(tree, { role: 'view' }, user && String(user.id)), user?.id));
  }
  if (path === 'create' && m === 'POST') {
    const body = await readBody(req);
    const user = tgUser(req);
    if (!rateLimit('create:' + (user?.id || clientIp(req)), 5, 60 * 60e3)) throw new HttpError(429, "Juda ko'p shajara yaratildi. Keyinroq urinib ko'ring");
    if (String(body.editCode || '').trim().length < 6) throw new HttpError(400, "Tahrir kodi kamida 6 belgi bo'lsin");
    let tree = await createTree({ ...body, persons: null, meta: null, who: nameOf(user), owner: user?.id });
    tree = await remember(tree, user, 'edit');
    return send(res, 200, session(tree, 'edit', user?.id));
  }
  if (path === 'tree' && m === 'GET') {
    const { tree, user, role } = await authTree(req);
    const t2 = await remember(tree, user, role);
    return send(res, 200, { tree: out(t2, role, user && String(user.id)) });
  }
  if (path === 'unlock' && m === 'POST') {
    const body = await readBody(req);
    const { tree, user, tok } = await authTree(req);
    await guardAttempts(user, clientIp(req));
    if (hashCode(normalizeCode(body.code)) !== tree.editHash) {
      await failAttempt(user);
      throw new HttpError(403, "Tahrir kodi noto'g'ri");
    }
    checkVer(tree, tok);
    const t2 = await remember(tree, user, 'edit');
    return send(res, 200, session(t2, 'edit', user?.id));
  }

  // ---- Fayldan import (CSV/Excel qatorlari yoki eksport qilingan JSON)
  if (path === 'import' && m === 'POST') {
    const body = await readBody(req);
    const replace = body.mode === 'replace';
    const { tok, user, uid } = await authTree(req, replace ? 'owner' : 'edit');
    const r = await mutateTree(tok.treeId, (t) => (checkVer(t, tok), replace ? replacePersons(t, body.data, nameOf(user)) : importRows(t, body.rows, nameOf(user))));
    return send(res, 200, { count: r.result, tree: out(r.data, 'edit', uid) });
  }

  // ---- Shaxslar
  if (parts[0] === 'person') {
    const { tok, user, uid, tree: t0 } = await authTree(req, 'edit');
    const actor = nameOf(user);
    const pid = parts[1];
    let r;
    let note = null;
    if (parts.length === 1 && m === 'POST') {
      const body = await readBody(req);
      r = await mutateTree(t0.id, (t) => (checkVer(t, tok), addPerson(t, body, actor)));
      note = (lang) => t(lang, '🌱 <b>{who}</b> shajaraga yangi a’zo qo‘shdi: {name}', { who: escapeHtml(actor || ''), name: escapeHtml(r.result.name) });
    } else if (parts.length === 2 && m === 'PATCH') {
      const body = await readBody(req);
      r = await mutateTree(t0.id, (t) => (checkVer(t, tok), updatePerson(t, pid, body, actor)));
    } else if (parts.length === 2 && m === 'DELETE') {
      r = await mutateTree(t0.id, (t) => (checkVer(t, tok), deletePerson(t, pid, actor)));
      if (r.result.photo) await deleteKey(`photos/${t0.id}/${r.result.photo}`);
    } else if (parts[2] === 'photo' && (m === 'POST' || m === 'DELETE')) {
      const body = m === 'POST' ? await readBody(req) : {};
      const file = m === 'POST' ? await savePhoto(t0.id, pid, body.data) : null;
      let old = null;
      let name = '';
      r = await mutateTree(t0.id, (t) => {
        checkVer(t, tok);
        const p = t.persons.find((x) => x.id === pid);
        if (!p) throw new HttpError(404, 'Shaxs topilmadi');
        old = p.photo;
        name = p.name;
        p.photo = file;
        t.updatedAt = new Date().toISOString();
        t.log = t.log || [];
        t.log.unshift({ at: t.updatedAt, who: actor || 'Tahrirchi', action: file ? 'photo' : 'photo-del', name: p.name });
      });
      if (old && old !== file) await deleteKey(`photos/${t0.id}/${old}`);
      if (file) note = (lang) => t(lang, '🖼 <b>{who}</b> {name} suratini yangiladi', { who: escapeHtml(actor || ''), name: escapeHtml(name) });
    } else throw new HttpError(404, 'Topilmadi');
    if (note) await notify(r.data, 'tree', note, { except: uid }).catch(() => {});
    return send(res, 200, { person: r.result?.id ? r.result : undefined, tree: out(r.data, 'edit', uid) });
  }

  if (path === 'settings' && m === 'PATCH') {
    const body = await readBody(req);
    const codes = body.viewCode || body.editCode;
    const { tok, user, uid } = await authTree(req, codes ? 'owner' : 'edit');
    if (body.editCode && normalizeCode(body.editCode).length < 6) throw new HttpError(400, "Tahrir kodi kamida 6 belgi bo'lsin");
    const r = await mutateTree(tok.treeId, async (t) => {
      checkVer(t, tok);
      if (['members', 'editors'].includes(body.albumUpload)) t.settings = { ...(t.settings || {}), albumUpload: body.albumUpload };
      return changeSettings(t, body, nameOf(user));
    });
    return send(res, 200, session(r.data, 'edit', uid));
  }

  // ---- A'zolar (kim kirgan, tahrirchilar, bloklash)
  if (parts[0] === 'members') {
    if (m === 'GET') {
      const { tree, uid } = await authTree(req, 'edit');
      const list = Object.entries(tree.members || {}).map(([id, x]) => ({
        id, name: x.name, username: x.username, role: x.role, at: x.at, owner: tree.owner === id, me: id === uid,
      }));
      const banned = (tree.banned || []).map((id) => ({ id, name: tree.bannedNames?.[id] || id }));
      return send(res, 200, { members: list, banned });
    }
    if (m === 'PATCH' && parts[1]) {
      const body = await readBody(req);
      const { tree, uid } = await authTree(req, 'owner');
      const target = parts[1];
      if (target === uid) throw new HttpError(400, 'O‘zingizni o‘zgartira olmaysiz');
      const r = await mutateTree(tree.id, (t) => {
        t.members = t.members || {};
        if (body.role && t.members[target]) t.members[target].role = body.role === 'edit' ? 'edit' : 'view';
        if (body.ban === true) {
          t.banned = [...new Set([...(t.banned || []), target])];
          t.bannedNames = { ...(t.bannedNames || {}), [target]: t.members[target]?.name || target };
          delete t.members[target];
        }
        if (body.ban === false) t.banned = (t.banned || []).filter((x) => x !== target);
        if (body.owner === true && t.members[target]) {
          t.owner = target;
          t.members[target].role = 'edit';
        }
      });
      return send(res, 200, { ok: true, memberCount: Object.keys(r.data.members || {}).length });
    }
  }

  // ---- Guruh / kanal ulash kodi
  if (path === 'linkcode' && m === 'POST') {
    const body = await readBody(req);
    const { tree, user } = await authTree(req, 'edit');
    const kind = body.kind === 'channel' ? 'channel' : 'group';
    const code = randomCode(8);
    const exp = Date.now() + 30 * 60e3;
    await writeJson(linkKey(code), { treeId: tree.id, kind, exp, by: user?.id || null });
    return send(res, 200, { code, exp, bot: BOT() });
  }
  if (path === 'unlink' && m === 'POST') {
    const body = await readBody(req);
    const { tree, uid } = await authTree(req, 'edit');
    const id = body.id === 'channel' ? tree.channel?.id : Number(body.id);
    if (!id) throw new HttpError(400, 'Topilmadi');
    await deleteKey(chatKey(id));
    const r = await mutateTree(tree.id, (t) => {
      if (t.channel?.id === id) t.channel = null;
      t.groups = (t.groups || []).filter((g) => g.id !== id);
    });
    tg('leaveChat', { chat_id: id }).catch(() => {});
    return send(res, 200, { tree: out(r.data, 'edit', uid) });
  }

  // ---- Shaxsiy sozlamalar: til, bildirishnomalar
  if (path === 'me' && m === 'PATCH') {
    const body = await readBody(req);
    const { tree, user, uid } = await authTree(req);
    if (!user) throw new HttpError(400, 'Bu funksiya faqat Telegram ichida ishlaydi');
    const lang = LANGS.includes(body.lang) ? body.lang : undefined;
    if (lang) await updateUser(user.id, user, (d) => { d.lang = lang; });
    await mutateTree(tree.id, (t) => {
      const mem = t.members?.[uid];
      if (!mem) return;
      if (lang) mem.lang = lang;
      if (body.notify && typeof body.notify === 'object') {
        mem.notify = { ...(mem.notify || {}) };
        for (const k of ['tree', 'album', 'bday']) if (k in body.notify) mem.notify[k] = !!body.notify[k];
      }
    });
    return send(res, 200, { ok: true });
  }

  // ---- Albom
  if (parts[0] === 'album') {
    const ctx = await authTree(req);
    const { tree, uid, role, user } = ctx;
    const by = { id: uid, name: nameOf(user) || 'Tahrirchi' };
    if (parts.length === 1 && m === 'GET') {
      const doc = await loadAlbum(tree.id);
      return send(res, 200, { ...publicAlbum(doc, tree, uid), hasChannel: !!tree.channel, canUpload: canUpload(tree, uid, role), canEdit: role === 'edit', me: uid });
    }
    if (parts.length === 1 && m === 'POST') {
      if (!canUpload(tree, uid, role)) throw new HttpError(403, 'Ruxsat yo‘q');
      const body = await readBody(req);
      const r = await mutateAlbum(tree.id, (doc) => ensureAlbum(doc, body.name, by));
      return send(res, 200, { album: r.result });
    }
    if (parts[1] === 'upload' && m === 'POST') {
      if (!canUpload(tree, uid, role)) throw new HttpError(403, 'Ruxsat yo‘q');
      const body = await readBody(req);
      const mm = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(String(body.data || ''));
      if (!mm) throw new HttpError(400, 'Rasm formati noto‘g‘ri');
      const buf = Buffer.from(mm[3], 'base64');
      if (buf.length > 3.5 * 1024 * 1024) throw new HttpError(413, 'Rasm juda katta');
      const target = tree.channel?.id;
      if (!target) throw new HttpError(400, 'Avval albom kanalini ulang');
      const albumName = cleanName(body.albumName);
      const doc = await loadAlbum(tree.id);
      const aName = doc.albums.find((a) => a.id === body.album)?.name || albumName || 'Umumiy';
      const cap = `📁 <b>${escapeHtml(aName)}</b>${body.caption ? '\n' + escapeHtml(cleanName(body.caption, 900)) : ''}\n— ${escapeHtml(by.name)}`;
      const sent = await tgUpload('sendPhoto', { chat_id: target, caption: cap, parse_mode: 'HTML' }, 'photo', buf, 'photo.jpg', mm[1]);
      if (!sent.ok) throw new HttpError(502, 'Telegramga yuklab bo‘lmadi');
      const media = mediaOf(sent.result);
      const r = await addToAlbum(tree, { inChannel: true, albumId: body.album, albumName, caption: body.caption, media: [{ ...media, ch: { chat: target, msg: sent.result.message_id } }], by });
      return send(res, 200, { ok: true, album: r.album });
    }
    if (parts[1] === 'a' && parts[2]) {
      if (role !== 'edit') throw new HttpError(403, 'Faqat tahrirchilar uchun');
      const aid = parts[2];
      if (m === 'PATCH') {
        const body = await readBody(req);
        const name = cleanName(body.name);
        if (!name) throw new HttpError(400, 'Nom kiriting');
        await mutateAlbum(tree.id, (d) => { const a = d.albums.find((x) => x.id === aid); if (a) a.name = name; });
        return send(res, 200, { ok: true });
      }
      if (m === 'DELETE') {
        // Albom o'chsa, fayllar yo'qolmaydi — "Umumiy" albomiga o'tadi.
        await mutateAlbum(tree.id, (d) => {
          const left = d.items.filter((x) => x.album === aid);
          d.albums = d.albums.filter((x) => x.id !== aid);
          if (left.length) {
            const g = ensureAlbum(d, 'Umumiy', by);
            for (const it of left) it.album = g.id;
          }
        });
        return send(res, 200, { ok: true });
      }
    }
    if (parts[1] === 'i' && parts[2]) {
      const iid = parts[2];
      const doc = await loadAlbum(tree.id);
      const it = doc.items.find((x) => x.id === iid);
      if (!it) throw new HttpError(404, 'Fayl topilmadi');
      if (parts[3] === 'send' && m === 'POST') {
        if (!uid) throw new HttpError(400, 'Bu funksiya faqat Telegram ichida ishlaydi');
        const a = doc.albums.find((x) => x.id === it.album);
        const r = await sendStored(uid, it, `📁 <b>${escapeHtml(a?.name || '')}</b>${it.caption ? '\n' + escapeHtml(it.caption) : ''}`);
        if (!r.ok) throw new HttpError(502, 'Yuborib bo‘lmadi. Avval botga /start yozing');
        const u = await mutateAlbum(tree.id, (d) => { const x = d.items.find((y) => y.id === iid); if (x) x.sends = (x.sends || 0) + 1; return x?.sends; }).catch(() => null);
        return send(res, 200, { ok: true, sends: u?.result });
      }
      if ((parts[3] === 'view' || parts[3] === 'like') && m === 'POST') {
        if (parts[3] === 'like' && !uid) return send(res, 200, { ok: true });
        const r = await mutateAlbum(tree.id, (d) => {
          const x = d.items.find((y) => y.id === iid);
          if (!x) return null;
          if (parts[3] === 'view') x.views = (x.views || (x.seen || []).length) + 1;
          else {
            const arr = (x.likes ||= []);
            const i = arr.indexOf(uid);
            if (i < 0) arr.push(uid); else arr.splice(i, 1);
          }
          return { views: x.views || 0, likes: (x.likes || []).length, liked: (x.likes || []).includes(uid) };
        });
        return send(res, 200, r.result || {});
      }
      if (role !== 'edit') throw new HttpError(403, 'Albomni faqat tahrir rejimidagilar o‘zgartira oladi');
      if (m === 'PATCH') {
        const body = await readBody(req);
        await mutateAlbum(tree.id, (d) => {
          const x = d.items.find((y) => y.id === iid);
          if (!x) return;
          if ('caption' in body) x.caption = cleanName(body.caption, 900);
          if (body.album && d.albums.some((a) => a.id === body.album)) x.album = body.album;
          if (body.albumName) x.album = ensureAlbum(d, body.albumName, by).id;
        });
        return send(res, 200, { ok: true });
      }
      if (m === 'DELETE') {
        await mutateAlbum(tree.id, (d) => { d.items = d.items.filter((y) => y.id !== iid); });
        if (it.ch) await tg('deleteMessage', { chat_id: it.ch.chat, message_id: it.ch.msg });
        return send(res, 200, { ok: true });
      }
    }
    throw new HttpError(404, 'Topilmadi');
  }

  // ---- Telegram fayllarini ko'rsatish (imzolangan, CDN keshlanadi)
  if (path === 'media' && m === 'GET') {
    const f = url.searchParams.get('f') || '';
    if (!verifyMedia(f, url.searchParams.get('e'), url.searchParams.get('s'))) throw new HttpError(403, 'Havola eskirgan');
    const CH = 4 * 1024 * 1024 - 1;
    const rg = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
    const start = rg && rg[1] ? Number(rg[1]) : 0;
    const end = rg && rg[2] ? Math.min(Number(rg[2]), start + CH) : start + CH;
    const size = Number(url.searchParams.get('z')) || 0;
    let file = null;
    if (size > 20 * 1024 * 1024) {
      // Bot API 20 MB dan kattasini bermaydi — MTProto orqali (bot tokeni bilan)
      const { mtprotoPart, mtprotoOn } = await import('../lib/mtproto.js');
      if (!mtprotoOn()) throw new HttpError(413, 'Fayl katta — Telegramda oching');
      const r = await mtprotoPart(f, start, end, size, { chat: url.searchParams.get('c'), msg: Number(url.searchParams.get('m')) || 0 });
      file = { ...r, path: '' };
    } else file = await fetchFilePart(f, start, end);
    if (!file) throw new HttpError(404, 'Fayl topilmadi');
    const ext = (url.searchParams.get('x') || file.path.split('.').pop() || '').toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const whole = start === 0 && file.buffer.length >= file.total;
    if (!rg && whole) return send(res, 200, file.buffer, { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=86400, s-maxage=604800, immutable' });
    if (!rg && file.total > file.buffer.length && !/^(video|audio)/.test(type)) throw new HttpError(413, 'Fayl katta — Telegramda oching');
    return send(res, 206, file.buffer, {
      'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=86400',
      'content-range': `bytes ${start}-${start + file.buffer.length - 1}/${file.total}`,
    });
  }

  // ---- Shaxs suratlari (maxfiy do'kondan, imzo bilan)
  if (parts[0] === 'photo' && parts.length === 3 && m === 'GET') {
    if (!verifyMedia('p:' + parts[1], url.searchParams.get('e'), url.searchParams.get('s'))) throw new HttpError(401, 'Ruxsat yo‘q');
    if (!/^[a-z0-9-]+\.(jpg|png|webp)$/i.test(parts[2])) throw new HttpError(400, 'Fayl nomi noto‘g‘ri');
    const f = await getFile(`photos/${parts[1]}/${parts[2]}`);
    if (!f) throw new HttpError(404, 'Surat topilmadi');
    return send(res, 200, f.buffer, { 'content-type': f.contentType, 'cache-control': 'private, max-age=31536000, immutable' });
  }

  // ---- Premium (Telegram Stars)
  if (path === 'premium' && m === 'POST') {
    const body = await readBody(req);
    const { tree } = await authTree(req);
    const plan = PLANS[body.plan] ? body.plan : 'year';
    const lang = LANGS.includes(body.lang) ? body.lang : 'uz';
    const r = await tg('createInvoiceLink', {
      title: `Shajara Premium — ${tree.title}`.slice(0, 32),
      description: (lang === 'ru' ? 'Безлимитный альбом и все функции для всей семьи' : lang === 'en' ? 'Unlimited album and all features for the whole family' : 'Cheksiz albom va barcha imkoniyatlar — butun oila uchun').slice(0, 255),
      payload: `prem:${tree.id}:${plan}`, currency: 'XTR', prices: [{ label: plan, amount: PLANS[plan].stars() }],
    });
    if (!r.ok) throw new HttpError(502, 'To‘lov havolasini yaratib bo‘lmadi');
    return send(res, 200, { link: r.result });
  }
  if (path === 'plans' && m === 'GET') {
    return send(res, 200, { month: PLANS.month.stars(), year: PLANS.year.stars(), paywall: process.env.PAYWALL === 'on' });
  }

  // ---- Zaxira nusxa
  if (path === 'export' && m === 'POST') {
    const { tree, uid } = await authTree(req, 'edit');
    if (!uid) throw new HttpError(400, 'Bu funksiya faqat Telegram ichida ishlaydi');
    const album = await loadAlbum(tree.id);
    const data = { meta: { ...tree.meta, title: tree.title, updated: tree.updatedAt }, persons: tree.persons, album };
    const day = new Date().toISOString().slice(0, 10);
    const j = await sendDocument(uid, `shajara-${day}.json`, Buffer.from(JSON.stringify(data, null, 1)),
      `💾 <b>${escapeHtml(tree.title)}</b> — ${tree.persons.length} · ${album.items.length} 📸 · ${day}`);
    if (!j.ok) throw new HttpError(500, 'Yuborib bo‘lmadi. Avval botga /start yozing');
    return send(res, 200, { ok: true });
  }

  // ---- Telegram webhook
  // Tezlikni o'lchash: ombor va Telegram javob vaqti (ms)
  if (path === 'ping' && m === 'GET') {
    let t = Date.now();
    await readJson('users/0.json').catch(() => null);
    const blobMs = Date.now() - t;
    t = Date.now();
    await tg('getMe', {});
    return send(res, 200, { blobMs, telegramMs: Date.now() - t, region: process.env.VERCEL_REGION || null });
  }

  // ---- Takroriy odamlarni topish va birlashtirish
  if (parts[0] === 'dupes') {
    const { tok, tree, user, uid } = await authTree(req, 'edit');
    if (m === 'GET') {
      const byId = new Map(tree.persons.map((p) => [p.id, p]));
      const brief = (p) => ({ id: p.id, name: p.name, birth: p.birth, death: p.death, photo: !!p.photo, kids: tree.persons.filter((x) => x.father_id === p.id || x.mother_id === p.id).length });
      return send(res, 200, { pairs: findDuplicates(tree).map((x) => ({ keep: brief(byId.get(x.keep)), drop: brief(byId.get(x.drop)), type: x.type, of: byId.get(x.of)?.name || '' })) });
    }
    if (parts[1] === 'merge' && m === 'POST') {
      const body = await readBody(req);
      const pairs = (Array.isArray(body.pairs) ? body.pairs : []).slice(0, 500);
      const r = await mutateTree(tok.treeId, (t) => {
        checkVer(t, tok);
        let n = 0;
        for (const [keep, drop] of pairs) if (mergePersons(t, String(keep), String(drop), nameOf(user))) n++;
        return n;
      });
      return send(res, 200, { merged: r.result, tree: out(r.data, 'edit', uid) });
    }
  }

  // ---- AI: fayldan ro'yxat (Mini App). Uzoq ish — fon vazifasi, ilova holatini so'rab turadi
  if (parts[0] === 'ai' && parts[1]) {
    const jobKey = (id) => `aijobs/${String(id).replace(/[^a-z0-9]/gi, '')}.json`;
    if (parts[1] === 'file' && m === 'POST') {
      const body = await readBody(req);
      const user = verifyInitData(req.headers['x-init-data']);
      if (!rateLimit('aifile:' + (user?.id || clientIp(req)), 10, 60 * 60e3)) throw new HttpError(429, 'Juda ko‘p fayl. Birozdan so‘ng urinib ko‘ring');
      const buf = Buffer.from(String(body.data || ''), 'base64');
      if (!buf.length) throw new HttpError(400, 'Fayl bo‘sh');
      if (buf.length > 3 * 1024 * 1024) throw new HttpError(413, 'Fayl juda katta (3 MB gacha)');
      const ai = await import('../lib/ai.js');
      const content = ai.fileToContent(buf, String(body.name || 'file').slice(0, 120), String(body.mime || ''));
      if (!content) throw new HttpError(415, 'Bu formatni o‘qib bo‘lmaydi. Faylni .xlsx, .docx, .pdf, .csv, .txt yoki rasm qilib yuboring');
      let tree = null;
      try { tree = (await authTree(req)).tree; } catch {}
      const id = randomId(14);
      const lang = ['uz', 'uzc', 'ru', 'en'].includes(body.lang) ? body.lang : 'uz';
      await writeJson(jobKey(id), { status: 'pending', at: Date.now() });
      const job = (async () => {
        try {
          const r = await ai.extractFamily(content, lang);
          const plan = tree ? planGraph(tree, r.rows) : null;
          await writeJson(jobKey(id), { status: 'done', at: Date.now(), rows: r.rows, summary: r.summary, count: r.rows.length, matched: plan?.matched.size ?? 0, fresh: plan?.newCount ?? r.rows.length });
        } catch (e) {
          console.error('ai file', e);
          await writeJson(jobKey(id), { status: 'error', at: Date.now(), error: 'AI faylni tahlil qila olmadi. Boshqa formatda yuborib ko‘ring' });
        }
      })();
      try { waitUntil(job); } catch { await job; }
      return send(res, 200, { job: id });
    }
    if (parts[1] === 'job' && parts[2] && m === 'GET') {
      const d = (await readJson(jobKey(parts[2])))?.data;
      if (!d) throw new HttpError(404, 'Topilmadi');
      if (d.status === 'pending' && Date.now() - d.at > 6 * 60e3) return send(res, 200, { status: 'error', error: 'Vaqt tugadi. Qayta urinib ko‘ring' });
      // joriy shajara bilan qayta solishtiramiz (bekor qilish yoki tahrirdan keyin sonlar yangilansin)
      if (d.status === 'done' && req.headers.authorization) {
        try {
          const plan = planGraph((await authTree(req)).tree, d.rows);
          Object.assign(d, { matched: plan.matched.size, fresh: plan.newCount, newIds: d.rows.filter((r) => !plan.matched.has(String(r.id))).map((r) => r.id) });
        } catch {}
      }
      return send(res, 200, d);
    }
    if (parts[1] === 'undo' && m === 'POST') {
      const { tok, user, uid } = await authTree(req, 'edit');
      const r = await mutateTree(tok.treeId, (t) => (checkVer(t, tok), undoImport(t, nameOf(user))));
      return send(res, 200, { removed: r.result, tree: out(r.data, 'edit', uid) });
    }
    if (parts[1] === 'apply' && m === 'POST') {
      const body = await readBody(req);
      const { tok, user, uid } = await authTree(req, 'edit');
      const d = (await readJson(jobKey(body.job || '')))?.data;
      if (d?.status !== 'done' || !d.rows?.length) throw new HttpError(404, 'Ma’lumot eskirgan. Faylni qayta yuboring');
      const r = await mutateTree(tok.treeId, (t) => (checkVer(t, tok), importGraph(t, d.rows, nameOf(user) || 'AI')));
      return send(res, 200, { ...r.result, tree: out(r.data, 'edit', uid) });
    }
    if (parts[1] === 'csv' && m === 'POST') {
      const body = await readBody(req);
      const user = verifyInitData(req.headers['x-init-data']);
      if (!user) throw new HttpError(400, 'Bu funksiya faqat Telegram ichida ishlaydi');
      const d = (await readJson(jobKey(body.job || '')))?.data;
      if (d?.status !== 'done') throw new HttpError(404, 'Ma’lumot eskirgan. Faylni qayta yuboring');
      const { rowsToCsv } = await import('../lib/ai.js');
      const r = await tgUpload('sendDocument', { chat_id: user.id, caption: `📋 ${d.count}` }, 'document', Buffer.from(rowsToCsv(d.rows)), 'shajara.csv', 'text/csv');
      if (!r.ok) throw new HttpError(502, 'Yuborib bo‘lmadi. Avval botga /start yozing');
      return send(res, 200, { ok: true });
    }
  }

  // Mini App ichidagi AI yordamchi
  if (path === 'ai' && m === 'POST') {
    const body = await readBody(req);
    const user = verifyInitData(req.headers['x-init-data']);
    if (!rateLimit('ai:' + (user?.id || clientIp(req)), 20, 60 * 60e3)) throw new HttpError(429, 'Juda ko‘p savol. Birozdan so‘ng urinib ko‘ring');
    const q = String(body.q || '').trim().slice(0, 2000);
    if (!q) throw new HttpError(400, 'Savol bo‘sh');
    const history = (Array.isArray(body.history) ? body.history : []).slice(-8)
      .filter((x) => ['user', 'assistant'].includes(x?.role) && typeof x.content === 'string')
      .map((x) => ({ role: x.role, content: x.content.slice(0, 2000) }));
    const { answerQuestion } = await import('../lib/ai.js');
    try {
      return send(res, 200, { answer: await answerQuestion(q, history, ['uz', 'uzc', 'ru', 'en'].includes(body.lang) ? body.lang : 'uz') });
    } catch (e) {
      console.error('ai', e);
      throw new HttpError(503, 'AI hozir javob bera olmadi. Birozdan so‘ng qayta urinib ko‘ring');
    }
  }

  // AI ulanishini tekshirish (juda qisqa so'rov, cheklangan)
  if (path === 'aihealth' && m === 'GET') {
    if (!rateLimit('aihealth', 5, 60 * 60e3)) throw new HttpError(429, 'Keyinroq');
    try { return send(res, 200, await (await import('../lib/ai.js')).aiHealth()); } catch (e) { return send(res, 200, { ok: false, error: String(e.message || e).slice(0, 300) }); }
  }

  if (path === 'webhook' && m === 'POST') {
    if (req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret()) return send(res, 401, { ok: false });
    const update = await readBody(req);
    // Telegram'ga darhol javob beramiz, ishni fonda davom ettiramiz — keyingi xabarlar navbatda kutib qolmaydi
    const job = handleUpdate(update).catch((e) => console.error('webhook', e));
    try { waitUntil(job); } catch { await job; }
    return send(res, 200, { ok: true });
  }

  // ---- Har kuni 09:00 (Toshkent): tug'ilgan kun va xotira kunlari
  if (path === 'cron') {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, 'Ruxsat yo‘q');
    let sent = 0;
    // eski AI vazifalarini tozalash (1 kundan eski)
    for (const key of await listKeys('aijobs/')) {
      const d = (await readJson(key).catch(() => null))?.data;
      if (!d || Date.now() - (d.at || 0) > 864e5) await deleteKey(key).catch(() => {});
    }
    for (const key of await listKeys('trees/')) {
      const tr = (await readJson(key))?.data;
      if (!tr) continue;
      if (!todayText(tr, 'uz')) continue;
      sent += await notify(tr, 'bday', (lang) => todayText(tr, lang));
    }
    return send(res, 200, { ok: true, sent });
  }

  // ---- Ma'mur
  if (path === 'admin/seed') {
    if (!process.env.ADMIN_KEY || url.searchParams.get('key') !== process.env.ADMIN_KEY) throw new HttpError(401, 'Ruxsat yo‘q');
    if (!process.env.SEED_KEY) throw new HttpError(400, 'SEED_KEY sozlanmagan');
    const raw = Buffer.from(readFileSync(new URL('../data/seed.enc', import.meta.url), 'utf8'), 'base64');
    const key = crypto.createHash('sha256').update(process.env.SEED_KEY).digest();
    const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    const src = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
    const tree = await createTree({
      title: src.meta?.title || 'Shajara', viewCode: url.searchParams.get('view'), editCode: url.searchParams.get('edit'),
      persons: src.persons, meta: { root_id: src.meta?.root_id || src.persons?.[0]?.id, next_id: src.meta?.next_id }, who: 'Import',
    });
    return send(res, 200, { ok: true, id: tree.id, persons: tree.persons.length });
  }
  // ---- Loyiha egasining admin paneli (x-admin-key bilan)
  if (path.startsWith('admin/') && ['admin/overview', 'admin/premium', 'admin/broadcast'].includes(path)) {
    const key = String(req.headers['x-admin-key'] || '');
    const real = process.env.ADMIN_KEY || '';
    if (!rateLimit('admin:' + clientIp(req), 30)) throw new HttpError(429, "Juda ko'p urinish");
    if (!real || key.length !== real.length || !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(real))) {
      await sleep(600);
      throw new HttpError(401, 'Kalit noto‘g‘ri');
    }
    if (path === 'admin/overview') {
      const trees = [];
      for (const k of await listKeys('trees/')) {
        const tr = (await readJson(k))?.data;
        if (!tr) continue;
        const al = await loadAlbum(tr.id);
        trees.push({
          id: tr.id, title: tr.title, persons: tr.persons.length, members: Object.keys(tr.members || {}).length,
          album: al.items.length, groups: (tr.groups || []).length, channel: tr.channel?.title || null,
          premiumUntil: tr.premiumUntil || null, createdAt: tr.createdAt, updatedAt: tr.updatedAt,
          owner: tr.owner ? tr.members?.[tr.owner]?.name || tr.owner : null, ownerId: tr.owner || null, stars: (tr.payments || []).reduce((a, p) => a + (p.stars || 0), 0),
        });
      }
      const users = (await listKeys('users/')).length;
      return send(res, 200, { trees, users, paywall: process.env.PAYWALL === 'on', prices: { month: PLANS.month.stars(), year: PLANS.year.stars() } });
    }
    const body = await readBody(req);
    if (path === 'admin/premium') {
      const days = Number(body.days) || 0;
      const r = await mutateTree(String(body.treeId), (tr) => {
        tr.premiumUntil = days > 0 ? new Date(Math.max(Date.now(), new Date(tr.premiumUntil || 0).getTime()) + days * 864e5).toISOString() : null;
      });
      return send(res, 200, { ok: true, premiumUntil: r.data.premiumUntil });
    }
    if (path === 'admin/broadcast') {
      const text = String(body.text || '').trim().slice(0, 3500);
      if (!text) throw new HttpError(400, 'Matn kiriting');
      const ids = (await listKeys('users/')).map((k) => k.slice(6, -5));
      let sent = 0;
      for (let i = 0; i < ids.length; i += 20) {
        const res2 = await Promise.all(ids.slice(i, i + 20).map((id) => tg('sendMessage', { chat_id: id, text, parse_mode: 'HTML', disable_web_page_preview: true })));
        sent += res2.filter((x) => x.ok).length;
        if (i + 20 < ids.length) await sleep(1000);
      }
      return send(res, 200, { ok: true, sent, total: ids.length });
    }
  }
  if (path === 'admin/migrate') {
    // Eski shajaralar: subscribers → members (bir martalik)
    if (!process.env.ADMIN_KEY || url.searchParams.get('key') !== process.env.ADMIN_KEY) throw new HttpError(401, 'Ruxsat yo‘q');
    let n = 0;
    for (const key of await listKeys('trees/')) {
      const id = key.slice(6, -5);
      await mutateTree(id, (tr) => {
        tr.members = tr.members || {};
        for (const s of tr.subscribers || []) {
          if (!tr.members[s]) tr.members[s] = { name: 'Telegram', role: 'view', at: new Date().toISOString(), notify: { tree: true, album: true, bday: true } };
        }
        delete tr.subscribers;
        n++;
      });
    }
    return send(res, 200, { ok: true, trees: n });
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
