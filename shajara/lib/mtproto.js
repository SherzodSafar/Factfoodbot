// Katta fayllar (20 MB+) uchun MTProto: bot o'z tokeni bilan kiradi (foydalanuvchi akkaunti ishlatilmaydi),
// Bot API cheklovisiz (2 GB gacha) fayl bo'laklarini yuklaydi. TG_API_ID / TG_API_HASH — my.telegram.org dagi ilova.
import { TelegramClient, Api, errors } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import bigInt from 'big-integer';
import crypto from 'node:crypto';
import { readJson, writeJson } from './store.js';

export const mtprotoOn = () => !!(process.env.TG_API_ID && process.env.TG_API_HASH);

let clientP = null;
function client() {
  if (clientP) return clientP;
  clientP = (async () => {
    // sessiya saqlanadi — har safar qayta kirish (va Telegram cheklovlari) bo'lmasin
    // har bot (va har server: MT_SESSION) uchun alohida sessiya
    const key = `mtproto/session-${String(process.env.BOT_TOKEN).split(':')[0]}${process.env.MT_SESSION ? '-' + process.env.MT_SESSION : ''}.json`;
    const saved = (await readJson(key).catch(() => null))?.data?.s || '';
    const c = new TelegramClient(new StringSession(saved), Number(process.env.TG_API_ID), process.env.TG_API_HASH, { connectionRetries: 3, autoReconnect: true });
    c.setLogLevel('error');
    await c.start({ botAuthToken: process.env.BOT_TOKEN });
    const s = c.session.save();
    if (s && s !== saved) await writeJson(key, { s }).catch(() => {});
    return c;
  })().catch((e) => { clientP = null; throw e; });
  return clientP;
}

// ---- Bot API file_id ni ochish (dc, id, access_hash, file_reference)
function rleDecode(buf) {
  const out = [];
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0 && i + 1 < buf.length) { for (let k = 0; k < buf[i + 1]; k++) out.push(0); i++; } else out.push(buf[i]);
  }
  return Buffer.from(out);
}
export function decodeFileId(fileId) {
  const b = rleDecode(Buffer.from(fileId, 'base64url'));
  let o = 0;
  const typeRaw = b.readUInt32LE(o); o += 4;
  const dcId = b.readUInt32LE(o); o += 4;
  const hasRef = !!(typeRaw & (1 << 25));
  const type = typeRaw & ~(1 << 25) & ~(1 << 24);
  let fileReference = Buffer.alloc(0);
  if (hasRef) {
    let len = b[o];
    let head = 1;
    if (len === 254) { len = b[o + 1] | (b[o + 2] << 8) | (b[o + 3] << 16); head = 4; }
    fileReference = b.subarray(o + head, o + head + len);
    o += Math.ceil((head + len) / 4) * 4;
  }
  const id = b.readBigInt64LE(o); o += 8;
  const accessHash = b.readBigInt64LE(o);
  return { type, dcId, id, accessHash, fileReference };
}

// ---- Katta fayllarni oqim bilan uzatish: 1 MB lik bo'laklar (Telegram ruxsat bergan eng kattasi) parallel
// so'raladi va kelishi bilan javobga yoziladi. Yaqinda olingan bo'laklar xotirada (LRU) — keyingi Range
// so'rovi (yoki oldindan yuklangan qism) kutmasdan beriladi. Fayl serverda saqlanmaydi.
const MB = 1024 * 1024;
const MAX_PARTS = 96; // ~96 MB xotira
const parts = new Map(); // `${docId}:${i}` -> Promise<Buffer>; Map tartibi — LRU
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function fetchPart(f, i) {
  const c = await client();
  const location = new Api.InputDocumentFileLocation({
    id: bigInt(f.id.toString()), accessHash: bigInt(f.accessHash.toString()), fileReference: f.fileReference, thumbSize: '',
  });
  let dc = f.dcId;
  for (let t = 0; ; t++) {
    try {
      const r = await c.invokeWithSender(new Api.upload.GetFile({ location, offset: bigInt(i * MB), limit: MB }), await c.getSender(dc));
      return r.bytes;
    } catch (e) {
      if (e instanceof errors.FileMigrateError) { dc = e.newDc; continue; }
      const rpc = e.errorMessage || '';
      // uzilish, TIMEOUT yoki qisqa FLOOD_WAIT — qayta urinamiz; fayl xatolari (FILE_REFERENCE_EXPIRED…) — yo'q
      if (t >= 2 || (rpc && rpc !== 'TIMEOUT' && !rpc.startsWith('FLOOD'))) throw e;
      await sleep(rpc.startsWith('FLOOD') ? Math.min(e.seconds || 1, 5) * 1000 : 400 * (t + 1));
    }
  }
}

