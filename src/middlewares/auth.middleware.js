/**
 * Validatsiya (autentifikatsiya) middleware'lari.
 *
 * 1) telegramAuth  — Mini App'dan kelgan `initData`ning haqiqiyligini
 *                    bot tokeni yordamida HMAC-SHA256 orqali tekshiradi.
 * 2) adminAuth     — Admin panel uchun imzolangan token tekshiruvi.
 */
import crypto from 'node:crypto';
import config from '../config/default.js';
import UserModel from '../models/User.js';

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
  if (!hash) return { ok: false, reason: 'hash topilmadi' };

  // Telegram mijozlarining turli versiyalari `signature` maydonini turlicha
  // hisobga oladi. Shuning uchun ikkala variantni ham tekshiramiz —
  // ikkalasi ham bot tokeni bilan imzolangan, ya'ni xavfsizlik pasaymaydi.
  const entries = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue;
    entries.push([key, value]);
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
    const computed = crypto
      .createHmac('sha256', secretKey)
      .update(buildCheckString(withSignature))
      .digest('hex');
    const actual = Buffer.from(computed, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  });

  if (!matches) {
    // Sabab aniqlash uchun: qaysi maydonlar kelgani (qiymatlarsiz) jurnalga yoziladi
    console.warn(`[auth] Imzo mos kelmadi. Kelgan maydonlar: ${entries.map(([key]) => key).join(', ')}`);
    return { ok: false, reason: 'Imzo (hash) mos kelmadi' };
  }

  // Ma'lumot 24 soatdan eski bo'lmasligi kerak
  const authDate = Number(params.get('auth_date') || 0);
  if (authDate && Date.now() / 1000 - authDate > 86400) {
    return { ok: false, reason: 'Sessiya eskirgan, ilovani qaytadan oching' };
  }

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    user = null;
  }
  if (!user?.id) return { ok: false, reason: 'Foydalanuvchi ma\'lumoti yo\'q' };

  return { ok: true, user };
}

/**
 * Mini App so'rovlarini himoyalaydi.
 * `X-Telegram-Init-Data` sarlavhasini kutadi.
 *
 * Ishlab chiqish rejimida (ALLOW_DEV_AUTH=true) Telegramsiz brauzerda
 * sinash uchun `X-Dev-User` sarlavhasi orqali soxta mijoz yaratiladi.
 */
export async function telegramAuth(req, res, next) {
  try {
    const initData = req.get('X-Telegram-Init-Data') || req.body?.initData || '';

    if (initData) {
      const result = verifyInitData(initData);
      if (!result.ok) {
        return res.status(401).json({ ok: false, error: `Telegram tekshiruvi muvaffaqiyatsiz: ${result.reason}` });
      }
      req.telegramUser = result.user;
      req.user = await UserModel.upsertFromTelegram(result.user);
      return next();
    }

    // --- Faqat localhost'da sinash uchun ---
    if (config.allowDevAuth) {
      const devId = req.get('X-Dev-User') || '999000001';
      req.telegramUser = { id: devId, first_name: 'Sinov', last_name: 'Foydalanuvchi', username: 'dev_user' };
      req.user = await UserModel.upsertFromTelegram(req.telegramUser);
      req.isDev = true;
      return next();
    }

    return res.status(401).json({ ok: false, error: 'Avtorizatsiya talab qilinadi' });
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

/** Admin uchun imzolangan token yaratish */
export function createAdminToken() {
  const payload = Buffer.from(
    JSON.stringify({ role: 'admin', exp: Date.now() + config.admin.tokenTtlMs }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** Tokenning haqiqiyligini tekshirish */
export function verifyAdminToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;

  const [payload, signature] = token.split('.');
  const expected = sign(payload);

  const a = Buffer.from(signature || '', 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.role === 'admin' && Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

/** Admin API yo'llarini himoyalaydi */
export function adminAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.get('X-Admin-Token');

  if (!verifyAdminToken(token)) {
    return res.status(401).json({ ok: false, error: 'Avtorizatsiya talab qilinadi. Qaytadan kiring.' });
  }
  return next();
}

export default { telegramAuth, adminAuth, verifyInitData, createAdminToken, verifyAdminToken };
