// Oila munosabatlari, sanalar va qarindoshlik hisoblash.

const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

export class Family {
  constructor(persons) {
    this.persons = persons;
    this.byId = new Map(persons.map((p) => [p.id, p]));
    this.kids = new Map();
    for (const p of persons) {
      for (const pid of [p.father_id, p.mother_id]) {
        if (!pid) continue;
        if (!this.kids.has(pid)) this.kids.set(pid, []);
        this.kids.get(pid).push(p);
      }
    }
    for (const arr of this.kids.values()) arr.sort(byOrder);
    const gens = persons.map((p) => p.generation).filter((g) => Number.isFinite(g));
    this.minGen = gens.length ? Math.min(...gens) : 1;
    this.maxGen = gens.length ? Math.max(...gens) : 1;
  }
  get(id) { return this.byId.get(id) || null; }
  children(id) { return this.kids.get(id) || []; }
  father(p) { return this.get(p.father_id); }
  mother(p) { return this.get(p.mother_id); }
  spouses(p) { return (p.spouse_ids || []).map((id) => this.get(id)).filter(Boolean); }
  siblings(p) {
    const set = new Map();
    for (const par of [p.father_id, p.mother_id]) {
      if (!par) continue;
      for (const c of this.children(par)) if (c.id !== p.id) set.set(c.id, c);
    }
    return [...set.values()].sort(byOrder);
  }
  grandchildren(p) {
    const out = new Map();
    for (const c of this.children(p.id)) for (const g of this.children(c.id)) out.set(g.id, g);
    return [...out.values()];
  }
  descendantsCount(id, seen = new Set()) {
    let n = 0;
    for (const c of this.children(id)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      n += 1 + this.descendantsCount(c.id, seen);
    }
    return n;
  }
  /** Avlod raqami (1 dan boshlab). */
  gen(p) { return (p.generation ?? this.minGen) - this.minGen + 1; }
  /** Urug' bo'yicha ajdodlar zanjiri: [eng katta ajdod, ..., p] */
  lineage(p) {
    const chain = [p];
    const seen = new Set([p.id]);
    let cur = p;
    for (;;) {
      const f = this.father(cur);
      const m = this.mother(cur);
      const next = f && (f.blood || !m || !m.blood) ? f : m;
      if (!next || seen.has(next.id)) break;
      seen.add(next.id);
      chain.unshift(next);
      cur = next;
    }
    return chain;
  }
  /** Urug'dagi qon qarindosh bo'lmagan shaxs uchun — kimning turmush o'rtog'i. */
  bloodSpouse(p) {
    return this.spouses(p).find((s) => s.blood) || this.spouses(p)[0] || null;
  }
  ancestors(p) {
    // id -> { d: masofa, via: birinchi qadamdagi ota/ona }
    const out = new Map([[p.id, { d: 0, via: null }]]);
    const q = [p];
    while (q.length) {
      const cur = q.shift();
      const info = out.get(cur.id);
      for (const par of [this.father(cur), this.mother(cur)]) {
        if (!par || out.has(par.id)) continue;
        out.set(par.id, { d: info.d + 1, via: info.via || par });
        q.push(par);
      }
    }
    return out;
  }
}

function byOrder(a, b) {
  return (a.child_order ?? 99) - (b.child_order ?? 99) || String(a.birth || '9999').localeCompare(String(b.birth || '9999'));
}

// ---------------------------------------------------------------- Sanalar --
export function parseDateInput(s) {
  s = String(s || '').trim();
  if (!s) return null;
  let m;
  if ((m = /^(\d{4})$/.exec(s))) return m[1];
  if ((m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(s))) return fmtIso(m[1], m[2], m[3]);
  if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s))) return fmtIso(m[3], m[2], m[1]);
  if ((m = /^(\d{1,2})[./-](\d{4})$/.exec(s))) return fmtIso(m[2], m[1]);
  return undefined; // noto'g'ri
}
function fmtIso(y, mo, d) {
  const mm = Number(mo);
  if (mm < 1 || mm > 12) return undefined;
  let s = `${y}-${String(mm).padStart(2, '0')}`;
  if (d) {
    const dd = Number(d);
    if (dd < 1 || dd > 31) return undefined;
    s += '-' + String(dd).padStart(2, '0');
  }
  return s;
}
export function dateToInput(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (d) return `${d}.${m}.${y}`;
  if (m) return `${m}.${y}`;
  return y;
}
export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (d) return `${Number(d)}-${MONTHS[Number(m) - 1]}, ${y}`;
  if (m) return `${MONTHS[Number(m) - 1]}, ${y}`;
  return `${y}-yil`;
}
export function year(iso) { return iso ? Number(iso.slice(0, 4)) : null; }

