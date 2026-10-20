// Katta fayllar (20 MB+) uchun MTProto: bot o'z tokeni bilan kiradi (foydalanuvchi akkaunti ishlatilmaydi),
// Bot API cheklovisiz fayl bo'laklarini yuklaydi. TG_API_ID / TG_API_HASH — my.telegram.org dagi ilova.
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import bigInt from 'big-integer';
import { readJson, writeJson } from './store.js';

export const mtprotoOn = () => !!(process.env.TG_API_ID && process.env.TG_API_HASH);

let clientP = null;
function client() {
  if (clientP) return clientP;
  clientP = (async () => {
    // sessiya saqlanadi — har safar qayta kirish (va Telegram cheklovlari) bo'lmasin
    const saved = (await readJson('mtproto/session.json').catch(() => null))?.data?.s || '';
    const c = new TelegramClient(new StringSession(saved), Number(process.env.TG_API_ID), process.env.TG_API_HASH, { connectionRetries: 3, autoReconnect: true });
    c.setLogLevel('error');
    await c.start({ botAuthToken: process.env.BOT_TOKEN });
    const s = c.session.save();
    if (s && s !== saved) await writeJson('mtproto/session.json', { s }).catch(() => {});
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

const PART = 512 * 1024; // MTProto bo'lagi: 4 KB ga karrali, 1 MB ni bo'ladi

/**
 * Faylning [start, end] oralig'ini yuklash. ch — kanal posti ({chat, msg}) — eskirgan file_reference ni yangilash uchun.
 * size — fayl hajmi (bayt).
 */
export async function mtprotoPart(fileId, start, end, size, ch) {
  const c = await client();
  const f = decodeFileId(fileId);
  const location = new Api.InputDocumentFileLocation({
    id: bigInt(f.id.toString()), accessHash: bigInt(f.accessHash.toString()), fileReference: f.fileReference, thumbSize: '',
  });
  end = Math.min(end, size - 1);
  const from = Math.floor(start / PART) * PART;
  const parts = Math.ceil((end + 1 - from) / PART);
  const msgData = ch?.chat && ch?.msg
    ? [new Api.InputPeerChannel({ channelId: bigInt(String(ch.chat).replace(/^-100/, '')), accessHash: bigInt(0) }), ch.msg]
    : undefined;
  const chunks = [];
  for await (const chunk of c.iterDownload({ file: location, offset: bigInt(from), limit: parts, requestSize: PART, dcId: f.dcId, fileSize: bigInt(size), msgData })) {
    chunks.push(chunk);
  }
  const buf = Buffer.concat(chunks);
  return { buffer: buf.subarray(start - from, end - from + 1), total: size };
}
