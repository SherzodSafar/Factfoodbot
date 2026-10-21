// Albom izohlari: MATN serverda saqlanmaydi — shajara kanalida bot xabari sifatida turadi
// (media postiga javob). Albom JSON'ida faqat indeks: it.cm = [{mid, uid, name, at, re, likes, ed}].
// O'qish — MTProto (bot sessiyasi) orqali kanal xabarlaridan, natija xotirada keshlanadi.
import { tg } from './telegram.js';
import { mtprotoOn, readChannelTexts } from './mtproto.js';
import { HttpError } from './tree.js';
import { rateLimit } from './auth.js';
import { loadAlbum, mutateAlbum } from './album.js';
import { escapeHtml } from './notify.js';
import { pushEvent, avatarUrl, getInbox, mutateInbox } from './inbox.js';

const cache = new Map(); // `${chat}:${mid}` -> matn
const ck = (chat, mid) => `${chat}:${mid}`;
const clean = (s) => String(s ?? '').replace(/\r/g, '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, 1000);
const body = (name, text) => `💬 <b>${escapeHtml(name)}</b>: ${escapeHtml(text)}`;
const strip = (raw, name) => {
  const s = String(raw || '');
  const pre = `💬 ${name}: `;
  return s.startsWith(pre) ? s.slice(pre.length) : s.replace(/^💬 [^:\n]{0,80}: /, '');
};

async function texts(chat, list) {
  const need = list.filter((c) => !cache.has(ck(chat, c.mid))).map((c) => c.mid);
  if (need.length && mtprotoOn()) {
    const got = await readChannelTexts(chat, need).catch((e) => { console.error('cm read', e?.message); return null; });
    if (got) for (const c of list) if (got.has(c.mid)) cache.set(ck(chat, c.mid), strip(got.get(c.mid), c.name));
  }
  return list.map((c) => cache.get(ck(chat, c.mid)) ?? null);
}

function person(tree, uid) {
  const m = tree.members?.[uid];
  return { id: uid, name: m?.name || 'Telegram', username: m?.username || null, ph: avatarUrl(uid) };
}

/** /api/album/i/:iid/(c|people) so'rovlari. parts = ['album','i',iid, ...]. */
export async function commentRoute({ tree, uid, role, user, nameOf, m, parts, readBody, url }) {
  const iid = parts[2];
  const doc = await loadAlbum(tree.id);
  const it = doc.items.find((x) => x.id === iid);
  if (!it) throw new HttpError(404, 'Fayl topilmadi');

  if (parts[3] === 'people' && m === 'GET') {
    const k = url.searchParams.get('k') === 'likes' ? 'likes' : 'seen';
    const c = url.searchParams.get('mid') && (it.cm || []).find((x) => x.mid === Number(url.searchParams.get('mid')));
    return { people: [...((c ? c.likes : it[k]) || [])].reverse().slice(0, 300).map((id) => person(tree, String(id))) };
  }
  if (parts[3] !== 'c') return null;
  const chat = tree.channel?.id || it.ch?.chat;
  const cm = it.cm || [];
  const mid = Number(parts[4]) || null;

  if (!mid && m === 'GET') {
    const tx = chat ? await texts(chat, cm) : cm.map(() => null);
    return {
      readable: mtprotoOn(),
      items: cm.map((c, i) => ({
        mid: c.mid, re: c.re || null, at: c.at, ed: !!c.ed, by: person(tree, c.uid), name: c.name,
        text: tx[i], likes: (c.likes || []).length, liked: !!uid && (c.likes || []).includes(uid), mine: c.uid === uid,
      })),
    };
  }
  if (!uid) throw new HttpError(400, 'Bu funksiya faqat Telegram ichida ishlaydi');
  if (!chat) throw new HttpError(400, 'Avval albom kanalini ulang');

  if (!mid && m === 'POST') {
    if (!await rateLimit('cm:' + uid, 20, 10 * 60e3)) throw new HttpError(429, 'Juda ko‘p izoh. Birozdan so‘ng yozing');
    const b = await readBody();
    const text = clean(b.text);
    if (!text) throw new HttpError(400, 'Izoh bo‘sh');
    const re = cm.some((c) => c.mid === Number(b.re) && !c.re) ? Number(b.re) : null; // javob — faqat 1 daraja
    const name = (nameOf(user) || 'Telegram').slice(0, 60);
    const replyTo = re || it.ch?.msg;
    const r = await tg('sendMessage', { chat_id: chat, text: body(name, text), parse_mode: 'HTML', disable_notification: true,
      ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}) });
    if (!r.ok) throw new HttpError(502, 'Kanalga yozib bo‘lmadi. Bot kanalda admin ekanini tekshiring');
    const c = { mid: r.result.message_id, uid, name, at: new Date().toISOString(), re, likes: [] };
    cache.set(ck(chat, c.mid), text);
    await mutateAlbum(tree.id, (d) => { const x = d.items.find((y) => y.id === iid); if (x) (x.cm ||= []).push(c); });
    // fayl egasi va (javob bo'lsa) izoh egasiga bildirishnoma
    const album = doc.albums.find((a) => a.id === it.album)?.name || '';
    const by = { id: uid, name };
    const parent = re && cm.find((x) => x.mid === re);
    if (parent) await pushEvent(tree, parent.uid, { kind: 're', iid, mid: c.mid, album, by, text });
    if (it.by?.id && String(it.by.id) !== String(parent?.uid)) await pushEvent(tree, it.by.id, { kind: 'cm', iid, mid: c.mid, album, by, text });
    return { ok: true, item: { ...c, text, likes: 0, liked: false, mine: true, by: person(tree, uid) } };
  }

  const c = cm.find((x) => x.mid === mid);
  if (!c) throw new HttpError(404, 'Izoh topilmadi');
  if (parts[5] === 'like' && m === 'POST') {
    const r = await mutateAlbum(tree.id, (d) => {
      const x = d.items.find((y) => y.id === iid)?.cm?.find((y) => y.mid === mid);
      if (!x) return null;
      const a = (x.likes ||= []);
      const i = a.indexOf(uid);
      if (i < 0) a.push(uid); else a.splice(i, 1);
      return { likes: a.length, liked: i < 0 };
    });
    if (r.result) await pushEvent(tree, c.uid, { kind: 'cmlike', iid, mid, album: doc.albums.find((a) => a.id === it.album)?.name || '', by: { id: uid, name: nameOf(user) || 'Telegram' }, off: !r.result.liked });
    return r.result || {};
  }
  if (m === 'PATCH') {
    if (c.uid !== uid) throw new HttpError(403, 'Faqat o‘z izohingizni tahrirlay olasiz');
    const text = clean((await readBody()).text);
    if (!text) throw new HttpError(400, 'Izoh bo‘sh');
    const r = await tg('editMessageText', { chat_id: chat, message_id: mid, text: body(c.name, text), parse_mode: 'HTML' });
    if (!r.ok && !/not modified/i.test(r.description || '')) throw new HttpError(502, 'Tahrirlab bo‘lmadi');
    cache.set(ck(chat, mid), text);
    await mutateAlbum(tree.id, (d) => { const x = d.items.find((y) => y.id === iid)?.cm?.find((y) => y.mid === mid); if (x) x.ed = 1; });
    return { ok: true, text };
  }
  if (m === 'DELETE') {
    if (c.uid !== uid && role !== 'edit') throw new HttpError(403, 'Ruxsat yo‘q');
    const gone = new Set([mid, ...cm.filter((x) => x.re === mid).map((x) => x.mid)]); // javoblari bilan
    await mutateAlbum(tree.id, (d) => { const x = d.items.find((y) => y.id === iid); if (x) x.cm = (x.cm || []).filter((y) => !gone.has(y.mid)); });
    for (const id of gone) { cache.delete(ck(chat, id)); await tg('deleteMessage', { chat_id: chat, message_id: id }).catch(() => {}); }
    return { ok: true, removed: [...gone] };
  }
  throw new HttpError(404, 'Topilmadi');
}

