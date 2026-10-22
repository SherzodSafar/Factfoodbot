// Render'dagi oqim serveri: 20 MB dan katta video/audio MTProto orqali, Vercel'dagi 4 MB javob chegarasisiz.
// Havolalar Vercel'dagi bilan bir xil imzolanadi: APP_SECRET berilgan bo'lsa joyida, bo'lmasa Vercel tekshiradi
// (natija keshlanadi). Fayl serverda saqlanmaydi.
import http from 'node:http';
import { verifyMedia } from '../lib/auth.js';
import { mtprotoOn, sendRange, readRange } from '../lib/mtproto.js';

const PORT = Number(process.env.PORT || 10000);
const MIME = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', m4v: 'video/mp4', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac' };

const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://shajara-ai.vercel.app').replace(/\/$/, '');
const okSig = new Map();
async function verified(f, e, s) {
  if (!(Number(e) * 864e5 > Date.now())) return false;
  if (process.env.APP_SECRET) return verifyMedia(f, e, s);
  const k = `${e}:${s}:${f}`;
  if (okSig.has(k)) return true;
  const r = await fetch(`${PUBLIC_URL}/api/media?f=${encodeURIComponent(f)}&e=${e}&s=${encodeURIComponent(s || '')}&chk=1`).catch(() => null);
  if (r?.status !== 204) return false;
  if (okSig.size > 5000) okSig.clear();
  okSig.set(k, true);
  return true;
}

// ---- ZIP: tanlangan albom fayllari (har albom — papka) Telegram'dan oqim bilan yig'iladi, serverda saqlanmaydi.
// Siqilmaydi (STORE): rasm/video allaqachon siqilgan; CRC fayl o'tayotganda hisoblanadi (data descriptor).
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf, c) => { for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return c; };
const TGF = () => `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}`;
const TGA = (m) => `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${m}`;

async function* fileChunks(f) {
  if (f.z > 20 * 1048576) { yield* readRange(f.f, 0, f.z - 1); return; } // Bot API 20 MB dan kattasini bermaydi
  const j = await (await fetch(`${TGA('getFile')}?file_id=${encodeURIComponent(f.f)}`)).json();
  if (!j.ok) throw new Error('getFile: ' + j.description);
  const r = await fetch(`${TGF()}/${j.result.file_path}`);
  if (!r.ok) throw new Error('download ' + r.status);
  for await (const c of r.body) yield Buffer.from(c);
}

const dos = (v) => {
  const d = new Date(v || Date.now());
  const y = Math.max(1980, d.getFullYear());
  return { t: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), d: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
};

/** out(buf) — yozish (orqaga bosim bilan). Ochib bo'lmagan fayl o'tkazib yuboriladi. */
async function writeZip(job, out) {
  const cd = [];
  let off = 0;
  for (const f of job.files) {
    const name = Buffer.from(f.p, 'utf8');
    const { t, d } = dos(f.at);
    const it = fileChunks(f);
    let r;
    try { r = await it.next(); } catch (e) { console.error('zip o‘tkazildi', f.p, e?.errorMessage || e?.message); continue; }
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0808, 6); // data descriptor + UTF-8 nom
    lh.writeUInt16LE(t, 10); lh.writeUInt16LE(d, 12); lh.writeUInt16LE(name.length, 26);
    await out(Buffer.concat([lh, name]));
    let c = -1;
    let size = 0;
    for (; !r.done; r = await it.next()) { c = crc32(r.value, c); size += r.value.length; await out(r.value); }
    const crc = (c ^ -1) >>> 0;
    const dd = Buffer.alloc(16);
    dd.writeUInt32LE(0x08074b50, 0); dd.writeUInt32LE(crc, 4); dd.writeUInt32LE(size, 8); dd.writeUInt32LE(size, 12);
    await out(dd);
    cd.push({ name, t, d, crc, size, off });
    off += 30 + name.length + size + 16;
  }
  let cdSize = 0;
  for (const e of cd) {
    const h = Buffer.alloc(46);
    h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(0x0808, 8);
    h.writeUInt16LE(e.t, 12); h.writeUInt16LE(e.d, 14); h.writeUInt32LE(e.crc, 16); h.writeUInt32LE(e.size, 20); h.writeUInt32LE(e.size, 24);
    h.writeUInt16LE(e.name.length, 28); h.writeUInt32LE(e.off, 42);
    await out(Buffer.concat([h, e.name]));
    cdSize += 46 + e.name.length;
  }
  const eo = Buffer.alloc(22);
  eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(cd.length, 8); eo.writeUInt16LE(cd.length, 10); eo.writeUInt32LE(cdSize, 12); eo.writeUInt32LE(off, 16);
  await out(eo);
  return cd.length;
}

