// Shajara hujjati ustidagi amallar: yaratish, ochish, shaxs qo'shish/tahrirlash.
import { readJson, writeJson, updateJson, deleteKey, putFile, ConflictError } from './store.js';
import { hashCode, normalizeCode, randomId } from './auth.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const treeKey = (id) => `trees/${id}.json`;
export const codeKey = (hash) => `codes/${hash}.json`;

const DATE_RE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;
const MAX_LOG = 300;

function cleanDate(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  if (!DATE_RE.test(s)) throw new HttpError(400, `Sana noto'g'ri: "${s}". Masalan: 1958 yoki 1958-03-20`);
  return s;
}

function cleanText(v, max = 120) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().slice(0, max);
  return s || null;
}

/** Foydalanuvchi yuborgan maydonlarni tekshirib, ruxsat etilganlarini qaytaradi. */
function personFields(body, { requireName } = {}) {
  const out = {};
  if ('name' in body || requireName) {
    const name = cleanText(body.name, 80);
    if (!name) throw new HttpError(400, 'Ism kiritilmagan');
    out.name = name;
  }
  if ('gender' in body || requireName) {
    if (!['m', 'f'].includes(body.gender)) throw new HttpError(400, 'Jinsini tanlang');
    out.gender = body.gender;
  }
  if ('birth' in body) out.birth = cleanDate(body.birth);
  if ('death' in body) out.death = cleanDate(body.death);
  if ('deceased' in body) out.deceased = !!body.deceased;
  if (out.death) out.deceased = true;
  if ('note' in body) out.note = cleanText(body.note, 1000);
  if ('code' in body) out.code = cleanText(body.code, 30);
  if ('bio' in body) out.bio = cleanText(body.bio, 3000);
  if ('place' in body) out.place = cleanText(body.place, 120);
  if ('fname' in body) out.fname = cleanText(body.fname, 60) || null; // otasining ismi (shajarada otasi bo'lmasa)
  if ('phone' in body) out.phone = cleanText(body.phone, 30);
  if ('child_order' in body && body.child_order !== null && body.child_order !== '') {
    const n = parseInt(body.child_order, 10);
    if (Number.isFinite(n)) out.child_order = n;
  }
  return out;
}

function nextId(tree) {
  const n = tree.meta.next_id || tree.persons.length + 1;
  tree.meta.next_id = n + 1;
  return 'p' + String(n).padStart(4, '0');
}

export function addLog(tree, who, action, name) {
  tree.log = tree.log || [];
  tree.log.unshift({ at: new Date().toISOString(), who: who || 'Tahrirchi', action, name });
  if (tree.log.length > MAX_LOG) tree.log.length = MAX_LOG;
  tree.updatedAt = new Date().toISOString();
}

/** Mijozga yuboriladigan ko'rinish (maxfiy maydonlarsiz). */
export const PAYWALL = () => process.env.PAYWALL === 'on';
export const LIMITS = { persons: Number(process.env.FREE_PERSONS || 500), album: Number(process.env.FREE_ALBUM || 150) };
export const isPremium = (tree) => !!tree.premiumUntil && new Date(tree.premiumUntil) > new Date();

/** Mijozga yuboriladigan ko'rinish (maxfiy maydonlarsiz). */
export function publicTree(tree, role, uid) {
  const me = uid ? tree.members?.[uid] : null;
  return {
    id: tree.id,
    title: tree.title,
    description: tree.description || '',
    role,
    isOwner: !!uid && tree.owner === uid,
    updatedAt: tree.updatedAt,
    createdAt: tree.createdAt,
    rootId: tree.meta?.root_id || null,
    persons: tree.persons,
    log: (tree.log || []).slice(0, 80),
    me: me ? { notify: me.notify || {}, role: me.role, pid: me.pid || null } : null,
    memberCount: Object.keys(tree.members || {}).length,
    groups: (tree.groups || []).map((g) => ({ id: g.id, title: g.title })),
    channel: tree.channel ? { title: tree.channel.title, invite: tree.channel.invite || null } : null,
    settings: { albumUpload: tree.settings?.albumUpload || 'members' },
    premium: { active: isPremium(tree), until: tree.premiumUntil || null, paywall: PAYWALL(), limits: LIMITS },
  };
}

/** A'zoni ro'yxatga olish yoki yangilash. O'zgarish bo'lsa true qaytaradi. */
export function upsertMember(tree, user, role, lang) {
  if (!user?.id) return false;
  tree.members = tree.members || {};
  const id = String(user.id);
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').slice(0, 60) || 'Telegram';
  const cur = tree.members[id];
  const nextRole = cur?.role === 'edit' || role === 'edit' ? 'edit' : 'view';
  if (cur && cur.name === name && cur.role === nextRole && (!lang || cur.lang === lang)) return false;
  tree.members[id] = {
    name, username: user.username || null, role: nextRole, lang: lang || cur?.lang || null,
    at: cur?.at || new Date().toISOString(), notify: cur?.notify || { tree: true, album: true, bday: true },
    ...(cur?.pid ? { pid: cur.pid } : {}),
  };
  if (!tree.owner && nextRole === 'edit') tree.owner = id;
  return true;
}

