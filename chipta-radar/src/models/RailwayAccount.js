/**
 * RailwayAccount modeli — foydalanuvchining ulangan eticket.railway.uz hisobi.
 * `secret` ustuni shifrlangan (services/vault.js) — bu yerda faqat saqlanadi va o'qiladi.
 */
import prisma from '../database/connection.js';

const RailwayAccountModel = {
  findByUser(userId) {
    return prisma.railwayAccount.findUnique({ where: { userId: Number(userId) } });
  },

  /** Ulash (qayta ulanganda eski token almashtiriladi) */
  upsert(userId, data) {
    return prisma.railwayAccount.upsert({
      where: { userId: Number(userId) },
      create: { userId: Number(userId), ...data },
      update: data,
    });
  },

  update(userId, data) {
    return prisma.railwayAccount.update({ where: { userId: Number(userId) }, data });
  },

  remove(userId) {
    return prisma.railwayAccount.deleteMany({ where: { userId: Number(userId) } });
  },

  count(where) {
    return prisma.railwayAccount.count({ where });
  },
};

export default RailwayAccountModel;
