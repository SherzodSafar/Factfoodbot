/**
 * Bitta buyruq bilan to'liq sozlash:
 *   1) Prisma clientini generatsiya qilish
 *   2) Bazada jadvallarni yaratish/yangilash (db push)
 *   3) Stansiyalar ro'yxatini yozish (seed)
 *
 * Ishga tushirish:  npm run setup
 * DATABASE_URL bo'lmasa, faqat 1-qadam bajariladi (server keyinroq bazaga ulanadi).
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';

/**
 * Neon "pooler" (PgBouncer) ulanishi orqali jadval yaratib bo'lmaydi.
 * Shuning uchun migratsiya paytida to'g'ridan-to'g'ri ulanish ishlatiladi:
 * ep-xxx-pooler.neon.tech  →  ep-xxx.neon.tech
 */
function directUrl(url) {
  if (!url) return url;
  return process.env.DIRECT_URL || url.replace('-pooler.', '.');
}

const hasDatabase = Boolean(process.env.DATABASE_URL);

const steps = [
  { title: 'Prisma client generatsiya qilinmoqda', cmd: 'npx', args: ['prisma', 'generate'] },
  hasDatabase && {
    title: 'Bazada jadvallar yaratilmoqda',
    cmd: 'npx',
    args: ['prisma', 'db', 'push', '--skip-generate'],
    env: { DATABASE_URL: directUrl(process.env.DATABASE_URL) },
  },
  hasDatabase && { title: 'Stansiyalar ro\'yxati yozilmoqda', cmd: 'node', args: ['prisma/seed.js'] },
].filter(Boolean);

console.log('\n🚆  Chipta Radar — sozlash boshlandi\n');

if (!hasDatabase) {
  console.warn('⚠️  DATABASE_URL topilmadi — faqat Prisma client tayyorlanadi.');
  console.warn('   Bazani ulash uchun DATABASE_URL ni kiriting va "npm run setup" ni qayta bajaring.\n');
}

for (const [index, step] of steps.entries()) {
  console.log(`\n▶️  ${index + 1}/${steps.length} — ${step.title}...\n`);
  const result = spawnSync(step.cmd, step.args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...(step.env || {}) },
  });
  if (result.status !== 0) {
    console.error(`\n❌ Qadam muvaffaqiyatsiz tugadi: ${step.title}`);
    console.error('   Yuqoridagi xatolik matnini tekshiring.\n');
    process.exit(1);
  }
}

console.log(hasDatabase ? '\n✅ Baza tayyor!\n' : '\n✅ Tayyor (bazasiz).\n');

if (!process.env.RENDER) {
  console.log('   Keyingi qadam:  npm run dev:all');
  console.log('   Mini App:       http://localhost:5173');
  console.log('   Admin panel:    http://localhost:5174\n');
}