export async function findTreeByCode(code) {
  const c = normalizeCode(code);
  if (c.length < 4) return null;
  const idx = await readJson(codeKey(hashCode(c)));
  if (!idx) return null;
  const t = await readJson(treeKey(idx.data.treeId));
  return t ? t.data : null;
}

export async function loadTree(id) {
  const t = await readJson(treeKey(id));
  if (!t) throw new HttpError(404, 'Shajara topilmadi');
  return t.data;
}

function validateCodes(viewCode, editCode) {
  const v = normalizeCode(viewCode);
  const e = normalizeCode(editCode);
  if (v.length < 4 || v.length > 40) throw new HttpError(400, "Kirish kodi 4–40 belgidan iborat bo'lsin");
  if (e.length < 4 || e.length > 40) throw new HttpError(400, "Tahrir kodi 4–40 belgidan iborat bo'lsin");
  if (v === e) throw new HttpError(400, "Kirish va tahrir kodlari bir xil bo'lmasin");
  return { v, e };
}

/** Kirish kodini band qiladi (noyob bo'lishi shart). */
async function reserveCode(code, treeId) {
  try {
    await writeJson(codeKey(hashCode(code)), { treeId }, null);
  } catch (e) {
    if (e instanceof ConflictError) throw new HttpError(409, 'Bu kirish kodi band. Boshqa kod tanlang');
    throw e;
  }
}

export async function createTree({ title, description, viewCode, editCode, root, persons, meta, who, owner }) {
  const { v, e } = validateCodes(viewCode, editCode);
  const t = cleanText(title, 80);
  if (!t) throw new HttpError(400, 'Shajara nomini kiriting');
  const id = randomId(12);
  await reserveCode(v, id);
  const now = new Date().toISOString();
  const tree = {
    id,
    title: t,
    description: cleanText(description, 500) || '',
    createdAt: now,
    updatedAt: now,
    viewHash: hashCode(v),
    editHash: hashCode(e),
    ver: 1,
    meta: { root_id: null, next_id: 1, ...(meta || {}) },
    persons: [],
    log: [],
    members: {},
    owner: owner ? String(owner) : null,
  };
  if (persons?.length) {
    tree.persons = persons.map((p) => ({ photo: null, ...p }));
    if (!tree.meta.next_id || tree.meta.next_id <= persons.length) tree.meta.next_id = persons.length + 1;
    addLog(tree, who, 'import', `${persons.length} kishi`);
  } else {
    const f = personFields(root || {}, { requireName: true });
    const pid = nextId(tree);
    tree.persons.push({
      id: pid, code: null, name: f.name, gender: f.gender, birth: f.birth ?? null, death: f.death ?? null,
      deceased: !!f.deceased, blood: true, generation: 1, father_id: null, mother_id: null,
      spouse_ids: [], child_order: 1, note: f.note ?? null, source: 'app', photo: null,
    });
    tree.meta.root_id = pid;
    addLog(tree, who, 'create', f.name);
  }
  try {
    await writeJson(treeKey(id), tree, null);
  } catch (err) {
    await deleteKey(codeKey(hashCode(v)));
    throw err;
  }
  return tree;
}

function byId(tree, id) {
  const p = tree.persons.find((x) => x.id === id);
  if (!p) throw new HttpError(404, 'Shaxs topilmadi');
  return p;
}

export async function mutateTree(treeId, fn) {
  const r = await updateJson(treeKey(treeId), fn);
  if (!r) throw new HttpError(404, 'Shajara topilmadi');
  return r;
}

