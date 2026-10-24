// Rasm sifatini AI bilan oshirish (Replicate). Asl rasm o'zgarmaydi — natija alohida nusxa bo'lib saqlanadi.
// up   — Real-ESRGAN: tiniqlashtirish/kattalashtirish, yuzni qayta chizmaydi (hamma rasm uchun).
// face — CodeFormer (fidelity 0.7 — o'xshashlik ustun): faqat yuzi juda xira/shikastlangan eski rasmlar uchun.
import { HttpError } from './tree.js';

const API = 'https://api.replicate.com/v1';
const MODELS = {
  up: { model: 'nightmareai/real-esrgan', input: { scale: 2, face_enhance: false } },
  face: { model: 'sczhou/codeformer', input: { upscale: 2, codeformer_fidelity: 0.7, background_enhance: false, face_upsample: true } },
};
const versions = new Map();
// O'z serverimiz (Oracle Cloud, enhance-server/) bo'lsa — avval o'sha; bo'lmasa Replicate
export const enhanceOn = () => !!(process.env.ENHANCE_URL || process.env.REPLICATE_API_TOKEN);
async function ownServer(buf, mode) {
  const r = await fetch(`${process.env.ENHANCE_URL.replace(/\/$/, '')}/enhance?mode=${mode}`, {
    method: 'POST', headers: { 'x-key': process.env.ENHANCE_KEY || '', 'content-type': 'application/octet-stream' }, body: buf, signal: AbortSignal.timeout(240e3) });
  if (!r.ok) throw new HttpError(502, `Server: ${(await r.text().catch(() => '')).slice(0, 150) || r.status}`);
  return { buf: Buffer.from(await r.arrayBuffer()), mime: r.headers.get('content-type') || 'image/jpeg' };
}
const H = () => ({ authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`, 'content-type': 'application/json' });

async function version(model) {
  if (versions.has(model)) return versions.get(model);
  const r = await fetch(`${API}/models/${model}`, { headers: H() });
  const j = await r.json().catch(() => ({}));
  const v = j.latest_version?.id;
  if (!v) throw new HttpError(502, 'AI xizmati javob bermadi');
  versions.set(model, v);
  return v;
}

/** buf — rasm baytlari. Natija: { buf, mime } (o'z serverimiz) yoki { url } (replicate.delivery). */
export async function enhanceImage(buf, mime, mode) {
  if (!enhanceOn()) throw new HttpError(400, 'Sifatni oshirish hali sozlanmagan');
  if (process.env.ENHANCE_URL) {
    try { return await ownServer(buf, mode); } catch (e) { if (!process.env.REPLICATE_API_TOKEN) throw e; console.error('enhance server', e.message); }
  }
  const M = MODELS[mode];
  if (!M) throw new HttpError(400, 'Noto‘g‘ri rejim');
  // rasm Replicate fayllariga yuklanadi (katta data: URI qabul qilinmasligi mumkin), bo'lmasa — data URI
  let image = `data:${mime || 'image/jpeg'};base64,${buf.toString('base64')}`;
  try {
    const fd = new FormData();
    fd.append('content', new Blob([buf], { type: mime || 'image/jpeg' }), 'photo.jpg');
    const u = await (await fetch(`${API}/files`, { method: 'POST', headers: { authorization: H().authorization }, body: fd })).json();
    if (u?.urls?.get) image = u.urls.get;
  } catch { /* data URI bilan davom */ }
  let r = await fetch(`${API}/predictions`, { method: 'POST', headers: { ...H(), prefer: 'wait=55' },
    body: JSON.stringify({ version: await version(M.model), input: { image, ...M.input } }) });
  let j = await r.json().catch(() => ({}));
  const until = Date.now() + 170e3;
  while (j?.status && !['succeeded', 'failed', 'canceled'].includes(j.status) && Date.now() < until) {
    await new Promise((ok) => setTimeout(ok, 2000));
    r = await fetch(j.urls.get, { headers: H() });
    j = await r.json().catch(() => ({}));
  }
  if (j?.status !== 'succeeded') throw new HttpError(502, j?.status ? 'Rasmni yaxshilab bo‘lmadi. Keyinroq urinib ko‘ring' : (j?.detail || 'AI xizmati javob bermadi').slice(0, 200));
  const out = Array.isArray(j.output) ? j.output[0] : j.output;
  if (!/^https:\/\/([a-z0-9-]+\.)*replicate\.delivery\//.test(String(out))) throw new HttpError(502, 'AI natijasi topilmadi');
  return { url: out };
}
