/**
 * Loyihaning barcha sozlamalari shu yerda jamlangan.
 * Qiymatlar .env faylidan o'qiladi.
 */
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '../../');

const toBool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),

  database: {
    url: process.env.DATABASE_URL || '',
  },

  bot: {
    token: process.env.BOT_TOKEN || '',
    // Mini App manzili (https). ngrok bergan domen shu yerga yoziladi.
    webAppUrl: (process.env.WEBAPP_URL || '').replace(/\/+$/, ''),
  },

  admin: {
    password: process.env.ADMIN_PASSWORD || 'admin123',
    secret: process.env.ADMIN_SECRET || 'factfood-default-secret-change-me',
    // Admin tokenining amal qilish muddati: 7 kun
    tokenTtlMs: 7 * 24 * 60 * 60 * 1000,
  },

  // Telegramsiz, oddiy brauzerda sinash imkoniyati (faqat localhost uchun)
  allowDevAuth: toBool(process.env.ALLOW_DEV_AUTH, true),

  frontend: {
    miniappPort: Number(process.env.MINIAPP_PORT || 5173),
    adminPort: Number(process.env.ADMIN_PORT || 5174),
    miniappDist: path.join(ROOT_DIR, 'miniapp', 'dist'),
    adminDist: path.join(ROOT_DIR, 'admin', 'dist'),
  },

  // Buyurtma qabul qilingandan keyin mijozga boradigan xabar
  messages: {
    orderAccepted:
      'Buyurtmangiz muvaffaqiyatli qabul qilindi! Kuryerimiz tez orada bog\'lanadi 🍕',
  },
};

/** Sozlamalarni tekshirish — nimadir yetishmasa terminalda ogohlantiradi */
export function validateConfig() {
  const problems = [];
  if (!config.database.url) problems.push('DATABASE_URL (.env faylida) to\'ldirilmagan');
  if (!config.bot.token) problems.push('BOT_TOKEN (.env faylida) to\'ldirilmagan');
  return problems;
}

export default config;
