// Jonli shajara daraxti: joylashtirish (layout), chizish, surish va kattalashtirish.
import { yearsLabel, age } from './family.js';
import { defaultAvatar } from './avatars.js';

const W = 124;        // tugun eni
const H = 132;        // tugun bo'yi
const SP = 14;        // er-xotin orasidagi bo'shliq
const GAP = 22;       // qo'shni oilalar orasidagi bo'shliq
const ROW = H + 96;   // avlodlar orasidagi masofa
const PAD = 120;
const STACK_INDENT = 36; // bir ustunli to'plamda chap tomondagi tanacha uchun joy
const STACK_GAP = 36;    // ikki ustun orasidagi tanacha
const STACK_VGAP = 18;

export class TreeView {
  /**
   * @param {HTMLElement} host
   * @param {{ onOpen:(id:string)=>void, photoUrl:(p:any)=>string|null }} opts
   */
  constructor(host, opts) {
    this.host = host;
    this.opts = opts;
    this.collapsed = new Set();
    this.view = { x: 0, y: 0, k: 0.8 };
    this.pointers = new Map();
    host.innerHTML = '<div class="tree-wrap"><div class="tree-canvas"></div></div>';
    this.wrap = host.firstChild;
    this.canvas = this.wrap.firstChild;
    this.bindGestures();
  }

  setData(fam, rootId) {
    this.fam = fam;
    this.rootId = rootId;
    // Birinchi ochilishda faqat bosh ajdodlar ko'rinadi — farzandlar bosilganda ochiladi
    if (!this.inited) { this.inited = true; this.collapseAll(true); }
    this.render();
  }

  // ------------------------------------------------------------ Layout --
  buildUnits() {
    const fam = this.fam;
    const placed = new Set();
    const persons = fam.persons;
    const hasParents = (p) => (p.father_id && fam.get(p.father_id)) || (p.mother_id && fam.get(p.mother_id));

    const makeUnit = (head, depth) => {
      placed.add(head.id);
      const spouses = fam.spouses(head).filter((s) => !placed.has(s.id) && !hasParents(s));
      spouses.forEach((s) => placed.add(s.id));
      const unit = { head, spouses, depth, children: [] };
      const members = [head, ...spouses];
      const kids = [];
      for (const m of members) {
        for (const c of fam.children(m.id)) if (!kids.includes(c)) kids.push(c);
      }
      // Avval onasi bo'yicha (1-xotin, 2-xotin...), so'ng tartib raqami bo'yicha
      const spouseIdx = (c) => {
        const other = c.father_id === head.id ? c.mother_id : c.father_id;
        const i = spouses.findIndex((s) => s.id === other);
        return i < 0 ? 99 : i;
      };
      kids.sort((a, b) => spouseIdx(a) - spouseIdx(b) || (a.child_order ?? 99) - (b.child_order ?? 99));
      unit.kidCount = kids.length;
      if (!this.collapsed.has(head.id)) {
        for (const c of kids) {
          if (placed.has(c.id)) continue;
          unit.children.push(makeUnit(c, depth + 1));
        }
      } else {
        // yig'ilgan shoxdagi avlodlarni ham "joylangan" deb belgilash
        const mark = (id) => fam.children(id).forEach((c) => { if (!placed.has(c.id)) { placed.add(c.id); fam.spouses(c).forEach((s) => placed.add(s.id)); mark(c.id); } });
        for (const m of members) mark(m.id);
      }
      return unit;
    };

    // Ildizlar: ota-onasi yo'q, va ota-onasi bor odamning turmush o'rtog'i emas
    const isRootCand = (p) => !hasParents(p) && !fam.spouses(p).some((s) => hasParents(s));
    const root = fam.get(this.rootId);
    const order = [];
    if (root) {
      // root'ning ajdodlari qo'shilgan bo'lsa, eng yuqorisidan boshlaymiz
      order.push(fam.lineage(root)[0]);
    }
    const cands = persons.filter(isRootCand).sort((a, b) => (b.blood - a.blood) || (a.gender === 'm' ? -1 : 1));
    for (const c of cands) if (!order.includes(c)) order.push(c);

    const roots = [];
    for (const r of order) {
      if (placed.has(r.id)) continue;
      roots.push(makeUnit(r, (r.generation ?? fam.minGen) - fam.minGen));
    }
    for (const p of persons) {
      if (!placed.has(p.id)) roots.push(makeUnit(p, (p.generation ?? fam.minGen) - fam.minGen));
    }
    return roots;
  }

