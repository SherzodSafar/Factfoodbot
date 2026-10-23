// Shajara a'zolari va ulangan guruhlarga bildirishnoma yuborish.
import { tg, appLink } from './telegram.js';
import { t } from './i18n.js';
import { signInvite } from './auth.js';
import { readJson, writeJson, updateJson } from './store.js';

/**
 * kind: 'tree' | 'album' | 'bday'. text(lang) — matn yasovchi.
 * except — yuboruvchining o'zi (unga xabar bormaydi).
 * agg: { key, n, add } — bir xil hodisalar (bitta odam ketma-ket fayl yuklasa, yangi a'zolar) 1 soat ichida
 * yangi xabar emas, avvalgi xabarni tahrirlab yig'iladi: text(lang, jami, ismlar). Chat to'lib ketmaydi.
 */
const AGG_MS = 3600e3;
export async function notify(tree, kind, text0, { except, button = true, open = null, agg = null, only = null, extra = null } = {}) {
  const akey = `nagg/${tree.id}.json`;
  const ast = agg ? (await readJson(akey).catch(() => null))?.data || {} : null;
  const prev = agg && ast[agg.key] && Date.now() - ast[agg.key].at < AGG_MS ? ast[agg.key] : null;
  const total = (prev?.n || 0) + (agg?.n || 0);
  const names = agg ? [...new Set([...(prev?.names || []), ...(agg.add ? [agg.add] : [])])].slice(-15) : [];
  const text = (lang, uid) => text0(lang, total, names, uid);
  const msgs = {};
  const daily = [];
  const url = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  // open: '_p0007' (shaxs) yoki '_a<itemId>' (albom fayli) — tugma aynan shuni ochadi
  const inv = open ? signInvite(tree.id, tree.ver || 1) + open : null;
  // extra(lang) — qo'shimcha tugma (masalan, tayyor taklifnoma)
  const markup = (lang) =>
    button && url ? { inline_keyboard: [[inv ? { text: t(lang, '👀 Ko‘rish'), web_app: { url: `${url}/?inv=${inv}` } } : { text: t(lang, '🌳 Shajarani ochish'), web_app: { url: url + '/' } }], ...(extra ? [[extra(lang)]] : [])] } : undefined;
  const jobs = [];
  for (const [uid, m] of Object.entries(tree.members || {})) {
    if (uid === String(except) || m.blocked || (tree.banned || []).includes(uid) || (only && !only.has(uid))) continue;
    if (m.notify && m.notify[kind] === false) continue;
    const lang = m.lang || 'uz';
    // «kunlik xulosa» tanlaganlar: albom va shajara yangiliklari kechqurun bitta xabarda
    if (m.notify?.daily && (kind === 'album' || kind === 'tree')) { daily.push([uid, text(lang, uid)]); continue; }
    const old = prev?.msgs?.[uid];
    jobs.push(async () => {
      if (old) {
        const r = await tg('editMessageText', { chat_id: uid, message_id: old, parse_mode: 'HTML', text: text(lang, uid), reply_markup: markup(lang), disable_web_page_preview: true });
        if (r.ok || /not modified/.test(r.description || '')) { msgs[uid] = old; return { ok: true }; }
      }
      const r = await tg('sendMessage', { chat_id: uid, parse_mode: 'HTML', text: text(lang, uid), reply_markup: markup(lang), disable_web_page_preview: true });
      if (r.ok && r.result?.message_id) msgs[uid] = r.result.message_id;
      return r;
    });
  }
  // Oila guruhlari: tug'ilgan kunlar darhol; qolganlari kechki (19:00) umumiy xabarga yig'iladi — chat to'lib ketmasin
  const groups = only ? [] : (tree.groups || []).filter((g) => !(kind === 'tree' && g.quiet));
  if (kind === 'bday') {
    const glink = inv && groups.length ? await appLink(inv) : null;
    for (const g of groups) jobs.push(() => tg('sendMessage', { chat_id: g.id, parse_mode: 'HTML', text: text(g.lang || 'uz'), disable_web_page_preview: true,
      reply_markup: glink || extra ? { inline_keyboard: [...(glink ? [[{ text: t(g.lang || 'uz', '👀 Ko‘rish'), url: glink }]] : []), ...(extra ? [[extra(g.lang || 'uz')]] : [])] } : undefined }));
  } else if (groups.length) {
    const langs = [...new Set(groups.map((g) => g.lang || 'uz'))];
    await queueDigest(tree.id, { at: new Date().toISOString(), kind, ...(agg ? { key: `${agg.key}:${prev?.since || Date.now()}` } : {}), text: Object.fromEntries(langs.map((l) => [l, text(l)])) }).catch((e) => console.error('digestq', e?.message));
  }
  if (daily.length) {
    const dk = agg ? `${agg.key}:${prev?.since || Date.now()}` : null;
    await updateOrCreate(`mdigest/${tree.id}.json`, (d) => {
      for (const [uid, tx] of daily) d[uid] = [...(d[uid] || []).filter((x) => !dk || x.key !== dk), { key: dk, text: tx }].slice(-40);
    }).catch((e) => console.error('mdigest', e?.message));
  }
  // Telegram cheklovi: sekundiga ~30 xabar. 10 tadan parallel yuboramiz.
  let sent = 0;
  for (let i = 0; i < jobs.length; i += 10) {
    const res = await Promise.all(jobs.slice(i, i + 10).map((j) => j()));
    sent += res.filter((r) => r?.ok).length;
  }
  if (agg) {
    const now = Date.now();
    for (const [k, v] of Object.entries(ast)) if (now - v.at > 864e5) delete ast[k];
    ast[agg.key] = { at: now, since: prev?.since || now, n: total, names, msgs: { ...(prev?.msgs || {}), ...msgs } };
    await writeJson(akey, ast).catch((e) => console.error('nagg', e?.message));
  }
  return sent;
}