// ---------------------------------------------------------------- bildirishnomalar bo'limi --
const fileOf = (doc, it) => ({ iid: it.id, album: doc.albums.find((a) => a.id === it.album)?.name || '', type: it.type, by: it.by || null });

/** GET /api/inbox: k=me — shaxsiy hodisalar; k=fam — oiladagi barcha izohlar (yangisi tepada). */
export async function inboxRoute({ tree, uid, k, onlyCount }) {
  const doc = await loadAlbum(tree.id);
  const chat = tree.channel?.id;
  const byIid = new Map(doc.items.map((x) => [x.id, x]));
  if (onlyCount) {
    if (!uid) return { unread: 0 };
    const ib = await getInbox(uid);
    const seen = ib.read?.[tree.id] || '';
    return { unread: ib.items.filter((x) => x.tree === tree.id && x.at > seen).length };
  }
  // izoh ma'lumoti (matn kanaldan)
  const view = async (pairs) => {
    const list = pairs.map(([it, c]) => c).filter(Boolean);
    const ch = chat || pairs.find(([it]) => it?.ch?.chat)?.[0].ch.chat;
    const tx = ch ? await texts(ch, list).catch(() => list.map(() => null)) : list.map(() => null);
    const T = new Map(list.map((c, i) => [c.mid, tx[i]]));
    return (c) => c && { mid: c.mid, re: c.re || null, at: c.at, name: c.name, by: person(tree, c.uid), text: T.get(c.mid) ?? null,
      likes: (c.likes || []).length, liked: !!uid && (c.likes || []).includes(uid), mine: c.uid === uid };
  };
  if (k === 'fam') {
    const all = [];
    for (const it of doc.items) for (const c of it.cm || []) all.push([it, c]);
    all.sort((a, b) => (a[1].at < b[1].at ? 1 : -1));
    const top = all.slice(0, 80);
    const V = await view(top);
    return { items: top.map(([it, c]) => ({ ...fileOf(doc, it), c: V(c) })) };
  }
  if (!uid) return { items: [] };
  const ib = await getInbox(uid);
  const seen = ib.read?.[tree.id] || '';
  const mine = ib.items.filter((x) => x.tree === tree.id).slice(0, 100);
  const pairs = mine.map((x) => { const it = byIid.get(x.iid); return [it, x.mid && it ? (it.cm || []).find((c) => c.mid === x.mid) : null]; });
  const V = await view(pairs.filter(([it]) => it));
  const items = mine.map((x, i) => {
    const [it, c] = pairs[i];
    if (!it || (x.mid && !c)) return null; // fayl yoki izoh o'chirilgan
    return { kind: x.kind, at: x.at, isNew: x.at > seen, who: { ...person(tree, String(x.by.id)), name: x.by.name }, ...fileOf(doc, it), c: V(c) };
  }).filter(Boolean);
  await mutateInbox(uid, (d) => { d.read = { ...(d.read || {}), [tree.id]: new Date().toISOString() }; }).catch(() => {});
  return { items };
}