  layout(roots) {
    const unitW = (u) => (1 + u.spouses.length) * W + u.spouses.length * SP;
    const measure = (u) => {
      const own = unitW(u);
      if (!u.children.length) return (u.w = own);
      const cw = u.children.reduce((s, c) => s + measure(c), 0) + GAP * (u.children.length - 1);
      // Oxirgi bo'g'indagi (farzandsiz, juftsiz) bolalarni ustun qilib terib, kenglikni tejaymiz
      u.stack = u.children.length >= 3 && u.children.every((c) => !c.children.length && !c.spouses.length && !c.kidCount);
      if (u.stack) {
        u.cols = u.children.length > 4 ? 2 : 1;
        u.rows = Math.ceil(u.children.length / u.cols);
        u.cw = u.cols === 1 ? W + STACK_INDENT : u.cols * W + STACK_GAP;
      } else u.cw = cw;
      return (u.w = Math.max(own, u.cw));
    };
    const place = (u, x, y) => {
      const own = unitW(u);
      u.y = y ?? PAD + u.depth * ROW;
      if (u.stack) {
        u.x = x + (u.w - own) / 2;
        const center = u.x + own / 2;
        const bx = u.cols === 1 ? center - W / 2 + STACK_INDENT / 2 : center - (u.cw / 2);
        u.trunkX = u.cols === 1 ? bx - STACK_INDENT / 2 : bx + W + STACK_GAP / 2;
        u.children.forEach((c, i) => {
          const col = Math.floor(i / u.rows);
          const row = i % u.rows;
          place(c, bx + col * (W + STACK_GAP), u.y + ROW + row * (H + STACK_VGAP));
          c.x = bx + col * (W + STACK_GAP);
          c.col = col;
        });
      } else if (u.children.length) {
        let cx = x + (u.w - u.cw) / 2;
        for (const c of u.children) {
          place(c, cx);
          cx += c.w + GAP;
        }
        // oila boshini farzandlari markaziga joylash
        const first = u.children[0];
        const last = u.children[u.children.length - 1];
        const mid = (first.x + W / 2 + last.x + W / 2) / 2;
        u.x = Math.max(x, Math.min(mid - own / 2, x + u.w - own));
      } else {
        u.x = x + (u.w - own) / 2;
      }
    };
    let x = PAD;
    for (const r of roots) {
      measure(r);
      place(r, x);
      x += r.w + GAP * 3;
    }
    return x + PAD;
  }