/** Ism — bosilsa ilovada o'sha a'zo profili (Telegram va shajaradagi o'rni) ochiladi. */
export function whoLink(tree, uid, name) {
  const n = escapeHtml(name || '');
  if (!uid || !/^\d+$/.test(String(uid))) return `<b>${n}</b>`;
  return `<a href="https://t.me/${process.env.BOT_USERNAME || 'ShajaraAiBot'}?startapp=${signInvite(tree.id, tree.ver || 1)}_u${uid}"><b>${n}</b></a>`;
}
/** Dayjest qatorlari: bir xil hodisalar (faqat soni farq qiladi) bitta qatorga — sonlar qo'shiladi. */
export function mergeLines(lines) {
  const out = new Map();
  // birinchi son (HTML teglari ichidagi havolalardagi raqamlar hisobga olinmaydi)
  const num = (s) => {
    const parts = String(s).split(/(<[^>]*>)/);
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith('<')) continue;
      const m = /\d+/.exec(parts[i]);
      if (m) return { n: Number(m[0]), k: [...parts.slice(0, i), parts[i].replace(m[0], '#'), ...parts.slice(i + 1)].join('') };
    }
    return { n: NaN, k: String(s) };
  };
  for (const s of lines) {
    const { k, n } = num(s);
    const cur = out.get(k);
    if (cur && Number.isFinite(n) && Number.isFinite(cur.n)) cur.n += n; else if (!cur) out.set(k, { s, n });
  }
  return [...out.entries()].map(([k, v]) => (Number.isFinite(v.n) && k.includes('#') ? k.replace('#', String(v.n)) : v.s));
}
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/** Shajara egasi va tahrirchilariga xabar (ilovani ochish tugmasi bilan). */
export async function notifyEditors(tree, html) {
  const url = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const ids = new Set([tree.owner, ...Object.entries(tree.members || {}).filter(([, m]) => m.role === 'edit').map(([id]) => id)].filter(Boolean).map(String));
  for (const id of ids) {
    await tg('sendMessage', { chat_id: id, parse_mode: 'HTML', text: html, disable_web_page_preview: true,
      reply_markup: url ? { inline_keyboard: [[{ text: '📨 Ko‘rib chiqish', web_app: { url: url + '/?props=1' } }]] } : undefined }).catch(() => {});
  }
}

async function updateOrCreate(key, fn) {
  if (!await readJson(key)) { const d = {}; fn(d); try { await writeJson(key, d, null); return; } catch { /* parallel */ } }
  await updateJson(key, fn);
}

/** 19:00 — «kunlik xulosa» tanlagan a'zolarga kun yangiliklari bitta xabarda. */
export async function memberDigest(tree) {
  const key = `mdigest/${tree.id}.json`;
  const d = (await readJson(key))?.data || {};
  if (!Object.keys(d).length) return 0;
  await writeJson(key, {});
  const url = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const inv = signInvite(tree.id, tree.ver || 1) + '_l';
  let sent = 0;
  for (const [uid, list] of Object.entries(d)) {
    const m = tree.members?.[uid];
    if (!m || !list?.length) continue;
    const lang = m.lang || 'uz';
    const r = await tg('sendMessage', { chat_id: uid, parse_mode: 'HTML', disable_web_page_preview: true,
      text: [`🌙 <b>${escapeHtml(tree.title)}</b> — ${t(lang, 'bugungi yangiliklar')}`, ...mergeLines(list.map((x) => x.text)).slice(-25).map((x) => '• ' + x)].join('\n').slice(0, 4000),
      reply_markup: url ? { inline_keyboard: [[{ text: t(lang, '👀 Ko‘rish'), web_app: { url: `${url}/?inv=${inv}` } }]] } : undefined });
    if (r.ok) sent++;
  }
  return sent;
}

/** Kechki guruh xabari uchun navbat: gdigest/<treeId>.json */
export async function queueDigest(treeId, ev) {
  const key = `gdigest/${treeId}.json`;
  if (!await readJson(key)) { try { await writeJson(key, { items: [ev] }, null); return; } catch { /* parallel */ } }
  // yig'ilgan hodisa (ev.key) — ro'yxatdagi eskisining o'rniga
  await updateJson(key, (d) => { d.items = [...(d.items || []).filter((x) => !ev.key || x.key !== ev.key), ev].slice(-60); });
}
export async function takeDigest(treeId) {
  const key = `gdigest/${treeId}.json`;
  const cur = (await readJson(key))?.data?.items || [];
  if (cur.length) await writeJson(key, { items: [] });
  return cur;
}
