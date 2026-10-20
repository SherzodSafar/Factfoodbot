// Cloudflare R2 — media kesh: bir marta Telegram'dan olingan fayl R2 ga yoziladi, keyingi safar
// ilova to'g'ridan-to'g'ri R2 dan (imzolangan havola orqali, Range qo'llab-quvvatlanadi) oladi.
import crypto from 'node:crypto';
import { AwsClient } from 'aws4fetch';
import { writeJson, readJson, ConflictError } from './store.js';

export const r2On = () => !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);
let aws = null;
const client = () => (aws ||= new AwsClient({ accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' }));
const base = () => `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}`;

export const mediaKey = (fileId, ext) => `m/${crypto.createHash('sha256').update(fileId).digest('hex').slice(0, 40)}${ext ? '.' + ext : ''}`;

/** Fayl R2 da bormi (kv dagi belgi bo'yicha — har so'rovda R2 ga HEAD yubormaslik uchun). */
export async function r2Has(key) {
  return (await readJson(`r2/${key.replace(/\//g, '_')}.json`).catch(() => null))?.data?.state === 'done';
}

/** Imzolangan GET havola (1 kun). */
export async function r2Url(key) {
  if (process.env.R2_PUBLIC_URL) return `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  const u = new URL(`${base()}/${key}`);
  u.searchParams.set('X-Amz-Expires', '86400');
  const signed = await client().sign(new Request(u, { method: 'GET' }), { aws: { signQuery: true } });
  return signed.url;
}

/**
 * Faylni R2 ga ko'chirish. readPart(start, end) → Buffer. Bir vaqtda bitta jarayon (kv qulfi).
 * 8 MB lik bo'laklar bilan multipart yuklash — xotira kam ishlatiladi.
 */
export async function r2Store(key, size, contentType, readPart) {
  const mark = `r2/${key.replace(/\//g, '_')}.json`;
  try { await writeJson(mark, { state: 'pending', at: Date.now() }, null); } catch (e) {
    if (!(e instanceof ConflictError)) throw e;
    const cur = (await readJson(mark))?.data;
    if (cur?.state === 'done' || Date.now() - (cur?.at || 0) < 10 * 60e3) return false; // boshqasi yuklayapti
    await writeJson(mark, { state: 'pending', at: Date.now() });
  }
  const url = `${base()}/${key}`;
  const c = client();
  try {
    const PART = 8 * 1024 * 1024;
    if (size <= PART) {
      const r = await c.fetch(url, { method: 'PUT', body: await readPart(0, size - 1), headers: { 'content-type': contentType } });
      if (!r.ok) throw new Error('R2 put ' + r.status);
    } else {
      const init = await c.fetch(`${url}?uploads`, { method: 'POST', headers: { 'content-type': contentType } });
      const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(await init.text())?.[1];
      if (!uploadId) throw new Error('R2 multipart init');
      const etags = [];
      for (let i = 0, start = 0; start < size; i++, start += PART) {
        const body = await readPart(start, Math.min(size, start + PART) - 1);
        const r = await c.fetch(`${url}?partNumber=${i + 1}&uploadId=${encodeURIComponent(uploadId)}`, { method: 'PUT', body });
        if (!r.ok) throw new Error('R2 part ' + r.status);
        etags.push(r.headers.get('etag'));
      }
      const xml = `<CompleteMultipartUpload>${etags.map((e, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${e}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
      const done = await c.fetch(`${url}?uploadId=${encodeURIComponent(uploadId)}`, { method: 'POST', body: xml });
      if (!done.ok) throw new Error('R2 complete ' + done.status);
    }
    await writeJson(mark, { state: 'done', at: Date.now(), size });
    return true;
  } catch (e) {
    await writeJson(mark, { state: 'error', at: 0 }).catch(() => {});
    throw e;
  }
}