  // ------------------------------------------------------------ Render --
  render() {
    if (!this.fam) return;
    const roots = this.buildUnits();
    const width = this.layout(roots);
    const nodes = [];
    const links = [];
    const pos = new Map();
    let maxDepth = 0;
    let maxY = 0;

    const walk = (u, parentAnchor) => {
      maxDepth = Math.max(maxDepth, u.depth);
      maxY = Math.max(maxY, u.y + H);
      const members = [u.head, ...u.spouses];
      members.forEach((p, i) => {
        const x = u.x + i * (W + SP);
        pos.set(p.id, { x, y: u.y });
        nodes.push({ p, x, y: u.y, head: i === 0, unit: u });
      });
      u.spouses.forEach((s, i) => {
        const x1 = u.x + W;
        const x2 = u.x + (i + 1) * (W + SP);
        const y = u.y + H / 2 + i * 6;
        links.push({ d: `M${x1} ${y} H${x2}`, cls: 'spouse' });
      });
      if (u.stack) {
        const first = u.children[0].head;
        const other = first.father_id === u.head.id ? first.mother_id : first.father_id;
        const si = u.spouses.findIndex((s) => s.id === other);
        const sx = si < 0 ? u.x + W / 2 : (u.x + W / 2 + u.x + (si + 1) * (W + SP) + W / 2) / 2;
        const sy = si < 0 ? u.y + H : u.y + H / 2 + si * 6;
        const my = u.y + H + (ROW - H) / 2;
        const lastY = u.y + ROW + (u.rows - 1) * (H + STACK_VGAP) + H / 2;
        links.push({ d: `M${sx} ${sy} V${my} H${u.trunkX} V${lastY}`, cls: '' });
        for (const c of u.children) {
          const cy = c.y + H / 2;
          const edge = c.x > u.trunkX ? c.x : c.x + W;
          links.push({ d: `M${u.trunkX} ${cy} H${edge}`, cls: '', child: c.head.id });
          walk(c);
        }
        return;
      }
      for (const c of u.children) {
        const child = c.head;
        const other = child.father_id === u.head.id ? child.mother_id : child.father_id;
        const si = u.spouses.findIndex((s) => s.id === other);
        const sx = si < 0 ? u.x + W / 2 : (u.x + W / 2 + u.x + (si + 1) * (W + SP) + W / 2) / 2;
        const sy = si < 0 ? u.y + H : u.y + H / 2 + si * 6;
        const tx = c.x + W / 2;
        const ty = c.y;
        const my = u.y + H + (ROW - H) / 2 + (si > 0 ? si * 8 : 0);
        links.push({ d: `M${sx} ${sy} V${my} H${tx} V${ty}`, cls: '', child: child.id });
        walk(c);
      }
    };
    roots.forEach((r) => walk(r));

    const height = maxY + PAD;
    this.size = { w: width, h: height };
    this.pos = pos;

    const fam = this.fam;
    const html = [];
    // avlod chiziqlari va yorliqlari
    for (let d = 0; d <= maxDepth; d++) {
      const y = PAD + d * ROW - 34;
      html.push(`<div class="gen-band" style="top:${y + 20}px;width:${width}px"></div>`);
      html.push(`<div class="gen-label" data-gen style="top:${y + 8}px;left:16px">${this.opts.genLabel ? this.opts.genLabel(d + 1) : d + 1}</div>`);
    }
    html.push(`<svg class="links" width="${width}" height="${height}">${links
      .map((l) => `<path d="${l.d}" class="${l.cls}"${l.child ? ` data-child="${l.child}"` : ''}/>`)
      .join('')}</svg>`);
    for (const n of nodes) {
      const p = n.p;
      const photo = this.opts.photoUrl(p);
      const u = n.unit;
      const closed = u.kidCount && this.collapsed.has(u.head.id);
      const state = u.kidCount ? (closed ? 'closed' : 'open') : 'leaf';
      const cls = ['node', p.gender, p.blood ? '' : 'inlaw', p.deceased ? 'dec' : '', state].join(' ');
      const cnt = n.head && u.kidCount
        ? `<button class="cnt ${closed ? 'closed' : ''}" data-toggle="${p.id}" aria-label="Shox">${closed ? '▾ ' + fam.descendantsCount(p.id) : '▴'}</button>`
        : '';
      const nm = this.opts.name ? this.opts.name(p.name) : p.name;
      html.push(`<div class="${cls}" data-id="${p.id}" data-unit="${u.head.id}" style="left:${n.x}px;top:${n.y}px">
        <div class="avatar ${p.gender} ${p.deceased ? 'dec' : ''}">${photo ? `<img src="${photo}" alt="" loading="lazy" decoding="async">` : defaultAvatar(p, age(p))}</div>
        <div class="nm">${esc(nm)}</div><div class="yr">${esc(yearsLabel(p)) || '&nbsp;'}</div>${cnt}</div>`);
    }
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.canvas.innerHTML = html.join('');
    this.genLabels = [...this.canvas.querySelectorAll('[data-gen]')];
    this.apply();
  }

