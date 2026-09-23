/**
 * Boshlang'ich ma'lumotlar: tasdiqlangan stansiyalar ro'yxati.
 * Mavjud stansiyalar yangilanadi, admin qo'shganlari o'chirilmaydi.
 *
 * Ishga tushirish:  npm run db:seed
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { STATIONS } from '../src/services/stationData.js';
import { withSchema } from '../src/database/url.js';

const prisma = new PrismaClient({ datasourceUrl: withSchema(process.env.DATABASE_URL) || undefined });

async function main() {
  let created = 0;
  let updated = 0;

  for (const station of STATIONS) {
    const existing = await prisma.station.findUnique({ where: { code: station.code } });
    if (existing) {
      // Admin o'zgartirgan nom/tartibni buzmaslik uchun faqat bo'sh maydonlar to'ldiriladi
      await prisma.station.update({
        where: { code: station.code },
        data: {
          nameRu: existing.nameRu || station.nameRu,
          nameEn: existing.nameEn || station.nameEn,
          region: existing.region || station.region,
          aliases: [...new Set([...(existing.aliases || []), ...station.aliases])],
        },
      });
      updated += 1;
    } else {
      await prisma.station.create({ data: station });
      created += 1;
    }
  }

  console.log(`✅ Stansiyalar: ${created} ta qo'shildi, ${updated} ta yangilandi`);
}

main()
  .catch((error) => {
    console.error('❌ Seed xatoligi:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
