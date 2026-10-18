// Saqlash qatlami: Vercel Blob (maxfiy do'kon) yoki lokal .data/ papkasi.
// JSON hujjatlar ETag bilan o'qiladi/yoziladi — bir vaqtda tahrirlashda
// ma'lumot yo'qolmasligi uchun (optimistik qulf).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
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
export async function readJson(key) {
  if (useBlob) {
    const { get } = await blob();
    const r = await get(key, { access: 'private', useCache: false }).catch((e) => {
      if (e?.name === 'BlobNotFoundError') return null;
      throw e;
    });
    if (!r || r.statusCode !== 200) return null;
    const buf = await streamToBuffer(r.stream);
    return { data: JSON.parse(buf.toString('utf8')), etag: r.blob.etag };
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
export async function writeJson(key, data, etag) {
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
      if (e?.name === 'BlobPreconditionFailedError' || /already exists/i.test(e?.message || '')) {
        throw new ConflictError('conflict');
      }
      throw e;
    }
    return;
  }
  const file = path.join(DATA_DIR, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (etag !== undefined) {
    const cur = await readJson(key);
    if (etag === null && cur) throw new ConflictError('exists');
    if (etag && (!cur || cur.etag !== etag)) throw new ConflictError('etag');
  }
  await fs.writeFile(file, body);
}

export async function deleteKey(key) {
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

/** Kalitlar ro'yxati (prefiks bo'yicha). */
export async function listKeys(prefix) {
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

/** JSON hujjatni o'qib-o'zgartirib qayta yozish (ziddiyatda 4 marta qayta urinadi). */
export async function updateJson(key, mutate) {
  for (let i = 0; i < 4; i++) {
    const cur = await readJson(key);
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
