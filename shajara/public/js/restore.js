// 🩹 Eski rasm shikastlarini tuzatish — butunlay telefonda (bepul, cheklovsiz).
// detectDefects: oq dog'lar/ko'chgan emulsiya (atrofidan keskin och, ixcham joylar) — «oq top-hat» usuli.
// inpaint: belgilangan joylar atrofdagi piksellardan to'ldiriladi (push-pull piramida) + plyonka donadorligi.
// levels: sarg'ayish/xiralikni ketkazish (har kanal darajalarini cho'zish).

const luma = (p, n) => { const L = new Uint8Array(n); for (let i = 0, j = 0; j < n; i += 4, j++) L[j] = (p[i] * 77 + p[i + 1] * 150 + p[i + 2] * 29) >> 8; return L; };

// ajraladigan min/max filtr (kvadrat oyna 2r+1)
function morph(src, w, h, r, isMax) {
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  const pick = isMax ? Math.max : Math.min;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      let v = src[o + x];
      for (let k = Math.max(0, x - r), e = Math.min(w - 1, x + r); k <= e; k++) v = pick(v, src[o + k]);
      tmp[o + x] = v;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = tmp[y * w + x];
      for (let k = Math.max(0, y - r), e = Math.min(h - 1, y + r); k <= e; k++) v = pick(v, tmp[k * w + x]);
      out[y * w + x] = v;
    }
  }
  return out;
}

