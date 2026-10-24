// Rasm sifatini AI bilan oshirish — ASL HOLICHA. Asl rasm o'zgarmaydi, natija alohida nusxa bo'lib saqlanadi.
// Real-ESRGAN (butun rasm 2×) + CodeFormer (faqat yuzlar, o'xshashlik 0.7): rasm qayta chizilmaydi —
// odamlar, ranglar, joylashuv va o'lchamlar o'z o'rnida qoladi. color — DDColor bilan oq-qora rasmga rang.
// Server: o'zimizning Hugging Face Space'imiz (HF_SPACE, xususiy, CPU — bepul, limitsiz; enhance-server/space/).
// Zaxira: CodeFormer mualliflarining ommaviy Space'i (GPU, tez, lekin kunlik limit kichik; rang bermaydi).
import { HttpError } from './tree.js';

const OWN = () => (process.env.HF_SPACE || '').replace(/\/$/, '');
const PUBLIC_CF = 'https://sczhou-codeformer.hf.space';
const auth = () => (process.env.HF_TOKEN ? { authorization: `Bearer ${process.env.HF_TOKEN}` } : {});
export const colorOn = () => !!OWN();

// Gradio API: fayl yuklash → /call/<api> (event_id) → SSE oqimidan natija
async function upload(host, buf) {
  const fd = new FormData();
  fd.append('files', new Blob([buf], { type: 'image/jpeg' }), 'photo.jpg');
  const r = await fetch(`${host}/gradio_api/upload`, { method: 'POST', headers: auth(), body: fd, signal: AbortSignal.timeout(60e3) });
  const t = await r.text();
  if (!r.ok) throw new Error(`upload ${r.status}: ${t.slice(0, 120)}`);
  return JSON.parse(t)[0];
}
async function call(host, api, data, ms) {
  const r = await fetch(`${host}/gradio_api/call/${api}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...auth() }, body: JSON.stringify({ data }), signal: AbortSignal.timeout(30e3) });
  const t0 = await r.text();
  if (!r.ok) throw new Error(`call ${r.status}: ${t0.slice(0, 120)}`);
  const { event_id: id } = JSON.parse(t0);
  const t = await (await fetch(`${host}/gradio_api/call/${api}/${id}`, { headers: auth(), signal: AbortSignal.timeout(ms) })).text();
  const events = t.split('\n\n').map((b) => ({ e: /event: (\w+)/.exec(b)?.[1], d: /data: ([\s\S]*)/.exec(b)?.[1] }));
  const done = events.find((x) => x.e === 'complete');
  if (done) return JSON.parse(done.d);
  const err = events.find((x) => x.e === 'error')?.d;
  throw new Error(`gradio: ${err && err !== 'null' ? err.slice(0, 200) : 'xato (limit yoki server band)'}`);
}
const fileOf = (x) => {
  if (!x || typeof x !== 'object') return null;
  if (Array.isArray(x)) { for (const y of x) { const f = fileOf(y); if (f) return f; } return null; }
  return x.url || x.path ? x : null;
};
async function run(host, api, buf, data, ms) {
  const res = await call(host, api, data({ path: await upload(host, buf), meta: { _type: 'gradio.FileData' } }), ms);
  const f = fileOf(res);
  if (!f) throw new Error('natija fayli yo‘q');
  const r = await fetch(f.url || `${host}/gradio_api/file=${f.path}`, { headers: auth(), signal: AbortSignal.timeout(60e3) });
  if (!r.ok) throw new Error(`natija ${r.status}`);
  return { buf: Buffer.from(await r.arrayBuffer()), mime: r.headers.get('content-type') || 'image/jpeg', info: Array.isArray(res) ? res[1] : null };
}

/** buf — JPEG (telefonda tayyorlangan: skrinshot chetlari kesilgan, ≤1600 px). Natija: { buf, mime, via }. */
export async function restorePhoto(buf, { color = false, fidelity = 0.7 } = {}) {
  const errs = [];
  if (OWN()) {
    try { return { ...(await run(OWN(), 'enhance', buf, (f) => [f, fidelity, !!color], 200e3)), via: 'own' }; }
    catch (e) { errs.push(`own: ${e.message}`); console.error('enhance own', e.message); }
  }
  if (color) throw new HttpError(503, OWN() ? 'AI server hozir javob bermadi. 1–2 daqiqadan keyin qayta urinib ko‘ring' : 'Rang berish uchun AI server hali sozlanmagan');
  try { return { ...(await run(PUBLIC_CF, 'inference', buf, (f) => [f, true, true, true, 2, fidelity], 75e3)), via: 'public' }; }
  catch (e) { errs.push(`public: ${e.message}`); console.error('enhance public', e.message); }
  throw new HttpError(503, OWN()
    ? 'AI server hozir javob bermadi. 1–2 daqiqadan keyin qayta urinib ko‘ring'
    : 'AI serveri hali sozlanmagan (umumiy bepul serverning kunlik limiti tugagan). Keyinroq urinib ko‘ring');
}

/** Space uyqudan uyg'onishi uchun (bepul Space 48 soat so'rovsiz qolsa uxlaydi) — cron chaqiradi. */
export async function wakeSpace() {
  if (!OWN()) return false;
  const r = await fetch(`${OWN()}/gradio_api/info`, { headers: auth(), signal: AbortSignal.timeout(20e3) }).catch(() => null);
  return !!r?.ok;
}
