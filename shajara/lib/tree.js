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
    me: me ? { notify: me.notify || {}, role: me.role } : null,
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
      births.push({ name: p.name, age: year - Number(p.birth.slice(0, 4)) });
    }
    if (p.death?.length === 10 && p.death.slice(5) === md) {
      memorials.push({ name: p.name, years: year - Number(p.death.slice(0, 4)) });
    }
  }
  return { births, memorials };
}

// ---------------------------------------------------------------- Fayldan import --
function flexDate(v) {
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
