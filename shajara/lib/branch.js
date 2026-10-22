// Shox mas'uli: havola orqali oila tarmog'ini to'ldirish (ilova yoki bot yozishmasi),
// zanjirli topshirish, to'liqlik hisobi va kunlik eslatmalar.
import { readJson, writeJson, updateJson, deleteKey } from './store.js';
import { loadTree, mutateTree, branchScope, flexDate, HttpError, applyProposal, fuzzyName } from './tree.js';
import { randomId, signShort } from './auth.js';
import { tg } from './telegram.js';
import { escapeHtml as esc } from './notify.js';
import { t } from './i18n.js';
import { updateUser } from './users.js';

const BOT = () => process.env.BOT_USERNAME || 'ShajaraAiBot';
const URL_ = () => (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const nameOf = (u) => [u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.username || 'Telegram';
export const fullDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
/** Kechiktirilgan topshirish havolasi: d_<tree>_<bid>_<pid>_<imzo> — ochilganda zanjir shoxi yaratiladi. */
export const dlgLink = (treeId, bid, pid) => `https://t.me/${BOT()}?start=d_${treeId}_${bid}_${pid}_${signShort(`${treeId}:${bid}:${pid}`)}`;
export async function resolveDlg(payload) {
  const m = /^d_([a-z0-9]{6,20})_([A-Za-z0-9]{4,16})_(p\d{1,8})_([A-Za-z0-9_-]{10})$/.exec(payload);
  if (!m || signShort(`${m[1]}:${m[2]}:${m[3]}`) !== m[4]) return null;
  const tree = await loadTree(m[1]).catch(() => null);
  const b = tree?.branches?.[m[2]];
  if (!b || b.revoked || !branchScope(tree, b.head).has(m[3])) return null;
  const ex = Object.entries(tree.branches).find(([, x]) => !x.revoked && x.head === m[3] && x.parent === m[2]);
  const nb = ex ? ex[0] : await createBranch(tree.id, m[3], b.claimedName || 'Telegram', { parent: m[2], byUid: b.claimed || null, ...(b.lang ? { lang: b.lang } : {}) });
  return [null, tree.id, nb];
}
// havola muddati: ochilmasa shu kundan keyin ishlamaydi (birinchi ochgan uchun esa doim ishlaydi)
export const LINK_DAYS = 30;
export const brLink = (treeId, bid) => `https://t.me/${BOT()}?start=br_${treeId}_${bid}`;

// ---------------------------------------------------------------- to'liqlik --
/** Shaxsda yetishmayotgan maydonlar. */
// kelin/kuyov (turmush o'rtog'i, ota-onasi shoxda yo'q): familiyasi ham yozilishi shart
const words = (n) => String(n || '').trim().split(/\s+/).filter(Boolean).length;
export function missingOf(p, inLaw = false) {
  const m = [];
  if (!String(p.name || '').trim()) m.push('name');
  else if (inLaw && words(p.name) < 2) m.push('surname');
  if (!fullDate(p.birth)) m.push('birth');
  if (p.deceased && !fullDate(p.death)) m.push('death');
  return m;
}
export function completeness(tree, ids) {
  const list = ids ? tree.persons.filter((p) => ids.has(p.id)) : tree.persons;
  const missing = list.map((p) => ({ id: p.id, name: p.name, miss: missingOf(p) })).filter((x) => x.miss.length);
  return { total: list.length, missing, pct: list.length ? Math.round(((list.length - missing.length) / list.length) * 100) : 100 };
}

// ---------------------------------------------------------------- havolalar --
export async function createBranch(treeId, head, by, extra = {}) {
  const bid = randomId(8);
  const exp = new Date(Date.now() + LINK_DAYS * 864e5).toISOString();
  await mutateTree(treeId, (t) => { t.branches = { ...(t.branches || {}), [bid]: { head, at: new Date().toISOString(), exp, by, claimed: null, ...extra } }; });
  return bid;
}

/** Havolani ochgan foydalanuvchiga biriktirish (birinchi ochgan egallaydi). */
export async function claimBranch(treeId, bid, user) {
  const tree = await loadTree(treeId).catch(() => null);
  const b = tree?.branches?.[bid];
  if (!tree || !b || b.revoked || !tree.persons.some((p) => p.id === b.head)) throw new HttpError(404, 'Havola eskirgan yoki bekor qilingan');
  const uid = String(user.id);
  if (b.exp && Date.parse(b.exp) < Date.now() && b.claimed !== uid) throw new HttpError(410, 'Havola muddati tugagan. Shajara egasidan yangisini so‘rang');
  if (b.claimed && b.claimed !== uid) throw new HttpError(403, 'Bu havola boshqa kishiga biriktirilgan. Shajara egasidan yangi havola so‘rang');
  if (!b.claimed) {
    await mutateTree(treeId, (t) => { Object.assign(t.branches[bid], { claimed: uid, claimedName: nameOf(user), claimedAt: new Date().toISOString() }); });
    b.claimed = uid;
  }
  return { tree, b };
}

export function scopePersons(tree, head) {
  const scope = branchScope(tree, head);
  return tree.persons.filter((p) => scope.has(p.id)).map((p) => ({ id: p.id, name: p.name, gender: p.gender, birth: p.birth, death: p.death, deceased: !!p.deceased, fname: p.fname || null,
    father_id: p.father_id, mother_id: p.mother_id, spouse_ids: p.spouse_ids || [] }));
}

/** Zanjir: mas'ul o'z shoxi ichidagi oila uchun yangi havola yaratadi. */
export async function subBranch(tree, bid, b, user, head) {
  if (!branchScope(tree, b.head).has(head)) throw new HttpError(400, 'Bu shaxs sizning shoxingizda emas');
  const ex = Object.entries(tree.branches || {}).find(([, x]) => !x.revoked && x.head === head && x.parent === bid && !x.claimed);
  const nb = ex ? ex[0] : await createBranch(tree.id, head, nameOf(user), { parent: bid, byUid: String(user.id) });
  return { bid: nb, link: brLink(tree.id, nb) };
}

// ---------------------------------------------------------------- takliflar --
const dateOk = (v) => { try { return fullDate(flexDate(v)); } catch { return false; } };
/** Hech qaysi maydon bo'sh qolmasin: ism, tug'ilgan sana, marhum bo'lsa — vafot sanasi. */
export function validateOps(ops, persons) {
  const byId = new Map(persons.map((p) => [p.id, p]));
  for (const o of ops) {
    const f = o.f || {};
    if (o.op === 'add') {
      if (!String(f.name || '').trim()) throw new HttpError(400, 'Ism kiritilmagan');
      if (f.birth && !dateOk(f.birth)) throw new HttpError(400, `${f.name}: tug‘ilgan sana to‘liq kiritilmagan (kun.oy.yil)`);
      if (f.death && !dateOk(f.death)) throw new HttpError(400, `${f.name}: vafot sanasi to‘liq kiritilmagan (kun.oy.yil)`);
    } else if (o.op === 'update') {
      const p = byId.get(o.id);
      if (!p) continue;
      if ('name' in f && !String(f.name || '').trim()) throw new HttpError(400, 'Ism bo‘sh bo‘lishi mumkin emas');
      if (f.birth && !dateOk(f.birth)) throw new HttpError(400, `${p.name}: tug‘ilgan sana to‘liq kiritilmagan (kun.oy.yil)`);
      if (f.death && !dateOk(f.death)) throw new HttpError(400, `${p.name}: vafot sanasi to‘liq kiritilmagan (kun.oy.yil)`);
    }
  }
}

/** Avtomatik tekshiruvlar: farzand ota-onasidan kamida 14 yosh kichik, takroriy odam, ism yozilishi. */
export function checkOps(tree, ops) {
  const warn = [];
  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  const tmp = new Map(ops.filter((o) => o.op === 'add').map((o) => [String(o.tmp), o.f]));
  const yr = (v) => Number(String(v || '').slice(0, 4)) || null;
  const get = (id) => tmp.get(String(id)) || byId.get(id);
  for (const o of ops) {
    const f = o.op === 'add' ? o.f : { ...byId.get(o.id), ...o.f };
    if (!f) continue;
    const by = yr(f.birth);
    const pars = o.op === 'add' ? [o.father, o.mother] : [f.father_id, f.mother_id];
    for (const pid of pars) {
      const pb = yr(get(pid)?.birth);
      if (by && pb && by - pb < 14) warn.push(`${f.name}: ota-onasi ${get(pid).name} dan ${by - pb} yosh kichik (kamida 14 bo‘lishi kerak)`);
    }
    if (o.op === 'add') {
      const k = fuzzyName(f.name);
      const dup = tree.persons.find((p) => fuzzyName(p.name) === k && (!by || !yr(p.birth) || yr(p.birth) === by));
      if (dup) warn.push(`${f.name}: shajarada «${dup.name}»${dup.birth ? ' (' + String(dup.birth).slice(0, 4) + ')' : ''} bor — takror bo‘lishi mumkin`);
    }
  }
  return warn.slice(0, 30);
}

/** Taklifni shajaraga qo'shish, qaytarish uchun avvalgi holatni saqlab. */
export async function applyWithUndo(treeId, pr, who) {
  let undo = null;
  const r = await mutateTree(treeId, (t) => {
    const before = new Set(t.persons.map((p) => p.id));
    const prev = pr.ops.filter((o) => o.op === 'update').map((o) => t.persons.find((p) => p.id === o.id)).filter(Boolean)
      .map((p) => ({ id: p.id, name: p.name, gender: p.gender, birth: p.birth, death: p.death, deceased: p.deceased }));
    const res = applyProposal(t, pr.head, pr.ops, who);
    undo = { prev, created: t.persons.filter((p) => !before.has(p.id)).map((p) => p.id) };
    return res;
  });
  return { status: 'applied', doneAt: new Date().toISOString(), undo, result: r.result, tree: r.data };
}
export async function undoProposal(treeId, pr, who) {
  const gone = new Set(pr.undo?.created || []);
  return mutateTree(treeId, (t) => {
    t.persons = t.persons.filter((p) => !gone.has(p.id));
    for (const p of t.persons) {
      if (gone.has(p.father_id)) p.father_id = null;
      if (gone.has(p.mother_id)) p.mother_id = null;
      p.spouse_ids = (p.spouse_ids || []).filter((x) => !gone.has(x));
      const old = (pr.undo?.prev || []).find((x) => x.id === p.id);
      if (old) Object.assign(p, old);
    }
    t.log = t.log || [];
    t.log.unshift({ at: new Date().toISOString(), who, action: 'undo-import', name: `${gone.size} / ${(pr.undo?.prev || []).length}` });
  });
}

/** Shox to'liqligi: foiz va nimalar yetishmaydi. */
export function branchStats(tree, head) {
  const scope = branchScope(tree, head);
  const list = tree.persons.filter((p) => scope.has(p.id));
  const kidsOfP = (id) => list.some((x) => x.father_id === id || x.mother_id === id);
  const noBirth = list.filter((p) => !fullDate(p.birth)).length;
  const noDeath = list.filter((p) => p.deceased && !fullDate(p.death)).length;
  const noSpouse = list.filter((p) => kidsOfP(p.id) && !(p.spouse_ids || []).length).length;
  const bad = list.filter((p) => !fullDate(p.birth) || (p.deceased && !fullDate(p.death)) || (kidsOfP(p.id) && !(p.spouse_ids || []).length)).length;
  return { total: list.length, noBirth, noDeath, noSpouse, pct: list.length ? Math.round(((list.length - bad) / list.length) * 100) : 100 };
}

/** Mas'ulga eslatma (panel tugmasi va kunlik eslatmalar). */
export async function remindBranch(tree, bid) {
  const b = tree.branches?.[bid];
  if (!b?.claimed) throw new HttpError(400, 'Havola hali hech kim tomonidan ochilmagan');
  const st = branchStats(tree, b.head);
  const l = tree.members?.[b.claimed]?.lang || b.lang || 'uz';
  const head = tree.persons.find((p) => p.id === b.head)?.name || '';
  const r = await tg('sendMessage', { chat_id: b.claimed, parse_mode: 'HTML',
    text: t(l, '🌳 <b>{name}</b> shoxi — {pct}%: {nb} kishining tug‘ilgan sanasi yo‘q, {ns} kishining turmush o‘rtog‘i noma’lum. Bir necha daqiqa ajratib to‘ldirib bersangiz — avlodlar uchun katta xizmat bo‘ladi 🙏', { name: esc(head), pct: st.pct, nb: st.noBirth, ns: st.noSpouse }),
    reply_markup: { inline_keyboard: [[{ text: t(l, '💬 Shu yerda to‘ldirish'), callback_data: `bc:go:${tree.id}_${bid}` }], [{ text: t(l, '✍️ Ilovada to‘ldirish'), web_app: { url: `${URL_()}/?br=${tree.id}_${bid}` } }]] } });
  if (!r.ok) throw new HttpError(502, 'Xabar yuborilmadi (mas’ul botni bloklagan bo‘lishi mumkin)');
  return true;
}

/** Taklifni saqlash va shajara egasi/tahrirchilariga (zanjirda — yuqori mas'ulga ham) xabar berish. */
export async function submitProposal(tree, bid, b, user, ops) {
  ops = (Array.isArray(ops) ? ops : []).slice(0, 500);
  if (!ops.length) throw new HttpError(400, 'O‘zgarish yo‘q');
  // qon qarindoshlar ismida familiya/otasining ismi bo'lsa — faqat ism
  const byId0 = new Map(tree.persons.map((p) => [p.id, p]));
  for (const o of ops) {
    if (!o.f?.name) continue;
    const blood = o.op === 'add' ? !!(o.father || o.mother) : !!(byId0.get(o.id)?.father_id || byId0.get(o.id)?.mother_id);
    if (blood) o.f.name = stripSurname(o.f.name);
  }
  validateOps(ops, tree.persons);
  const uid = String(user.id);
  const key = `props/${tree.id}.json`;
  const item = { id: randomId(10), bid, head: b.head, by: { id: uid, name: nameOf(user) }, at: new Date().toISOString(), status: 'pending', ops, warn: checkOps(tree, ops) };
  // ishonchli mas'ul — tekshiruvdan o'tgan bo'lsa darhol qo'shiladi (qaytarish mumkin)
  if (b.trust && !item.warn.length) { const { tree: _t, ...ap } = await applyWithUndo(tree.id, item, nameOf(user)); Object.assign(item, ap); }
  if (!(await updateJson(key, (d) => { d.items = [item, ...(d.items || [])].slice(0, 300); }))) await writeJson(key, { items: [item] });
  const adds = ops.filter((o) => o.op === 'add').length;
  const head = tree.persons.find((p) => p.id === b.head)?.name || '';
  const html = `📨 <b>${esc(tree.title)}</b>\n<b>${esc(head)}</b> oilasi bo‘yicha yangi ma’lumotlar ${item.status === 'applied' ? 'avtomatik qo‘shildi' : 'keldi'}: +${adds} kishi, ${ops.length - adds} tuzatish.\n👤 ${esc(nameOf(user))}${item.warn.length ? `\n⚠️ ${item.warn.length} ta ogohlantirish` : ''}\n\n${item.status === 'applied' ? 'Xato bo‘lsa — panelda bir tugma bilan qaytarish mumkin 👇' : 'Ko‘rib chiqib tasdiqlang 👇'}`;
  const { notifyEditors } = await import('./notify.js');
  await notifyEditors(tree, html).catch(() => {});
  const up = b.parent && tree.branches?.[b.parent]?.claimed;
  if (up && up !== String(tree.owner)) await tg('sendMessage', { chat_id: up, parse_mode: 'HTML', text: `🔗 ${esc(nameOf(user))} — <b>${esc(head)}</b> oilasi ma’lumotlarini to‘ldirib yubordi. Rahmat!` }).catch(() => {});
  return item;
}

// ---------------------------------------------------------------- kunlik eslatmalar --
/** Shaxsning oila boshi: qon ota-onasi (juft bo'lsa — juftining ota-onasi), bo'lmasa o'zi. */
function familyHead(byId, p) {
  const par = (x) => x && (x.father_id || x.mother_id);
  if (par(p)) return par(p);
  for (const s of p.spouse_ids || []) if (par(byId.get(s))) return par(byId.get(s));
  return p.id;
}

export async function dailyReminders(tree) {
  let sent = 0;
  const c = completeness(tree);
  const owner = tree.owner && String(tree.owner);
  const om = owner && tree.members?.[owner];
  const lang = om?.lang || 'uz';
  if (owner && c.missing.length && om?.notify?.remind !== false) {
    const byId = new Map(tree.persons.map((p) => [p.id, p]));
    const groups = new Map();
    for (const x of c.missing) { const h = familyHead(byId, byId.get(x.id)); groups.set(h, [...(groups.get(h) || []), x]); }
    const top = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6);
    const lines = [];
    for (const [h, xs] of top) {
      let bid = Object.entries(tree.branches || {}).find(([, b]) => !b.revoked && b.head === h)?.[0];
      if (!bid) bid = await createBranch(tree.id, h, 'auto', { auto: true });
      lines.push(`• <b>${esc(byId.get(h)?.name || '?')}</b> ${t(lang, 'oilasi')} — ${xs.length}: ${xs.slice(0, 4).map((x) => esc(x.name || '?')).join(', ')}${xs.length > 4 ? '…' : ''}\n   🔗 ${brLink(tree.id, bid)}`);
    }
    const text = `📋 <b>${esc(tree.title)}</b> — ${t(lang, 'to‘liqlik')}: <b>${c.pct}%</b>\n${t(lang, 'Ma’lumoti to‘liq bo‘lmagan: {n} kishi (tug‘ilgan yoki vafot sanasi yo‘q).', { n: c.missing.length })}\n\n${lines.join('\n')}\n\n${t(lang, 'Havolani o‘sha oiladagi qarindoshga yuboring — u ilovada yoki shu bot yozishmasida to‘ldiradi.')}`;
    const r = await tg('sendMessage', { chat_id: owner, parse_mode: 'HTML', text, disable_web_page_preview: true, reply_markup: { inline_keyboard: [
      [{ text: t(lang, '📊 To‘liqlik paneli'), web_app: { url: `${URL_()}/?props=1` } }],
      [{ text: t(lang, '💬 O‘zim botda to‘ldiraman'), callback_data: `bc:me:${tree.id}` }],
      [{ text: t(lang, '🔕 Eslatmani o‘chirish'), callback_data: `bc:off:${tree.id}` }],
    ] } }).catch(() => null);
    if (r?.ok) sent++;
  }
  // shox mas'ullariga — har 3 kunda, shoxida yetishmayotgan ma'lumot bo'lsa
  if (Math.floor(Date.now() / 864e5) % 3 === 0) {
    for (const [bid, b] of Object.entries(tree.branches || {})) {
      if (b.revoked || !b.claimed || b.claimed === owner) continue;
      const cc = completeness(tree, branchScope(tree, b.head));
      if (!cc.missing.length) continue;
      const l = tree.members?.[b.claimed]?.lang || 'uz';
      const head = tree.persons.find((p) => p.id === b.head)?.name || '';
      const r = await tg('sendMessage', { chat_id: b.claimed, parse_mode: 'HTML',
        text: t(l, '🌳 <b>{name}</b> oilasida hali {n} kishining ma’lumoti yetishmaydi (to‘liqlik {pct}%). Bir necha daqiqa ajratib to‘ldirib bersangiz — avlodlar uchun katta xizmat bo‘ladi 🙏', { name: esc(head), n: cc.missing.length, pct: cc.pct }),
        reply_markup: { inline_keyboard: [[{ text: t(l, '✍️ Ilovada to‘ldirish'), web_app: { url: `${URL_()}/?br=${tree.id}_${bid}` } }], [{ text: t(l, '💬 Shu yerda to‘ldirish'), callback_data: `bc:go:${tree.id}_${bid}` }]] } }).catch(() => null);
      if (r?.ok) sent++;
    }
  }
  return sent;
}

// ---------------------------------------------------------------- bot yozishmasi orqali to'ldirish --
const sKey = (uid) => `brchat/${uid}.json`;
const send = (chat_id, text, kb) => tg('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb ? { inline_keyboard: kb } : undefined });
const isNew = (id) => String(id).startsWith('n');
const yr = (d) => (d ? String(d).slice(0, 4) : '—');
// to'liq sana: 20.03.1958; to'liq bo'lmasa — ❗ bilan
const fd = (d) => (!d ? '❓' : fullDate(d) ? String(d).split('-').reverse().join('.') : `${String(d).split('-').reverse().join('.')} ❗`);
const fmtD = (d) => (!d ? '—' : d.length === 10 ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : d.length === 7 ? `${d.slice(5, 7)}.${d.slice(0, 4)}` : d);

function W_(s) { return new Map(Object.entries(s.W)); }
const kidsOf = (W, id) => [...W.values()].filter((p) => p.father_id === id || p.mother_id === id);
const spousesOf = (W, id) => [...new Set([...(W.get(id)?.spouse_ids || []), ...[...W.values()].filter((p) => p.spouse_ids.includes(id)).map((p) => p.id)])].map((x) => W.get(x)).filter(Boolean);
function order(s) {
  const W = W_(s);
  const out = [];
  const walk = (id) => { if (out.includes(id) || !W.has(id)) return; out.push(id); kidsOf(W, id).forEach((c) => walk(c.id)); };
  walk(s.head);
  return out;
}
const inLaw = (s, x) => !!x && x.id !== s.head && !x.father_id && !x.mother_id && spousesOf(W_(s), x.id).length > 0;
const line = (p) => `${esc(p.name || '?')} (${fd(p.birth)}${p.deceased ? ` – ✝ ${fd(p.death)}` : ''})`;

async function save(uid, s) { s.at = Date.now(); await writeJson(sKey(uid), s); }

export async function chatStart(from, lang, treeId, bid) {
  const { tree, b } = await claimBranch(treeId, bid, from);
  if (b.lang) lang = b.lang;
  const persons = scopePersons(tree, b.head);
  const s = { tree: tree.id, bid, head: b.head, title: tree.title, lang, i: 0, seq: 0, done: [], skip: [], W: Object.fromEntries(persons.map((p) => [p.id, p])), O: Object.fromEntries(persons.map((p) => [p.id, p])) };
  await save(from.id, s);
  await updateUser(from.id, from, (d) => { d.brchat = Date.now(); d.aimode = null; d.pending = null; });
  await send(from.id, t(lang, '💬 Boshladik! Har bir kishi haqida birma-bir savol beraman. Bor ma’lumot ko‘rsatiladi — to‘g‘ri bo‘lsa tasdiqlang, bo‘lmasa tuzating. Bilmasangiz «🤷 Bilmayman»ni bosing.\n\nTo‘xtatish: /bekor'));
  return askQ(from, s);
}

// Ketma-ket savollar: har bir kishi uchun alohida savol, bor ma'lumot oldindan ko'rsatiladi — faqat tasdiqlash yoki tuzatish.
// Savol kalitlari: nm (ism), g (jins), b (tug'ilgan), al (hayotmi), d (vafot), ot (ikkinchi ota-ona), sp (juft), k (farzandlar).
const cleanNm = (v) => String(v || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/([oOgG])[ʻʼ’'`´]/g, '$1‘').replace(/(^|\s)(\S)/g, (m, a, c) => a + c.toUpperCase()).slice(0, 80);
// «Xadicha Bobojonova Rahim qizi» / «… Rahimovna» → ['Xadicha Bobojonova', 'Rahim']
function splitFull(v) {
  const w = String(v).split(' ').filter(Boolean);
  if (w.length < 3) return [w.join(' '), null];
  const rest = w.slice(2).join(' ').replace(/\s+(qizi|o‘g‘li|o'g'li|ўғли|қизи)$/i, '').replace(/(ovna|evna|yevna|ovich|evich|yevich)$/i, '');
  return [w.slice(0, 2).join(' '), rest.split(' ')[0] || null];
}
// Qon qarindoshning «ismi» joyiga familiya va otasining ismi ham yozilsa — faqat ism qoladi
// («Go‘zal Komiljonova Hamidjon qizi» → «Go‘zal»); «Nur Muhammad» kabi qo'sh ismlar o'zgarmaydi.
const SURNAME = /^\S+(ov|ova|ev|eva|yev|yeva|ovich|evich|ovna|evna|yevna)$/i;
export function stripSurname(name) {
  const w = String(name || '').trim().split(/\s+/);
  if (w.length < 2) return w.join(' ');
  if (SURNAME.test(w[1]) || /(^|\s)(qizi|o[‘'’`ʻ]?g[‘'’`ʻ]?li|қизи|ўғли)$/i.test(w.slice(1).join(' '))) return w[0];
  return w.join(' ');
}
const isKid = (x) => !!(x.father_id || x.mother_id);

function visitList(s) {
  const W = W_(s);
  const skip = new Set(s.skip || []);
  const out = [];
  const walk = (id) => { if (out.includes(id) || !W.has(id) || skip.has(id)) return; out.push(id); kidsOf(W, id).forEach((c) => walk(c.id)); };
  walk(s.head);
  return out;
}
function personKeys(s, x) {
  const k = [];
  // turmush o'rtog'i: ism, familiya va otasining ismi — bitta savolda
  if (!String(x.name || '').trim() || (inLaw(s, x) && (words(x.name) < 2 || !x.fname))) k.push('nm:' + x.id);
  if (isNew(x.id) && isKid(x)) k.push('g:' + x.id);
  k.push('b:' + x.id, 'al:' + x.id);
  if (x.deceased) k.push('d:' + x.id);
  const par = x.father_id || x.mother_id;
  if (isNew(x.id) && isKid(x) && spousesOf(W_(s), par).length > 1) k.push('ot:' + x.id);
  return k;
}
function nextQ(s) {
  const W = W_(s);
  const done = new Set(s.done || []);
  const vl = visitList(s);
  const seen = new Set();
  for (const id of vl) {
    for (const k of personKeys(s, W.get(id))) if (!done.has(k)) return k;
    const sps = spousesOf(W, id);
    for (const x of sps) {
      if (seen.has(x.id) || vl.includes(x.id)) continue;
      seen.add(x.id);
      for (const k of personKeys(s, x)) if (!done.has(k)) return k;
    }
    if (!sps.length && !done.has('sp:' + id)) return 'sp:' + id;
    if (!done.has('k:' + id)) return 'k:' + id;
  }
  return null;
}
function addKids(s, pid, n) {
  const W = W_(s);
  const p = W.get(pid);
  const o = spousesOf(W, pid).slice(-1)[0];
  for (let i = 0; i < Math.min(n, 20); i++) {
    const id = 'n' + (++s.seq);
    const x = { id, name: '', gender: null, birth: null, death: null, deceased: false, father_id: null, mother_id: null, spouse_ids: [] };
    if (p.gender === 'f') { x.mother_id = pid; x.father_id = o?.id || null; } else { x.father_id = pid; x.mother_id = o?.id || null; }
    s.W[id] = x;
  }
}
const markDone = (s, k) => { s.done = [...(s.done || []).filter((x) => x !== k), k]; };

async function askQ(from, s) {
  const key = nextQ(s);
  s.cur = key;
  s.wait = null;
  if (!key) return finish(from, s);
  const L = s.lang;
  const [f, id] = key.split(':');
  const W = W_(s);
  const x = W.get(id);
  const nm = `<b>${esc(x.name || '?')}</b>`;
  const vl = visitList(s);
  const pos = Math.max(0, vl.indexOf(vl.includes(id) ? id : (spousesOf(W, id).find((y) => vl.includes(y.id))?.id || x.father_id || x.mother_id)));
  const par = W.get(x.father_id || x.mother_id);
  const role = inLaw(s, x) ? `💍 ${t(L, '{name} — turmush o‘rtog‘i', { name: esc(spousesOf(W, id)[0]?.name || '') })}\n`
    : isNew(id) && par ? `👶 ${t(L, '{name} — farzandi', { name: esc(par.name || '') })}\n` : '';
  const head = `🌳 <b>${esc(s.title)}</b> · ${pos + 1}/${vl.length}\n\n${role}`;
  const U = { text: t(L, '🤷 Bilmayman'), callback_data: 'bc:u' };
  const Y = { text: t(L, '✅ To‘g‘ri'), callback_data: 'bc:y' };
  const E = { text: t(L, '✏️ Tuzatish'), callback_data: 'bc:e' };
  let text;
  let kb = [];
  if (f === 'nm') {
    s.wait = { f: 'name', id };
    text = inLaw(s, x) ? t(L, '✍️ {who} — ismi, familiyasi va otasining ismini yozing (masalan: Toshmat Eshmatov Yormatovich):', { who: nm })
      : par && isNew(id) ? t(L, '✍️ {name}ning {n}-farzandi ismini yozing (faqat ismi, familiyasiz):', { name: esc(par.name || ''), n: kidsOf(W, par.id).findIndex((k) => k.id === id) + 1 }) : t(L, '✍️ Ismini yozing:');
    if (x.name) kb = [[U]];
  } else if (f === 'g') {
    text = t(L, '{who} — o‘g‘ilmi yoki qiz?', { who: nm });
    kb = [[{ text: t(L, '👦 O‘g‘il'), callback_data: 'bc:g:m' }, { text: t(L, '👧 Qiz'), callback_data: 'bc:g:f' }]];
  } else if (f === 'b') {
    if (fullDate(x.birth)) { text = t(L, '👤 {who} — {date} da tug‘ilgan, to‘g‘rimi?', { who: nm, date: fd(x.birth) }); kb = [[Y, E]]; }
    else {
      s.wait = { f: 'birth', id };
      text = t(L, '📅 {who} qachon tug‘ilgan? To‘liq sanani yozing: kun.oy.yil (masalan: 20.03.1958).', { who: nm }) + (x.birth ? `\n${t(L, 'Hozir yozilgan: {d}', { d: fd(x.birth) })}` : '');
      kb = [[U]];
    }
    // shox ichidagi katta oila — o'zi to'ldirsin (zanjirli topshirish)
    if (!isNew(id) && id !== s.head && vl.includes(id)) kb.push([{ text: t(L, '🔗 Bu oilani o‘zi to‘ldirsin'), callback_data: `bc:dl:${id}` }]);
  } else if (f === 'al') {
    if (x.deceased) { text = t(L, '🤲 {who} vafot etgan — to‘g‘rimi?', { who: nm }); kb = [[Y, { text: t(L, '💚 Yo‘q, hayot'), callback_data: 'bc:al:1' }]]; }
    else { text = t(L, '{who} hozir hayotmi?', { who: nm }); kb = [[{ text: t(L, '💚 Hayot'), callback_data: 'bc:al:1' }, { text: t(L, '🤲 Vafot etgan'), callback_data: 'bc:al:0' }], [U]]; }
  } else if (f === 'd') {
    if (fullDate(x.death)) { text = t(L, '🤲 {who} — {date} da vafot etgan, to‘g‘rimi?', { who: nm, date: fd(x.death) }); kb = [[Y, E], [U]]; }
    else { s.wait = { f: 'death', id }; text = t(L, '🤲 {who} qachon vafot etgan? To‘liq sanani yozing: kun.oy.yil (masalan: 05.06.2001).', { who: nm }); kb = [[U]]; }
  } else if (f === 'ot') {
    text = t(L, '{who} — onasi/otasi kim?', { who: nm });
    kb = [...spousesOf(W, x.father_id || x.mother_id).map((sp) => [{ text: sp.name, callback_data: `bc:op:${sp.id}` }]), [U]];
  } else if (f === 'sp') {
    s.wait = { f: 'sp', id };
    text = t(L, '💍 {who}ning turmush o‘rtog‘i kim? Ismi, familiyasi va otasining ismini yozing (masalan: Toshmat Eshmatov Yormatovich).', { who: nm });
    kb = [[{ text: t(L, '🚫 Turmush qurmagan'), callback_data: 'bc:u' }], [U]];
  } else if (f === 'k') {
    const kids = kidsOf(W, id);
    if (kids.length) {
      text = t(L, '👶 {who}ning farzandlari ({n}): {list}.\nHammasi shumi?', { who: nm, n: kids.length, list: kids.map((k) => esc(k.name || '?')).join(', ') });
      kb = [[{ text: t(L, '✅ Ha, shular'), callback_data: 'bc:y' }], [{ text: t(L, '➕ Yana farzandi bor'), callback_data: 'bc:more' }], [U]];
    } else {
      text = t(L, '👶 {who}ning nechta farzandi bor?', { who: nm });
      kb = [[0, 1, 2, 3].map((n) => ({ text: String(n), callback_data: `bc:n:${n}` })), [4, 5, 6, 7].map((n) => ({ text: String(n), callback_data: `bc:n:${n}` })),
        [{ text: '8+', callback_data: 'bc:nx' }, U]];
    }
  }
  kb.push([...((s.done || []).length ? [{ text: t(L, '⬅️ Orqaga'), callback_data: 'bc:bk' }] : []),
    { text: t(L, '📨 Yakunlash'), callback_data: 'bc:fin' }]);
  await save(from.id, s);
  return send(from.id, head + text, kb);
}

/** Matnli javob. true — xabar shu oqimga tegishli edi. */
export async function chatText(from, text) {
  const s = (await readJson(sKey(from.id)))?.data;
  if (!s) return false;
  const L = s.lang;
  if (/^\/(bekor|cancel)/.test(text)) {
    await deleteKey(sKey(from.id)).catch(() => {});
    await updateUser(from.id, from, (d) => { d.brchat = null; });
    await send(from.id, t(L, 'To‘xtatildi. Kiritganlaringiz yuborilmadi. Qayta boshlash uchun havolani yana oching.'));
    return true;
  }
  const w = s.wait;
  if (!w) { await send(from.id, t(L, 'Iltimos, tugmalardan birini bosing 👆')); return true; }
  const x = s.W[w.id];
  const v = String(text || '').trim();
  if (w.f === 'name' || w.f === 'sp') {
    const name = cleanNm(v);
    if (!name || name.startsWith('/')) { await send(from.id, t(L, 'Ism bo‘sh bo‘lmasin. Qayta yozing:')); return true; }
    if (w.f === 'sp' || inLaw(s, x)) {
      // «Xadicha Bobojonova Rahim qizi» → ism+familiya va otasining ismi
      const [full, fn] = splitFull(name);
      if (words(full) < 2) { await send(from.id, t(L, 'Familiyasi ham kerak. Ismi, familiyasi va otasining ismini yozing (masalan: Toshmat Eshmatov Yormatovich):'), [[{ text: t(L, '🤷 Bilmayman'), callback_data: 'bc:u' }]]); return true; }
      if (w.f === 'sp') {
        const id = 'n' + (++s.seq);
        s.W[id] = { id, name: full, fname: fn, gender: x.gender === 'f' ? 'm' : 'f', birth: null, death: null, deceased: false, father_id: null, mother_id: null, spouse_ids: [w.id] };
        markDone(s, 'sp:' + w.id);
        markDone(s, 'nm:' + id);
      } else {
        x.name = full;
        if (fn) x.fname = fn;
        if (s.cur === 'nm:' + w.id) markDone(s, s.cur);
      }
    } else {
      x.name = stripSurname(name);
      if (x.name !== name) await send(from.id, t(L, 'ℹ️ Faqat ism saqlandi: <b>{name}</b> — familiya va otasining ismi shajaradan avtomatik olinadi.', { name: esc(x.name) }));
      if (s.cur === 'nm:' + w.id) markDone(s, s.cur);
    }
  } else if (w.f === 'fname') {
    const fn = cleanNm(v).split(' ')[0];
    if (!fn) { await send(from.id, t(L, 'Ism bo‘sh bo‘lmasin. Qayta yozing:')); return true; }
    x.fname = fn;
    markDone(s, 'fn:' + w.id);
  } else if (w.f === 'count') {
    const n = Number(v);
    if (!(n >= 0 && n <= 30)) { await send(from.id, t(L, 'Raqam yozing, masalan: 9')); return true; }
    addKids(s, w.id, n);
    markDone(s, 'k:' + w.id);
  } else {
    let d = null;
    try { d = flexDate(v); } catch {}
    if (!fullDate(d)) { await send(from.id, t(L, 'Sana to‘liq emas yoki noto‘g‘ri. Kun.oy.yil shaklida yozing, masalan: 20.03.1958'), [[{ text: t(L, '🤷 Bilmayman'), callback_data: 'bc:u' }]]); return true; }
    x[w.f] = d;
    const k = (w.f === 'birth' ? 'b:' : 'd:') + w.id;
    if (s.cur === k) markDone(s, k);
  }
  await askQ(from, s);
  return true;
}

function diffOps(s) {
  const ops = [];
  for (const x of Object.values(s.W)) {
    if (isNew(x.id)) {
      if (!String(x.name || '').trim()) continue; // ismi yozilmagan farzand — tashlab yuboriladi
      ops.push({ op: 'add', tmp: x.id, f: { name: x.name, gender: x.gender || 'm', birth: x.birth, death: x.death || null, deceased: !!x.deceased, fname: x.fname || null }, father: x.father_id, mother: x.mother_id, spouse: x.spouse_ids[0] || null });
      continue;
    }
    const o = s.O[x.id];
    const f = {};
    for (const k of ['name', 'gender', 'birth', 'death', 'fname']) if ((x[k] || null) !== (o[k] || null)) f[k] = x[k];
    if (!!x.deceased !== !!o.deceased) f.deceased = !!x.deceased;
    if (Object.keys(f).length) ops.push({ op: 'update', id: x.id, f });
  }
  return ops;
}

export async function chatCallback(cq, lang) {
  const from = cq.from;
  const data = cq.data;
  const answer = (text) => tg('answerCallbackQuery', { callback_query_id: cq.id, text });
  const [, act, arg] = data.split(':');
  // havoladan yoki eslatmadan boshlash
  if (act === 'go' || act === 'me' || act === 'off') {
    answer();
    if (act === 'off') {
      await mutateTree(arg, (t) => { const m = t.members?.[String(from.id)]; if (m) m.notify = { ...(m.notify || {}), remind: false }; }).catch(() => {});
      return send(from.id, t(lang, '🔕 Kunlik eslatma o‘chirildi.'));
    }
    try {
      if (act === 'go') { const [tr, b] = arg.split('_'); return await chatStart(from, lang, tr, b); }
      const tree = await loadTree(arg);
      if (String(tree.owner) !== String(from.id)) return send(from.id, '⚠️');
      const root = tree.meta?.root_id || tree.persons[0]?.id;
      let bid = Object.entries(tree.branches || {}).find(([, b]) => !b.revoked && b.head === root && b.claimed === String(from.id))?.[0];
      if (!bid) bid = await createBranch(tree.id, root, nameOf(from), { self: true });
      return await chatStart(from, lang, tree.id, bid);
    } catch (e) { return send(from.id, '⚠️ ' + t(lang, e.message)); }
  }
  const s = (await readJson(sKey(from.id)))?.data;
  if (!s) { answer(t(lang, 'Sessiya tugagan. Havolani qayta oching.')); return; }
  answer();
  const L = s.lang;
  const cur = s.cur;
  const [cf, cid] = String(cur || '').split(':');
  const x = s.W[cid];
  if (act === 'fin') return finish(from, s);
  if (act === 'bk') { s.done = (s.done || []).slice(0, -1); return askQ(from, s); }
  if (!cur) return askQ(from, s);
  if (act === 'y' || act === 'u') { markDone(s, cur); return askQ(from, s); }
  if (act === 'e') {
    if (cf === 'd') { s.wait = { f: 'death', id: cid }; await save(from.id, s); return send(from.id, t(L, '🤲 {who} qachon vafot etgan? To‘liq sanani yozing: kun.oy.yil (masalan: 05.06.2001).', { who: `<b>${esc(x.name)}</b>` })); }
    return send(from.id, t(L, 'Nimani tuzatamiz?'), [[{ text: t(L, '✍️ Ismi'), callback_data: 'bc:ef:name' }, { text: t(L, '📅 Tug‘ilgan sana'), callback_data: 'bc:ef:birth' }], [{ text: t(L, '⬅️ Orqaga'), callback_data: 'bc:re' }]]);
  }
  if (act === 're') return askQ(from, s);
  if (act === 'ef') {
    s.wait = { f: arg === 'name' ? 'name' : 'birth', id: cid };
    await save(from.id, s);
    return send(from.id, arg === 'name' ? (inLaw(s, x) ? t(L, '✍️ Ismi, familiyasi va otasining ismini yozing (masalan: Toshmat Eshmatov Yormatovich):') : t(L, '✍️ Ismini yozing:'))
      : t(L, '📅 {who} qachon tug‘ilgan? To‘liq sanani yozing: kun.oy.yil (masalan: 20.03.1958).', { who: `<b>${esc(x.name)}</b>` }));
  }
  if (act === 'g' && cf === 'g') { x.gender = arg === 'f' ? 'f' : 'm'; markDone(s, cur); return askQ(from, s); }
  if (act === 'al' && cf === 'al') { x.deceased = arg === '0'; if (!x.deceased) x.death = null; markDone(s, cur); return askQ(from, s); }
  if (act === 'op' && cf === 'ot') { const o = s.W[arg]; if (o) { if (o.gender === 'f') x.mother_id = arg; else x.father_id = arg; } markDone(s, cur); return askQ(from, s); }
  if (act === 'n' && cf === 'k') { addKids(s, cid, Number(arg) || 0); markDone(s, cur); return askQ(from, s); }
  if (act === 'more' && cf === 'k') {
    return send(from.id, t(L, 'Yana nechta farzandi bor?'), [[1, 2, 3, 4].map((n) => ({ text: '+' + n, callback_data: `bc:n:${n}` })), [5, 6, 7].map((n) => ({ text: '+' + n, callback_data: `bc:n:${n}` })), [{ text: t(L, '⬅️ Orqaga'), callback_data: 'bc:re' }]]);
  }
  if (act === 'nx' && cf === 'k') { s.wait = { f: 'count', id: cid }; await save(from.id, s); return send(from.id, t(L, 'Nechta? Raqam yozing:')); }
  if (act === 'dl') {
    const p = s.W[arg];
    if (!p || isNew(arg)) return askQ(from, s);
    try {
      const tree = await loadTree(s.tree);
      const b = tree.branches?.[s.bid];
      if (!b || b.claimed !== String(from.id)) throw new HttpError(403, 'Havola bekor qilingan');
      const r = await subBranch(tree, s.bid, b, from, arg);
      const msg = t(L, 'Assalomu alaykum! Iltimos «{title}» shajarasidagi {name} oilasi ma’lumotlarini to‘ldirishda yordam bersangiz.\n\nHavola:', { title: s.title, name: p.name });
      await send(from.id, t(L, '🔗 <b>{name}</b> oilasini shu oiladagi kishiga topshiring. Pastdagi tugmani bosib, kimga yuborishni tanlang 👇', { name: esc(p.name) }),
        [[{ text: t(L, '📤 Kimga yuborishni tanlash'), url: `https://t.me/share/url?url=${encodeURIComponent(`${msg} ${r.link}`)}` }]]);
      s.skip = [...new Set([...(s.skip || []), arg])];
      return askQ(from, s);
    } catch (e) { return send(from.id, '⚠️ ' + t(L, e.message)); }
  }
  return askQ(from, s);
}

/** Daftar rasmi: AI odamlarni ajratadi va ular joriy shoxga qo'shiladi — so'ng odatdagidek savollar bilan tasdiqlanadi. */
export async function chatMedia(from, content) {
  const s = (await readJson(sKey(from.id)))?.data;
  if (!s) return false;
  const L = s.lang;
  await send(from.id, t(L, '🔎 Tahlil qilinmoqda… biroz kuting.'));
  try {
    const { extractFamily } = await import('./ai.js');
    const ctx = Object.values(s.W).map((p) => `${p.name}${p.birth ? ' (' + p.birth.slice(0, 4) + ')' : ''}`).join(', ');
    const { rows } = await extractFamily([...content, { type: 'text', text: `Context — the family already known: ${ctx}.` }], L);
    if (!rows.length) { await send(from.id, t(L, 'Hech kim aniqlanmadi. Ismlarni aniqroq aytib qayta yuboring.')); return true; }
    const { planGraph } = await import('./tree.js');
    const persons = Object.values(s.W).map((p) => ({ ...p, spouse_ids: p.spouse_ids || [] }));
    const { matched } = planGraph({ persons }, rows);
    const idOf = new Map();
    let added = 0;
    for (const r of rows) {
      const m = matched.get(String(r.id));
      if (m) { idOf.set(String(r.id), m.id); const x = s.W[m.id]; if (r.birth && !fullDate(x.birth)) { try { const d = flexDate(r.birth); if (d) x.birth = d; } catch {} } continue; }
      if (!String(r.name || '').trim()) continue;
      const id = 'n' + (++s.seq);
      idOf.set(String(r.id), id);
      let birth = null;
      try { birth = r.birth ? flexDate(r.birth) : null; } catch {}
      s.W[id] = { id, name: cleanNm(r.name), gender: r.gender === 'f' ? 'f' : r.gender === 'm' ? 'm' : null, birth, death: null, deceased: !!r.death, father_id: null, mother_id: null, spouse_ids: [] };
      added++;
    }
    for (const r of rows) {
      const id = idOf.get(String(r.id));
      if (!id || !isNew(id)) continue;
      const x = s.W[id];
      x.father_id = idOf.get(String(r.father)) || null;
      x.mother_id = idOf.get(String(r.mother)) || null;
      const sp = idOf.get(String(r.spouse));
      if (sp) x.spouse_ids = [sp];
      if (!x.father_id && !x.mother_id && !sp) delete s.W[id]; // bog'lanmagan — shoxga tegishli emas
    }
    await send(from.id, t(L, '✅ {n} ta yangi kishi aniqlandi. Endi ularni birma-bir tasdiqlaymiz.', { n: added }));
    await askQ(from, s);
  } catch (e) { console.error('photo', e); await send(from.id, t(L, 'AI tahlil qila olmadi. Keyinroq urinib ko‘ring yoki matn bilan yozing.')); }
  return true;
}

async function finish(from, s) {
  const L = s.lang;
  const ops = diffOps(s);
  await deleteKey(sKey(from.id)).catch(() => {});
  await updateUser(from.id, from, (d) => { d.brchat = null; });
  if (!ops.length) return send(from.id, t(L, 'Rahmat! Hamma ma’lumot to‘g‘ri ekan — o‘zgarish yo‘q.'));
  try {
    const tree = await loadTree(s.tree);
    const b = tree.branches?.[s.bid];
    if (!b || b.revoked || b.claimed !== String(from.id)) throw new HttpError(403, 'Havola eskirgan yoki bekor qilingan');
    const item = await submitProposal(tree, s.bid, b, from, ops);
    return send(from.id, item.status === 'applied' ? `🎉 ${t(L, 'Rahmat! Ma’lumotlar shajaraga qo‘shildi.')}`
      : `🎉 ${t(L, 'Rahmat! Ma’lumotlar yuborildi.')}\n${t(L, 'Shajara egasi tekshirib tasdiqlagach, ular shajaraga qo‘shiladi. Natija haqida bot xabar beradi.')}`);
  } catch (e) { return send(from.id, '⚠️ ' + t(L, e.message)); }
}
