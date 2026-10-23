// Qo'shimchalar: xotira sahifasi, oylik faollar, shajara kitobi (chop etishga tayyor HTML).
import { readJson, writeJson, updateJson, getFile } from './store.js';
import { tg } from './telegram.js';
import { t } from './i18n.js';
import { escapeHtml as esc } from './notify.js';
import { HttpError } from './tree.js';

// ---------------------------------------------------------------- xotira sahifasi --
const mKey = (treeId) => `memories/${treeId}.json`;
export async function memories(treeId, pid) {
  return ((await readJson(mKey(treeId)))?.data || {})[pid] || [];
}
export async function addMemory(tree, pid, user, name, text) {
  const p = tree.persons.find((x) => x.id === pid);
  if (!p) throw new HttpError(404, 'Shaxs topilmadi');
  const tx = String(text || '').trim().slice(0, 1000);
  if (!tx) throw new HttpError(400, 'Matn bo‘sh');
  const item = { id: Math.random().toString(36).slice(2, 10), uid: String(user.id), name, text: tx, at: new Date().toISOString() };
  const fn = (d) => { d[pid] = [...(d[pid] || []), item].slice(-300); };
  if (!(await updateJson(mKey(tree.id), fn))) { const d = {}; fn(d); await writeJson(mKey(tree.id), d); }
  return item;
}
export async function delMemory(tree, pid, id, uid, isEditor) {
  await updateJson(mKey(tree.id), (d) => { d[pid] = (d[pid] || []).filter((x) => x.id !== id || (x.uid !== uid && !isEditor)); });
}

// ---------------------------------------------------------------- oylik faollar --
const W = { add: 2, edit: 1, photo: 2, album: 1, branch: 3, import: 3, merge: 1 };
/** Har oyning 1-kuni: o'tgan oy eng ko'p hissa qo'shgan 3 kishiga rahmat (va egasiga ro'yxat). */
export async function monthlyThanks(tree) {
  const from = Date.now() - 31 * 864e5;
  const score = new Map();
  for (const l of tree.log || []) {
    if (!l.uid || !W[l.action] || Date.parse(l.at) < from) continue;
    const n = l.action === 'album' ? Number(String(l.name || '').split(' · ')[1]) || 1 : 1;
    score.set(l.uid, (score.get(l.uid) || 0) + W[l.action] * Math.min(n, 30));
  }
  const top = [...score.entries()].filter(([uid, s]) => s >= 3 && tree.members?.[uid]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!top.length) return 0;
  let sent = 0;
  const medal = ['🥇', '🥈', '🥉'];
  for (const [i, [uid]] of top.entries()) {
    const lang = tree.members[uid].lang || 'uz';
    const r = await tg('sendMessage', { chat_id: uid, parse_mode: 'HTML',
      text: `${medal[i]} ${t(lang, 'Rahmat! O‘tgan oyda «{title}» shajarasini to‘ldirishga eng ko‘p hissa qo‘shganlardan birisiz. Avlodlar sizdan minnatdor bo‘ladi 🌳', { title: esc(tree.title) })}` }).catch(() => null);
    if (r?.ok) sent++;
  }
  const owner = tree.owner && String(tree.owner);
  if (owner && !top.some(([uid]) => uid === owner)) {
    const lang = tree.members?.[owner]?.lang || 'uz';
    await tg('sendMessage', { chat_id: owner, parse_mode: 'HTML',
      text: `🏆 <b>${esc(tree.title)}</b> — ${t(lang, 'o‘tgan oyning eng faollari')}:\n${top.map(([uid], i) => `${medal[i]} ${esc(tree.members[uid].name)}`).join('\n')}` }).catch(() => {});
  }
  return sent;
}

