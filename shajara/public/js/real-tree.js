// "Haqiqiy daraxt" ko'rinishi: ildiz va tana pastda (bosh ajdod), shoxlar yuqoriga —
// har bir shox yo'g'onligi undan tarqalgan avlodlar soniga mos.
import { TreeView, esc } from './tree-view.js?v=5';
import { yearsLabel, age } from './family.js';
import { defaultAvatar } from './avatars.js';

const NW = 96;     // bargcha (tugun) eni
const SPW = 74;    // juft uchun qo'shimcha eni
const GAP = 18;
const ROW = 190;   // avlodlar orasidagi balandlik
const PAD = 110;
const W = 124, H = 132; // asosiy ko'rinishdagi tugun o'lchami (focus() hisobi uchun)

export class RealTreeView extends TreeView {
  render() {
    if (!this.fam) return;
    const fam = this.fam;
    const roots = this.buildUnits();
    const unitW = (u) => NW + u.spouses.length * SPW;
    let maxDepth = 0;
    const measure = (u) => {
      maxDepth = Math.max(maxDepth, u.depth);
      const cw = u.children.reduce((s, c) => s + measure(c), 0) + GAP * Math.max(0, u.children.length - 1);
      return (u.w = Math.max(unitW(u), cw));
    };
    roots.forEach(measure);
    const baseY = PAD + maxDepth * ROW + 40;
    const place = (u, x) => {
      u.cy = baseY - u.depth * ROW;
      if (u.children.length) {
        const cw = u.children.reduce((s, c) => s + c.w, 0) + GAP * (u.children.length - 1);
        let cx = x + (u.w - cw) / 2;
        for (const c of u.children) { place(c, cx); cx += c.w + GAP; }
        u.cx = (u.children[0].cx + u.children[u.children.length - 1].cx) / 2;
      } else u.cx = x + u.w / 2;
    };
    let x = PAD;
    for (const r of roots) { place(r, x); x += r.w + GAP * 4; }
    const width = x + PAD;
    const height = baseY + 150;

    const thick = (u) => Math.min(34, 5 + 3.2 * Math.sqrt(fam.descendantsCount(u.head.id) + 1));
    const paths = [];
    const nodes = [];
    const pos = new Map();
    const walk = (u) => {
      const t = thick(u);
      for (const c of u.children) {
        const ct = thick(c);
        const y0 = u.cy - 30, y1 = c.cy + 34;
        const my = (y0 + y1) / 2;
        // shox: pastdan yuqoriga egilgan, uchiga qarab ingichkalashadi
        paths.push(`<path d="M${u.cx} ${y0} C${u.cx} ${my}, ${c.cx} ${my + 20}, ${c.cx} ${y1}" stroke-width="${Math.max(ct, t * 0.55)}" class="br"/>`);
        walk(c);
      }
      if (!u.children.length) {
        // farzandsiz uchlarda barg shodasi
        for (let i = 0; i < 5; i++) {
          const a = (-150 + i * 30) * Math.PI / 180;
          paths.push(`<ellipse cx="${u.cx + Math.cos(a) * 52}" cy="${u.cy - 6 + Math.sin(a) * 44}" rx="15" ry="8" transform="rotate(${-150 + i * 30 + 90} ${u.cx + Math.cos(a) * 52} ${u.cy - 6 + Math.sin(a) * 44})" class="lf"/>`);
        }
      }
      const start = u.cx - unitW(u) / 2;
      nodes.push({ p: u.head, x: start, y: u.cy - 40, sp: false, u });
      u.spouses.forEach((p, i) => nodes.push({ p, x: start + NW + i * SPW, y: u.cy - 26, sp: true, u }));
    };
    for (const r of roots) {
      const t = thick(r) * 1.5;
      // tana va ildizlar
      paths.push(`<path d="M${r.cx - t / 2} ${baseY + 70} C${r.cx - t / 2} ${baseY + 20}, ${r.cx - t / 3} ${r.cy + 10}, ${r.cx} ${r.cy - 20} C${r.cx + t / 3} ${r.cy + 10}, ${r.cx + t / 2} ${baseY + 20}, ${r.cx + t / 2} ${baseY + 70} Z" class="trunk"/>`);
      for (const k of [-1, -0.45, 0.45, 1]) paths.push(`<path d="M${r.cx + k * t * 0.3} ${baseY + 64} q${k * 40} 30 ${k * 90} 40" stroke-width="${t * 0.22}" class="root"/>`);
      walk(r);
    }

    const html = [`<svg class="rt-svg" width="${width}" height="${height}"><rect x="0" y="${baseY + 66}" width="${width}" height="90" class="ground"/>${paths.join('')}</svg>`];
    for (const n of nodes) {
      const p = n.p;
      const u = n.u;
      const closed = u.kidCount && this.collapsed.has(u.head.id);
      const state = u.kidCount ? (closed ? 'closed' : 'open') : 'leaf';
      const photo = this.opts.photoUrl(p);
      const nm = this.opts.name ? this.opts.name(p.name) : p.name;
      pos.set(p.id, { x: n.x + (n.sp ? SPW : NW) / 2 - W / 2, y: n.y + 40 - H / 2 });
      const cnt = !n.sp && u.kidCount
        ? `<button class="cnt ${closed ? 'closed' : ''}" data-toggle="${p.id}">${closed ? '▴ ' + fam.descendantsCount(p.id) : '▾'}</button>` : '';
      html.push(`<div class="node rt ${p.gender} ${p.deceased ? 'dec' : ''} ${n.sp ? 'sp' : ''} ${state}" data-id="${p.id}" data-unit="${u.head.id}" style="left:${n.x}px;top:${n.y}px">
        <div class="avatar ${p.gender} ${p.deceased ? 'dec' : ''}">${photo ? `<img src="${photo}" alt="" loading="lazy">` : defaultAvatar(p, age(p))}</div>
        <div class="nm">${esc(nm)}</div><div class="yr">${esc(yearsLabel(p))}</div>${cnt}</div>`);
    }
    this.size = { w: width, h: height };
    this.pos = pos;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.canvas.innerHTML = html.join('');
    this.genLabels = [];
    this.apply();
  }

  expand(id) {
    this.toggle(id);
    const at = this.pos.get(id);
    if (!at) return;
    const r = this.wrap.getBoundingClientRect();
    const k = Math.max(this.view.k, 0.62);
    this.animate(() => {
      this.view = { k, x: r.width / 2 - (at.x + W / 2) * k, y: r.height * 0.72 - (at.y + H / 2) * k };
      this.apply();
    });
  }

  showRoot() {
    const lin = this.fam.get(this.rootId);
    const top = lin ? this.fam.lineage(lin)[0] : this.fam.persons[0];
    if (!top) return;
    const at = this.pos.get(top.id);
    const r = this.wrap.getBoundingClientRect();
    if (!at) return;
    const k = 0.8;
    this.animate(() => {
      this.view = { k, x: r.width / 2 - (at.x + W / 2) * k, y: r.height * 0.62 - (at.y + H / 2) * k };
      this.apply();
    });
  }
}
