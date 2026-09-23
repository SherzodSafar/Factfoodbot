/**
 * Loyihaning barcha sozlamalari shu yerda jamlangan.
 * Qiymatlar .env faylidan (bulutda — Render "Environment" bo'limidan) o'qiladi.
 */
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeUrl } from '../database/url.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '../../');

const toBool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const toNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && value !== '' && value !== undefined ? number : fallback;
};

const env = process.env.NODE_ENV || 'development';

const config = {
  appName: process.env.APP_NAME || 'Chipta Radar',
  env,
  port: toNumber(process.env.PORT, 3000),

  database: {
    // Jadvallar alohida sxemada (standart: chipta_radar) — boshqa loyihalar jadvallariga tegilmaydi.
    // Neon "uxlab" qolganda uzilgan ulanishlar qayta ishlatilmaydi (database/url.js).
    url: runtimeUrl(process.env.DATABASE_URL),
  },

  bot: {
    token: process.env.BOT_TOKEN || '',
    // Mini App manzili (https) — bot "Menu" tugmasi shunga ulanadi.
    webAppUrl: (process.env.WEBAPP_URL || '').replace(/\/+$/, ''),
    // Backendning ochiq manzili. Render uni avtomatik beradi (RENDER_EXTERNAL_URL).
    publicUrl: (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, ''),
    // "webhook" — bulut uchun, "polling" — localhost uchun. Bo'sh bo'lsa avtomatik tanlanadi.
    mode: (process.env.BOT_MODE || '').toLowerCase(),
    webhookSecret: process.env.WEBHOOK_SECRET || '',
  },

  admin: {
    password: process.env.ADMIN_PASSWORD || 'admin123',
    secret: process.env.ADMIN_SECRET || 'chipta-radar-default-secret-change-me',
    // Admin tokenining amal qilish muddati: 7 kun
    tokenTtlMs: 7 * 24 * 60 * 60 * 1000,
  },

  // Telegramsiz, oddiy brauzerda sinash imkoniyati (faqat localhost uchun).
  allowDevAuth: toBool(process.env.ALLOW_DEV_AUTH, env !== 'production'),

  /** O'zbekiston temir yo'llari chipta sayti (ma'lumot manbai) */
  railway: {
    baseUrl: (process.env.RAILWAY_BASE_URL || 'https://eticket.railway.uz').replace(/\/+$/, ''),
    lang: process.env.RAILWAY_LANG || 'uz',
    // Ixtiyoriy: agar sayt API uchun hisobga kirishni talab qilsa
    login: process.env.RAILWAY_LOGIN || '',
    password: process.env.RAILWAY_PASSWORD || '',
    // Saytga so'rovlar orasidagi eng kam oraliq (saytni ortiqcha yuklamaslik uchun)
    minIntervalMs: toNumber(process.env.RAILWAY_MIN_INTERVAL_MS, 1200),
    timeoutMs: toNumber(process.env.RAILWAY_TIMEOUT_MS, 20000),
    // Qidiruv natijalari shuncha vaqt keshda turadi
    cacheTtlMs: toNumber(process.env.RAILWAY_CACHE_TTL_MS, 30000),
    // Mijoz chiptani shu sahifada sotib oladi
    buyUrl: process.env.RAILWAY_BUY_URL || 'https://eticket.railway.uz/uz/home',
  },

  /** Kuzatuv (monitoring) xizmati — standart qiymatlar, Admin Paneldan o'zgartiriladi */
  watcher: {
    enabled: toBool(process.env.WATCHER_ENABLED, true),
    intervalSec: toNumber(process.env.WATCH_INTERVAL_SEC, 60),
    maxWatchesPerUser: toNumber(process.env.MAX_WATCHES_PER_USER, 10),
    notifyCooldownMin: toNumber(process.env.NOTIFY_COOLDOWN_MIN, 10),
    maxDaysAhead: toNumber(process.env.MAX_DAYS_AHEAD, 60),
  },

  // Bepul serverni uxlab qolmasligi uchun o'ziga so'rov yuborish (faqat faol kuzatuvlar bo'lsa)
  keepAlive: toBool(process.env.KEEP_ALIVE, true),

  // Toshkent vaqti: UTC+5 (yozgi vaqt yo'q)
  timezoneOffsetMin: 300,

  frontend: {
    miniappDist: path.join(ROOT_DIR, 'miniapp', 'dist'),
  },
};

/** Bot qaysi rejimda ishlashi kerak: 'webhook' yoki 'polling' */
export function resolveBotMode() {
  if (config.bot.mode === 'webhook' || config.bot.mode === 'polling') return config.bot.mode;
  return config.bot.publicUrl.startsWith('https://') ? 'webhook' : 'polling';
}

/** Yetishmayotgan sozlamalar ro'yxati (server baribir ishga tushadi, lekin ogohlantiradi) */
export function missingConfig() {
  const problems = [];
  if (!config.database.url) problems.push('DATABASE_URL to\'ldirilmagan — baza ulanmaydi');
  if (!config.bot.token) problems.push('BOT_TOKEN to\'ldirilmagan — bot ishga tushmaydi');
  return problems;
}

export default config;