  // ------------------------------------------------------- Navigatsiya --
  apply() {
    const { x, y, k } = this.view;
    this.canvas.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${k})`;
    // avlod yorliqlari doim ekranning chap chetida tursin
    const left = (-x + 12) / k;
    for (const el of this.genLabels || []) el.style.left = Math.max(8, left) + 'px';
  }

  clampK(k) { return Math.min(2.2, Math.max(0.03, k)); }

  zoomAt(factor, cx, cy) {
    const k = this.clampK(this.view.k * factor);
    const f = k / this.view.k;
    this.view.x = cx - (cx - this.view.x) * f;
    this.view.y = cy - (cy - this.view.y) * f;
    this.view.k = k;
    this.apply();
  }

  zoom(factor) {
    const r = this.wrap.getBoundingClientRect();
    this.animate(() => this.zoomAt(factor, r.width / 2, r.height / 2));
  }

  animate(fn) {
    this.canvas.style.transition = 'transform .35s cubic-bezier(.2,.8,.2,1)';
    fn();
    clearTimeout(this._t);
    this._t = setTimeout(() => (this.canvas.style.transition = ''), 380);
  }

  fit() {
    const r = this.wrap.getBoundingClientRect();
    if (!this.size || !r.width) return;
    const k = this.clampK(Math.min(r.width / this.size.w, (r.height - 40) / this.size.h));
    this.animate(() => {
      this.view = { k, x: (r.width - this.size.w * k) / 2, y: (r.height - this.size.h * k) / 2 };
      this.apply();
    });
  }

  focus(id, { k, pulse = true } = {}) {
    // yig'ilgan ajdodlar bo'lsa — ochamiz
    const p = this.fam.get(id);
    if (!p) return;
    let changed = false;
    for (const a of this.fam.lineage(p)) {
      for (const s of [a, ...this.fam.spouses(a)]) if (s.id !== id && this.collapsed.delete(s.id)) changed = true;
    }
    if (changed) this.render();
    const at = this.pos.get(id);
    if (!at) return;
    const r = this.wrap.getBoundingClientRect();
    const kk = k ?? Math.max(this.view.k, 0.85);
    this.animate(() => {
      this.view = { k: kk, x: r.width / 2 - (at.x + W / 2) * kk, y: r.height * 0.42 - (at.y + H / 2) * kk };
      this.apply();
    });
    this.highlight(id, pulse);
  }

  highlight(id, pulse) {
    this.canvas.querySelectorAll('.node.focus').forEach((n) => n.classList.remove('focus', 'pulse'));
    this.canvas.querySelectorAll('path.hl').forEach((n) => n.classList.remove('hl'));
    const el = this.canvas.querySelector(`.node[data-id="${id}"]`);
    if (!el) return;
    el.classList.add('focus');
    if (pulse) el.classList.add('pulse');
    const p = this.fam.get(id);
    for (const a of this.fam.lineage(p)) {
      this.canvas.querySelector(`path[data-child="${a.id}"]`)?.classList.add('hl');
    }
  }

  showRoot() {
    const lin = this.fam.get(this.rootId);
    const top = lin ? this.fam.lineage(lin)[0] : this.fam.persons[0];
    if (top) this.focus(top.id, { k: 0.8, pulse: false });
  }

  toggle(id) {
    if (this.collapsed.has(id)) this.collapsed.delete(id);
    else this.collapsed.add(id);
    const before = this.pos.get(id);
    this.render();
    const after = this.pos.get(id);
    if (before && after) {
      // bosilgan tugun ekranda joyidan qochmasin
      this.view.x += (before.x - after.x) * this.view.k;
      this.view.y += (before.y - after.y) * this.view.k;
      this.apply();
    }
  }

  collapseAll(silent) {
    this.collapsed.clear();
    for (const p of this.fam.persons) if (this.fam.children(p.id).length) this.collapsed.add(p.id);
    if (!silent) this.render();
  }

  expandAll() {
    this.collapsed.clear();
    this.render();
  }

  /** Shoxni ochib, farzandlar ko'rinadigan qilib suradi. */
  expand(id) {
    this.toggle(id);
    const at = this.pos.get(id);
    if (!at) return;
    const r = this.wrap.getBoundingClientRect();
    const k = Math.max(this.view.k, 0.62);
    this.animate(() => {
      this.view = { k, x: r.width / 2 - (at.x + W / 2) * k, y: r.height * 0.3 - (at.y + H / 2) * k };
      this.apply();
    });
  }

  collapseFrom(depthLimit) {
    this.collapsed.clear();
    for (const p of this.fam.persons) {
      if (this.fam.gen(p) >= depthLimit && this.fam.children(p.id).length) this.collapsed.add(p.id);
    }
    this.render();
  }

  bindGestures() {
    const w = this.wrap;
    let start = null;
    let moved = 0;
    let pinch = null;

    w.addEventListener('pointerdown', (e) => {
      w.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.canvas.style.transition = '';
      if (this.pointers.size === 1) {
        start = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y };
        moved = 0;
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.view.k };
        moved = 99;
      }
    });
    w.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = w.getBoundingClientRect();
      if (this.pointers.size === 2 && pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2 - r.left;
        const cy = (a.y + b.y) / 2 - r.top;
        this.zoomAt((pinch.k * (d / pinch.d)) / this.view.k, cx, cy);
      } else if (this.pointers.size === 1 && start) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        moved = Math.max(moved, Math.hypot(dx, dy));
        this.view.x = start.vx + dx;
        this.view.y = start.vy + dy;
        this.apply();
      }
    });
    const up = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 1) {
        const [p] = [...this.pointers.values()];
        start = { x: p.x, y: p.y, vx: this.view.x, vy: this.view.y };
        pinch = null;
        return;
      }
      if (this.pointers.size === 0) {
        if (moved < 8 && e.type === 'pointerup') {
          const el = document.elementFromPoint(e.clientX, e.clientY);
          const tog = el?.closest('[data-toggle]');
          const node = el?.closest('.node');
          if (tog) {
            this.toggle(tog.dataset.toggle);
            haptic('light');
          } else if (node) {
            haptic('light');
            // yopiq shox — ochamiz; ochilgan yoki farzandsiz — ma'lumotini ko'rsatamiz
            if (node.classList.contains('closed')) this.expand(node.dataset.unit);
            else { const id = node.dataset.id; setTimeout(() => this.opts.onOpen(id), 90); } // sensorli ekranda keyingi 'click' oynani yopib qo'ymasin
          }
        }
        start = null;
        pinch = null;
      }
    };
    w.addEventListener('pointerup', up);
    w.addEventListener('pointercancel', up);
    w.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = w.getBoundingClientRect();
      if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) * 1.5) {
        this.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
      } else {
        this.view.x -= e.deltaX;
        this.view.y -= e.deltaY;
        this.apply();
      }
    }, { passive: false });
    let lastTap = 0;
    w.addEventListener('pointerup', (e) => {
      const now = Date.now();
      if (now - lastTap < 280 && moved < 8 && !document.elementFromPoint(e.clientX, e.clientY)?.closest('.node')) {
        const r = w.getBoundingClientRect();
        this.animate(() => this.zoomAt(1.6, e.clientX - r.left, e.clientY - r.top));
      }
      lastTap = now;
    });
  }
}

function haptic(kind) {
  try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(kind); } catch {}
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
