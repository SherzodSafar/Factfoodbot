/**
 * Station modeli — stansiyalar ro'yxati (Admin Paneldan boshqariladi).
 */
import prisma from '../database/connection.js';

/** Kelgan ma'lumotni bazaga mos ko'rinishga keltirish */
function normalize(input = {}) {
  const data = {};
  if (input.nameUz !== undefined) data.nameUz = String(input.nameUz).trim();
  if (input.nameRu !== undefined) data.nameRu = String(input.nameRu ?? '').trim();
  if (input.nameEn !== undefined) data.nameEn = String(input.nameEn ?? '').trim();
  if (input.region !== undefined) data.region = String(input.region ?? '').trim();
  if (input.isPopular !== undefined) data.isPopular = Boolean(input.isPopular);
  if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);
  if (input.sortOrder !== undefined) data.sortOrder = Math.round(Number(input.sortOrder) || 100);
  if (input.aliases !== undefined) {
    const list = Array.isArray(input.aliases) ? input.aliases : String(input.aliases || '').split(',');
    data.aliases = [...new Set(list.map((item) => String(item).trim()).filter(Boolean))];
  }
  return data;
}

const StationModel = {
  findAll() {
    return prisma.station.findMany({ orderBy: [{ sortOrder: 'asc' }, { nameUz: 'asc' }] });
  },

  findByCode(code) {
    return prisma.station.findUnique({ where: { code: String(code) } });
  },

  create(input) {
    return prisma.station.create({
      data: {
        code: String(input.code).trim(),
        nameUz: String(input.nameUz).trim(),
        ...normalize({ ...input, nameUz: undefined }),
      },
    });
  },

  update(code, input) {
    return prisma.station.update({ where: { code: String(code) }, data: normalize(input) });
  },

  remove(code) {
    return prisma.station.delete({ where: { code: String(code) } });
  },
};

export default StationModel;
