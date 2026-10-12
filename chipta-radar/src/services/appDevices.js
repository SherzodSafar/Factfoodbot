/**
 * "Chipta Radar" Android ilovasi: botdagi bir martalik kod bilan ulanadi va
 * chipta topilganda (Notification kind=found) soxta qo'ng'iroq/SMS ko'rsatadi.
 * Qurilma tokenlari bazada xeshlangan holda saqlanadi (Setting "appDevices").
 */
import crypto from 'node:crypto';
import prisma, { isDatabaseReady } from '../database/connection.js';

const KEY = 'appDevices';
const CODE_TTL_MS = 15 * 60_000;
const codes = new Map(); // kod → { userId, expires }
let devices = null; // tokenHash → { userId, createdAt }

const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

async function load() {
  if (devices) return devices;
  try {
    const row = isDatabaseReady() ? await prisma.setting.findUnique({ where: { key: KEY } }) : null;
    devices = row?.value?.devices || {};
  } catch {
    devices = {};
  }
  return devices;
}

async function save() {
  const value = { devices };
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

/** Botda ko'rsatiladigan 6 xonali kod (foydalanuvchining eski kodi bekor bo'ladi) */
export function createPairCode(userId) {
  for (const [code, entry] of codes) if (entry.expires < Date.now() || entry.userId === userId) codes.delete(code);
  let code;
  do code = String(crypto.randomInt(100000, 1000000)); while (codes.has(code));
  codes.set(code, { userId, expires: Date.now() + CODE_TTL_MS });
  return code;
}

/** Kod to'g'ri bo'lsa — yangi qurilma tokeni */
export async function pairDevice(code) {
  const key = String(code || '').replace(/\D/g, '');
  const entry = codes.get(key);
  if (!entry || entry.expires < Date.now()) return null;
  codes.delete(key);
  await load();
  const token = crypto.randomBytes(24).toString('hex');
  devices[hash(token)] = { userId: entry.userId, createdAt: new Date().toISOString() };
  await save();
  return { token, userId: entry.userId };
}

export async function deviceUserId(token) {
  if (!token) return null;
  return (await load())[hash(token)]?.userId ?? null;
}

export default { createPairCode, pairDevice, deviceUserId };
