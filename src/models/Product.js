/**
 * Product modeli — pizzalar va ichimliklar.
 */
import prisma from '../database/connection.js';

/** Kelgan ma'lumotni bazaga mos ko'rinishga keltirish */
function normalize(input = {}) {
  const data = {};

  if (input.name !== undefined) data.name = String(input.name).trim();
  if (input.description !== undefined) data.description = String(input.description ?? '').trim();
  if (input.imageUrl !== undefined) data.imageUrl = String(input.imageUrl ?? '').trim();
  if (input.category !== undefined) data.category = String(input.category || 'Pizza').trim();
  if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);

  if (input.newPrice !== undefined) data.newPrice = Math.max(0, Math.round(Number(input.newPrice) || 0));

  if (input.oldPrice !== undefined) {
    const old = Number(input.oldPrice);
    data.oldPrice = !input.oldPrice || Number.isNaN(old) || old <= 0 ? null : Math.round(old);
  }

  if (input.ingredients !== undefined) {
    const list = Array.isArray(input.ingredients)
      ? input.ingredients
      : String(input.ingredients || '').split(',');
    data.ingredients = list.map((item) => String(item).trim()).filter(Boolean);
  }

  return data;
}

const ProductModel = {
  /** Mijozlar uchun — faqat faol mahsulotlar */
  findActive() {
    return prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { id: 'asc' }],
    });
  },

  /** Admin uchun — hammasi */
  findAll() {
    return prisma.product.findMany({ orderBy: { id: 'asc' } });
  },

  findById(id) {
    return prisma.product.findUnique({ where: { id: Number(id) } });
  },

  findManyByIds(ids) {
    return prisma.product.findMany({
      where: { id: { in: ids.map(Number) }, isActive: true },
    });
  },

  create(input) {
    const data = normalize(input);
    return prisma.product.create({
      data: {
        name: data.name,
        description: data.description ?? '',
        imageUrl: data.imageUrl ?? '',
        oldPrice: data.oldPrice ?? null,
        newPrice: data.newPrice ?? 0,
        category: data.category ?? 'Pizza',
        ingredients: data.ingredients ?? [],
        isActive: data.isActive ?? true,
      },
    });
  },

  update(id, input) {
    return prisma.product.update({ where: { id: Number(id) }, data: normalize(input) });
  },

  remove(id) {
    return prisma.product.delete({ where: { id: Number(id) } });
  },

  /** Mavjud kategoriyalar ro'yxati */
  async categories() {
    const rows = await prisma.product.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    return rows.map((row) => row.category).filter(Boolean);
  },

  count() {
    return prisma.product.count();
  },
};

export default ProductModel;
