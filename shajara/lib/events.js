// Kunlik voqealar: tug'ilgan kunlar va xotira kunlari, webhook kaliti.
import { hashCode, signInvite } from './auth.js';
import { todaysEvents } from './tree.js';
import { t } from './i18n.js';
import { escapeHtml } from './notify.js';

export function webhookSecret() {
  return hashCode('webhook:' + (process.env.BOT_TOKEN || '')).slice(0, 48);
}

/** Bugungi tug'ilgan kun / xotira kunlari matni (bo'lmasa null). */
export function todayText(tree, lang) {
  const { births, memorials } = todaysEvents(tree);
  if (!births.length && !memorials.length) return null;
  // ism ustiga bosilsa — ilovada o'sha shaxs profili ochiladi (/tugilgan ro'yxatidagi kabi)
  const bot = process.env.BOT_USERNAME || 'ShajaraAiBot';
  const inv = signInvite(tree.id, tree.ver || 1);
  const nm = (x) => `<a href="https://t.me/${bot}?startapp=${inv}_${x.id}">${escapeHtml(x.name)}</a>`;
  let text = `🌳 <b>${escapeHtml(tree.title)}</b>\n`;
  if (births.length) {
    text += `\n${t(lang, '🎂 <b>Bugun tug‘ilgan kun:</b>')}\n` + births.map((b) => '• ' + t(lang, '{name} — {age} yosh', { name: '\u0001', age: b.age }).replace('\u0001', nm(b))).join('\n');
    text += `\n\n${t(lang, 'Tabriklashni unutmang — bir qo‘ng‘iroq ham qondoshlikni mustahkamlaydi. 💚')}`;
  }
  if (memorials.length) {
    const nmx = (x) => `<a href="https://t.me/${bot}?startapp=${inv}_x${x.id}">${escapeHtml(x.name)}</a>`; // xotira sahifasi
    text += `\n\n${t(lang, '🤲 <b>Xotira kuni:</b>')}\n` + memorials.map((x) => '• ' + t(lang, '{name} — vafotiga {years} yil', { name: '\u0001', years: x.years }).replace('\u0001', nmx(x))).join('\n');
    text += `\n\n${t(lang, 'Duo bilan yod eting.')}`;
  }
  return text;
}

/** Keyingi 30 kundagi tug'ilgan kunlar (guruhdagi /tugilgan uchun). */
export function upcomingText(tree, lang, linkFor) {
  const now = new Date(Date.now() + 5 * 3600e3);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const list = [];
  for (const p of tree.persons) {
    if (p.deceased || p.birth?.length !== 10) continue;
    const [y, m, d] = p.birth.split('-').map(Number);
    let next = Date.UTC(now.getUTCFullYear(), m - 1, d);
    if (next < today) next = Date.UTC(now.getUTCFullYear() + 1, m - 1, d);
    const diff = Math.round((next - today) / 864e5);
    if (diff <= 30) list.push({ p, diff, date: new Date(next), age: new Date(next).getUTCFullYear() - y });
  }
  list.sort((a, b) => a.diff - b.diff);
  if (!list.length) return t(lang, 'Yaqin kunlarda tug‘ilgan kun yo‘q.');
  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  return `🎂 ${t(lang, 'Yaqin tug‘ilgan kunlar (30 kun):')}\n\n` + list.slice(0, 30).map((x) => {
    const f = byId.get(x.p.father_id) || byId.get(x.p.mother_id);
    const rel = f ? ` (${t(lang, x.p.gender === 'f' ? '{name} qizi' : '{name} o‘g‘li', { name: escapeHtml(f.name) })})` : '';
    const d = x.date.toISOString();
    return `📅 ${d.slice(8, 10)}.${d.slice(5, 7)}.${x.p.birth.slice(0, 4)} — <b>${linkFor ? `<a href="${linkFor(x.p.id)}">${escapeHtml(x.p.name)}</a>` : escapeHtml(x.p.name)}</b>${rel} · ${t(lang, '{n} yosh', { n: x.age })}`;
  }).join('\n');
}
