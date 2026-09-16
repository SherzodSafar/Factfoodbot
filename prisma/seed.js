/**
 * Seed skript — baza bo'sh qolmasligi uchun boshlang'ich mahsulotlarni yozadi.
 * Ishga tushirish:  npm run db:seed
 *
 * Skript "idempotent": bir necha marta ishlatsangiz ham nusxalar ko'paymaydi.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const IMG = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;

const products = [
  {
    name: 'Margarita',
    description:
      'Klassikaning eng go\'zali: mayin tomat sousi, eriydigan motsarella va yangi rayhon. Sodda, lekin mukammal.',
    imageUrl: IMG('photo-1604068549290-dea0e4a305ca'),
    oldPrice: 55000,
    newPrice: 45000,
    category: 'Klassik',
    ingredients: ['Tomat sousi', 'Motsarella pishlog\'i', 'Yangi rayhon', 'Zaytun moyi', 'Yupqa xamir'],
  },
  {
    name: 'Peperoni',
    description:
      'Achchiqroq peperoni kolbasasi, qalin motsarella qatlami va firma tomat sousi. Eng ko\'p buyurtma qilinadigan pizza.',
    imageUrl: IMG('photo-1628840042765-356cda07504e'),
    oldPrice: 69000,
    newPrice: 59000,
    category: 'Go\'shtli',
    ingredients: ['Peperoni kolbasa', 'Motsarella pishlog\'i', 'Tomat sousi', 'Origano', 'Qalampir'],
  },
  {
    name: 'Qazi pizza',
    description:
      'Milliy ta\'m: haqiqiy ot go\'shtidan qazi, qizil piyoz va pishloq uyg\'unligi. Faqat bizda.',
    imageUrl: IMG('photo-1594007654729-407eedc4be65'),
    oldPrice: 89000,
    newPrice: 75000,
    category: 'Go\'shtli',
    ingredients: ['Qazi (ot go\'shti)', 'Motsarella pishlog\'i', 'Qizil piyoz', 'Tomat sousi', 'Ko\'kat'],
  },
  {
    name: 'Pishloqli',
    description:
      '4 xil pishloq uyg\'unligi: motsarella, chedder, parmezan va dor blyu. Pishloq sevuvchilar uchun.',
    imageUrl: IMG('photo-1513104890138-7c749659a591'),
    oldPrice: 62000,
    newPrice: 52000,
    category: 'Pishloqli',
    ingredients: ['Motsarella', 'Chedder', 'Parmezan', 'Dor blyu', 'Qaymoqli sous'],
  },
  {
    name: 'Coca-Cola 0.5L',
    description: 'Muzdek Coca-Cola — pizzaning eng yaxshi hamrohi.',
    imageUrl: IMG('photo-1554866585-cd94860890b7'),
    oldPrice: null,
    newPrice: 5000,
    category: 'Ichimliklar',
    ingredients: ['Gazlangan ichimlik', '0.5 litr'],
  },
];

async function main() {
  console.log('🌱 Boshlang\'ich mahsulotlar yozilmoqda...\n');

  let created = 0;
  let skipped = 0;

  for (const product of products) {
    const existing = await prisma.product.findFirst({ where: { name: product.name } });

    if (existing) {
      skipped += 1;
      console.log(`   ⏭️  ${product.name} — allaqachon mavjud`);
      continue;
    }

    await prisma.product.create({ data: product });
    created += 1;
    console.log(`   ✅ ${product.name} — qo'shildi`);
  }

  const total = await prisma.product.count();
  console.log(`\n🎉 Tayyor! Yangi: ${created}, o'tkazib yuborilgan: ${skipped}, bazada jami: ${total} ta mahsulot.\n`);
}

main()
  .catch((error) => {
    console.error('❌ Seed xatoligi:', error.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
