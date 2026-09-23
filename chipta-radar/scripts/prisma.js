/**
 * Prisma CLI'ni loyiha sxemasi (chipta_radar) bilan ishga tushirish:
 *   npm run db:push    →  node scripts/prisma.js db push
 *   npm run db:studio  →  node scripts/prisma.js studio
 * DATABASE_URL ga sxema qo'shiladi, Neon pooler o'rniga to'g'ridan-to'g'ri ulanish ishlatiladi.
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { withSchema, directUrl } from '../src/database/url.js';

const env = { ...process.env };
if (env.DATABASE_URL) env.DATABASE_URL = directUrl(withSchema(env.DATABASE_URL));

const result = spawnSync('npx', ['prisma', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env,
});
process.exit(result.status ?? 1);
