/**
 * Bitta buyruq bilan to'liq sozlash:
 *   1) Prisma clientini generatsiya qilish
 *   2) Bazada jadvallarni yaratish (db push)
 *   3) Boshlang'ich mahsulotlarni yozish (seed)
 *
 * Ishga tushirish:  npm run setup
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';

const steps = [
  { title: 'Prisma client generatsiya qilinmoqda', cmd: 'npx', args: ['prisma', 'generate'] },
  { title: 'Bazada jadvallar yaratilmoqda', cmd: 'npx', args: ['prisma', 'db', 'push'] },
  { title: 'Boshlang\'ich mahsulotlar yozilmoqda', cmd: 'node', args: ['prisma/seed.js'] },
];

console.log('\n🍕  FactFood — sozlash boshlandi\n');

if (!process.env.DATABASE_URL) {
  console.error('❌ .env faylida DATABASE_URL topilmadi.\n');
  process.exit(1);
}

for (const [index, step] of steps.entries()) {
  console.log(`\n▶️  ${index + 1}/${steps.length} — ${step.title}...\n`);

  const result = spawnSync(step.cmd, step.args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    console.error(`\n❌ Qadam muvaffaqiyatsiz tugadi: ${step.title}`);
    console.error('   Yuqoridagi xatolik matnini tekshiring.\n');
    process.exit(1);
  }
}

console.log('\n✅ Hammasi tayyor!\n');
console.log('   Keyingi qadam:  npm run dev:all');
console.log('   Mini App:       http://localhost:5173');
console.log('   Admin panel:    http://localhost:5174\n');
