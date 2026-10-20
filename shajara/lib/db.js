// Neon (Postgres) — JSON hujjatlar va so'rov cheklovlari uchun. DATABASE_URL bo'lmasa ishlatilmaydi.
import { neon } from '@neondatabase/serverless';

export const dbOn = () => !!process.env.DATABASE_URL;
let sqlFn = null;
let ready = null;

export function sql() {
  if (!sqlFn) sqlFn = neon(process.env.DATABASE_URL);
  return sqlFn;
}

/** Jadvallarni yaratish (bir marta, birinchi so'rovda). */
export function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      const q = sql();
      await q.query(`create table if not exists kv (key text primary key, data jsonb not null, ver bigint not null default 1, updated_at timestamptz not null default now())`);
      await q.query(`create table if not exists rl (key text primary key, n int not null, reset_at timestamptz not null)`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

export async function q(text, params = []) {
  await ensureSchema();
  return sql().query(text, params);
}
