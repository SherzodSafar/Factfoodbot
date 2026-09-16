/**
 * User modeli — mijozlar bilan ishlash logikasi.
 */
import prisma from '../database/connection.js';

const UserModel = {
  /** Telegram ID bo'yicha topish */
  findByTelegramId(telegramId) {
    return prisma.user.findUnique({ where: { telegramId: String(telegramId) } });
  },

  findById(id) {
    return prisma.user.findUnique({ where: { id: Number(id) } });
  },

  /**
   * Telegram ma'lumotlari asosida mijozni yaratadi yoki yangilaydi.
   * @param {{id:number|string, first_name?:string, last_name?:string, username?:string, photo_url?:string}} tgUser
   */
  upsertFromTelegram(tgUser) {
    const telegramId = String(tgUser.id);
    const data = {
      firstName: tgUser.first_name || 'Mehmon',
      lastName: tgUser.last_name || null,
      username: tgUser.username || null,
      photoUrl: tgUser.photo_url || null,
    };

    return prisma.user.upsert({
      where: { telegramId },
      create: { telegramId, ...data },
      update: data,
    });
  },

  /** Telefon raqamni saqlash */
  updatePhone(userId, phone) {
    return prisma.user.update({
      where: { id: Number(userId) },
      data: { phone },
    });
  },

  update(userId, data) {
    return prisma.user.update({ where: { id: Number(userId) }, data });
  },

  count() {
    return prisma.user.count();
  },

  findAll() {
    return prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  },
};

export default UserModel;
