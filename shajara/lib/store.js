// Saqlash qatlami: Vercel Blob (maxfiy do'kon) yoki lokal .data/ papkasi.
// JSON hujjatlar ETag bilan o'qiladi/yoziladi — bir vaqtda tahrirlashda
// ma'lumot yo'qolmasligi uchun (optimistik qulf).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { dbOn, q } from './db.js';

const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
// JSON hujjatlar: Neon ulangan bo'lsa — bazada (eski Blob'dagilari birinchi o'qishda avtomatik ko'chiriladi)
const DATA_DIR = path.resolve(process.cwd(), '.data');

let blobLib;
async function blob() {
  if (!blobLib) blobLib = await import('@vercel/blob');
  return blobLib;
}

export class ConflictError extends Error {}

async function streamToBuffer(stream) {
  const chunks = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** @returns {Promise<{data:any, etag:string}|null>} */
async function readJsonFile(key, forWrite = false) {
  if (useBlob) {
    const { get, head } = await blob();
    // get() qaytaradigan ETag CDN formatida bo'ladi; shartli yozish uchun API ETag'i (head) kerak.
    const meta = forWrite ? await head(key).catch(() => null) : null;
    const r = await get(key, { access: 'private', useCache: false }).catch((e) => {
      if (e?.name === 'BlobNotFoundError') return null;
      throw e;
    });
    if (!r || r.statusCode !== 200) return null;
    const buf = await streamToBuffer(r.stream);
    return { data: JSON.parse(buf.toString('utf8')), etag: meta?.etag || r.blob.etag };
  }
  try {
    const buf = await fs.readFile(path.join(DATA_DIR, key));
    return { data: JSON.parse(buf.toString('utf8')), etag: crypto.createHash('md5').update(buf).digest('hex') };
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

/**
 * etag: undefined → shart yo'q; null → fayl mavjud bo'lmasligi kerak; satr → mos kelishi kerak.
 */
async function writeJsonFile(key, data, etag) {
  const body = JSON.stringify(data);
  if (useBlob) {
    const { put } = await blob();
    try {
      await put(key, body, {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: etag !== null,
        cacheControlMaxAge: 60,
        ...(etag ? { ifMatch: etag } : {}),
      });
    } catch (e) {
      if (e?.name === 'BlobPreconditionFailedError' || e?.constructor?.name === 'BlobPreconditionFailedError' || /precondition|already exists/i.test(e?.message || '')) {
        throw new ConflictError('conflict');
      }
      throw e;
    }
    return;
  }
  const file = path.join(DATA_DIR, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (etag !== undefined) {
    const cur = await readJsonFile(key);
    if (etag === null && cur) throw new ConflictError('exists');
    if (etag && (!cur || cur.etag !== etag)) throw new ConflictError('etag');
  }
  await fs.writeFile(file, body);
}

async function deleteKeyFile(key) {
  if (useBlob) {
    const { del } = await blob();
    await del(key).catch(() => {});
    return;
  }
  await fs.rm(path.join(DATA_DIR, key), { force: true });
}

export async function putFile(key, buffer, contentType) {
  if (useBlob) {
    const { put } = await blob();
    await put(key, buffer, {
      access: 'private',
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 31536000,
    });
    return;
  }
  const file = path.join(DATA_DIR, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buffer);
}

/** @returns {Promise<{buffer:Buffer, contentType:string}|null>} */
export async function getFile(key) {
  if (useBlob) {
    const { get } = await blob();
    const r = await get(key, { access: 'private' }).catch(() => null);
    if (!r || r.statusCode !== 200) return null;
    return { buffer: await streamToBuffer(r.stream), contentType: r.blob.contentType };
  }
  try {
    const buffer = await fs.readFile(path.join(DATA_DIR, key));
    return { buffer, contentType: key.endsWith('.png') ? 'image/png' : 'image/jpeg' };
  } catch {
    return null;
  }
}

async function listKeysFile(prefix) {
  if (useBlob) {
    const { list } = await blob();
    const out = [];
    let cursor;
    do {
      const r = await list({ prefix, cursor, limit: 1000 });
      out.push(...r.blobs.map((b) => b.pathname));
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    return out;
  }
  const dir = path.join(DATA_DIR, prefix);
  try {
    const files = await fs.readdir(dir);
    return files.map((f) => prefix + f);
  } catch {
    return [];
  }
}

/** @returns {Promise<{data:any, etag:string}|null>} */
export async function readJson(key, forWrite = false) {
  if (!dbOn()) return readJsonFile(key, forWrite);
  const r = await q('select data, ver from kv where key = $1', [key]);
  if (r.length) return { data: r[0].data, etag: String(r[0].ver) };
  // eski ombordan bir martalik ko'chirish
  const old = await readJsonFile(key).catch(() => null);
  if (!old) return null;
  await q('insert into kv (key, data) values ($1, $2) on conflict (key) do nothing', [key, JSON.stringify(old.data)]);
  return readJson(key, forWrite);
}

/** etag: undefined → shart yo'q; null → hujjat mavjud bo'lmasligi kerak; satr → mos kelishi kerak. */
export async function writeJson(key, data, etag) {
  if (!dbOn()) return writeJsonFile(key, data, etag);
  const body = JSON.stringify(data);
  if (etag === undefined) {
    await q('insert into kv (key, data) values ($1, $2) on conflict (key) do update set data = excluded.data, ver = kv.ver + 1, updated_at = now()', [key, body]);
    return;
  }
  if (etag === null) {
    // eski omborda bo'lsa ham "mavjud" hisoblanadi
    if (!(await q('select 1 from kv where key = $1', [key])).length && (await readJsonFile(key).catch(() => null))) throw new ConflictError('exists');
    const r = await q('insert into kv (key, data) values ($1, $2) on conflict (key) do nothing returning key', [key, body]);
    if (!r.length) throw new ConflictError('exists');
    return;
  }
  const r = await q('update kv set data = $2, ver = ver + 1, updated_at = now() where key = $1 and ver = $3 returning key', [key, body, Number(etag)]);
  if (!r.length) throw new ConflictError('etag');
}

export async function deleteKey(key) {
  if (dbOn()) await q('delete from kv where key = $1', [key]);
  await deleteKeyFile(key);
}

/** Kalitlar ro'yxati (prefiks bo'yicha). */
export async function listKeys(prefix) {
  const file = await listKeysFile(prefix).catch(() => []);
  if (!dbOn()) return file;
  const r = await q("select key from kv where key like $1 || '%'", [prefix.replace(/[%_]/g, (c) => '\\' + c)]);
  return [...new Set([...r.map((x) => x.key), ...file])];
}

/** Eski ombordagi barcha JSON hujjatlarni bazaga ko'chirish. */
export async function migrateToDb(prefixes = ['trees/', 'codes/', 'users/', 'albums/', 'chats/', 'links/', 'aijobs/', 'mtproto/']) {
  let n = 0;
  for (const p of prefixes) for (const key of await listKeysFile(p).catch(() => [])) if (key.endsWith('.json')) { await readJson(key); n++; }
  return n;
}

/** JSON hujjatni o'qib-o'zgartirib qayta yozish (ziddiyatda 4 marta qayta urinadi). */
export async function updateJson(key, mutate) {
  for (let i = 0; i < 4; i++) {
    const cur = await readJson(key, true);
    if (!cur) return null;
    const result = await mutate(cur.data);
    try {
      await writeJson(key, cur.data, cur.etag);
      return { data: cur.data, result };
    } catch (e) {
      if (!(e instanceof ConflictError) || i === 3) throw e;
      await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    }
  }
  return null;
}
