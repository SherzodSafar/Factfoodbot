// Shajara a'zolari va ulangan guruhlarga bildirishnoma yuborish.
import { tg, appLink } from './telegram.js';
import { t } from './i18n.js';
import { signInvite } from './auth.js';
import { readJson, writeJson, updateJson } from './store.js';

/**
 * kind: 'tree' | 'album' | 'bday'. text(lang) — matn yasovchi.
 * except — yuboruvchining o'zi (unga xabar bormaydi).
 */
export async function notify(tree, kind, text, { except, button = true, open = null } = {}) {
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
    jobs.push(() => tg('sendMessage', { chat_id: uid, parse_mode: 'HTML', text: text(lang), reply_markup: markup(lang), disable_web_page_preview: true }));
  }
  // Oila guruhlari: tug'ilgan kunlar darhol; qolganlari kechki (19:00) umumiy xabarga yig'iladi — chat to'lib ketmasin
  const groups = (tree.groups || []).filter((g) => !(kind === 'tree' && g.quiet));
  if (kind === 'bday') {
    const glink = inv && groups.length ? await appLink(inv) : null;
    for (const g of groups) jobs.push(() => tg('sendMessage', { chat_id: g.id, parse_mode: 'HTML', text: text(g.lang || 'uz'), disable_web_page_preview: true,
      reply_markup: glink ? { inline_keyboard: [[{ text: t(g.lang || 'uz', '👀 Ko‘rish'), url: glink }]] } : undefined }));
  } else if (groups.length) {
    const langs = [...new Set(groups.map((g) => g.lang || 'uz'))];
    await queueDigest(tree.id, { at: new Date().toISOString(), kind, text: Object.fromEntries(langs.map((l) => [l, text(l)])) }).catch((e) => console.error('digestq', e?.message));
  }
  // Telegram cheklovi: sekundiga ~30 xabar. 10 tadan parallel yuboramiz.
  let sent = 0;
  for (let i = 0; i < jobs.length; i += 10) {
    const res = await Promise.all(jobs.slice(i, i + 10).map((j) => j()));
    sent += res.filter((r) => r.ok).length;
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
  await updateJson(key, (d) => { d.items = [...(d.items || []), ev].slice(-60); });
}
export async function takeDigest(treeId) {
  const key = `gdigest/${treeId}.json`;
  const cur = (await readJson(key))?.data?.items || [];
  if (cur.length) await writeJson(key, { items: [] });
  return cur;
}
