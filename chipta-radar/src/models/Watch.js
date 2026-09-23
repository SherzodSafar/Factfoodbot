/**
 * Watch modeli — kuzatuvlar ("joy chiqsa xabar ber" buyurtmalari).
 */
import prisma from '../database/connection.js';

export const WATCH_STATUSES = ['ACTIVE', 'PAUSED', 'FOUND', 'EXPIRED', 'CANCELLED'];

const WatchModel = {
  create(data) {
    return prisma.watch.create({ data });
  },

  findById(id) {
    return prisma.watch.findUnique({ where: { id: Number(id) }, include: { user: true } });
  },

  /** Foydalanuvchining kuzatuvi (boshqa birovniki bo'lsa — null) */
  findOwned(id, userId) {
    return prisma.watch.findFirst({ where: { id: Number(id), userId: Number(userId) } });
  },

  findByUser(userId, { onlyOpen = false } = {}) {
    return prisma.watch.findMany({
      where: {
        userId: Number(userId),
        ...(onlyOpen ? { status: { in: ['ACTIVE', 'PAUSED'] } } : { status: { not: 'CANCELLED' } }),
      },
      orderBy: [{ status: 'asc' }, { date: 'asc' }, { id: 'desc' }],
      take: 100,
    });
  },

  countActiveByUser(userId) {
    return prisma.watch.count({ where: { userId: Number(userId), status: { in: ['ACTIVE', 'PAUSED'] } } });
  },

  /** Kuzatuv xizmati uchun: faol va muddati o'tmaganlar (bloklanmagan foydalanuvchilarniki) */
  findForWatcher(today) {
    return prisma.watch.findMany({
      where: {
        status: 'ACTIVE',
        date: { gte: today },
        user: { isBlocked: false, botBlocked: false },
      },
      include: { user: true },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
  },

  countActive() {
    return prisma.watch.count({ where: { status: 'ACTIVE' } });
  },

  /** Sanasi o'tib ketgan kuzatuvlarni yopish */
  expireBefore(today) {
    return prisma.watch.updateMany({
      where: { status: { in: ['ACTIVE', 'PAUSED'] }, date: { lt: today } },
      data: { status: 'EXPIRED' },
    });
  },

  update(id, data) {
    return prisma.watch.update({ where: { id: Number(id) }, data });
  },

  remove(id) {
    return prisma.watch.delete({ where: { id: Number(id) } });
  },

  pauseAllForUser(userId) {
    return prisma.watch.updateMany({ where: { userId: Number(userId), status: 'ACTIVE' }, data: { status: 'PAUSED' } });
  },

  /** Admin panel uchun ro'yxat */
  async list({ status, q, page = 1, pageSize = 50 } = {}) {
    const where = {};
    if (status && status !== 'ALL') where.status = status;
    if (q) {
      where.OR = [
        { fromName: { contains: q, mode: 'insensitive' } },
        { toName: { contains: q, mode: 'insensitive' } },
        { date: { contains: q } },
        { user: { firstName: { contains: q, mode: 'insensitive' } } },
        { user: { username: { contains: q.replace(/^@/, ''), mode: 'insensitive' } } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.watch.findMany({
        where,
        include: { user: true },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.watch.count({ where }),
    ]);
    return { items, total, page, pageSize };
  },

  groupByStatus() {
    return prisma.watch.groupBy({ by: ['status'], _count: { _all: true } });
  },
};

export default WatchModel;
