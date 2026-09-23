/**
 * Notification modeli — foydalanuvchilarga yuborilgan xabarlar tarixi.
 */
import prisma from '../database/connection.js';

const NotificationModel = {
  create({ watchId = null, userId, kind = 'found', text, seats = 0, delivered = true }) {
    return prisma.notification.create({
      data: { watchId, userId, kind, text: String(text).slice(0, 4000), seats, delivered },
    });
  },

  findByWatch(watchId, take = 20) {
    return prisma.notification.findMany({
      where: { watchId: Number(watchId) },
      orderBy: { createdAt: 'desc' },
      take,
    });
  },

  async list({ page = 1, pageSize = 50, kind } = {}) {
    const where = kind ? { kind } : undefined;
    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: { user: true, watch: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notification.count({ where }),
    ]);
    return { items, total, page, pageSize };
  },

  count(where) {
    return prisma.notification.count({ where });
  },
};

export default NotificationModel;
