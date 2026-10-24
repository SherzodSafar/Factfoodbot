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
// 🪄 restore: Cloudflare Workers AI (FLUX.2 klein, kuniga 10 000 neuron bepul) — asosiy;
// Gemini pulli (~$0.04/rasm) — faqat GEMINI_RESTORE=1 bo'lsa
const cfAccount = () => process.env.CF_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
export const cfOn = () => !!(process.env.CF_AI_TOKEN && cfAccount());
const geminiOn = () => process.env.GEMINI_RESTORE === '1' && !!(process.env.GEMINI_API_KEY_PAID || process.env.GEMINI_API_KEY);
export const restoreOn = () => cfOn() || geminiOn();
// Sinovda (2026-10-24): uzun «same person/face/badge» buyruqlari xavfsizlik filtriga tushdi («output flagged»);
// «vintage portrait clean up» uslubidagisi o'tdi. Cloudflare ba'zan 500 qaytaradi — boshqa buyruq bilan qayta urinamiz.
const CF_PROMPTS = [
  'Clean up this vintage portrait photograph: remove all white spots, scratches, stains and peeled areas, crop to the portrait without the paper border, sharpen details, high quality studio scan, black and white.',
  'Clean up this vintage portrait photograph: remove the white spots and scratches, sharpen, high quality scan.',
  'Clean up this vintage black and white photograph: remove dust, spots and scratches, sharp focus, high quality scan.',
];
async function cfRun(small, w, h, prompt, model) {
  const fd = new FormData();
  fd.append('prompt', prompt);
  fd.append('input_image_0', new Blob([small], { type: 'image/jpeg' }), 'photo.jpg');
  fd.append('width', String(w)); fd.append('height', String(h));
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccount()}/ai/run/${model}`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.CF_AI_TOKEN}` }, body: fd, signal: AbortSignal.timeout(90e3) });
  const ct = r.headers.get('content-type') || '';
  if (r.ok && ct.startsWith('image/')) return { buf: Buffer.from(await r.arrayBuffer()), mime: ct };
  const j = await r.json().catch(() => ({}));
  const img = j.result?.image || j.image;
  if (r.ok && img) return { buf: Buffer.from(img, 'base64'), mime: 'image/jpeg' };
  return { err: `Cloudflare ${r.status}: ${(j.errors?.[0]?.message || JSON.stringify(j)).slice(0, 200)}` };
}
/** small — telefonda 512 px dan kichraytirilgan JPEG; w,h — natija o'lchami (16 ga karrali). */
export async function cfRestore(small, w, h) {
  const model = process.env.CF_AI_MODEL || '@cf/black-forest-labs/flux-2-klein-9b';
  let last = '';
  for (const [i, prompt] of CF_PROMPTS.entries()) {
    if (i) await new Promise((ok) => setTimeout(ok, 800));
    const out = await cfRun(small, w, h, prompt, model).catch((e) => ({ err: e.message }));
    if (out.buf) return out;
    last = out.err;
    console.error('restore', i, last);
    if (/4006|neuron|quota|429/i.test(last)) throw new HttpError(429, 'Bugungi bepul AI limiti tugadi. Ertaga urinib ko‘ring');
  }
  throw new HttpError(502, /flagged/i.test(last) ? 'AI bu rasmni qayta ishlashni rad etdi. Boshqa rasm bilan urinib ko‘ring' : 'AI xizmati hozir javob bermadi. Birozdan keyin qayta urinib ko‘ring');
}

// 🪄 restore — Gemini rasm modeli: tirnalgan/yirtilgan/dog' joylarni tuzatadi, tiniqlashtiradi (qiyofa saqlanadi)
const PROMPT = `Restore this old damaged photograph. Remove all scratches, cracks, creases, tears, dust, stains and missing (peeled) emulsion spots, and reconstruct the damaged areas naturally. Remove the yellowing, fix faded contrast, reduce noise and make it sharp and detailed, like a high quality professional scan of the original print. Keep it black-and-white (or its original colors). VERY IMPORTANT: preserve each person's identity, facial features, expression, age, hairstyle, clothing, insignia, pose and composition exactly — do not beautify, retouch faces, add or remove anything, or change the framing. If the photo is shown on a table or with a border, crop to the photograph itself. Return only the restored photo.`;
let imgModels = null;
async function imageModels(key) {
  if (process.env.GEMINI_IMAGE_MODEL) return [process.env.GEMINI_IMAGE_MODEL];
  if (imgModels) return imgModels;
  const pref = ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'];
  try {
    const j = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10e3) })).json();
    const all = (j.models || []).filter((m) => /image/.test(m.name) && /^models\/gemini/.test(m.name) && m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.slice(7));
    // barqaror (preview bo'lmagan) va yangi versiya oldinda; pro — eng oxirida (qimmat)
    const rank = (n) => (/pro/.test(n) ? 4 : 0) + (/lite/.test(n) ? 2 : 0) + (/preview|exp/.test(n) ? 1 : 0);
    if (all.length) return (imgModels = all.sort((a, b) => rank(a) - rank(b) || b.localeCompare(a, 'en', { numeric: true })));
  } catch { /* standart ro'yxat */ }
  return pref;
}
async function geminiRestore(buf, mime) {
  const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_PAID].filter(Boolean);
  let last = 'AI xizmati javob bermadi';
  for (const key of keys) {
    for (const model of await imageModels(key)) {
      let r, j;
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(150e3),
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime || 'image/jpeg', data: buf.toString('base64') } }, { text: PROMPT }] }],
            generationConfig: { responseModalities: ['IMAGE'] } }) });
        j = await r.json().catch(() => ({}));
      } catch (e) { last = e.message; continue; }
      const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
      const d = part?.inlineData || part?.inline_data;
      if (r.ok && d?.data) return { buf: Buffer.from(d.data, 'base64'), mime: d.mimeType || d.mime_type || 'image/png' };
      last = `Gemini ${model} ${r.status}: ${j.error?.message || j.candidates?.[0]?.finishReason || 'rasm qaytmadi'}`;
      console.error('restore', last.slice(0, 300));
      if (r.status === 404) continue;
      if (r.status === 429 || r.status === 403 || r.status === 400) break; // bu kalit bilan bo'lmaydi — keyingi kalit
    }
  }
  throw new HttpError(502, /429|quota/i.test(last) ? 'AI limiti tugadi (Gemini kalitida rasm uchun to‘lov yoqilmagan bo‘lishi mumkin)' : `Rasmni tiklab bo‘lmadi: ${last.slice(0, 160)}`);
}
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
export async function enhanceImage(buf, mime, mode, opt = {}) {
  if (mode === 'restore') {
    if (cfOn() && opt.small) {
      try { return await cfRestore(opt.small, opt.w, opt.h); } catch (e) { if (!geminiOn()) throw e; }
    }
    if (!geminiOn()) throw new HttpError(400, 'Rasmni yuboring');
    return geminiRestore(buf, mime);
  }
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
