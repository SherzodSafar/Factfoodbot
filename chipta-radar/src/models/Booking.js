/**
 * Booking modeli — bot orqali qilingan bronlar.
 */
import prisma from '../database/connection.js';

const BookingModel = {
  create(data) {
    return prisma.booking.create({ data });
  },

  update(id, data) {
    return prisma.booking.update({ where: { id: Number(id) }, data });
  },

  findOwned(id, userId) {
    return prisma.booking.findFirst({ where: { id: Number(id), userId: Number(userId) } });
  },

  findByUser(userId, take = 20) {
    return prisma.booking.findMany({
      where: { userId: Number(userId) },
      orderBy: { createdAt: 'desc' },
      take,
    });
  },

  findByOrder(userId, orderId) {
    return prisma.booking.findFirst({ where: { userId: Number(userId), orderId: String(orderId) } });
  },

  removeAllForUser(userId) {
    return prisma.booking.deleteMany({ where: { userId: Number(userId) } });
  },

  count(where) {
    return prisma.booking.count({ where });
  },
};

export default BookingModel;
