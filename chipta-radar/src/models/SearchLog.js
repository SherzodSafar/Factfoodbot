/**
 * SearchLog modeli — qidiruvlar jurnali (statistika uchun).
 */
import prisma from '../database/connection.js';

const SearchLogModel = {
  /** Jurnalga yozish. Xatolik bo'lsa ham asosiy ish to'xtamaydi. */
  record({ userId = null, fromCode, toCode, date, source = 'app', trains = 0, withSeats = 0, ok = true }) {
    return prisma.searchLog
      .create({ data: { userId, fromCode, toCode, date, source, trains, withSeats, ok } })
      .catch((error) => console.warn('[search-log]', error.message));
  },

  count(where) {
    return prisma.searchLog.count({ where });
  },

  /** Eng ko'p qidirilgan yo'nalishlar */
  async popularRoutes({ since, take = 10 } = {}) {
    const rows = await prisma.searchLog.groupBy({
      by: ['fromCode', 'toCode'],
      where: since ? { createdAt: { gte: since } } : undefined,
      _count: { _all: true },
      orderBy: { _count: { fromCode: 'desc' } },
      take,
    });
    return rows.map((row) => ({ fromCode: row.fromCode, toCode: row.toCode, count: row._count._all }));
  },

  /** Foydalanuvchining oxirgi qidiruvlari (takrorlarsiz) */
  async recentForUser(userId, take = 6) {
    const rows = await prisma.searchLog.findMany({
      where: { userId: Number(userId) },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
    const seen = new Set();
    const result = [];
    for (const row of rows) {
      const key = `${row.fromCode}-${row.toCode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ fromCode: row.fromCode, toCode: row.toCode, date: row.date });
      if (result.length >= take) break;
    }
    return result;
  },
};

export default SearchLogModel;
