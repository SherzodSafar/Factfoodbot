// Oilaviy albom: fayllarning o'zi Telegram'da (shajara kanalida) turadi,
// bu yerda faqat ro'yxat — file_id, izoh, albom nomi, kim yuborgani.
import { readJson, writeJson, updateJson, ConflictError } from './store.js';
import { sendStored, mediaOf, downloadFile } from './telegram.js';
import { signMedia, randomId } from './auth.js';
import { mtprotoOn, readBuffer } from './mtproto.js';
import { r2On, r2Store } from './r2.js';
import { HttpError, PAYWALL, LIMITS, isPremium, mutateTree, addLog, branchScope } from './tree.js';
import { notify, escapeHtml } from './notify.js';
import { t } from './i18n.js';

export const albumKey = (treeId) => `albums/${treeId}.json`;
const INLINE_MAX = 20 * 1024 * 1024; // Bot API yuklab olish chegarasi — kattaroqlari chat orqali ochiladi
// rasm bir bo'lakda qaytadi; R2 kesh bo'lsa katta (asl) rasmlar ham u orqali ochiladi
const IMG_MAX = 4 * 1024 * 1024;
const imgMax = () => (r2On() ? INLINE_MAX : IMG_MAX);

export async function loadAlbum(treeId) {
  return (await readJson(albumKey(treeId)))?.data || { albums: [], items: [] };
}

export async function mutateAlbum(treeId, fn) {
  for (let i = 0; i < 2; i++) {
    const r = await updateJson(albumKey(treeId), fn);
    if (r) return r;
    try {
      await writeJson(albumKey(treeId), { albums: [], items: [] }, null);
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
    }
  }
  throw new HttpError(500, 'Albomni saqlab bo‘lmadi');
}

export function cleanName(s, max = 60) {
  const v = String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  return v || null;
}

export function ensureAlbum(doc, name, by) {
  const n = cleanName(name) || 'Umumiy';
  let a = doc.albums.find((x) => x.name.toLowerCase() === n.toLowerCase());
  if (!a) {
    a = { id: randomId(8), name: n, createdAt: new Date().toISOString(), by: by?.name || null };
    doc.albums.push(a);
  }
  return a;
}

export function canUpload(tree, uid, role) {
  if (!tree.channel) return false; // albom faqat kanal ulangandan keyin
  if ((tree.banned || []).includes(String(uid))) return false;
  if (role === 'edit' || tree.members?.[uid]?.role === 'edit') return true;
  if (!tree.members?.[uid]) return false;
  return (tree.settings?.albumUpload || 'members') === 'members';
}

const mediaUrl = (fileId, x) => {
  const { e, s } = signMedia(fileId);
  return `/api/media?f=${encodeURIComponent(fileId)}&e=${e}&s=${s}${x ? '&x=' + x : ''}`;
};

