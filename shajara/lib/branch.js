// Shox mas'uli: havola orqali oila tarmog'ini to'ldirish (ilova yoki bot yozishmasi),
// zanjirli topshirish, to'liqlik hisobi va kunlik eslatmalar.
import { readJson, writeJson, updateJson, deleteKey } from './store.js';
import { loadTree, mutateTree, branchScope, flexDate, HttpError } from './tree.js';
import { randomId } from './auth.js';
import { tg } from './telegram.js';
import { escapeHtml as esc } from './notify.js';
import { t } from './i18n.js';
import { updateUser } from './users.js';

const BOT = () => process.env.BOT_USERNAME || 'ShajaraAiBot';
const URL_ = () => (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const nameOf = (u) => [u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.username || 'Telegram';
export const brLink = (treeId, bid) => `https://t.me/${BOT()}?start=br_${treeId}_${bid}`;

// ---------------------------------------------------------------- to'liqlik --
/** Shaxsda yetishmayotgan maydonlar. */
export function missingOf(p) {
  const m = [];
  if (!String(p.name || '').trim()) m.push('name');
  if (!p.birth) m.push('birth');
  if (p.deceased && !p.death) m.push('death');
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
  await mutateTree(treeId, (t) => { t.branches = { ...(t.branches || {}), [bid]: { head, at: new Date().toISOString(), by, claimed: null, ...extra } }; });
  return bid;
}

/** Havolani ochgan foydalanuvchiga biriktirish (birinchi ochgan egallaydi). */
export async function claimBranch(treeId, bid, user) {
  const tree = await loadTree(treeId).catch(() => null);
  const b = tree?.branches?.[bid];
  if (!tree || !b || b.revoked || !tree.persons.some((p) => p.id === b.head)) throw new HttpError(404, 'Havola eskirgan yoki bekor qilingan');
  const uid = String(user.id);
  if (b.claimed && b.claimed !== uid) throw new HttpError(403, 'Bu havola boshqa kishiga biriktirilgan. Shajara egasidan yangi havola so‘rang');
  if (!b.claimed) {
    await mutateTree(treeId, (t) => { Object.assign(t.branches[bid], { claimed: uid, claimedName: nameOf(user), claimedAt: new Date().toISOString() }); });
    b.claimed = uid;
  }
  return { tree, b };
}

export function scopePersons(tree, head) {
  const scope = branchScope(tree, head);
  return tree.persons.filter((p) => scope.has(p.id)).map((p) => ({ id: p.id, name: p.name, gender: p.gender, birth: p.birth, death: p.death, deceased: !!p.deceased,
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
const dateOk = (v) => { try { return !!flexDate(v); } catch { return false; } };
/** Hech qaysi maydon bo'sh qolmasin: ism, tug'ilgan sana, marhum bo'lsa — vafot sanasi. */
export function validateOps(ops, persons) {
  const byId = new Map(persons.map((p) => [p.id, p]));
  for (const o of ops) {
    const f = o.f || {};
    if (o.op === 'add') {
      if (!String(f.name || '').trim()) throw new HttpError(400, 'Ism kiritilmagan');
      if (!dateOk(f.birth)) throw new HttpError(400, `${f.name}: tug‘ilgan sana kiritilmagan`);
      if (f.deceased && !dateOk(f.death)) throw new HttpError(400, `${f.name}: vafot sanasi kiritilmagan`);
    } else if (o.op === 'update') {
      const p = byId.get(o.id);
      if (!p) continue;
      if ('name' in f && !String(f.name || '').trim()) throw new HttpError(400, 'Ism bo‘sh bo‘lishi mumkin emas');
      if ('birth' in f && !dateOk(f.birth)) throw new HttpError(400, `${p.name}: tug‘ilgan sana kiritilmagan`);
      const dec = 'deceased' in f ? f.deceased : p.deceased;
      if (dec && !dateOk('death' in f ? f.death : p.death)) throw new HttpError(400, `${p.name}: vafot sanasi kiritilmagan`);
    }
  }
}

/** Taklifni saqlash va shajara egasi/tahrirchilariga (zanjirda — yuqori mas'ulga ham) xabar berish. */
export async function submitProposal(tree, bid, b, user, ops) {
  ops = (Array.isArray(ops) ? ops : []).slice(0, 500);
  if (!ops.length) throw new HttpError(400, 'O‘zgarish yo‘q');
  validateOps(ops, tree.persons);
  const uid = String(user.id);
  const key = `props/${tree.id}.json`;
  const item = { id: randomId(10), bid, head: b.head, by: { id: uid, name: nameOf(user) }, at: new Date().toISOString(), status: 'pending', ops };
  if (!(await updateJson(key, (d) => { d.items = [item, ...(d.items || [])].slice(0, 300); }))) await writeJson(key, { items: [item] });
  const adds = ops.filter((o) => o.op === 'add').length;
  const head = tree.persons.find((p) => p.id === b.head)?.name || '';
  const html = `📨 <b>${esc(tree.title)}</b>\n<b>${esc(head)}</b> oilasi bo‘yicha yangi ma’lumotlar keldi: +${adds} kishi, ${ops.length - adds} tuzatish.\n👤 ${esc(nameOf(user))}\n\nKo‘rib chiqib tasdiqlang 👇`;
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
        reply_markup: { inline_keyboard: [[{ text: t(l, '✍️ Ilovada to‘ldirish'), web_app: { url: `${URL_()}/?br=${tree.id}_${bid}` } }], [{ text: t(l, '💬 Shu yerda yozishma orqali'), callback_data: `bc:go:${tree.id}_${bid}` }]] } }).catch(() => null);
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
const line = (p) => `${esc(p.name || '?')} (${yr(p.birth)}${p.deceased ? ` – ✝ ${yr(p.death)}` : ''})`;

async function save(uid, s) { s.at = Date.now(); await writeJson(sKey(uid), s); }

export async function chatStart(from, lang, treeId, bid) {
  const { tree, b } = await claimBranch(treeId, bid, from);
  const persons = scopePersons(tree, b.head);
  const s = { tree: tree.id, bid, head: b.head, title: tree.title, lang, i: 0, seq: 0, ask: null, W: Object.fromEntries(persons.map((p) => [p.id, p])), O: Object.fromEntries(persons.map((p) => [p.id, p])) };
  await save(from.id, s);
  await updateUser(from.id, from, (d) => { d.brchat = Date.now(); d.aimode = null; d.pending = null; });
  await send(from.id, t(lang, '💬 Boshladik! Har bir oila uchun savol beraman. Javobni oddiy xabar qilib yozing yoki tugmalarni bosing. Barcha maydonlar to‘ldirilishi shart — aniq sanani bilmasangiz, taxminiy yilni yozing.\n\nTo‘xtatish: /bekor'));
  return step(from, s);
}

/** Navbatdagi savol: avval kartadagi kishilarning yetishmayotgan maydonlari, so'ng karta. */
async function step(from, s) {
  const W = W_(s);
  const ids = order(s);
  if (s.i >= ids.length) s.i = ids.length - 1;
  const p = W.get(ids[s.i]);
  for (const x of [p, ...spousesOf(W, p.id)]) {
    const miss = missingOf(x);
    if (miss.length) { s.ask = { k: miss[0], pid: x.id }; await save(from.id, s); return ask(from, s); }
  }
  s.ask = null;
  await save(from.id, s);
  const L = s.lang;
  const sps = spousesOf(W, p.id);
  const kids = kidsOf(W, p.id);
  const text = `🌳 <b>${esc(s.title)}</b> · ${s.i + 1}/${ids.length}\n\n👤 <b>${line(p)}</b>\n💍 ${t(L, 'Turmush o‘rtog‘i')}: ${sps.map(line).join(', ') || '—'}\n👶 ${t(L, 'Farzandlari')} (${kids.length}): ${kids.map(line).join(', ') || '—'}\n\n${t(L, 'Hammasi to‘g‘rimi? Yetishmagan farzand yoki turmush o‘rtog‘i bo‘lsa — qo‘shing.')}`;
  const kb = [
    [{ text: t(L, '✅ To‘g‘ri, keyingisi'), callback_data: 'bc:ok' }],
    [{ text: t(L, '➕ Farzand'), callback_data: 'bc:kid' }, { text: t(L, '➕ Turmush o‘rtog‘i'), callback_data: 'bc:sp' }],
    [{ text: t(L, '✏️ Tuzatish'), callback_data: 'bc:edit' }, { text: t(L, '🔗 Boshqaga topshirish'), callback_data: 'bc:dlg' }],
    [...(s.i > 0 ? [{ text: t(L, '⬅️ Orqaga'), callback_data: 'bc:prev' }] : []), { text: t(L, '📨 Yakunlash'), callback_data: 'bc:fin' }],
  ];
  return send(from.id, text, kb);
}

async function ask(from, s) {
  const L = s.lang;
  const a = s.ask;
  const x = s.W[a.pid];
  const who = esc(x?.name || '');
  const Q = {
    name: [t(L, '✍️ Ismini yozing:'), null],
    gender: [t(L, '<b>{who}</b> — o‘g‘ilmi yoki qiz?', { who }), [[{ text: t(L, '👦 O‘g‘il'), callback_data: 'bc:g:m' }, { text: t(L, '👧 Qiz'), callback_data: 'bc:g:f' }]]],
    birth: [t(L, '📅 <b>{who}</b> qachon tug‘ilgan? Yil yoki to‘liq sana yozing (masalan: 1958 yoki 20.03.1958). Aniq bilmasangiz — taxminiy yilni yozing.', { who }), null],
    alive: [t(L, '<b>{who}</b> hozir hayotmi?', { who }), [[{ text: t(L, '💚 Hayot'), callback_data: 'bc:al:1' }, { text: t(L, '🤲 Vafot etgan'), callback_data: 'bc:al:0' }]]],
    death: [t(L, '🤲 <b>{who}</b> qachon vafot etgan? Yil yoki to‘liq sana (masalan: 2001 yoki 05.06.2001).', { who }), null],
    other: [t(L, '<b>{who}</b> — onasi/otasi kim?', { who }), spousesOf(W_(s), a.parent).map((sp) => [{ text: sp.name, callback_data: `bc:op:${sp.id}` }])],
  }[a.k];
  return send(from.id, Q[0], Q[1] ? [...Q[1], [{ text: t(L, '✖️ Bekor qilish'), callback_data: 'bc:cancel' }]] : undefined);
}

// yangi kishi qo'shish ketma-ketligi: ism → (farzand: jins) → tug'ilgan → hayotmi → (vafot) → (bir nechta juft: ikkinchi ota-ona)
function nextAsk(s) {
  const a = s.ask;
  const x = s.W[a.pid];
  if (!a.add) return null;
  const seq = a.add === 'kid' ? ['name', 'gender', 'birth', 'alive', 'death', 'other'] : ['name', 'birth', 'alive', 'death'];
  for (let j = seq.indexOf(a.k) + 1; j < seq.length; j++) {
    const k = seq[j];
    if (k === 'death' && !x.deceased) continue;
    if (k === 'other' && spousesOf(W_(s), a.parent).length < 2) continue;
    return { ...a, k };
  }
  return null;
}

async function answered(from, s) {
  const n = s.ask && (s.ask.add ? nextAsk(s) : null);
  if (n) { s.ask = n; await save(from.id, s); return ask(from, s); }
  // tuzatish (bitta maydon): marhum bo'lsa vafot sanasini ham so'raymiz — step() buni o'zi tutadi
  s.ask = null;
  return step(from, s);
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
  if (!s.ask || !['name', 'birth', 'death'].includes(s.ask.k)) { await send(from.id, t(L, 'Iltimos, tugmalardan birini bosing 👆')); return true; }
  const x = s.W[s.ask.pid];
  const v = String(text || '').trim();
  if (s.ask.k === 'name') {
    const name = v.replace(/[\u0000-\u001f]/g, ' ').slice(0, 80);
    if (!name || name.startsWith('/')) { await send(from.id, t(L, 'Ism bo‘sh bo‘lmasin. Qayta yozing:')); return true; }
    x.name = name;
  } else {
    let d = null;
    try { d = flexDate(v); } catch {}
    if (!d) { await send(from.id, t(L, 'Sana formati noto‘g‘ri. Masalan: 1958 yoki 20.03.1958')); return true; }
    x[s.ask.k] = d;
  }
  await answered(from, s);
  return true;
}

function diffOps(s) {
  const ops = [];
  for (const x of Object.values(s.W)) {
    if (isNew(x.id)) {
      ops.push({ op: 'add', tmp: x.id, f: { name: x.name, gender: x.gender, birth: x.birth, death: x.death || null, deceased: !!x.deceased }, father: x.father_id, mother: x.mother_id, spouse: x.spouse_ids[0] || null });
      continue;
    }
    const o = s.O[x.id];
    const f = {};
    for (const k of ['name', 'gender', 'birth', 'death']) if ((x[k] || null) !== (o[k] || null)) f[k] = x[k];
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
  const W = W_(s);
  const ids = order(s);
  const p = W.get(ids[s.i]);
  if (act === 'cancel') {
    // qo'shilayotgan yangi kishini tashlab yuborish
    if (s.ask?.add) delete s.W[s.ask.pid];
    s.ask = null;
    return step(from, s);
  }
  if (act === 'ok') {
    if (s.i < ids.length - 1) { s.i++; return step(from, s); }
    return finish(from, s);
  }
  if (act === 'prev') { s.i = Math.max(0, s.i - 1); return step(from, s); }
  if (act === 'fin') return finish(from, s);
  if (act === 'kid' || act === 'sp') {
    const id = 'n' + (++s.seq);
    const x = { id, name: '', gender: act === 'sp' ? (p.gender === 'f' ? 'm' : 'f') : 'm', birth: null, death: null, deceased: false, father_id: null, mother_id: null, spouse_ids: [] };
    if (act === 'sp') x.spouse_ids = [p.id];
    else {
      const sp = spousesOf(W, p.id);
      const o = sp[sp.length - 1];
      if (p.gender === 'f') { x.mother_id = p.id; x.father_id = o?.id || null; } else { x.father_id = p.id; x.mother_id = o?.id || null; }
    }
    s.W[id] = x;
    s.ask = { k: 'name', pid: id, add: act, parent: p.id };
    await save(from.id, s);
    return send(from.id, act === 'kid' ? t(L, '👶 Farzandning ismini yozing:') : t(L, '💍 Turmush o‘rtog‘ining ismini yozing:'), [[{ text: t(L, '✖️ Bekor qilish'), callback_data: 'bc:cancel' }]]);
  }
  if (act === 'edit') {
    const list = [p, ...spousesOf(W, p.id), ...kidsOf(W, p.id)];
    return send(from.id, t(L, 'Kimning ma’lumotini tuzatamiz?'), [...list.map((x) => [{ text: x.name || '?', callback_data: `bc:ep:${x.id}` }]), [{ text: t(L, '⬅️ Orqaga'), callback_data: 'bc:back' }]]);
  }
  if (act === 'back') return step(from, s);
  if (act === 'ep') {
    const x = s.W[arg];
    if (!x) return step(from, s);
    const kb = [
      [{ text: t(L, '✍️ Ismi'), callback_data: `bc:ef:${arg}:name` }, { text: t(L, '📅 Tug‘ilgan sana'), callback_data: `bc:ef:${arg}:birth` }],
      [{ text: x.deceased ? t(L, '💚 Hayot deb belgilash') : t(L, '🤲 Vafot etgan deb belgilash'), callback_data: `bc:ef:${arg}:alive` }, ...(x.deceased ? [{ text: t(L, '🤲 Vafot sanasi'), callback_data: `bc:ef:${arg}:death` }] : [])],
      [...(isNew(arg) ? [{ text: t(L, '🗑 O‘chirish'), callback_data: `bc:del:${arg}` }] : []), { text: t(L, '⬅️ Orqaga'), callback_data: 'bc:back' }],
    ];
    return send(from.id, `👤 <b>${line(x)}</b>`, kb);
  }
  if (act === 'ef') {
    const f = data.split(':')[3];
    const x = s.W[arg];
    if (!x) return step(from, s);
    if (f === 'alive') {
      x.deceased = !x.deceased;
      if (!x.deceased) x.death = null;
      return step(from, s); // marhum bo'lsa vafot sanasi so'raladi
    }
    s.ask = { k: f, pid: arg };
    await save(from.id, s);
    return ask(from, s);
  }
  if (act === 'del' && isNew(arg)) {
    delete s.W[arg];
    for (const x of Object.values(s.W)) {
      if (x.father_id === arg) x.father_id = null;
      if (x.mother_id === arg) x.mother_id = null;
      x.spouse_ids = x.spouse_ids.filter((y) => y !== arg);
    }
    return step(from, s);
  }
  if (act === 'g' && s.ask?.k === 'gender') { s.W[s.ask.pid].gender = arg === 'f' ? 'f' : 'm'; return answered(from, s); }
  if (act === 'al' && s.ask?.k === 'alive') { s.W[s.ask.pid].deceased = arg === '0'; return answered(from, s); }
  if (act === 'op' && s.ask?.k === 'other') {
    const x = s.W[s.ask.pid];
    const o = s.W[arg];
    if (o) { if (o.gender === 'f') x.mother_id = arg; else x.father_id = arg; }
    return answered(from, s);
  }
  if (act === 'dlg') {
    if (isNew(p.id)) return send(from.id, t(L, 'Avval ma’lumotlarni yuboring — yangi qo‘shilgan oilani keyin topshirish mumkin.'));
    try {
      const tree = await loadTree(s.tree);
      const b = tree.branches?.[s.bid];
      if (!b || b.claimed !== String(from.id)) throw new HttpError(403, 'Havola bekor qilingan');
      const r = await subBranch(tree, s.bid, b, from, p.id);
      await send(from.id, t(L, '🔗 <b>{name}</b> oilasini shu oiladagi kishiga topshiring. Quyidagi xabarni unga yuboring (forward):', { name: esc(p.name) }));
      await send(from.id, t(L, 'Assalomu alaykum! «{title}» shajarasidagi {name} oilasi ma’lumotlarini to‘ldirib bersangiz. Havola:', { title: esc(s.title), name: esc(p.name) }) + `\n${r.link}`);
      return step(from, s);
    } catch (e) { return send(from.id, '⚠️ ' + t(L, e.message)); }
  }
}

async function finish(from, s) {
  const L = s.lang;
  const ops = diffOps(s);
  // bo'sh maydon qolmasin
  for (const x of Object.values(s.W)) {
    const miss = missingOf(x);
    if (miss.length && (isNew(x.id) || ops.some((o) => o.id === x.id))) {
      s.ask = { k: miss[0], pid: x.id };
      await save(from.id, s);
      await send(from.id, t(L, 'Yuborishdan oldin yetishmayotgan ma’lumotni to‘ldiring:'));
      return ask(from, s);
    }
  }
  await deleteKey(sKey(from.id)).catch(() => {});
  await updateUser(from.id, from, (d) => { d.brchat = null; });
  if (!ops.length) return send(from.id, t(L, 'Rahmat! Hamma ma’lumot to‘g‘ri ekan — o‘zgarish yo‘q.'));
  try {
    const tree = await loadTree(s.tree);
    const b = tree.branches?.[s.bid];
    if (!b || b.revoked || b.claimed !== String(from.id)) throw new HttpError(403, 'Havola eskirgan yoki bekor qilingan');
    await submitProposal(tree, s.bid, b, from, ops);
    return send(from.id, `🎉 ${t(L, 'Rahmat! Ma’lumotlar yuborildi.')}\n${t(L, 'Shajara egasi tekshirib tasdiqlagach, ular shajaraga qo‘shiladi. Natija haqida bot xabar beradi.')}`);
  } catch (e) { return send(from.id, '⚠️ ' + t(L, e.message)); }
}