export function age(p, now = new Date()) {
  if (!p.birth) return null;
  const end = p.deceased ? (p.death ? p.death : null) : now.toISOString().slice(0, 10);
  if (!end) return null;
  let a = year(end) - year(p.birth);
  if (p.birth.length === 10 && end.length === 10 && end.slice(5) < p.birth.slice(5)) a--;
  return a >= 0 && a < 130 ? a : null;
}

export function yearsLabel(p) {
  const b = year(p.birth);
  const d = year(p.death);
  if (b && d) return `${b} – ${d}`;
  if (b && p.deceased) return `${b} – …`;
  if (b) return `${b}`;
  if (d) return `… – ${d}`;
  return '';
}

/** Yaqin kunlardagi tug'ilgan kunlar (faqat hayotlar, to'liq sana bilan). */
export function upcomingBirthdays(persons, days = 30, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out = [];
  for (const p of persons) {
    if (p.deceased || !p.birth || p.birth.length !== 10) continue;
    const [, m, d] = p.birth.split('-').map(Number);
    let next = new Date(today.getFullYear(), m - 1, d);
    if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
    const diff = Math.round((next - today) / 864e5);
    if (diff <= days) out.push({ p, diff, date: next, turns: next.getFullYear() - year(p.birth) });
  }
  return out.sort((a, b) => a.diff - b.diff);
}
export const monthShort = (i) => MONTHS[i].slice(0, 3);

