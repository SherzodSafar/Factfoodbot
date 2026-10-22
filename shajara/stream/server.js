// Render'dagi oqim serveri: 20 MB dan katta video/audio MTProto orqali, Vercel'dagi 4 MB javob chegarasisiz.
// Havolalar Vercel'dagi bilan bir xil imzolanadi: APP_SECRET berilgan bo'lsa joyida, bo'lmasa Vercel tekshiradi
// (natija keshlanadi). Fayl serverda saqlanmaydi.
import http from 'node:http';
import { verifyMedia } from '../lib/auth.js';
import { mtprotoOn, sendRange } from '../lib/mtproto.js';

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

const fail = (res, code, msg) => { res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' }); res.end(msg); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') return fail(res, 200, 'ok');
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
