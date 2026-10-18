// Kirish kodlari, sessiya tokenlari va Telegram imzosini tekshirish.
import crypto from 'node:crypto';

const SECRET = process.env.APP_SECRET || 'dev-secret-faqat-lokal';

export function normalizeCode(code) {
  return String(code || '').trim().toLowerCase().replace(/\s+/g, '');
}

/** Kodni bazada ochiq saqlamaslik uchun HMAC xeshi. */
export function hashCode(code) {
  return crypto.createHmac('sha256', SECRET).update('code:' + normalizeCode(code)).digest('hex');
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

/** role: 'view' | 'edit'. ver: kodlar o'zgarsa eski tokenlar bekor bo'ladi. */
export function signToken({ treeId, role, ver }, days = 180) {
  const payload = b64url(JSON.stringify({ t: treeId, r: role, v: ver, e: Date.now() + days * 864e5 }));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(payload).digest());
  return payload + '.' + sig;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expect = b64url(crypto.createHmac('sha256', SECRET).update(payload).digest());
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (p.e < Date.now()) return null;
    return { treeId: p.t, role: p.r, ver: p.v };
  } catch {
    return null;
  }
}

/** Telegram WebApp initData imzosini tekshiradi va foydalanuvchini qaytaradi. */
export function verifyInitData(initData) {
  const botToken = process.env.BOT_TOKEN;
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  params.delete('signature');
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
  if (calc !== hash) return null;
  const authDate = Number(params.get('auth_date') || 0) * 1000;
  if (Date.now() - authDate > 7 * 864e5) return null;
  try {
    return JSON.parse(params.get('user') || 'null');
  } catch {
    return null;
  }
}

// Kodni taxmin qilishga urinishlarni sekinlashtirish (har bir server nusxasi uchun).
const attempts = new Map();
export function rateLimit(key, max = 8, windowMs = 10 * 60e3) {
  const now = Date.now();
  const rec = attempts.get(key) || { n: 0, at: now };
  if (now - rec.at > windowMs) {
    rec.n = 0;
    rec.at = now;
  }
  rec.n++;
  attempts.set(key, rec);
  return rec.n <= max;
}

export function randomId(len = 10) {
  return crypto.randomBytes(len).toString('base64url').replace(/[-_]/g, '').slice(0, len).toLowerCase();
}

export function randomCode() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}