export function addPerson(tree, body, who) {
  const f = personFields(body, { requireName: true });
  const rel = body.relation;
  const of = body.of ? byId(tree, body.of) : null;
  const pid = nextId(tree);
  const p = {
    id: pid, code: null, name: f.name, gender: f.gender, birth: null, death: null, deceased: false,
    blood: true, generation: 1, father_id: null, mother_id: null, spouse_ids: [], child_order: null,
    note: null, source: 'app', photo: null, ...f,
  };

  if (rel === 'child') {
    if (!of) throw new HttpError(400, 'Ota yoki ona tanlanmagan');
    let other = body.otherParentId ? byId(tree, body.otherParentId) : null;
    if (!other && of.spouse_ids?.length === 1) other = byId(tree, of.spouse_ids[0]);
    const parents = [of, other].filter(Boolean);
    for (const par of parents) {
      if (par.gender === 'm') p.father_id = par.id;
      else p.mother_id = par.id;
    }
    p.blood = parents.some((x) => x.blood);
    p.generation = (of.blood || !other ? of.generation : other.generation) + 1;
    const siblings = tree.persons.filter((x) => (p.father_id && x.father_id === p.father_id) || (p.mother_id && x.mother_id === p.mother_id));
    if (p.child_order == null) p.child_order = siblings.reduce((m, x) => Math.max(m, x.child_order || 0), 0) + 1;
  } else if (rel === 'spouse') {
    if (!of) throw new HttpError(400, 'Kimning turmush o‘rtog‘i ekani tanlanmagan');
    p.blood = false;
    p.generation = of.generation;
    p.spouse_ids = [of.id];
    of.spouse_ids = [...new Set([...(of.spouse_ids || []), pid])];
  } else if (rel === 'parent') {
    if (!of) throw new HttpError(400, 'Kimning ota-onasi ekani tanlanmagan');
    const slot = p.gender === 'm' ? 'father_id' : 'mother_id';
    if (of[slot]) throw new HttpError(400, p.gender === 'm' ? 'Otasi allaqachon kiritilgan' : 'Onasi allaqachon kiritilgan');
    of[slot] = pid;
    p.blood = of.blood;
    p.generation = of.generation - 1;
    p.child_order = 1;
    const otherSlot = slot === 'father_id' ? 'mother_id' : 'father_id';
    if (of[otherSlot]) {
      const o = byId(tree, of[otherSlot]);
      o.spouse_ids = [...new Set([...(o.spouse_ids || []), pid])];
      p.spouse_ids = [o.id];
    }
    if (tree.meta.root_id === of.id) tree.meta.root_id = pid;
  } else {
    throw new HttpError(400, "Qarindoshlik turi noto'g'ri");
  }
  if (PAYWALL() && !isPremium(tree) && tree.persons.length >= LIMITS.persons) {
    throw new HttpError(402, `Bepul tarifda ${LIMITS.persons} kishigacha. Premium bilan cheksiz`);
  }
  tree.persons.push(p);
  if (!tree.meta.root_id) tree.meta.root_id = pid;
  addLog(tree, who, 'add', p.name);
  return p;
}

export function updatePerson(tree, id, body, who) {
  const p = byId(tree, id);
  const f = personFields(body);
  if ('deceased' in f && !f.deceased) f.death = null;
  Object.assign(p, f);
  addLog(tree, who, 'edit', p.name);
  return p;
}

export function deletePerson(tree, id, who) {
  const p = byId(tree, id);
  const children = tree.persons.filter((x) => x.father_id === id || x.mother_id === id);
  // Daraxt o'rtasidagi odamni o'chirsak shox uzilib qoladi; faqat eng yuqoridagi ajdodga ruxsat.
  if (children.length && (p.father_id || p.mother_id)) {
    throw new HttpError(400, "Farzandlari bor shaxsni o'chirib bo'lmaydi. Avval farzandlarini o'chiring yoki ma'lumotni tahrirlang");
  }
  for (const c of children) {
    if (c.father_id === id) c.father_id = null;
    if (c.mother_id === id) c.mother_id = null;
  }
  for (const x of tree.persons) {
    if (x.spouse_ids?.includes(id)) x.spouse_ids = x.spouse_ids.filter((s) => s !== id);
  }
  tree.persons = tree.persons.filter((x) => x.id !== id);
  if (tree.meta.root_id === id) tree.meta.root_id = children.find((c) => c.blood)?.id || tree.persons[0]?.id || null;
  addLog(tree, who, 'delete', p.name);
  return p;
}

const PHOTO_MAX = 1.5 * 1024 * 1024;

export async function savePhoto(treeId, personId, dataUrl) {
  const m = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'Rasm formati noto‘g‘ri');
  const buf = Buffer.from(m[3], 'base64');
  if (buf.length > PHOTO_MAX) throw new HttpError(413, 'Rasm juda katta');
  const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
  const file = `${personId}-${randomId(6)}.${ext}`;
  await putFile(`photos/${treeId}/${file}`, buf, m[1]);
  return file;
}

