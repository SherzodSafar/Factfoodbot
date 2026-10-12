/**
 * Botga kirish kodi: BOT_ACCESS_CODE berilgan bo'lsa, foydalanuvchi bir marta kodni yuboradi.
 * Bazada kodning o'zi emas, xeshi saqlanadi; kod o'zgarsa — hamma qayta kiritadi.
 */
import crypto from 'node:crypto';
import config from '../config/default.js';
import prisma, { isDatabaseReady } from '../database/connection.js';

const verified = new Map(); // telegramId → kalit (xesh)
const attempts = new Map(); // noto'g'ri urinishlar: 1 soatda 5 ta

const keyOf = (code) => crypto.createHash('sha256').update(`access:${code}`).digest('hex').slice(0, 24);

export function accessEnabled() {
  return config.bot.accessCode !== '';
}

export async function hasAccess(telegramId) {
  if (!accessEnabled()) return true;
  const id = String(telegramId);
  const key = keyOf(config.bot.accessCode);
  if (verified.get(id) === key) return true;
  if (!isDatabaseReady()) return false;
  const row = await prisma.user.findUnique({ where: { telegramId: id }, select: { accessKey: true } });
  if (row?.accessKey !== key) return false;
  verified.set(id, key);
  return true;
}

/** Yuborilgan kodni tekshirish: 'ok' | 'wrong' | 'limit' (foydalanuvchi bazada bo'lishi kerak) */
export async function submitCode(telegramId, text) {
  const id = String(telegramId);
  const tries = attempts.get(id) || { count: 0, since: Date.now() };
  if (Date.now() - tries.since > 3_600_000) Object.assign(tries, { count: 0, since: Date.now() });
  if (tries.count >= 5) return 'limit';
  const given = Buffer.from(keyOf(String(text || '').trim()));
  const key = keyOf(config.bot.accessCode);
  if (!crypto.timingSafeEqual(given, Buffer.from(key))) {
    tries.count += 1;
    attempts.set(id, tries);
    return 'wrong';
  }
  attempts.delete(id);
  verified.set(id, key);
  if (isDatabaseReady()) await prisma.user.updateMany({ where: { telegramId: id }, data: { accessKey: key } });
  return 'ok';
}

export default { accessEnabled, hasAccess, submitCode };
