// Shajara a'zolari va ulangan guruhlarga bildirishnoma yuborish.
import { tg } from './telegram.js';
import { t } from './i18n.js';

/**
 * kind: 'tree' | 'album' | 'bday'. text(lang) — matn yasovchi.
 * except — yuboruvchining o'zi (unga xabar bormaydi).
 */
export async function notify(tree, kind, text, { except, button = true } = {}) {
  const url = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const markup = (lang) =>
    button && url ? { inline_keyboard: [[{ text: t(lang, '🌳 Shajarani ochish'), web_app: { url: url + '/' } }]] } : undefined;
  const jobs = [];
  for (const [uid, m] of Object.entries(tree.members || {})) {
    if (uid === String(except) || m.blocked || (tree.banned || []).includes(uid)) continue;
    if (m.notify && m.notify[kind] === false) continue;
    const lang = m.lang || 'uz';
    jobs.push(() => tg('sendMessage', { chat_id: uid, parse_mode: 'HTML', text: text(lang), reply_markup: markup(lang), disable_web_page_preview: true }));
  }
  for (const g of tree.groups || []) {
    if (kind === 'tree' && g.quiet) continue;
    jobs.push(() => tg('sendMessage', { chat_id: g.id, parse_mode: 'HTML', text: text(g.lang || 'uz'), disable_web_page_preview: true }));
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