export async function changeSettings(tree, body, who) {
  if ('title' in body) {
    const t = cleanText(body.title, 80);
    if (!t) throw new HttpError(400, 'Shajara nomini kiriting');
    tree.title = t;
  }
  if ('description' in body) tree.description = cleanText(body.description, 500) || '';
  let codesChanged = false;
  if (body.viewCode) {
    const v = normalizeCode(body.viewCode);
    if (v.length < 4) throw new HttpError(400, "Kirish kodi kamida 4 belgi bo'lsin");
    const h = hashCode(v);
    if (h !== tree.viewHash) {
      if (h === tree.editHash) throw new HttpError(400, "Kirish va tahrir kodlari bir xil bo'lmasin");
      await reserveCode(v, tree.id);
      await deleteKey(codeKey(tree.viewHash));
      tree.viewHash = h;
      codesChanged = true;
    }
  }
  if (body.editCode) {
    const e = normalizeCode(body.editCode);
    if (e.length < 4) throw new HttpError(400, "Tahrir kodi kamida 4 belgi bo'lsin");
    const h = hashCode(e);
    if (h === tree.viewHash) throw new HttpError(400, "Kirish va tahrir kodlari bir xil bo'lmasin");
    if (h !== tree.editHash) {
      tree.editHash = h;
      codesChanged = true;
    }
  }
  if (codesChanged) tree.ver = (tree.ver || 1) + 1;
  addLog(tree, who, 'settings', tree.title);
  return codesChanged;
}

/** Bugungi tug'ilgan kunlar va xotira kunlari (Toshkent vaqti bilan). */
export function todaysEvents(tree, date = new Date()) {
  const local = new Date(date.getTime() + 5 * 3600e3);
  const md = `${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`;
  const year = local.getUTCFullYear();
  const births = [];
  const memorials = [];
  for (const p of tree.persons) {
    if (p.birth?.length === 10 && p.birth.slice(5) === md && !p.deceased) {
      births.push({ id: p.id, name: p.name, age: year - Number(p.birth.slice(0, 4)) });
    }
    if (p.death?.length === 10 && p.death.slice(5) === md) {
      memorials.push({ id: p.id, name: p.name, years: year - Number(p.death.slice(0, 4)) });
    }
  }
  return { births, memorials };
}

// ---------------------------------------------------------------- Fayldan import --
export function flexDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m;
  if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s))) return cleanDate(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  if ((m = /^(\d{1,2})[./-](\d{4})$/.exec(s))) return cleanDate(`${m[2]}-${m[1].padStart(2, '0')}`);
  return cleanDate(s);
}
function genderOf(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (/^(f|a|ayol|female|woman|ж|жен|аёл|qiz)/.test(s)) return 'f';
  return 'm';
}
const yes = (v) => /^(1|ha|yes|true|\+|да|ҳа|marhum|vafot)/i.test(String(v ?? '').trim());

/**
 * Jadvaldagi (CSV/Excel) qatorlarni shajaraga qo'shadi.
 * Ustunlar: name, gender, birth, death, deceased, father, mother, spouse, place, phone, note, code.
 * father/mother/spouse — fayldagi yoki shajaradagi ism (yoki daftar raqami).
 */
export function importRows(tree, rows, who) {
  if (!Array.isArray(rows) || !rows.length) throw new HttpError(400, 'Faylda ma’lumot topilmadi');
  if (rows.length > 2000) throw new HttpError(400, 'Bir martada 2000 tadan ko‘p qator yuklab bo‘lmaydi');
  if (PAYWALL() && !isPremium(tree) && tree.persons.length + rows.length > LIMITS.persons) {
    throw new HttpError(402, `Bepul tarifda ${LIMITS.persons} kishigacha. Premium bilan cheksiz`);
  }
  const key = (s) => String(s ?? '').trim().toLowerCase();
  const created = [];
  for (const [i, r] of rows.entries()) {
    const name = cleanText(r.name, 80);
    if (!name) continue;
    let birth, death;
    try {
      birth = flexDate(r.birth);
      death = flexDate(r.death);
    } catch (e) {
      throw new HttpError(400, `${i + 2}-qator (${name}): ${e.message}`);
    }
    const p = {
      id: nextId(tree), code: cleanText(r.code, 30), name, gender: genderOf(r.gender), birth, death,
      deceased: !!death || yes(r.deceased), blood: true, generation: null, father_id: null, mother_id: null,
      spouse_ids: [], child_order: null, note: cleanText(r.note, 1000), place: cleanText(r.place, 120),
      phone: cleanText(r.phone, 30), source: 'import', photo: null,
    };
    created.push({ p, r });
  }
  // Ismlar bo'yicha qidiruv: avval fayldagilar, so'ng shajaradagilar (faqat bitta mos kelsa)
  const inFile = new Map();
  for (const { p } of created) {
    if (!inFile.has(key(p.name))) inFile.set(key(p.name), p);
    if (p.code) inFile.set(key(p.code), p);
  }
  const inTree = new Map();
  for (const p of tree.persons) {
    for (const k of [key(p.name), p.code && key(p.code)].filter(Boolean)) inTree.set(k, inTree.has(k) ? null : p);
  }
  const find = (ref) => (ref ? inFile.get(key(ref)) || inTree.get(key(ref)) || null : null);
  for (const { p, r } of created) {
    const f = find(r.father);
    const m = find(r.mother);
    if (f) p.father_id = f.id;
    if (m) p.mother_id = m.id;
    const s = find(r.spouse);
    if (s && s !== p) {
      p.spouse_ids = [...new Set([...p.spouse_ids, s.id])];
      s.spouse_ids = [...new Set([...(s.spouse_ids || []), p.id])];
    }
  }
  return finishImport(tree, created, who);
}