export function initials(name) {
  const parts = String(name || '?').replace(/[^\p{L}\s'‘’]/gu, '').trim().split(/\s+/);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

// ------------------------------------------------------- Kim kimga kim? --
/** B shaxs A ga kim bo'ladi. tr — tarjima funksiyasi, nm — ismni ko'rsatish. */
export function kinship(fam, a, b, tr = (s) => s, nm = (s) => s) {
  if (a.id === b.id) return { term: tr('Bu — aynan o‘sha inson'), detail: '' };
  if ((a.spouse_ids || []).includes(b.id)) return { term: tr(b.gender === 'm' ? 'Eri (turmush o‘rtog‘i)' : 'Xotini (turmush o‘rtog‘i)'), detail: '' };
  const direct = bloodKin(fam, a, b, tr, nm);
  if (direct) return direct;
  for (const s of fam.spouses(b)) {
    const k = bloodKin(fam, a, s, tr, nm);
    if (!k) continue;
    const detail = tr('{name}ning turmush o‘rtog‘i', { name: nm(s.name) });
    if (k.key === 'child') return { term: tr(b.gender === 'f' ? 'Kelini' : 'Kuyovi'), detail };
    if (k.key === 'sibling') return { term: tr(b.gender === 'f' ? 'Yangasi (kelinoyisi)' : 'Pochchasi (kuyov)'), detail };
    if (k.key === 'grandchild') return { term: tr(b.gender === 'f' ? 'Nevara kelini' : 'Nevara kuyovi'), detail };
    return { term: tr('{rel} — turmush o‘rtog‘i', { rel: k.term }), detail: tr('{name} orqali', { name: nm(s.name) }) };
  }
  for (const s of fam.spouses(a)) {
    const k = bloodKin(fam, s, b, tr, nm);
    if (!k) continue;
    const via = tr('{name} orqali', { name: nm(s.name) });
    if (k.key === 'parent') return { term: tr(b.gender === 'm' ? 'Qaynotasi' : 'Qaynonasi'), detail: via };
    if (k.key === 'sibling') return { term: tr(b.gender === 'm' ? 'Qaynisi / qaynog‘asi' : 'Qaynsinglisi / qaynopasi'), detail: via };
    if (k.key === 'child') return { term: tr(b.gender === 'm' ? 'O‘gay o‘g‘li / o‘g‘li' : 'O‘gay qizi / qizi'), detail: via };
    return { term: tr('Turmush o‘rtog‘ining qarindoshi: {rel}', { rel: k.term }), detail: via };
  }
  return { term: tr('Qon qarindoshlik topilmadi'), detail: tr('Bu ikki inson shajarada to‘g‘ridan-to‘g‘ri bog‘lanmagan yoki ma’lumot yetarli emas') };
}

function bloodKin(fam, a, b, tr, nm) {
  const A = fam.ancestors(a);
  const B = fam.ancestors(b);
  let best = null;
  for (const [id, ia] of A) {
    const ib = B.get(id);
    if (!ib) continue;
    if (!best || ia.d + ib.d < best.ia.d + best.ib.d) best = { id, ia, ib };
  }
  if (!best) return null;
  const lca = fam.get(best.id);
  const da = best.ia.d;
  const db = best.ib.d;
  const m = b.gender === 'm';
  const older = a.birth && b.birth ? b.birth < a.birth : null;
  const detail = da && db ? tr('Umumiy ajdod: {name}', { name: nm(lca.name) }) : '';
  const viaA = best.ia.via;
  const r = (key, term, d = detail) => ({ key, term, detail: d });

  if (da === 0) {
    const k = [null, m ? 'O‘g‘li' : 'Qizi', 'Nevarasi', 'Evarasi', 'Chevarasi', 'Duvarasi'][db];
    return r(db === 1 ? 'child' : db === 2 ? 'grandchild' : 'desc', k ? tr(k) : tr('{n}-bo‘g‘in avlodi', { n: db }), '');
  }
  if (db === 0) {
    const k = [null, m ? 'Otasi' : 'Onasi', m ? 'Bobosi' : 'Buvisi', m ? 'Katta bobosi (bobokaloni)' : 'Katta buvisi', m ? 'Bobosining bobosi' : 'Buvisining buvisi'][da];
    return r(da === 1 ? 'parent' : 'anc', k ? tr(k) : tr('{n}-bo‘g‘in ajdodi', { n: da }), '');
  }
  if (da === 1 && db === 1) {
    const half = a.father_id !== b.father_id || a.mother_id !== b.mother_id;
    let t = tr(m ? (older === null ? 'Aka-ukasi' : older ? 'Akasi' : 'Ukasi') : (older === null ? 'Opa-singlisi' : older ? 'Opasi' : 'Singlisi'));
    if (half && a.father_id && b.father_id && a.mother_id && b.mother_id) t += ' ' + tr(a.father_id === b.father_id ? '(otasi bir)' : '(onasi bir)');
    return r('sibling', t);
  }
  if (da === 2 && db === 1) return r('uncle', tr(viaA?.gender === 'm' ? (m ? 'Amakisi' : 'Ammasi') : (m ? 'Tog‘asi' : 'Xolasi')));
  if (da === 1 && db === 2) return r('nephew', tr(m ? 'Jiyani (o‘g‘il)' : 'Jiyani (qiz)'));
  if (da === 2 && db === 2) {
    const pa = viaA?.gender === 'm';
    const pb = best.ib.via?.gender === 'm';
    return r('cousin', tr(pa && pb ? 'Amakivachchasi' : pa ? 'Ammavachchasi' : pb ? 'Tog‘avachchasi' : 'Xolavachchasi'));
  }
  if (da === 3 && db === 1) return r('granduncle', tr(m ? 'Katta amakisi / tog‘asi' : 'Katta ammasi / xolasi'));
  if (da === 1 && db === 3) return r('grandnephew', tr('Jiyanining farzandi'));
  if (da === 3 && db === 2) return r('parent-cousin', tr('Ota-onasining amakivachchasi'));
  if (da === 2 && db === 3) return r('cousin-child', tr('Amakivachchasining farzandi'));
  const deg = Math.min(da, db) - 1;
  const diff = Math.abs(da - db);
  return r('far', tr('{n}-darajali qarindosh', { n: deg }) + (diff ? ' ' + tr('({n} avlod farq)', { n: diff }) : ''));
}