// ---------------------------------------------------------------- shajara kitobi --
function generations(tree) {
  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  const memo = new Map();
  const depth = (p, seen = new Set()) => {
    if (memo.has(p.id)) return memo.get(p.id);
    if (seen.has(p.id)) return 0;
    seen.add(p.id);
    const par = [p.father_id, p.mother_id].map((id) => byId.get(id)).filter(Boolean);
    let d = par.length ? Math.max(...par.map((x) => depth(x, seen))) + 1 : null;
    if (d == null) { // qon qarindoshi emas (kelin/kuyov) — turmush o'rtog'i avlodida
      const sp = (p.spouse_ids || []).map((id) => byId.get(id)).find((x) => x && (x.father_id || x.mother_id));
      d = sp ? depth(sp, seen) : 0;
    }
    memo.set(p.id, d);
    return d;
  };
  const gens = [];
  for (const p of tree.persons) (gens[depth(p)] ||= []).push(p);
  return gens.filter(Boolean);
}
const fmt = (d) => (d ? String(d).split('-').reverse().join('.') : '');

export async function bookHtml(tree, lang) {
  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  const photo = async (p) => {
    if (!p.photo) return '';
    const f = await getFile(`photos/${tree.id}/${p.photo}`).catch(() => null);
    return f ? `<img src="data:${f.contentType};base64,${f.buffer.toString('base64')}" alt="">` : '';
  };
  const gens = generations(tree);
  let body = '';
  for (const [g, list] of gens.entries()) {
    body += `<h2>${g + 1}-${t(lang, 'avlod')} · ${list.length}</h2><div class="grid">`;
    for (const p of list.sort((a, b) => String(a.birth || '9').localeCompare(String(b.birth || '9')))) {
      const sp = (p.spouse_ids || []).map((id) => byId.get(id)?.name).filter(Boolean);
      const kids = tree.persons.filter((x) => x.father_id === p.id || x.mother_id === p.id).map((x) => x.name);
      const par = [byId.get(p.father_id)?.name, byId.get(p.mother_id)?.name].filter(Boolean);
      body += `<div class="card ${p.deceased ? 'dec' : ''}">${await photo(p)}<div><b>${esc(p.name)}</b>${p.fname ? ` <span class="m">(${esc(p.fname)})</span>` : ''}
        <div class="m">${p.birth ? '✦ ' + fmt(p.birth) : ''}${p.deceased ? ` · † ${fmt(p.death)}` : ''}${p.place ? ' · ' + esc(p.place) : ''}</div>
        ${par.length ? `<div class="s">${t(lang, 'Ota-onasi')}: ${esc(par.join(', '))}</div>` : ''}
        ${sp.length ? `<div class="s">💍 ${esc(sp.join(', '))}</div>` : ''}
        ${kids.length ? `<div class="s">${t(lang, 'Farzandlari')}: ${esc(kids.join(', '))}</div>` : ''}
        ${p.note ? `<div class="s n">${esc(p.note)}</div>` : ''}</div></div>`;
    }
    body += '</div>';
  }
  const day = new Date().toISOString().slice(0, 10);
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(tree.title)}</title>
<style>@page{size:A4;margin:14mm}body{font-family:Georgia,'Times New Roman',serif;color:#222;margin:0 auto;max-width:900px;padding:16px}
.cover{text-align:center;padding:30vh 0 20vh;page-break-after:always}.cover h1{font-size:40px;margin:0 0 12px}.cover p{color:#666}
h2{border-bottom:2px solid #2e7d5b;color:#2e7d5b;padding-bottom:4px;page-break-after:avoid;margin-top:28px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.card{display:flex;gap:10px;border:1px solid #ddd;border-radius:10px;padding:10px;page-break-inside:avoid}
.card img{width:64px;height:64px;object-fit:cover;border-radius:50%;flex:none}.dec{background:#f6f4ef}.m{color:#666;font-size:13px}.s{font-size:12px;color:#444;margin-top:3px}.n{font-style:italic}
.tip{background:#eef7f2;border-radius:8px;padding:10px;font-family:sans-serif;font-size:13px}@media print{.tip{display:none}}@media(max-width:600px){.grid{grid-template-columns:1fr}}</style></head>
<body><div class="tip">🖨 ${t(lang, 'PDF qilish: faylni brauzerda oching → «Chop etish» (Print) → «PDF sifatida saqlash».')}</div>
<div class="cover"><h1>🌳 ${esc(tree.title)}</h1><p>${tree.persons.length} ${t(lang, 'kishi')} · ${gens.length} ${t(lang, 'avlod')}</p><p>${fmt(day)}</p></div>${body}</body></html>`;
}