// Yangi qo'shilganlarning avlodi, qon qarindoshligi va farzandlik tartibini hisoblab, shajaraga qo'shish
function finishImport(tree, created, who) {
  const all = [...tree.persons, ...created.map((c) => c.p)];
  const byId = new Map(all.map((p) => [p.id, p]));
  const base = Math.min(...tree.persons.map((p) => p.generation ?? 1), 1);
  // Avlod va qon qarindoshlikni ota-ona/juft bo'yicha aniqlash (bir necha marta aylanib)
  for (let pass = 0; pass < 12; pass++) {
    for (const { p } of created) {
      const par = byId.get(p.father_id) || byId.get(p.mother_id);
      if (par && par.generation != null) {
        p.generation = par.generation + 1;
        p.blood = [byId.get(p.father_id), byId.get(p.mother_id)].some((x) => x?.blood);
        continue;
      }
      const sp = p.spouse_ids.map((id) => byId.get(id)).find((x) => x && x.generation != null && (x.father_id || x.mother_id || x.blood));
      if (sp && !par) {
        p.generation = sp.generation;
        p.blood = false;
      } else if (!par && p.generation == null && !p.father_id && !p.mother_id) {
        const anySp = p.spouse_ids.map((id) => byId.get(id)).find(Boolean);
        if (!anySp || anySp.generation == null) p.generation = base;
      }
    }
  }
  const order = new Map();
  for (const { p } of created) {
    if (p.generation == null) p.generation = base;
    const par = p.father_id || p.mother_id;
    if (par) {
      const n = (order.get(par) ?? tree.persons.filter((x) => x.father_id === par || x.mother_id === par).length) + 1;
      order.set(par, n);
      p.child_order = n;
    } else p.child_order = 1;
  }
  tree.persons.push(...created.map((c) => c.p));
  if (!tree.meta.root_id && tree.persons[0]) tree.meta.root_id = tree.persons[0].id;
  addLog(tree, who, 'import', `${created.length}`);
  return created.length;
}

