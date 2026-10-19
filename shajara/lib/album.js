// Oilaviy albom: fayllarning o'zi Telegram'da (shajara kanalida) turadi,
// bu yerda faqat ro'yxat — file_id, izoh, albom nomi, kim yuborgani.
import { readJson, writeJson, updateJson, ConflictError } from './store.js';
import { sendStored, mediaOf } from './telegram.js';
import { signMedia, randomId } from './auth.js';
import { HttpError, PAYWALL, LIMITS, isPremium, mutateTree, addLog } from './tree.js';
import { notify, escapeHtml } from './notify.js';
import { t } from './i18n.js';

export const albumKey = (treeId) => `albums/${treeId}.json`;
const INLINE_MAX = 4 * 1024 * 1024; // Vercel javob chegarasi — kattaroq fayllar Telegram orqali ochiladi

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

const mediaUrl = (fileId) => {
  const { e, s } = signMedia(fileId);
  return `/api/media?f=${encodeURIComponent(fileId)}&e=${e}&s=${s}`;
};

export function publicAlbum(doc, tree) {
  const users = tree?.members || {};
  return {
    albums: doc.albums,
    items: doc.items.map((it) => ({
      byUser: it.by?.id ? users[it.by.id]?.username || null : null,
      id: it.id, album: it.album, type: it.type, caption: it.caption, name: it.name, w: it.w, h: it.h, dur: it.dur,
      size: it.size, by: it.by, at: it.at,
      thumb: it.thumbId ? mediaUrl(it.thumbId) : null,
      src: (it.type === 'photo' || ((it.type === 'video' || it.type === 'animation') && it.size && it.size <= INLINE_MAX)) ? mediaUrl(it.fileId) : null,
    })),
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
