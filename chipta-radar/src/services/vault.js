/**
 * Shaxsiy ma'lumotlarni shifrlash — AES-256-GCM.
 *
 * Kalit bazada emas, server muhit o'zgaruvchisida turadi, shuning uchun baza
 * o'g'irlansa ham eticket tokeni va yo'lovchi ma'lumotlarini o'qib bo'lmaydi:
 *   • DATA_ENCRYPTION_KEY — 32 bayt (64 ta hex belgi yoki base64). Tavsiya etiladi.
 *   • berilmasa — ADMIN_SECRET dan HKDF orqali hosil qilinadi (u standart qiymat bo'lmasa).
 *
 * Shifrlangan matn: "v1.<kid>.<iv>.<tag>.<data>" (base64url).
 * kid — kalit belgisi: DATA_ENCRYPTION_KEY keyinroq qo'shilsa ham eski yozuvlar
 * ADMIN_SECRET kaliti bilan ochilaveradi, yangilari yangi kalit bilan yoziladi.
 *
 * context (masalan "passenger:12") shifrlangan matnni egasiga bog'laydi — boshqa
 * foydalanuvchi yozuviga ko'chirilgan matn ochilmaydi.
 */
import crypto from 'node:crypto';
import config from '../config/default.js';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12;

export class VaultError extends Error {
  constructor(message, code = 'VAULT_ERROR') {
    super(message);
    this.name = 'VaultError';
    this.code = code;
  }
}

/** Matndan 32 baytli kalit: hex, base64 yoki erkin matn (HKDF bilan) */
export function parseKey(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (/^[0-9a-f]{64}$/i.test(text)) return Buffer.from(text, 'hex');
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(text)) {
    const bytes = Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (bytes.length === 32) return bytes;
  }
  return Buffer.from(crypto.hkdfSync('sha256', text, 'chipta-radar', 'data-encryption-key', 32));
}

const keyId = (key) => crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);

/** Mavjud kalitlar: birinchisi bilan shifrlanadi, istalgani bilan ochiladi */
function loadKeys() {
  const keys = [];
  const primary = parseKey(config.security.dataKey);
  if (primary) keys.push({ id: keyId(primary), key: primary, source: 'DATA_ENCRYPTION_KEY' });

  const adminUsable = !config.admin.secretIsDefault || config.env !== 'production';
  if (adminUsable && config.admin.secret) {
    const derived = Buffer.from(crypto.hkdfSync('sha256', config.admin.secret, 'chipta-radar', 'data-encryption-v1', 32));
    if (!keys.some((item) => item.key.equals(derived))) {
      keys.push({ id: keyId(derived), key: derived, source: config.admin.secretIsDefault ? 'dev' : 'ADMIN_SECRET' });
    }
  }
  return keys;
}

let keys = loadKeys();

/** Sinov uchun: sozlamalar o'zgargach kalitlarni qayta o'qish */
export function reloadKeys() {
  keys = loadKeys();
}

export function vaultStatus() {
  return { ready: keys.length > 0, source: keys[0]?.source || null, keys: keys.length };
}

export function isVaultReady() {
  return keys.length > 0;
}

const b64 = (buffer) => buffer.toString('base64url');

/**
 * Qiymatni (obyekt, matn, son) shifrlash.
 * @param {unknown} value
 * @param {string} context  yozuv egasi, masalan "account:5"
 */
export function encrypt(value, context = '') {
  const active = keys[0];
  if (!active) throw new VaultError('Shifrlash kaliti sozlanmagan (DATA_ENCRYPTION_KEY)', 'NO_KEY');
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, active.key, iv);
  cipher.setAAD(Buffer.from(String(context)));
  const data = Buffer.concat([cipher.update(JSON.stringify(value ?? null), 'utf8'), cipher.final()]);
  return [VERSION, active.id, b64(iv), b64(cipher.getAuthTag()), b64(data)].join('.');
}

/** Shifrlangan matnni ochish. Kalit mos kelmasa yoki matn o'zgartirilgan bo'lsa — VaultError */
export function decrypt(payload, context = '') {
  const parts = String(payload || '').split('.');
  if (parts.length !== 5 || parts[0] !== VERSION) throw new VaultError('Shifrlangan ma\'lumot buzilgan', 'BAD_FORMAT');
  const [, id, iv, tag, data] = parts;
  const entry = keys.find((item) => item.id === id);
  if (!entry) throw new VaultError('Ma\'lumot boshqa kalit bilan shifrlangan', 'UNKNOWN_KEY');
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, entry.key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(String(context)));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const text = Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
    return JSON.parse(text);
  } catch {
    throw new VaultError('Ma\'lumotni ochib bo\'lmadi (kalit yoki matn mos emas)', 'DECRYPT_FAILED');
  }
}

/** Yozuv eski kalit bilan shifrlanganmi (qayta shifrlash kerak) */
export function needsRotation(payload) {
  return Boolean(keys[0]) && String(payload || '').split('.')[1] !== keys[0].id;
}

export default { encrypt, decrypt, isVaultReady, vaultStatus, needsRotation, reloadKeys, parseKey, VaultError };