const normName = (v) => String(v ?? '').toLowerCase().replace(/[ʻʼ‘’'`´]/g, '').replace(/\s+/g, ' ').trim();
const yearOf = (d) => (d ? String(d).slice(0, 4) : '');
function safeDate(v) {
  const s = String(v ?? '').trim();
  if (!s || s === '+') return null;
  try { return flexDate(s); } catch { const y = /\b(1[5-9]\d\d|20\d\d)\b/.exec(s)?.[1]; return y || null; }
}

// Ismlarni taqqoslash: katta-kichik harf, tutuq belgisi, x/h, qo'sh harf va qavsdagi izoh farq qilmaydi
export const fuzzyName = (v) => normName(String(v ?? '').replace(/\(.*?\)/g, '')).replace(/x/g, 'h').replace(/[^\p{L}\p{N}]/gu, '').replace(/(.)\1+/gu, '$1');
function lev1(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}
/** 2 — bir xil ism, 1 — bitta harf farqi (Qadirbergan/Qodirbergan), 0 — boshqa ism. */
function sameName(a, b) {
  const x = fuzzyName(a), y = fuzzyName(b);
  if (!x || !y) return 0;
  return x === y ? 2 : Math.min(x.length, y.length) >= 4 && lev1(x, y) ? 1 : 0;
}
const idNum = (id) => Number(String(id).replace(/\D/g, '')) || 0;

function treeIndex(tree) {
  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  const kids = new Map();
  const sp = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
  for (const p of tree.persons) {
    for (const pid of [p.father_id, p.mother_id]) if (pid && byId.has(pid)) add(kids, pid, p);
    for (const sid of p.spouse_ids || []) {
      const q = byId.get(sid);
      if (q && q !== p) { add(sp, p.id, q); add(sp, q.id, p); }
    }
  }
  return { byId, kids, sp };
}

/**
 * AI ajratgan ro'yxatni shajaraga solishtirish. Avval ism + tug'ilgan yil bo'yicha aniq mosliklar topiladi,
 * keyin qarindoshlik bo'yicha yoyiladi: mos kelgan odamning farzandlari, turmush o'rtoqlari va ota-onasi
 * shajaradagi farzandlari/juftlari orasidan (imlo farqlarini hisobga olib) izlanadi.
 */
export function planGraph(tree, rows) {
  const { byId, kids, sp } = treeIndex(tree);
  const R = new Map(rows.map((r) => [String(r.id), r]));
  const rKids = new Map();
  const rSp = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
  for (const r of rows) {
    for (const pid of [r.father, r.mother]) if (pid && R.has(String(pid))) add(rKids, String(pid), r);
    const s = R.get(String(r.spouse));
    if (s && s !== r) { add(rSp, String(r.id), s); add(rSp, String(s.id), r); }
  }
  const matched = new Map();
  const used = new Set();
  const queue = [];
  const fits = (r, p) => {
    const a = yearOf(safeDate(r.birth));
    const b = yearOf(p.birth);
    if (a && b && a !== b) return 0;
    if (r.gender && p.gender && genderOf(r.gender) !== p.gender) return 0;
    const ns = sameName(r.name, p.name);
    return ns ? ns * 2 + (a && a === b ? 2 : 0) : 0;
  };
  const pick = (r, cands) => {
    let top = 0;
    let best = [];
    for (const p of cands || []) {
      if (used.has(p.id)) continue;
      const sc = fits(r, p);
      if (sc > top) { top = sc; best = [p]; } else if (sc && sc === top) best.push(p);
    }
    if (!best.length) return null;
    // teng nomzodlar bir xil ismli bo'lsa (shajaradagi takror) — eng eskisi; turli ismlar bo'lsa — aniq emas
    if (best.length > 1 && new Set(best.map((p) => fuzzyName(p.name))).size > 1) return null;
    return best.sort((x, y) => idNum(x.id) - idNum(y.id))[0];
  };
  const link = (r, p) => { matched.set(String(r.id), p); used.add(p.id); queue.push(r); };
  // 1) Tayanch: ism + tug'ilgan yil, shajarada yagona
  const exact = new Map();
  for (const p of tree.persons) {
    const y = yearOf(p.birth);
    if (!y) continue;
    const k = fuzzyName(p.name) + '|' + y;
    exact.set(k, exact.has(k) ? null : p);
  }
  for (const r of rows) {
    const y = yearOf(safeDate(r.birth));
    const p = y && exact.get(fuzzyName(r.name) + '|' + y);
    if (p && !used.has(p.id) && !matched.has(String(r.id)) && fits(r, p)) link(r, p);
  }
  // 2) Qarindoshlik bo'yicha yoyilish
  while (queue.length) {
    const r = queue.shift();
    const p = matched.get(String(r.id));
    for (const c of rKids.get(String(r.id)) || []) if (!matched.has(String(c.id))) { const q = pick(c, kids.get(p.id)); if (q) link(c, q); }
    for (const s of rSp.get(String(r.id)) || []) if (!matched.has(String(s.id))) { const q = pick(s, sp.get(p.id)); if (q) link(s, q); }
    for (const k of ['father', 'mother']) {
      const pr = R.get(String(r[k]));
      const pp = byId.get(p[k + '_id']);
      if (pr && pp && !matched.has(String(pr.id)) && !used.has(pp.id) && fits(pr, pp)) link(pr, pp);
    }
  }
  return { matched, newCount: rows.filter((r) => !matched.has(String(r.id)) && cleanText(r.name, 80)).length };
}

/** Oxirgi importni bekor qilish (qo'shilgan odamlar va ularga bog'lanishlar o'chiriladi). */
export function undoImport(tree, who) {
  let ids = tree.meta.lastImport?.ids;
  if (!ids?.length) {
    // eski importlar uchun: oxirgi «import» yozuvidagi son — ro'yxat oxiridagi shuncha odam
    const n = Number(tree.log?.find((l) => l.action === 'import')?.name);
    const tail = n > 0 ? tree.persons.slice(-n) : [];
    if (!n || tail.length !== n || tail.some((p) => p.source !== 'import')) throw new HttpError(400, 'Bekor qiladigan import topilmadi');
    ids = tail.map((p) => p.id);
  }
  const drop = new Set(ids);
  const before = tree.persons.length;
  tree.persons = tree.persons.filter((p) => !drop.has(p.id));
  for (const p of tree.persons) {
    if (drop.has(p.father_id)) p.father_id = null;
    if (drop.has(p.mother_id)) p.mother_id = null;
    if (p.spouse_ids?.some((x) => drop.has(x))) p.spouse_ids = p.spouse_ids.filter((x) => !drop.has(x));
  }
  if (drop.has(tree.meta.root_id)) tree.meta.root_id = tree.persons[0]?.id || null;
  tree.meta.lastImport = null;
  const removed = before - tree.persons.length;
  addLog(tree, who, 'undo-import', String(removed));
  return removed;
}

/** Ehtimoliy takrorlar: bir odamning farzandlari yoki juftlari orasida ismi o'xshash, yili zid bo'lmaganlar. */
export function findDuplicates(tree) {
  const { byId, kids, sp } = treeIndex(tree);
  const out = [];
  const seen = new Set();
  const scan = (group, type, of) => {
    const arr = [...group];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        if (a.gender !== b.gender || !sameName(a.name, b.name)) continue;
        const ya = yearOf(a.birth);
        const yb = yearOf(b.birth);
        if (ya && yb && ya !== yb) continue;
        const [keep, drop] = idNum(a.id) < idNum(b.id) ? [a, b] : [b, a];
        if (seen.has(drop.id)) continue;
        seen.add(drop.id);
        out.push({ keep: keep.id, drop: drop.id, type, of });
      }
    }
  };
  for (const [pid, set] of kids) scan(set, 'child', pid);
  for (const [pid, set] of sp) scan(set, 'spouse', pid);
  return out.filter((x) => byId.has(x.keep) && byId.has(x.drop));
}

