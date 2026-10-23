// Shaxsiy bildirishnomalar (Instagram uslubi): har foydalanuvchining o'z ro'yxati — inbox/<uid>.json.
// Hodisalar: like (faylga), cm (faylga izoh), re (izohga javob), cmlike (izohga like).
// Izoh matni bu yerda ham saqlanmaydi — ko'rsatishda kanaldan o'qiladi (comments.js).
import { readJson, writeJson, updateJson } from './store.js';
import { tg } from './telegram.js';
import { t } from './i18n.js';
import { escapeHtml, mergeLines } from './notify.js';
import { signInvite, signMedia } from './auth.js';

const key = (uid) => `inbox/${uid}.json`;
const URL_ = () => (process.env.PUBLIC_URL || '').replace(/\/$/, '');

export async function getInbox(uid) {
  return (await readJson(key(uid)))?.data || { items: [], read: {} };
}

export async function mutateInbox(uid, fn) {
  if (!await readJson(key(uid))) {
    const d = { items: [], read: {} };
    fn(d);
    try { await writeJson(key(uid), d, null); return; } catch { /* parallel yaratilgan */ }
  }
  await updateJson(key(uid), fn);
}

/** Telegram profil rasmi havolasi (imzolangan, kunlik). */
export function avatarUrl(uid) {
  const { e, s } = signMedia('u:' + uid);
  return `/api/uphoto/${uid}?e=${e}&s=${s}`;
}

const TXT = {
  like: '❤️ <b>{who}</b> «{album}» albomidagi faylingizni yoqtirdi',
  cm: '💬 <b>{who}</b> «{album}» albomidagi faylingizga izoh yozdi:\n{text}',
  re: '↩️ <b>{who}</b> izohingizga javob yozdi:\n{text}',
  cmlike: '❤️ <b>{who}</b> izohingizni yoqtirdi',
};

/**
 * Hodisani `to` foydalanuvchining ro'yxatiga yozish va Telegram orqali xabar berish.
 * ev: { kind, iid, mid?, album, by: {id, name}, text?, off? } — off: like qaytarib olindi.
 */
export async function pushEvent(tree, to, ev) {
  to = String(to || '');
  if (!to || to === String(ev.by?.id)) return;
  const m = tree.members?.[to];
  if (!m || m.blocked || (tree.banned || []).includes(to)) return;
  const k = `${ev.kind}:${ev.iid}:${ev.mid || ''}:${ev.by.id}`;
  let fresh = false;
  await mutateInbox(to, (d) => {
    const i = d.items.findIndex((x) => x.k === k);
    if (ev.off) { if (i >= 0) d.items.splice(i, 1); return; }
    if (i >= 0) return; // qayta like — takror xabar yo'q
    fresh = true;
    d.items.unshift({ k, kind: ev.kind, tree: tree.id, iid: ev.iid, mid: ev.mid || null, album: ev.album || '', by: ev.by, at: new Date().toISOString() });
    d.items = d.items.slice(0, 300);
  }).catch((e) => console.error('inbox', e?.message));
  if (!fresh || m.notify?.social === false) return;
  const lang = m.lang || 'uz';
  const text = t(lang, TXT[ev.kind], { who: escapeHtml(ev.by.name || ''), album: escapeHtml(ev.album || ''), text: escapeHtml(String(ev.text || '').slice(0, 300)) });
  const inv = `${signInvite(tree.id, tree.ver || 1)}_n`;
  await tg('sendMessage', { chat_id: to, parse_mode: 'HTML', text, disable_web_page_preview: true,
    reply_markup: URL_() ? { inline_keyboard: [[{ text: t(lang, '👀 Ko‘rish'), web_app: { url: `${URL_()}/?inv=${inv}` } }]] } : undefined }).catch(() => {});
}

/** Toshkent vaqti bo'yicha bugungi kun boshi (UTC ms). */
export function todayStart(now = Date.now()) {
  const local = now + 5 * 3600e3;
  return local - (local % 864e5) - 5 * 3600e3;
}

/** Kunlik dayjest (19:00): bugun yozilgan izohlar soni — oila guruhlariga bitta xabar. */
export async function commentDigest(tree, doc) {
  if (!tree.groups?.length) return 0;
  const from = todayStart();
  const albums = new Map();
  let n = 0;
  for (const it of doc.items) {
    if (doc.albums.find((x) => x.id === it.album)?.priv && !it.pub) continue; // yopiq albom guruhga chiqmaydi
    const c = (it.cm || []).filter((x) => Date.parse(x.at) >= from).length;
    if (!c) continue;
    n += c;
    const a = doc.albums.find((x) => x.id === it.album)?.name || '';
    albums.set(a, (albums.get(a) || 0) + c);
  }
  const { takeDigest } = await import('./notify.js');
  const evs = await takeDigest(tree.id);
  if (!n && !evs.length) return 0;
  const { appLink } = await import('./telegram.js');
  // faqat izohlar bo'lsa — «Oila izohlari», aks holda «Yangiliklar» bo'limi ochiladi
  const link = await appLink(`${signInvite(tree.id, tree.ver || 1)}_${evs.length ? 'l' : 'f'}`);
  const names = [...albums.keys()].filter(Boolean).slice(0, 5).map((a) => `«${escapeHtml(a)}»`).join(', ');
  let sent = 0;
  for (const g of tree.groups) {
    const lang = g.lang || 'uz';
    const r = await tg('sendMessage', { chat_id: g.id, parse_mode: 'HTML', disable_web_page_preview: true,
      text: [t(lang, '🌙 <b>Bugungi yangiliklar</b>'),
        ...mergeLines(evs.map((e) => e.text[lang] || e.text.uz || Object.values(e.text)[0] || '')).slice(-25).map((x) => '• ' + x),
        ...(n ? [t(lang, '💬 Bugun {albums} albomlaridagi fayllarga <b>{n} ta</b> izoh yozildi', { albums: names, n })] : [])].join('\n'),
      reply_markup: { inline_keyboard: [[{ text: t(lang, '👀 Ko‘rish'), url: link }]] } }).catch(() => null);
    if (r?.ok) sent++;
  }
  return sent;
}
