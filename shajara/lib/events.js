// Kunlik voqealar: tug'ilgan kunlar va xotira kunlari, webhook kaliti.
import { hashCode } from './auth.js';
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
  let text = `🌳 <b>${escapeHtml(tree.title)}</b>\n`;
  if (births.length) {
    text += `\n${t(lang, '🎂 <b>Bugun tug‘ilgan kun:</b>')}\n` + births.map((b) => '• ' + t(lang, '{name} — {age} yosh', { name: escapeHtml(b.name), age: b.age })).join('\n');
    text += `\n\n${t(lang, 'Tabriklashni unutmang — bir qo‘ng‘iroq ham qondoshlikni mustahkamlaydi. 💚')}`;
  }
  if (memorials.length) {
    text += `\n\n${t(lang, '🤲 <b>Xotira kuni:</b>')}\n` + memorials.map((x) => '• ' + t(lang, '{name} — vafotiga {years} yil', { name: escapeHtml(x.name), years: x.years })).join('\n');
    text += `\n\n${t(lang, 'Duo bilan yod eting.')}`;
  }
  return text;
}

/** Keyingi 30 kundagi tug'ilgan kunlar (guruhdagi /tugilgan uchun). */
export function upcomingText(tree, lang) {
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
  return `🎂 ${t(lang, 'Yaqin tug‘ilgan kunlar (30 kun):')}\n\n` + list.slice(0, 25).map((x) =>
    `${x.date.toISOString().slice(8, 10)}.${x.date.toISOString().slice(5, 7)} — ${t(lang, '{name} — {age} yosh', { name: escapeHtml(x.p.name), age: x.age })}`).join('\n');
}