function getPart(f, i) {
  const k = `${f.id}:${i}`;
  let p = parts.get(k);
  if (p) parts.delete(k);
  else {
    p = fetchPart(f, i);
    p.catch(() => { if (parts.get(k) === p) parts.delete(k); });
  }
  parts.set(k, p);
  while (parts.size > MAX_PARTS) parts.delete(parts.keys().next().value);
  return p;
}

/** Faylning [start, end] oralig'i bo'laklab (tartib bilan); oldindan `ahead` ta bo'lak so'raladi. */
export async function* readRange(fileId, start, end, ahead = 4) {
  const f = decodeFileId(fileId);
  const first = Math.floor(start / MB);
  const last = Math.floor(end / MB);
  for (let i = first; i <= last; i++) {
    for (let j = i + 1; j <= Math.min(last, i + ahead); j++) getPart(f, j);
    const buf = await getPart(f, i);
    const a = i === first ? start - i * MB : 0;
    const b = Math.min(buf.length, end - i * MB + 1);
    if (b > a) yield buf.subarray(a, b);
    if (buf.length < MB) return; // fayl oxiri
  }
}

/** pos dan boshlab n MB ni xotiraga oldindan yuklash (brauzer keyingi qismni so'raguncha). */
export function prefetch(fileId, pos, size, n = 8) {
  const f = decodeFileId(fileId);
  const from = Math.floor(pos / MB);
  const ps = [];
  for (let i = from; i < Math.min(Math.ceil(size / MB), from + n); i++) ps.push(getPart(f, i));
  return Promise.allSettled(ps);
}

const waitDrain = (res) => new Promise((ok) => {
  const done = () => { res.off('drain', done); res.off('close', done); ok(); };
  res.on('drain', done);
  res.on('close', done);
});

/**
 * Range so'roviga javob: bo'laklar kelishi bilan yoziladi. max — bitta javobning eng katta hajmi
 * (brauzer keyingi qismni o'zi so'raydi). Qaytaradi: yuborilgan oxirgi bayt (yoki null).
 */
export async function sendRange(req, res, { fileId, size, type, max = Infinity }) {
  const rg = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  let start = 0;
  let end = size - 1;
  if (rg && rg[1]) { start = Number(rg[1]); if (rg[2]) end = Math.min(Number(rg[2]), size - 1); }
  else if (rg && rg[2]) start = Math.max(0, size - Number(rg[2]));
  if (start >= size || start > end) {
    res.writeHead(416, { 'content-range': `bytes */${size}` });
    res.end();
    return null;
  }
  if (rg) end = Math.min(end, start + max - 1);
  const it = readRange(fileId, start, end);
  const first = await it.next(); // xato bo'lsa — sarlavhalar yuborilmasidan oldin chiqadi
  res.writeHead(rg ? 206 : 200, {
    'content-type': type, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'private, max-age=86400',
    ...(rg ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}),
  });
  let gone = false;
  res.on('close', () => { gone = true; });
  try {
    for (let r = first; !r.done && !gone; r = await it.next()) {
      if (!res.write(r.value)) await waitDrain(res);
    }
  } catch (e) {
    console.error('stream', e?.errorMessage || e?.message);
    res.destroy();
    return null;
  } finally {
    it.return();
  }
  res.end();
  return end;
}

// ---- Katta faylni (ZIP) foydalanuvchining bot chatiga yuklash: 512 KB lik bo'laklar oqim bilan (hajmi oldindan
// noma'lum — oxirgi bo'lakkacha file_total_parts = -1), 2 GB gacha. Bot uchun access_hash = 0 yetadi.
const rid = () => bigInt(crypto.randomBytes(8).readBigInt64LE().toString());
const userPeer = (uid) => new Api.InputPeerUser({ userId: bigInt(String(uid)), accessHash: bigInt(0) });

export async function canReachUser(uid) {
  try {
    const r = await (await client()).invoke(new Api.users.GetUsers({ id: [new Api.InputUser({ userId: bigInt(String(uid)), accessHash: bigInt(0) })] }));
    return r.some((u) => u.className === 'User');
  } catch (e) { console.error('mtproto user', e?.errorMessage || e?.message); return false; }
}

