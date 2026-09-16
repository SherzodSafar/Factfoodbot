/**
 * Order modeli — buyurtmalar bilan ishlash logikasi.
 */
import prisma from '../database/connection.js';

export const ORDER_STATUSES = ['PENDING', 'DELIVERED', 'CANCELLED'];

const OrderModel = {
  /**
   * Yangi buyurtma yaratish.
   * @param {{userId:number, items:Array, total:number, location?:string,
   *          latitude?:number, longitude?:number, phone?:string, comment?:string}} payload
   */
  create(payload) {
    return prisma.order.create({
      data: {
        userId: Number(payload.userId),
        items: payload.items,
        total: Math.round(Number(payload.total) || 0),
        location: payload.location || '',
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        phone: payload.phone || null,
        comment: payload.comment || null,
      },
      include: { user: true },
    });
  },

  findById(id) {
    return prisma.order.findUnique({ where: { id: Number(id) }, include: { user: true } });
  },

  /** Admin panel uchun barcha buyurtmalar (yangisi tepada) */
  findAll({ status } = {}) {
    return prisma.order.findMany({
      where: status && ORDER_STATUSES.includes(status) ? { status } : undefined,
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** Mijozning shaxsiy buyurtmalar tarixi */
  findByUser(userId) {
    return prisma.order.findMany({
      where: { userId: Number(userId) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  updateStatus(id, status) {
    return prisma.order.update({
      where: { id: Number(id) },
      data: { status },
      include: { user: true },
    });
  },

  remove(id) {
    return prisma.order.delete({ where: { id: Number(id) } });
  },

  count(where) {
    return prisma.order.count({ where });
  },

  /** Admin bosh sahifasi uchun umumiy statistika */
  async stats() {
    const [total, pending, delivered, revenue, users] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.count({ where: { status: 'DELIVERED' } }),
      prisma.order.aggregate({
        _sum: { total: true },
        where: { status: { not: 'CANCELLED' } },
      }),
      prisma.user.count(),
    ]);

    return {
      totalOrders: total,
      pendingOrders: pending,
      deliveredOrders: delivered,
      revenue: revenue._sum.total || 0,
      totalUsers: users,
    };
  },
};

export default OrderModel;
