/**
 * PostgreSQL (Neon) bazasiga Prisma orqali ulanish.
 * Butun loyiha bo'ylab yagona `prisma` nusxasidan foydalaniladi.
 */
import { PrismaClient } from '@prisma/client';
import config from '../config/default.js';

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__factfoodPrisma ??
  new PrismaClient({
    log: config.env === 'development' ? ['warn', 'error'] : ['error'],
  });

if (config.env === 'development') {
  globalForPrisma.__factfoodPrisma = prisma;
}

/** Bazaga ulanishni tekshirish */
export async function connectDatabase() {
  await prisma.$connect();
  return prisma;
}

/** Ulanishni yopish */
export async function disconnectDatabase() {
  await prisma.$disconnect();
}

export default prisma;