const drain = (res) => new Promise((ok) => {
  const done = () => { res.off('drain', done); res.off('close', done); ok(); };
  res.on('drain', done);
  res.on('close', done);
});

async function zipRoute(req, res, id, url) {
  const e = url.searchParams.get('e');
  const s = url.searchParams.get('s');
  const cors = { 'access-control-allow-origin': '*' };
  if (!(await verified('zip:' + id, e, s))) return fail(res, 403, 'Havola eskirgan');
  const job = await fetch(`${PUBLIC_URL}/api/zipjob/${id}?e=${e}&s=${encodeURIComponent(s || '')}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!job?.files?.length) return fail(res, 404, 'ZIP topilmadi');
  const fname = `${job.title || 'Shajara'}.zip`;
  console.log('🗜', job.files.length, 'fayl', url.searchParams.get('send') ? '→ chat' : '→ yuklab olish');
  if (url.searchParams.get('send')) {
    // kichik ZIP (≤ 49 MB) — Bot API orqali foydalanuvchining bot chatiga hujjat bo'lib boradi
    const bufs = [];
    let n = 0;
    try {
      await writeZip(job, async (b) => { n += b.length; if (n > 49 * 1048576) throw new Error('ZIP 50 MB dan katta'); bufs.push(b); });
      const form = new FormData();
      form.append('chat_id', String(job.uid));
      form.append('caption', `🗜 ${job.title} · ${job.files.length}`);
      form.append('document', new Blob([Buffer.concat(bufs)], { type: 'application/zip' }), fname);
      const r = await (await fetch(TGA('sendDocument'), { method: 'POST', body: form })).json();
      res.writeHead(r.ok ? 200 : 502, { 'content-type': 'application/json', ...cors });
      return res.end(JSON.stringify({ ok: !!r.ok, error: r.ok ? undefined : r.description }));
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json', ...cors });
      return res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  }
  res.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`, ...cors });
  if (req.method === 'HEAD') return res.end();
  let gone = false;
  res.on('close', () => { gone = true; });
  try {
    await writeZip(job, async (b) => { if (gone) throw new Error('mijoz uzildi'); if (!res.write(b)) await drain(res); });
    res.end();
  } catch (err) {
    console.error('zip', err.message);
    res.destroy();
  }
}

const fail = (res, code, msg) => { res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' }); res.end(msg); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') return fail(res, 200, 'ok');
  const zm = /^\/zip\/([a-z0-9]{12})$/.exec(url.pathname);
  if (zm && ['GET', 'HEAD'].includes(req.method)) return zipRoute(req, res, zm[1], url);
  if (url.pathname !== '/api/media' || !['GET', 'HEAD'].includes(req.method)) return fail(res, 404, 'Topilmadi');
  const f = url.searchParams.get('f') || '';
  if (!(await verified(f, url.searchParams.get('e'), url.searchParams.get('s')))) return fail(res, 403, 'Havola eskirgan');
  const size = Number(url.searchParams.get('z')) || 0;
  if (!size) return fail(res, 400, 'Hajm yo‘q');
  if (!mtprotoOn()) return fail(res, 503, 'MTProto sozlanmagan');
  const x = (url.searchParams.get('x') || '').toLowerCase();
  console.log('▶', x || '?', `${Math.round(size / 1048576)} MB`, req.headers.range || ''); // video Render orqali berilganini logda ko'rish uchun
  try {
    // bitta javob 64 MB gacha — brauzer keyingisini o'zi so'raydi
    await sendRange(req, res, { fileId: f, size, type: MIME[x] || 'application/octet-stream', max: 64 * 1024 * 1024 });
  } catch (e) {
    console.error('media', e?.errorMessage || e?.message);
    if (!res.headersSent) fail(res, 502, 'Telegramdan olib bo‘lmadi');
    else res.destroy();
  }
}).listen(PORT, () => console.log(`Shajara oqim serveri: ${PORT}`));