// Fayl turi: ilovada qanday ochiladi (image | video | audio | file)
export function kindOf(it) {
  const mime = it.mime || '';
  if (it.type === 'photo' || (it.type === 'document' && /^image\/(jpeg|png|webp|gif)/.test(mime))) return 'image';
  if (['video', 'animation', 'video_note'].includes(it.type) || /^video\//.test(mime)) return 'video';
  if (['audio', 'voice'].includes(it.type) || /^audio\//.test(mime)) return 'audio';
  return 'file';
}
const EXT = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/ogg': 'ogg', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

/**
 * Shox oilasining maxfiy albomi (a.priv = { head }): faqat a'zolar ko'radi (a.members).
 * Kimni qo'shishni albomni ochgan kishi (a.owner) hal qiladi: bir martalik taklif yoki so'rovni qabul qilish.
 */
export function albumAccess(tree, a, uid) {
  if (!a?.priv) return true;
  return !!uid && (a.members || []).includes(String(uid));
}
export const albumOwner = (a, uid) => !!uid && String(a?.owner || a?.members?.[0] || '') === String(uid);
// maxfiy fayl R2'da: imzolangan, kunlik havola
const privUrl = (treeId, iid) => { const { e, s } = signMedia('pm:' + iid); return `/api/pm/${treeId}/${iid}?e=${e}&s=${s}`; };

export function publicAlbum(doc, tree, uid) {
  const users = tree?.members || {};
  const vis = new Map(doc.albums.map((a) => [a.id, albumAccess(tree, a, uid)]));
  const headName = (id) => tree.persons.find((p) => p.id === id)?.name || '';
  return {
    // maxfiy albom a'zo bo'lmaganlarga umuman ko'rinmaydi
    albums: doc.albums.filter((a) => vis.get(a.id)).map((a) => {
      if (!a.priv) return a;
      const base = { id: a.id, name: a.name, createdAt: a.createdAt, by: a.by, priv: { head: a.priv.head, headName: headName(a.priv.head) }, members: (a.members || []).length };
      if (!albumOwner(a, uid)) return base;
      const nameOf = (id) => users[id]?.name || 'Telegram';
      return { ...base, owner: true, memberList: (a.members || []).map((id) => ({ id, name: nameOf(id) })) };
    }),
    // maxfiy albom fayli boshqalarga faqat «umumiyda ham ko'rsatish» yoqilgan bo'lsa ko'rinadi (umumiy albomda)
    items: doc.items.filter((it) => vis.get(it.album) !== false || (it.pub && it.alsoIn)).map((it) => {
      const kind = kindOf(it);
      const base = {
        byUser: it.by?.id ? users[it.by.id]?.username || null : null,
        id: it.id, album: vis.get(it.album) === false ? it.alsoIn : it.album, type: it.type, kind, mime: it.mime || null, caption: it.caption, name: it.name, w: it.w, h: it.h, dur: it.dur,
        size: it.size, by: it.by, at: it.at, tags: it.tags || [],
        views: it.views || (it.seen || []).length, sends: it.sends || 0, cm: (it.cm || []).length, likes: (it.likes || []).length, liked: !!uid && (it.likes || []).includes(String(uid)),
      };
      if (it.r2) return { ...base, priv: true, pub: !!it.pub, member: vis.get(it.album) !== false, thumb: kind === 'image' ? privUrl(tree.id, it.id) : it.r2t ? privUrl(tree.id, it.id) + '&t=1' : null, src: privUrl(tree.id, it.id) };
      // 20 MB dan katta video/audio — MTProto orqali oqim bilan (kalitlar sozlangan bo'lsa)
      const big = (kind === 'video' || kind === 'audio') && it.size > INLINE_MAX && mtprotoOn();
      const ok = kind === 'image' ? !it.size || it.size <= imgMax() : kind !== 'file' && (!it.size || it.size <= INLINE_MAX || big);
      return {
        ...base,
        thumb: it.thumbId ? mediaUrl(it.thumbId) : null,
        src: ok ? mediaUrl(it.fileId, EXT[it.mime] || (it.type === 'voice' ? 'ogg' : it.type === 'photo' ? 'jpg' : '')) + (big ? `&z=${it.size}` : '') : null,
      };
    }),
  };
}

const PRIV_MIME = { photo: 'image/jpeg', video: 'video/mp4', animation: 'video/mp4', video_note: 'video/mp4', voice: 'audio/ogg', audio: 'audio/mpeg' };

/**
 * Bot orqali yopiq oilaviy albomga: fayl Telegramdan R2 omboriga ko'chiriladi (kanalga yozilmaydi — boshqalar ko'rmaydi).
 * 20 MB gacha — Bot API orqali, kattasi — MTProto (2 GB gacha). Muqova ham omborga olinadi.
 */
export async function addToPrivAlbum(tree, { albumId, caption, media, by }) {
  const a = (await loadAlbum(tree.id)).albums.find((x) => x.id === albumId && x.priv);
  if (!a || !albumAccess(tree, a, by?.id)) throw new HttpError(403, 'Bu albomga ruxsatingiz yo‘q');
  const cap = cleanName(caption, 900);
  const stored = [];
  for (const m of media) {
    const iid = randomId(10);
    const key = `p/${tree.id}/${iid}`;
    const mime = m.mime || PRIV_MIME[m.type] || 'application/octet-stream';
    let size = m.size;
    let read;
    if (!size || size <= INLINE_MAX) {
      const f = await downloadFile(m.fileId);
      if (!f) throw new HttpError(502, 'Faylni Telegramdan olib bo‘lmadi');
      size = f.buffer.length;
      read = async (x, y) => f.buffer.subarray(x, y + 1);
    } else {
      if (!mtprotoOn()) throw new HttpError(413, 'Fayl juda katta (20 MB gacha)');
      read = (x, y) => readBuffer(m.fileId, x, y, size);
    }
    await r2Store(key, size, mime, read);
    const item = { ...m, id: iid, album: a.id, mime, size, caption: cap, by, at: new Date().toISOString(), r2: key };
    const th = m.thumbId && kindOf(item) !== 'image' ? await downloadFile(m.thumbId).catch(() => null) : null;
    if (th) {
      await r2Store(key + '.t', th.buffer.length, 'image/jpeg', async (x, y) => th.buffer.subarray(x, y + 1));
      item.r2t = 1;
    }
    stored.push(item);
  }
  await mutateAlbum(tree.id, (d) => { d.items.unshift(...stored); });
  return { album: a, count: stored.length };
}

/**
 * Yuklamani albomga yozish: kanal ulangan bo'lsa avval kanalga yuboriladi (asosiy saqlash joyi).
 * media: mediaOf() natijalari ro'yxati. by: { id, name }.
 */
export async function addToAlbum(tree, { albumId, albumName, caption, media, by, inChannel, silent }) {
  if (!media.length) throw new HttpError(400, 'Fayl yo‘q');
  if (!tree.channel) throw new HttpError(400, 'Avval albom kanalini ulang');
  const doc0 = await loadAlbum(tree.id);
  if (PAYWALL() && !isPremium(tree) && doc0.items.length + media.length > LIMITS.album) {
    throw new HttpError(402, `Bepul tarifda albom limiti: ${LIMITS.album} ta fayl`);
  }
  let album = doc0.albums.find((a) => a.id === albumId && !a.priv); // maxfiy albom — kanalga yozilmaydi
  const name = album?.name || cleanName(albumName) || 'Umumiy';
  const cap = cleanName(caption, 900);
  const stored = [];
  for (const m of media) {
    const item = { ...m, id: randomId(10), caption: cap, by, at: new Date().toISOString() };
    if (tree.channel?.id && !inChannel) {
      const text = `📁 <b>${escapeHtml(name)}</b>${cap ? '\n' + escapeHtml(cap) : ''}\n— ${escapeHtml(by?.name || '')}`;
      const r = await sendStored(tree.channel.id, item, text);
      if (r.ok) {
        const again = mediaOf(r.result);
        if (again) Object.assign(item, { fileId: again.fileId, thumbId: again.thumbId || item.thumbId });
        item.ch = { chat: tree.channel.id, msg: r.result.message_id };
      }
    }
    stored.push(item);
  }
  const r = await mutateAlbum(tree.id, (doc) => {
    const a = (albumId && doc.albums.find((x) => x.id === albumId && !x.priv)) || ensureAlbum(doc, name, by);
    for (const it of stored) it.album = a.id;
    doc.items.unshift(...stored);
    return a;
  });
  album = r.result;
  await mutateTree(tree.id, (tr) => {
    addLog(tr, by?.name, 'album', `${album.name} · ${stored.length}`);
  });
  if (!silent) await notify(tree, 'album', (lang) => t(lang, '📸 <b>{who}</b> «{album}» albomiga {n} ta fayl qo‘shdi', { who: escapeHtml(by?.name || ''), album: escapeHtml(album.name), n: stored.length }), { except: by?.id, open: `_a${stored[0].id}` }).catch(() => {});
  return { album, count: stored.length };
}