/** Ikki yozuvni birlashtirish: drop'ning bog'lanishlari va bo'sh maydonlari keep'ga o'tadi, drop o'chiriladi. */
export function mergePersons(tree, keepId, dropId, who) {
  const keep = tree.persons.find((p) => p.id === keepId);
  const drop = tree.persons.find((p) => p.id === dropId);
  if (!keep || !drop || keep === drop) return false;
  for (const k of ['birth', 'death', 'photo', 'note', 'place', 'phone', 'code']) if (!keep[k] && drop[k]) keep[k] = drop[k];
  if (drop.deceased) keep.deceased = true;
  if (!keep.father_id && drop.father_id && drop.father_id !== keepId) keep.father_id = drop.father_id;
  if (!keep.mother_id && drop.mother_id && drop.mother_id !== keepId) keep.mother_id = drop.mother_id;
  keep.spouse_ids = [...new Set([...(keep.spouse_ids || []), ...(drop.spouse_ids || [])])].filter((x) => x !== keepId && x !== dropId);
  for (const p of tree.persons) {
    if (p.father_id === dropId) p.father_id = keepId;
    if (p.mother_id === dropId) p.mother_id = keepId;
    if (p.spouse_ids?.includes(dropId)) p.spouse_ids = [...new Set(p.spouse_ids.map((x) => (x === dropId ? keepId : x)))].filter((x) => x !== p.id);
  }
  tree.persons = tree.persons.filter((p) => p.id !== dropId);
  if (tree.meta.root_id === dropId) tree.meta.root_id = keepId;
  if (tree.meta.lastImport?.ids) tree.meta.lastImport.ids = tree.meta.lastImport.ids.filter((x) => x !== dropId);
  addLog(tree, who, 'merge', keep.name);
  return true;
}

/**
 * AI ro'yxatini qo'shish: qatorlarda vaqtinchalik id, ota/ona/juft — shu id'lar (bir xil ismlar adashmaydi).
 * Shajarada borlar qayta qo'shilmaydi — yangi farzandlar ularga ulanadi.
 */
export function importGraph(tree, rows, who) {
  if (!Array.isArray(rows) || !rows.length) throw new HttpError(400, 'Faylda ma’lumot topilmadi');
  if (rows.length > 3000) throw new HttpError(400, 'Bir martada 3000 tadan ko‘p odam qo‘shib bo‘lmaydi');
  const { matched, newCount } = planGraph(tree, rows);
  if (PAYWALL() && !isPremium(tree) && tree.persons.length + newCount > LIMITS.persons) {
    throw new HttpError(402, `Bepul tarifda ${LIMITS.persons} kishigacha. Premium bilan cheksiz`);
  }
  const map = new Map(matched);
  const created = [];
  for (const r of rows) {
    const id = String(r.id);
    const name = cleanText(r.name, 80);
    if (!name || map.has(id)) continue;
    const death = safeDate(r.death);
    const p = {
      id: nextId(tree), code: null, name, gender: genderOf(r.gender), birth: safeDate(r.birth), death,
      deceased: !!death || String(r.death).trim() === '+', blood: true, generation: null, father_id: null, mother_id: null,
      spouse_ids: [], child_order: null, note: cleanText(r.note, 1000), place: cleanText(r.place, 120),
      phone: cleanText(r.phone, 30), source: 'import', photo: null,
    };
    map.set(id, p);
    created.push({ p, r });
  }
  const fresh = new Set(created.map((c) => c.p));
  for (const { p, r } of created) {
    const f = map.get(String(r.father));
    const m = map.get(String(r.mother));
    if (f && f !== p) p.father_id = f.id;
    if (m && m !== p && m !== f) p.mother_id = m.id;
  }
  // Juftlar: kamida bittasi yangi bo'lsa ikki tomonlama bog'laymiz
  for (const r of rows) {
    const a = map.get(String(r.id));
    const b = map.get(String(r.spouse));
    if (!a || !b || a === b || (!fresh.has(a) && !fresh.has(b))) continue;
    a.spouse_ids = [...new Set([...(a.spouse_ids || []), b.id])];
    b.spouse_ids = [...new Set([...(b.spouse_ids || []), a.id])];
  }
  const n = created.length ? finishImport(tree, created, who) : 0;
  if (n) tree.meta.lastImport = { at: new Date().toISOString(), ids: created.map((c) => c.p.id) };
  return { created: n, matched: matched.size };
}

