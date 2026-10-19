// Telegram Bot API bilan ishlash (kutubxonasiz, oddiy fetch).
const API = () => `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

export async function tg(method, body) {
  try {
    const r = await fetch(`${API()}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const j = await r.json().catch(() => ({ ok: false }));
    if (!j.ok) console.error('Telegram xatosi', method, j.error_code, j.description);
    return j;
  } catch (e) {
    console.error('Telegram tarmoq xatosi', method, e.message);
    return { ok: false, description: e.message };
  }
}

/** Fayl bilan birga yuborish (multipart). */
export async function tgUpload(method, fields, field, buffer, filename, type) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  form.append(field, new Blob([buffer], { type }), filename);
  const r = await fetch(`${API()}/${method}`, { method: 'POST', body: form });
  return r.json().catch(() => ({ ok: false }));
}

export function sendDocument(chatId, filename, buffer, caption) {
  return tgUpload('sendDocument', { chat_id: chatId, caption, parse_mode: 'HTML' }, 'document', buffer, filename, 'application/json');
}

const SEND = {
  photo: ['sendPhoto', 'photo'], video: ['sendVideo', 'video'], document: ['sendDocument', 'document'],
  audio: ['sendAudio', 'audio'], animation: ['sendAnimation', 'animation'], voice: ['sendVoice', 'voice'],
  video_note: ['sendVideoNote', 'video_note'],
};

/** Saqlangan file_id bo'yicha faylni istalgan chatga qayta yuborish. */
export function sendStored(chatId, item, caption, extra = {}) {
  const [method, field] = SEND[item.type] || SEND.document;
  const body = { chat_id: chatId, [field]: item.fileId, ...extra };
  if (item.type !== 'video_note' && caption) {
    body.caption = caption.slice(0, 1024);
    body.parse_mode = 'HTML';
  }
  return tg(method, body);
}

/** Xabardagi media haqida ma'lumot (albom uchun). */
export function mediaOf(msg) {
  if (msg.photo?.length) {
    const big = msg.photo[msg.photo.length - 1];
    const thumb = msg.photo.find((p) => p.width >= 320) || big;
    return { type: 'photo', fileId: big.file_id, uniq: big.file_unique_id, thumbId: thumb.file_id, w: big.width, h: big.height, size: big.file_size };
  }
  for (const type of ['video', 'animation', 'video_note', 'document', 'audio', 'voice']) {
    const m = msg[type];
    if (!m) continue;
    const th = m.thumbnail || m.thumb;
    return {
      type, fileId: m.file_id, uniq: m.file_unique_id, thumbId: th?.file_id || null,
      w: m.width || m.length || null, h: m.height || m.length || null, dur: m.duration || null,
      size: m.file_size || null, mime: m.mime_type || null, name: m.file_name || m.title || null,
    };
  }
  return null;
}

/** Faylni Telegram serveridan yuklab olish (20 MB gacha). */
export async function downloadFile(fileId) {
  const j = await tg('getFile', { file_id: fileId });
  if (!j.ok) return null;
  const r = await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${j.result.file_path}`);
  if (!r.ok) return null;
  return { buffer: Buffer.from(await r.arrayBuffer()), path: j.result.file_path };
}

// file_path ~1 soat amal qiladi — har so'rovda getFile chaqirmaslik uchun xotirada saqlaymiz
const pathCache = new Map();
async function filePath(fileId) {
  const c = pathCache.get(fileId);
  if (c && c.until > Date.now()) return c.path;
  const j = await tg('getFile', { file_id: fileId });
  if (!j.ok) return null;
  if (pathCache.size > 500) pathCache.clear();
  pathCache.set(fileId, { path: j.result.file_path, size: j.result.file_size, until: Date.now() + 50 * 60e3 });
  return j.result.file_path;
}

/** Faylning bir qismini (Range) olish — video/audio uchun. Javob 4 MB dan oshmaydi. */
export async function fetchFilePart(fileId, start, end) {
  const path = await filePath(fileId);
  if (!path) return null;
  const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${path}`;
  const r = await fetch(url, { headers: { range: `bytes=${start}-${end}` } });
  if (!r.ok) return null;
  let buf = Buffer.from(await r.arrayBuffer());
  let total = pathCache.get(fileId)?.size || null;
  if (r.status === 206) {
    const m = /\/(\d+)$/.exec(r.headers.get('content-range') || '');
    if (m) total = Number(m[1]);
  } else {
    total = buf.length;
    buf = buf.subarray(start, end + 1);
  }
  return { buffer: buf, path, total };
}
