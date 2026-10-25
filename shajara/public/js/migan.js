// 🩹 Shikastlarni AI bilan to'ldirish — MI-GAN (Picsart, MIT) butunlay telefonda: onnxruntime-web (WASM), server kerak emas.
// Model 512×512 oynada ishlaydi: har bir shikastlangan joy atrofidan oyna olinadi (asl o'lchamda), faqat bo'yalgan piksellar almashtiriladi —
// rasmning qolgan qismi bir piksel ham o'zgarmaydi. Kirish: [0.5 − mask, rasm·(1 − mask)] (−1…1), mask=1 — to'ldiriladigan joy.
const S = 512;
let sessP = null;
const loadJs = (src) => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('AI model yuklanmadi. Internetni tekshiring')); document.head.append(s); });

function session() {
  return (sessP ||= (async () => {
    if (!window.ort?.InferenceSession) await loadJs('/vendor/ort/ort.wasm.min.js');
    const ort = window.ort;
    ort.env.wasm.wasmPaths = '/vendor/ort/';
    ort.env.wasm.numThreads = 1; // SharedArrayBuffer (ko'p oqim) Telegram ichida yo'q
    return ort.InferenceSession.create('/vendor/migan/migan.onnx', { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  })().catch((e) => { sessP = null; throw e; }));
}
/** Modelni oldindan yuklab qo'yish (foydalanuvchi bo'yayotganda). */
export const preload = () => session().catch(() => null);

/** px — RGBA (W×H, joyida o'zgaradi), mask — Uint8Array (1 = to'ldiriladi). onP(0…1). */
export async function inpaintAI(px, W, H, mask, onP) {
  const sess = await session();
  const ort = window.ort;
  const todo = mask.slice();
  let left = todo.reduce((a, v) => a + v, 0);
  const total = left || 1;
  const src = document.createElement('canvas'); src.width = W; src.height = H;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  const tile = document.createElement('canvas'); tile.width = tile.height = S;
  const tctx = tile.getContext('2d', { willReadFrequently: true });
  for (let guard = 0; left > 0 && guard < 300; guard++) {
    // birinchi qolgan joy va uning qo'shnilari (bog'langan qism) — oyna markazi
    let s = todo.indexOf(1);
    const q = [s]; const seen = new Uint8Array(W * H); seen[s] = 1;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let k = 0; k < q.length && q.length < 400000; k++) {
      const i = q[k], x = i % W, y = (i / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && todo[j] && !seen[j]) { seen[j] = 1; q.push(j); }
    }
    // oyna — asl o'lchamda 512. Katta yaxlit shikast (yirtilgan burchak) — kattaroq oyna kichraytirib beriladi;
    // uzun ingichka tirnalish — bir necha 512 oynada, asl aniqlikda (birinchi qolgan nuqta markazda)
    const bw = x1 - x0, bh = y1 - y0, big = Math.max(bw, bh) > S - 64;
    const fat = big && q.length > 0.15 * (bw + 1) * (bh + 1);
    const side = fat ? Math.ceil(Math.max(bw, bh) * 1.3) : S;
    const ww = Math.min(side, W), wh = Math.min(side, H);
    const cx = big && !fat ? s % W : (x0 + x1) / 2, cy = big && !fat ? (s / W) | 0 : (y0 + y1) / 2;
    const wx = Math.max(0, Math.min(W - ww, Math.round(cx - ww / 2)));
    const wy = Math.max(0, Math.min(H - wh, Math.round(cy - wh / 2)));
    const whole = !big || fat; // butun qism shu oynaga sig'di
    sctx.putImageData(new ImageData(px, W, H), 0, 0);
    tctx.drawImage(src, wx, wy, ww, wh, 0, 0, S, S);
    const ip = tctx.getImageData(0, 0, S, S).data;
    const x = new Float32Array(4 * S * S), N = S * S;
    for (let ty = 0; ty < S; ty++) for (let tx = 0; tx < S; tx++) {
      const t = ty * S + tx;
      const m = mask[(wy + Math.min(wh - 1, (ty * wh / S) | 0)) * W + wx + Math.min(ww - 1, (tx * ww / S) | 0)] ? 1 : 0;
      x[t] = 0.5 - m;
      for (let c = 0; c < 3; c++) x[(c + 1) * N + t] = m ? 0 : ip[t * 4 + c] / 127.5 - 1;
    }
    const out = (await sess.run({ x: new ort.Tensor('float32', x, [1, 4, S, S]) })).y.data;
    for (let t = 0; t < N; t++) for (let c = 0; c < 3; c++) ip[t * 4 + c] = out[c * N + t] * 127.5 + 127.5;
    tctx.putImageData(new ImageData(ip, S, S), 0, 0);
    const back = document.createElement('canvas'); back.width = ww; back.height = wh;
    const bctx = back.getContext('2d', { willReadFrequently: true });
    bctx.drawImage(tile, 0, 0, S, S, 0, 0, ww, wh);
    const bp = bctx.getImageData(0, 0, ww, wh).data;
    // oyna chetiga yaqin joylar (kontekst bir tomonda yo'q) — keyingi oynada qayta ishlanadi
    const mg = 24;
    for (let y = 0; y < wh; y++) for (let xx = 0; xx < ww; xx++) {
      const i = (wy + y) * W + wx + xx;
      if (!mask[i]) continue;
      const b = (y * ww + xx) * 4;
      px[i * 4] = bp[b]; px[i * 4 + 1] = bp[b + 1]; px[i * 4 + 2] = bp[b + 2];
      const inner = (xx >= mg || wx === 0) && (xx < ww - mg || wx + ww === W) && (y >= mg || wy === 0) && (y < wh - mg || wy + wh === H);
      if (todo[i] && (inner || (whole && seen[i]))) { todo[i] = 0; left--; }
    }
    onP?.(1 - left / total);
  }
}