/** Eksport qilingan JSON (persons[]) bilan shajarani to'liq almashtirish. */
export function replacePersons(tree, data, who) {
  const persons = data?.persons;
  if (!Array.isArray(persons) || !persons.length) throw new HttpError(400, 'Faylda ma’lumot topilmadi');
  for (const p of persons) {
    if (!p.id || !p.name) throw new HttpError(400, 'Fayl formati noto‘g‘ri');
  }
  tree.persons = persons.map((p) => ({ photo: null, spouse_ids: [], ...p }));
  const nums = persons.map((p) => Number(String(p.id).replace(/\D/g, '')) || 0);
  tree.meta.next_id = Math.max(data.meta?.next_id || 0, ...nums) + 1;
  tree.meta.root_id = data.meta?.root_id && persons.some((p) => p.id === data.meta.root_id) ? data.meta.root_id : persons[0].id;
  addLog(tree, who, 'import', `${persons.length}`);
  return persons.length;
}

// ---------------------------------------------------------------- Shox havolalari --
/** Shox doirasi: bosh, uning avlodlari va ularning juftlari (id lar to'plami). */
export function branchScope(tree, headId) {
  const kids = new Map();
  for (const p of tree.persons) for (const pid of [p.father_id, p.mother_id]) if (pid) { if (!kids.has(pid)) kids.set(pid, []); kids.get(pid).push(p.id); }
  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  const scope = new Set();
  const stack = [headId];
  while (stack.length) {
    const id = stack.pop();
    if (scope.has(id) || !byId.has(id)) continue;
    scope.add(id);
    for (const s of byId.get(id).spouse_ids || []) if (byId.has(s)) scope.add(s);
    for (const c of kids.get(id) || []) stack.push(c);
  }
  return scope;
}

/**
 * Shox taklifini qo'llash. ops: [{op:'update', id, f:{...}} | {op:'add', tmp, f:{...}, father, mother, spouse}]
 * Faqat shox doirasidagi odamlarga tegadi; yangi odamlar doiradagi odamlarga bog'lanadi.
 */
export function applyProposal(tree, headId, ops, who) {
  const scope = branchScope(tree, headId);
  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  const date = (v) => { const s = String(v ?? '').trim(); if (!s) return null; try { return flexDate(s); } catch { return null; } };
  let updated = 0;
  for (const o of ops) {
    if (o.op !== 'update' || !scope.has(o.id)) continue;
    const p = byId.get(o.id);
    const f = o.f || {};
    if ('name' in f && cleanText(f.name, 80)) p.name = cleanText(f.name, 80);
    if ('gender' in f) p.gender = genderOf(f.gender);
    if ('birth' in f && date(f.birth)) p.birth = date(f.birth);
    if ('death' in f && date(f.death)) p.death = date(f.death);
    if ('deceased' in f) p.deceased = !!f.deceased || !!p.death;
    if ('fname' in f) p.fname = cleanText(f.fname, 60) || null;
    updated++;
  }
  const map = new Map();
  const created = [];
  for (const o of ops) {
    if (o.op !== 'add' || !cleanText(o.f?.name, 80)) continue;
    const death = date(o.f.death);
    const p = {
      id: nextId(tree), code: null, name: cleanText(o.f.name, 80), gender: genderOf(o.f.gender), birth: date(o.f.birth), death,
      deceased: !!death || !!o.f.deceased, blood: !o.spouse || !!(o.father || o.mother), generation: null, father_id: null, mother_id: null,
      spouse_ids: [], child_order: null, note: null, place: null, phone: null, source: 'branch', photo: null, fname: cleanText(o.f.fname, 60) || null,
    };
    map.set(String(o.tmp), p);
    created.push({ p, o });
  }
  const ref = (v) => (v == null || v === '' ? null : map.get(String(v)) || (scope.has(v) ? byId.get(v) : null));
  for (const { p, o } of created) {
    const f = ref(o.father);
    const m = ref(o.mother);
    if (f) p.father_id = f.id;
    if (m) p.mother_id = m.id;
    const s = ref(o.spouse);
    if (s) {
      p.spouse_ids = [s.id];
      s.spouse_ids = [...new Set([...(s.spouse_ids || []), p.id])];
    }
  }
  const n = created.length ? finishImport(tree, created, who) : 0;
  addLog(tree, who, 'branch', `+${n} ✏️${updated}`);
  return { created: n, updated };
}
