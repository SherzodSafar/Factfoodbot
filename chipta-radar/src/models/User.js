/**
 * User modeli — foydalanuvchilar bilan ishlash logikasi.
 */
import prisma from '../database/connection.js';

const UserModel = {
  findByTelegramId(telegramId) {
    return prisma.user.findUnique({ where: { telegramId: String(telegramId) } });
  },

  findById(id) {
    return prisma.user.findUnique({ where: { id: Number(id) } });
  },

  /**
   * Telegram ma'lumotlari asosida foydalanuvchini yaratish yoki yangilash.
   * @param {{id:number|string, first_name?:string, last_name?:string, username?:string, language_code?:string}} tgUser
   */
  upsertFromTelegram(tgUser) {
    const telegramId = String(tgUser.id);
    const data = {
      firstName: tgUser.first_name || 'Mehmon',
      lastName: tgUser.last_name || null,
      username: tgUser.username || null,
      languageCode: tgUser.language_code || null,
      lastSeenAt: new Date(),
      botBlocked: false,
    };
    return prisma.user.upsert({
      where: { telegramId },
      create: { telegramId, ...data },
      update: data,
    });
  },

  update(id, data) {
    return prisma.user.update({ where: { id: Number(id) }, data });
  },

  markBotBlocked(telegramId) {
    return prisma.user.updateMany({ where: { telegramId: String(telegramId) }, data: { botBlocked: true } });
  },

  count(where) {
    return prisma.user.count({ where });
  },

  /** Admin panel uchun ro'yxat (qidiruv va sahifalash bilan) */
  async list({ q, page = 1, pageSize = 50 } = {}) {
    const where = q
      ? {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { username: { contains: q.replace(/^@/, ''), mode: 'insensitive' } },
            { telegramId: { contains: q } },
          ],
        }
      : undefined;

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { watches: true, notifications: true, searches: true } } },
      }),
      prisma.user.count({ where }),
    ]);
    return { items, total, page, pageSize };
  },

  /** Xabar yuborish mumkin bo'lgan barcha foydalanuvchilar (e'lon uchun) */
  findReachable() {
    return prisma.user.findMany({
      where: { isBlocked: false, botBlocked: false },
      select: { id: true, telegramId: true },
      orderBy: { id: 'asc' },
    });
  },
};

export default UserModel;
