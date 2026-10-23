// Kirish kodlari, sessiya va taklif tokenlari, Telegram imzosini tekshirish.
import crypto from 'node:crypto';
import { dbOn, q } from './db.js';

const SECRET = process.env.APP_SECRET || 'dev-secret-faqat-lokal';

export function normalizeCode(code) {
  return String(code || '').trim().toLowerCase().replace(/\s+/g, '');
}

/** Kodni bazada ochiq saqlamaslik uchun HMAC xeshi. */
export function hashCode(code) {
  return crypto.createHmac('sha256', SECRET).update('code:' + normalizeCode(code)).digest('hex');
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
/** Qisqa imzo (start payload'lari uchun). */
export const signShort = (s, len = 10) => mac('s:' + s, len);
const mac = (s, len) => b64url(crypto.createHmac('sha256', SECRET).update(s).digest()).slice(0, len);

function safeEqual(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Albom faylini havola bilan ulashish (t.me/bot?start=f_…): ochgan kishiga bot faylni yuboradi
export const signShare = (s) => mac('share:' + s, 12);
export const verifyShare = (s, sig) => safeEqual(String(sig || ''), signShare(s));

/** Sessiya tokeni. role: 'view'|'edit'; ver: kodlar o'zgarsa eski tokenlar bekor; uid: Telegram foydalanuvchisi. */
export function signToken({ treeId, role, ver, uid }, days = 120) {
  const payload = b64url(JSON.stringify({ t: treeId, r: role, v: ver, u: uid || 0, e: Date.now() + days * 864e5 }));
  return payload + '.' + mac(payload);
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!safeEqual(sig, mac(payload))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (p.e < Date.now()) return null;
    return { treeId: p.t, role: p.r, ver: p.v, uid: p.u || 0 };
  } catch {
    return null;
  }
}

/** Taklif havolasi uchun ixcham kod: inv_<treeId><imzo>. Kirish kodi oshkor bo'lmaydi. */
export function signInvite(treeId, ver) {
  return `inv_${treeId}${mac(`inv:${treeId}:${ver}`, 16)}`;
}
export function parseInvite(s) {
  const m = /^inv_([a-z0-9]{12})([A-Za-z0-9_-]{16})(?:_(p\d{1,8})|_m([a-z0-9]{10})|_([nfl])|_a([a-z0-9]{10})|_k([A-Za-z0-9]{8}[A-Za-z0-9_-]{10})|_u(\d{1,15})|_x(p\d{1,8}))?$/.exec(String(s || ''));
  return m ? { treeId: m[1], sig: m[2], person: m[3] || null, media: m[4] || null, inbox: m[5] || null, item: m[6] || null, albumInv: m[7] || null } : null;
}
export function checkInvite(inv, ver) {
  return safeEqual(inv.sig, mac(`inv:${inv.treeId}:${ver}`, 16));
}

/** Telegram faylini ko'rsatish uchun imzolangan, kunlik o'zgaradigan havola parametrlari. */
export function signMedia(fileId) {
  const e = Math.ceil(Date.now() / 864e5) + 1; // ertaga oxirigacha amal qiladi
  return { e, s: mac(`m:${fileId}:${e}`, 22) };
}
export function verifyMedia(fileId, e, s) {
  return Number(e) * 864e5 > Date.now() && safeEqual(String(s || ''), mac(`m:${fileId}:${e}`, 22));
}

/** Telegram WebApp initData imzosini tekshiradi va foydalanuvchini qaytaradi. */
export function verifyInitData(initData) {
  const botToken = process.env.BOT_TOKEN;
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const check = (p) => [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  // Yangi mijozlar `signature` maydonini ham imzoga kiritadi, eskilari — yo'q.
  const variants = [new URLSearchParams(params)];
  const noSig = new URLSearchParams(params);
  noSig.delete('signature');
  variants.push(noSig);
  const ok = variants.some((p) => safeEqual(crypto.createHmac('sha256', secret).update(check(p)).digest('hex'), hash));
  if (!ok) return null;
  const authDate = Number(params.get('auth_date') || 0) * 1000;
  if (Date.now() - authDate > 2 * 864e5) return null;
  try {
    return JSON.parse(params.get('user') || 'null');
  } catch {
    return null;
  }
}

// Bitta server nusxasi doirasidagi tezkor cheklov (asosiy himoya — foydalanuvchi hujjatidagi hisoblagich).
const attempts = new Map();
/**
 * So'rovlar cheklovi. Avval server xotirasida (tez), Neon ulangan bo'lsa — barcha server nusxalari uchun umumiy
 * hisob bazada saqlanadi (xotira yangi nusxada nolga tushib qolmasin).
 */
export async function rateLimit(key, max = 8, windowMs = 10 * 60e3) {
  const now = Date.now();
  const rec = attempts.get(key) || { n: 0, at: now };
  if (now - rec.at > windowMs) {
    rec.n = 0;
    rec.at = now;
  }
  rec.n++;
  attempts.set(key, rec);
  if (attempts.size > 5000) attempts.clear();
  if (rec.n > max) return false;
  if (!dbOn()) return true;
  try {
    const r = await q(
      `insert into rl (key, n, reset_at) values ($1, 1, now() + ($2 || ' milliseconds')::interval)
       on conflict (key) do update set
         n = case when rl.reset_at < now() then 1 else rl.n + 1 end,
         reset_at = case when rl.reset_at < now() then excluded.reset_at else rl.reset_at end
       returning n`, [key, String(windowMs)]);
    return r[0].n <= max;
  } catch {
    return true; // baza vaqtincha ishlamasa foydalanuvchini to'smaymiz
  }
}

export function randomId(len = 10) {
  let s = '';
  while (s.length < len) s += crypto.randomBytes(len).toString('base64url').replace(/[^a-z0-9]/g, '');
  return s.slice(0, len);
}

export function randomCode(len = 8) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}