/** produce(out) — ma'lumotni out(buf) bilan beradi. Qaytaradi: yuborilgan hujjat (Api.Document). */
export async function uploadDocument(uid, name, caption, produce) {
  const c = await client();
  const fileId = rid();
  const PART = 512 * 1024;
  const inflight = new Set();
  let n = 0;
  let buf = Buffer.alloc(0);
  const put = async (bytes, last) => {
    while (inflight.size >= 4) await Promise.race(inflight);
    const i = n++;
    const req = () => c.invoke(new Api.upload.SaveBigFilePart({ fileId, filePart: i, fileTotalParts: last ? i + 1 : -1, bytes }));
    const p = req().catch(async (e) => { await sleep(1500); return req(); }); // bir marta qayta urinish
    inflight.add(p);
    p.then(() => inflight.delete(p), () => inflight.delete(p));
  };
  await produce(async (chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    while (buf.length > PART) { await put(buf.subarray(0, PART), false); buf = buf.subarray(PART); }
  });
  await put(buf, true);
  await Promise.all(inflight);
  const r = await c.invoke(new Api.messages.SendMedia({
    peer: userPeer(uid), message: caption, randomId: rid(),
    media: new Api.InputMediaUploadedDocument({ file: new Api.InputFileBig({ id: fileId, parts: n, name }), mimeType: 'application/zip', attributes: [new Api.DocumentAttributeFilename({ fileName: name })] }),
  }));
  return (r.updates || []).find((u) => u.message?.media?.document)?.message.media.document || null;
}

/** MTProto hujjatidan Bot API file_id (ulashish oynasi uchun); like — shu botning mavjud file_id si (versiya baytlari). */
export function encodeFileId(doc, like) {
  const tail = rleDecode(Buffer.from(like, 'base64url')).subarray(-2);
  const ref = Buffer.from(doc.fileReference || []);
  const head = ref.length < 254 ? Buffer.from([ref.length]) : Buffer.from([254, ref.length & 255, (ref.length >> 8) & 255, (ref.length >> 16) & 255]);
  const b = Buffer.alloc(8);
  b.writeUInt32LE((5 | (1 << 25)) >>> 0, 0); // 5 — hujjat, 25-bit — file_reference bor
  b.writeUInt32LE(doc.dcId, 4);
  const ids = Buffer.alloc(16);
  ids.writeBigInt64LE(BigInt(doc.id.toString()), 0);
  ids.writeBigInt64LE(BigInt(doc.accessHash.toString()), 8);
  const raw = Buffer.concat([b, head, ref, Buffer.alloc((4 - ((head.length + ref.length) % 4)) % 4), ids, tail]);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== 0) { out.push(raw[i]); continue; }
    let z = 0;
    while (i < raw.length && raw[i] === 0 && z < 250) { z++; i++; }
    i--;
    out.push(0, z);
  }
  return Buffer.from(out).toString('base64url');
}

// ---- Kanal xabarlari matnini o'qish (albom izohlari uchun)
const chHash = new Map(); // channelId -> access_hash (bot uchun 0 bilan getChannels haqiqiy hashni qaytaradi)
async function inputChannel(c, chat) {
  const id = String(chat).replace(/^-100/, '');
  if (!chHash.has(id)) {
    const r = await c.invoke(new Api.channels.GetChannels({ id: [new Api.InputChannel({ channelId: bigInt(id), accessHash: bigInt(0) })] }));
    const ch = r.chats?.find((x) => String(x.id) === id);
    chHash.set(id, ch?.accessHash ?? bigInt(0));
  }
  return new Api.InputChannel({ channelId: bigInt(id), accessHash: chHash.get(id) });
}

/** chat — kanal id (-100…), ids — xabar raqamlari. Qaytaradi: Map(mid -> matn). */
export async function readChannelTexts(chat, ids) {
  const c = await client();
  const channel = await inputChannel(c, chat);
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const r = await c.invoke(new Api.channels.GetMessages({ channel, id: ids.slice(i, i + 100).map((id) => new Api.InputMessageID({ id })) }));
    for (const msg of r.messages || []) if (msg.className === 'Message') out.set(msg.id, msg.message || '');
  }
  return out;
}
