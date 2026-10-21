// Oilaviy albom: fayllarning o'zi Telegram'da (shajara kanalida) turadi,
// bu yerda faqat ro'yxat — file_id, izoh, albom nomi, kim yuborgani.
import { readJson, writeJson, updateJson, ConflictError } from './store.js';
import { sendStored, mediaOf } from './telegram.js';
import { signMedia, randomId } from './auth.js';
import { mtprotoOn } from './mtproto.js';
import { HttpError, PAYWALL, LIMITS, isPremium, mutateTree, addLog } from './tree.js';
import { notify, escapeHtml } from './notify.js';
import { t } from './i18n.js';

export const albumKey = (treeId) => `albums/${treeId}.json`;
const INLINE_MAX = 20 * 1024 * 1024; // Bot API yuklab olish chegarasi — kattaroqlari chat orqali ochiladi
const IMG_MAX = 4 * 1024 * 1024; // rasm bir bo'lakda qaytadi

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

export function publicAlbum(doc, tree, uid) {
  const users = tree?.members || {};
  return {
    albums: doc.albums,
    items: doc.items.map((it) => {
      const kind = kindOf(it);
      // 20 MB dan katta video/audio — MTProto orqali bo'laklab (kalitlar sozlangan bo'lsa)
      const big = (kind === 'video' || kind === 'audio') && it.size > INLINE_MAX && mtprotoOn() && it.ch?.msg;
      const ok = kind === 'image' ? !it.size || it.size <= IMG_MAX : kind !== 'file' && (!it.size || it.size <= INLINE_MAX || big);
      return {
        byUser: it.by?.id ? users[it.by.id]?.username || null : null,
        id: it.id, album: it.album, type: it.type, kind, mime: it.mime || null, caption: it.caption, name: it.name, w: it.w, h: it.h, dur: it.dur,
        size: it.size, by: it.by, at: it.at,
        views: it.views || (it.seen || []).length, sends: it.sends || 0, cm: (it.cm || []).length, likes: (it.likes || []).length, liked: !!uid && (it.likes || []).includes(String(uid)),
        thumb: it.thumbId ? mediaUrl(it.thumbId) : null,
        src: ok ? mediaUrl(it.fileId, EXT[it.mime] || (it.type === 'voice' ? 'ogg' : it.type === 'photo' ? 'jpg' : '')) + (big ? `&z=${it.size}&c=${it.ch.chat}&m=${it.ch.msg}` : '') : null,
      };
    }),
  };
}

/**
 * Yuklamani albomga yozish: kanal ulangan bo'lsa avval kanalga yuboriladi (asosiy saqlash joyi).
 * media: mediaOf() natijalari ro'yxati. by: { id, name }.
 */
export async function addToAlbum(tree, { albumId, albumName, caption, media, by, inChannel }) {
  if (!media.length) throw new HttpError(400, 'Fayl yo‘q');
  if (!tree.channel) throw new HttpError(400, 'Avval albom kanalini ulang');
  const doc0 = await loadAlbum(tree.id);
  if (PAYWALL() && !isPremium(tree) && doc0.items.length + media.length > LIMITS.album) {
    throw new HttpError(402, `Bepul tarifda albom limiti: ${LIMITS.album} ta fayl`);
  }
  let album = doc0.albums.find((a) => a.id === albumId);
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
    const a = (albumId && doc.albums.find((x) => x.id === albumId)) || ensureAlbum(doc, name, by);
    for (const it of stored) it.album = a.id;
    doc.items.unshift(...stored);
    return a;
  });
  album = r.result;
  await mutateTree(tree.id, (tr) => {
    addLog(tr, by?.name, 'album', `${album.name} · ${stored.length}`);
  });
  await notify(tree, 'album', (lang) => t(lang, '📸 <b>{who}</b> «{album}» albomiga {n} ta fayl qo‘shdi', { who: escapeHtml(by?.name || ''), album: escapeHtml(album.name), n: stored.length }), { except: by?.id }).catch(() => {});
  return { album, count: stored.length };
}