// Huang usuli: siljuvchi gistogramma bilan median (kvadrat oyna 2r+1)
function median(src, w, h, r) {
  const out = new Uint8Array(w * h), hst = new Uint16Array(256);
  for (let y = 0; y < h; y++) {
    hst.fill(0);
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
    let cnt = 0;
    for (let yy = y0; yy <= y1; yy++) for (let xx = 0; xx <= Math.min(w - 1, r); xx++) { hst[src[yy * w + xx]]++; cnt++; }
    for (let x = 0; x < w; x++) {
      if (x > 0) {
        const xa = x + r, xr = x - r - 1;
        for (let yy = y0; yy <= y1; yy++) {
          if (xa < w) { hst[src[yy * w + xa]]++; cnt++; }
          if (xr >= 0) { hst[src[yy * w + xr]]--; cnt--; }
        }
      }
      let s = 0, v = 0;
      for (; v < 255; v++) { s += hst[v]; if (s * 2 >= cnt) break; }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** Shikast niqobi (1 — tuzatiladi): atrofidagi medianadan keskin och, ixcham joylar.
 *  Uzun chiziqlar (yoqa, chet) va juda mayda nuqtalar (ko'z yaltirog'i) tegilmaydi. */
export function detectDefects(px, w, h) {
  const n = w * h, L = luma(px, n);
  // median yarim o'lchamda (tezlik), so'ng kattalashtiriladi
  const sw = Math.max(1, w >> 1), sh = Math.max(1, h >> 1), S = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const i = y * 2 * w + x * 2;
    S[y * sw + x] = (L[i] + L[Math.min(n - 1, i + 1)] + L[Math.min(n - 1, i + w)] + L[Math.min(n - 1, i + w + 1)]) >> 2;
  }
  const M = median(S, sw, sh, Math.max(4, Math.round(Math.max(sw, sh) / 55)));
  const cand = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, m = M[Math.min(sh - 1, y >> 1) * sw + Math.min(sw - 1, x >> 1)];
    cand[i] = L[i] - m > 32 && L[i] > 110 ? 1 : 0;
  }
  const mask = new Uint8Array(n), seen = new Uint8Array(n), q = new Int32Array(n);
  const aMin = Math.max(6, (Math.max(w, h) / 220) ** 2);
  for (let s = 0; s < n; s++) {
    if (!cand[s] || seen[s]) continue;
    let qh = 0, qt = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    q[qt++] = s; seen[s] = 1;
    while (qh < qt) {
      const i = q[qh++], x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (j < 0 || j >= n || seen[j] || !cand[j] || (j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue;
        seen[j] = 1; q[qt++] = j;
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, area = qt;
    const elong = Math.max(bw, bh) / Math.min(bw, bh);
    // chiziqsimon (ingichka va uzun) — kiyim chetlari bo'lishi mumkin, tegilmaydi
    if (area < aMin || elong > 5 || area / (bw * bh) < 0.2) continue;
    for (let k = 0; k < qt; k++) mask[q[k]] = 1;
  }
  return dilate(mask, w, h, Math.max(2, Math.round(Math.max(w, h) / 350)));
}

export function dilate(mask, w, h, r) { return morph(mask, w, h, r, true); }

/** Niqobdagi piksellarni atrofdan to'ldirish (px — RGBA, joyida o'zgaradi). */
export function inpaint(px, w, h, mask) {
  const levels = [];
  let lw = w, lh = h;
  let V = new Float32Array(w * h * 3), W = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const k = mask[i] ? 0 : 1;
    W[i] = k; V[i * 3] = px[i * 4] * k; V[i * 3 + 1] = px[i * 4 + 1] * k; V[i * 3 + 2] = px[i * 4 + 2] * k;
  }
  levels.push({ V, W, w: lw, h: lh });
  // push: yarim o'lchamga, og'irlikli o'rtacha (rang qiymatlari og'irlikka ko'paytirilgan holda saqlanadi)
  while (lw > 1 || lh > 1) {
    const nw = Math.max(1, (lw + 1) >> 1), nh = Math.max(1, (lh + 1) >> 1);
    const nV = new Float32Array(nw * nh * 3), nW = new Float32Array(nw * nh);
    let holes = 0;
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let s0 = 0, s1 = 0, s2 = 0, sw = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const X = Math.min(lw - 1, x * 2 + dx), Y = Math.min(lh - 1, y * 2 + dy), j = Y * lw + X;
        s0 += V[j * 3]; s1 += V[j * 3 + 1]; s2 += V[j * 3 + 2]; sw += W[j];
      }
      const o = y * nw + x, ww = Math.min(1, sw);
      if (sw > 0) { nV[o * 3] = (s0 / sw) * ww; nV[o * 3 + 1] = (s1 / sw) * ww; nV[o * 3 + 2] = (s2 / sw) * ww; } else holes++;
      nW[o] = ww;
    }
    V = nV; W = nW; lw = nw; lh = nh;
    levels.push({ V, W, w: lw, h: lh });
    if (!holes) break;
  }
  // pull: yuqoridan pastga — bo'sh joylar kattaroq darajadan (bilinear) to'ldiriladi
  for (let l = levels.length - 2; l >= 0; l--) {
    const A = levels[l], B = levels[l + 1];
    for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
      const o = y * A.w + x, a = A.W[o];
      if (a >= 1) { continue; }
      const fx = Math.min(B.w - 1, Math.max(0, (x - 0.5) / 2)), fy = Math.min(B.h - 1, Math.max(0, (y - 0.5) / 2));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(B.w - 1, x0 + 1), y1 = Math.min(B.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      for (let c = 0; c < 3; c++) {
        const g = (X, Y) => { const j = Y * B.w + X; return B.W[j] > 0 ? B.V[j * 3 + c] / B.W[j] : 0; };
        const up = (g(x0, y0) * (1 - tx) + g(x1, y0) * tx) * (1 - ty) + (g(x0, y1) * (1 - tx) + g(x1, y1) * tx) * ty;
        A.V[o * 3 + c] = A.V[o * 3 + c] + (1 - a) * up; // V allaqachon a ga ko'paytirilgan
      }
      A.W[o] = 1;
    }
  }
  // donadorlik: asl rasmning mayda shovqini (niqobdan tashqarida) taxminiy kattaligi
  const L = luma(px, w * h);
  let sum = 0, cnt = 0;
  for (let i = w + 1; i < w * h - w - 1; i += 7) {
    if (mask[i] || mask[i - 1] || mask[i + 1] || mask[i - w] || mask[i + w]) continue;
    sum += Math.abs(L[i] - (L[i - 1] + L[i + 1] + L[i - w] + L[i + w]) / 4); cnt++;
  }
  const sigma = Math.min(8, cnt ? (sum / cnt) * 0.9 : 2);
  const V0 = levels[0].V;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const g = (Math.random() + Math.random() + Math.random() - 1.5) * 2 * sigma;
    px[i * 4] = V0[i * 3] + g; px[i * 4 + 1] = V0[i * 3 + 1] + g; px[i * 4 + 2] = V0[i * 3 + 2] + g;
  }
}

