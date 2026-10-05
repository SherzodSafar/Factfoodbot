/**
 * Passenger modeli — saqlangan yo'lovchilar (shaxsiy ma'lumotlar `secret` ustunida shifrlangan).
 */
import prisma from '../database/connection.js';

export const MAX_PASSENGERS_PER_USER = 10;

const PassengerModel = {
  create(data) {
    return prisma.passenger.create({ data });
  },

  update(id, data) {
    return prisma.passenger.update({ where: { id: Number(id) }, data });
  },

  findByUser(userId) {
    return prisma.passenger.findMany({ where: { userId: Number(userId) }, orderBy: { id: 'asc' } });
  },

  /** Foydalanuvchining yo'lovchisi (boshqa birovniki bo'lsa — null) */
  findOwned(id, userId) {
    return prisma.passenger.findFirst({ where: { id: Number(id), userId: Number(userId) } });
  },

  countByUser(userId) {
    return prisma.passenger.count({ where: { userId: Number(userId) } });
  },

  remove(id) {
    return prisma.passenger.delete({ where: { id: Number(id) } });
  },

  removeAllForUser(userId) {
    return prisma.passenger.deleteMany({ where: { userId: Number(userId) } });
  },

  count(where) {
    return prisma.passenger.count({ where });
  },
};

export default PassengerModel;
