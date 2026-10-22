// Shaxsiy tabrik eslatmalari: har bir a'zoga (shajarada o'rnini belgilagan bo'lsa) yaqinlarining
// ertangi tug'ilgan kuni haqida — «Ertaga nabirangiz Go'zalning tug'ilgan kuni».
import { Family, kinship } from '../public/js/family.js';
import { tg } from './telegram.js';
import { escapeHtml as esc } from './notify.js';
import { signInvite } from './auth.js';
import { t } from './i18n.js';

/** «Nevarasi» → «Nevarangiz», «O‘g‘li» → «O‘g‘lingiz» (o'zbekchada egalik — sizga nisbatan). */
export function yours(term) {
  const w = String(term || '').split(' ');
  if (/si$/i.test(w[0])) w[0] = w[0].slice(0, -2) + 'ngiz';
  else if (/i$/i.test(w[0])) w[0] = w[0].slice(0, -1) + 'ingiz';
  return w.join(' ');
}

/** Ota-ona/farzand/juft bog'lari bo'yicha 3 qadamgacha yaqin bo'lganlar. */
function closeOnes(fam, id, depth = 3) {
  const seen = new Map([[id, 0]]);
  const q = [id];
  while (q.length) {
    const cur = q.shift();
    const d = seen.get(cur);
    if (d >= depth) continue;
    const p = fam.get(cur);
    if (!p) continue;
    for (const n of [p.father_id, p.mother_id, ...(p.spouse_ids || []), ...fam.children(cur).map((c) => c.id)]) {
      if (n && !seen.has(n)) { seen.set(n, d + 1); q.push(n); }
    }
  }
  seen.delete(id);
  return seen;
}

export async function personalBirthdays(tree, now = new Date()) {
  const tomorrow = new Date(now.getTime() + 5 * 3600e3 + 864e5); // Toshkent vaqti bo'yicha ertaga
  const md = `${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrow.getUTCDate()).padStart(2, '0')}`;
  const born = tree.persons.filter((p) => !p.deceased && /^\d{4}-\d{2}-\d{2}$/.test(p.birth || '') && p.birth.slice(5) === md);
  if (!born.length) return 0;
  const fam = new Family(tree.persons);
  const URL_ = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  let sent = 0;
  for (const [uid, m] of Object.entries(tree.members || {})) {
    if (!m.pid || m.blocked || m.notify?.bday === false) continue;
    const me = fam.get(m.pid);
    if (!me) continue;
    const near = closeOnes(fam, m.pid);
    const list = born.filter((p) => near.has(p.id));
    if (!list.length) continue;
    const lang = m.lang || 'uz';
    const lines = list.map((p) => {
      const k = kinship(fam, me, p).term || '';
      const rel = lang === 'uz' || lang === 'uzc' ? yours(k) : k;
      const age = tomorrow.getUTCFullYear() - Number(p.birth.slice(0, 4));
      return `🎂 ${rel ? esc(rel) + ' — ' : ''}<b>${esc(p.name)}</b> (${age} ${t(lang, 'yosh')})`;
    });
    const inv = signInvite(tree.id, tree.ver || 1);
    const r = await tg('sendMessage', { chat_id: uid, parse_mode: 'HTML', disable_web_page_preview: true,
      text: `${t(lang, '🌸 Ertaga yaqinlaringizning tug‘ilgan kuni:')}\n\n${lines.join('\n')}\n\n${t(lang, 'Tabriklashni unutmang! 💐')}`,
      reply_markup: URL_ ? { inline_keyboard: [[{ text: t(lang, '👀 Ko‘rish'), web_app: { url: `${URL_}/?inv=${inv}_${list[0].id}` } }]] } : undefined }).catch(() => null);
    if (r?.ok) sent++;
  }
  return sent;
}
