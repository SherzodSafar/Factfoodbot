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
export async function notify(tree, kind, text0, { except, button = true, open = null, agg = null } = {}) {
  const akey = `nagg/${tree.id}.json`;
  const ast = agg ? (await readJson(akey).catch(() => null))?.data || {} : null;
  const prev = agg && ast[agg.key] && Date.now() - ast[agg.key].at < AGG_MS ? ast[agg.key] : null;
  const total = (prev?.n || 0) + (agg?.n || 0);
  const names = agg ? [...new Set([...(prev?.names || []), ...(agg.add ? [agg.add] : [])])].slice(-15) : [];
  const text = (lang, uid) => text0(lang, total, names, uid);
  const msgs = {};
  const url = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  // open: '_p0007' (shaxs) yoki '_a<itemId>' (albom fayli) — tugma aynan shuni ochadi
  const inv = open ? signInvite(tree.id, tree.ver || 1) + open : null;
  const markup = (lang) =>
    button && url ? { inline_keyboard: [[inv ? { text: t(lang, '👀 Ko‘rish'), web_app: { url: `${url}/?inv=${inv}` } } : { text: t(lang, '🌳 Shajarani ochish'), web_app: { url: url + '/' } }]] } : undefined;
  const jobs = [];
  for (const [uid, m] of Object.entries(tree.members || {})) {
    if (uid === String(except) || m.blocked || (tree.banned || []).includes(uid)) continue;
    if (m.notify && m.notify[kind] === false) continue;
    const lang = m.lang || 'uz';
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
  const groups = (tree.groups || []).filter((g) => !(kind === 'tree' && g.quiet));
  if (kind === 'bday') {
    const glink = inv && groups.length ? await appLink(inv) : null;
    for (const g of groups) jobs.push(() => tg('sendMessage', { chat_id: g.id, parse_mode: 'HTML', text: text(g.lang || 'uz'), disable_web_page_preview: true,
      reply_markup: glink ? { inline_keyboard: [[{ text: t(g.lang || 'uz', '👀 Ko‘rish'), url: glink }]] } : undefined }));
  } else if (groups.length) {
    const langs = [...new Set(groups.map((g) => g.lang || 'uz'))];
    await queueDigest(tree.id, { at: new Date().toISOString(), kind, ...(agg ? { key: `${agg.key}:${prev?.since || Date.now()}` } : {}), text: Object.fromEntries(langs.map((l) => [l, text(l)])) }).catch((e) => console.error('digestq', e?.message));
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
