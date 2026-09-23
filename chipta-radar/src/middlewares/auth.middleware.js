/**
 * Validatsiya (autentifikatsiya) middleware'lari.
 *
 * 1) telegramAuth    — Mini App'dan kelgan `initData`ning haqiqiyligini
 *                      bot tokeni yordamida HMAC-SHA256 orqali tekshiradi.
 * 2) adminAuth       — Admin panel uchun imzolangan token tekshiruvi.
 * 3) requireDatabase — baza ulanmagan bo'lsa tushunarli javob.
 * 4) rateLimit       — bitta foydalanuvchidan juda ko'p so'rovni cheklash.
 */
import crypto from 'node:crypto';
import config from '../config/default.js';
import UserModel from '../models/User.js';
import { isDatabaseReady } from '../database/connection.js';

/* ------------------------------------------------------------------ */
/*  Telegram Mini App                                                  */
/* ------------------------------------------------------------------ */

/**
 * Telegram initData satrini tekshiradi.
 * Hujjat: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * @returns {{ok:boolean, user?:object, reason?:string}}
 */
export function verifyInitData(initData, botToken = config.bot.token) {
  if (!initData || !botToken) return { ok: false, reason: 'Ma\'lumot yoki token yo\'q' };

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return { ok: false, reason: 'hash topilmadi' };

  // Telegram mijozlarining turli versiyalari `signature` maydonini turlicha hisobga oladi —
  // ikkala variant ham bot tokeni bilan imzolangan, xavfsizlik pasaymaydi.
  const entries = [];
  for (const [key, value] of params.entries()) {
    if (key !== 'hash') entries.push([key, value]);
  }

  const buildCheckString = (withSignature) =>
    entries
      .filter(([key]) => withSignature || key !== 'signature')
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = Buffer.from(hash, 'hex');

  const matches = [false, true].some((withSignature) => {
    const actual = crypto.createHmac('sha256', secretKey).update(buildCheckString(withSignature)).digest();
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  });

  if (!matches) return { ok: false, reason: 'Imzo (hash) mos kelmadi' };

  // Ma'lumot 24 soatdan eski bo'lmasligi kerak
  const authDate = Number(params.get('auth_date') || 0);
  if (authDate && Date.now() / 1000 - authDate > 86_400) {
    return { ok: false, reason: 'Sessiya eskirgan, ilovani qaytadan oching' };
  }

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    user = null;
  }
  if (!user?.id) return { ok: false, reason: 'Foydalanuvchi ma\'lumoti yo\'q' };

  return { ok: true, user, startParam: params.get('start_param') || null };
}

/**
 * Mini App so'rovlarini himoyalaydi. `X-Telegram-Init-Data` sarlavhasini kutadi.
 * Ishlab chiqish rejimida (ALLOW_DEV_AUTH=true) Telegramsiz brauzerda sinash mumkin.
 */
export async function telegramAuth(req, res, next) {
  try {
    const initData = req.get('X-Telegram-Init-Data') || '';

    let tgUser = null;
    if (initData) {
      const result = verifyInitData(initData);
      if (!result.ok) {
        return res.status(401).json({ ok: false, error: `Telegram tekshiruvi muvaffaqiyatsiz: ${result.reason}` });
      }
      tgUser = result.user;
    } else if (config.allowDevAuth) {
      // --- Faqat localhost'da sinash uchun ---
      tgUser = { id: req.get('X-Dev-User') || '999000001', first_name: 'Sinov', last_name: 'Foydalanuvchi', username: 'dev_user' };
      req.isDev = true;
    } else {
      return res.status(401).json({ ok: false, error: 'Ilovani Telegram ichida oching' });
    }

    req.telegramUser = tgUser;
    req.user = await UserModel.upsertFromTelegram(tgUser);
    if (req.user.isBlocked) {
      return res.status(403).json({ ok: false, error: 'Hisobingiz vaqtincha cheklangan' });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

/* ------------------------------------------------------------------ */
/*  Admin panel                                                        */
/* ------------------------------------------------------------------ */

function sign(value) {
  return crypto.createHmac('sha256', config.admin.secret).update(value).digest('hex');
}

export function createAdminToken() {
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + config.admin.tokenTtlMs })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  const a = Buffer.from(signature || '', 'hex');
  const b = Buffer.from(sign(payload), 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.role === 'admin' && Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

/** Parollarni vaqt bo'yicha xavfsiz solishtirish */
export function passwordMatches(input) {
  const a = crypto.createHash('sha256').update(String(input ?? '')).digest();
  const b = crypto.createHash('sha256').update(String(config.admin.password)).digest();
  return crypto.timingSafeEqual(a, b);
}

export function adminAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.get('X-Admin-Token');
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ ok: false, error: 'Avtorizatsiya talab qilinadi. Qaytadan kiring.' });
  }
  return next();
}

/* ------------------------------------------------------------------ */
/*  Umumiy                                                             */
/* ------------------------------------------------------------------ */

export function requireDatabase(req, res, next) {
  if (isDatabaseReady()) return next();
  return res.status(503).json({
    ok: false,
    error: 'Server sozlanmoqda (ma\'lumotlar bazasi ulanmagan). Birozdan so\'ng qayta urinib ko\'ring.',
  });
}

/**
 * Oddiy xotiradagi cheklovchi: bitta kalitdan `limit` ta so'rov / `windowMs`.
 * @param keyFn (req) => kalit (masalan foydalanuvchi ID)
 */
export function rateLimit({ limit, windowMs, keyFn, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, list] of hits) {
      const fresh = list.filter((time) => now - time < windowMs);
      if (fresh.length) hits.set(key, fresh);
      else hits.delete(key);
    }
  }, windowMs).unref?.();

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const list = (hits.get(key) || []).filter((time) => now - time < windowMs);
    if (list.length >= limit) {
      return res.status(429).json({ ok: false, error: message || 'Juda ko\'p so\'rov. Biroz kuting.' });
    }
    list.push(now);
    hits.set(key, list);
    return next();
  };
}

export default { telegramAuth, adminAuth, verifyInitData, createAdminToken, verifyAdminToken, requireDatabase, rateLimit, passwordMatches };
