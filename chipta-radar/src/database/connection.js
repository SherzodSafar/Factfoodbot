/**
 * PostgreSQL (Neon) bazasiga Prisma orqali ulanish.
 * Butun loyiha bo'ylab yagona `prisma` nusxasidan foydalaniladi.
 */
import { PrismaClient } from '@prisma/client';
import config from '../config/default.js';

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__chiptaPrisma ??
  new PrismaClient({
    log: config.env === 'development' ? ['warn', 'error'] : ['error'],
  });

if (config.env === 'development') {
  globalForPrisma.__chiptaPrisma = prisma;
}

let ready = false;

/** Bazaga ulanishni tekshirish */
export async function connectDatabase() {
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
  ready = true;
  return prisma;
}

/** Baza ulanganmi (sozlanmagan bo'lsa API 503 qaytaradi) */
export function isDatabaseReady() {
  return ready;
}

/** Ulanishni yopish */
export async function disconnectDatabase() {
  await prisma.$disconnect();
}

export default prisma;