/** Sarg'ayish/xiralik: har kanal 0.5%–99.5% oralig'ini cho'zish (haddan oshmasdan). */
export function levels(p) {
  const lo = [], hi = [];
  for (let ch = 0; ch < 3; ch++) {
    const hst = new Uint32Array(256);
    for (let i = ch; i < p.length; i += 16) hst[p[i]]++;
    const n = p.length / 16;
    let s = 0, a = 0, b = 255;
    for (let v = 0; v < 256; v++) { s += hst[v]; if (s > n * 0.005) { a = v; break; } }
    s = 0;
    for (let v = 255; v >= 0; v--) { s += hst[v]; if (s > n * 0.005) { b = v; break; } }
    if (b - a < 100) { const m = (a + b) / 2; a = Math.max(0, m - 50); b = Math.min(255, m + 50); }
    lo[ch] = a; hi[ch] = b;
  }
  const lut = [0, 1, 2].map((ch) => Uint8ClampedArray.from({ length: 256 }, (_, v) => ((v - lo[ch]) * 255) / (hi[ch] - lo[ch])));
  for (let i = 0; i < p.length; i += 4) { p[i] = lut[0][p[i]]; p[i + 1] = lut[1][p[i + 1]]; p[i + 2] = lut[2][p[i + 2]]; }
}

/** Keskinlik (unsharp mask) — canvas ustida. */
export function sharpen(c, amount = 0.5) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!('filter' in ctx)) return;
  const b = document.createElement('canvas');
  b.width = c.width; b.height = c.height;
  const bx = b.getContext('2d', { willReadFrequently: true });
  bx.filter = `blur(${Math.max(1, Math.round(c.width / 1500))}px)`;
  bx.drawImage(c, 0, 0);
  const bd = bx.getImageData(0, 0, c.width, c.height).data;
  const o = ctx.getImageData(0, 0, c.width, c.height), q = o.data;
  for (let i = 0; i < q.length; i += 4) for (let j = 0; j < 3; j++) q[i + j] = q[i + j] + amount * (q[i + j] - bd[i + j]);
  ctx.putImageData(o, 0, 0);
}

/** Mahalliy kontrast («clarity»): katta radiusli unsharp — telefon ekranida ham tiniqlik seziladi.
 *  Xiralashtirish kichraytirib-kattalashtirish bilan (chetlarda qora hoshiya paydo bo'lmaydi). */
export function clarity(c, amount = 0.15) {
  const r = Math.max(4, Math.round(Math.max(c.width, c.height) / 120));
  const s = document.createElement('canvas');
  s.width = Math.max(1, Math.round(c.width / r)); s.height = Math.max(1, Math.round(c.height / r));
  const sx = s.getContext('2d');
  sx.imageSmoothingQuality = 'high';
  sx.drawImage(c, 0, 0, s.width, s.height);
  const b = document.createElement('canvas');
  b.width = c.width; b.height = c.height;
  const bx = b.getContext('2d', { willReadFrequently: true });
  bx.imageSmoothingQuality = 'high';
  bx.drawImage(s, 0, 0, c.width, c.height);
  const bd = bx.getImageData(0, 0, c.width, c.height).data;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const o = ctx.getImageData(0, 0, c.width, c.height), q = o.data;
  for (let i = 0; i < q.length; i += 4) for (let j = 0; j < 3; j++) q[i + j] = q[i + j] + amount * (q[i + j] - bd[i + j]);
  ctx.putImageData(o, 0, 0);
}
