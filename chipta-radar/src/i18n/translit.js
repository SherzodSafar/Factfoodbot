/**
 * O'zbek lotin → kirill (bot matnlari uchun). HTML teglari, havolalar, buyruqlar,
 * qisqartmalar (HTTP, KTZ) va brend nomlari o'zgarmaydi.
 */
const MAP = {
  a: 'а', b: 'б', c: 'с', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м',
  n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'х', y: 'й', z: 'з',
};
const APOS = "'ʻ‘’`";
const KEEP = new Set(['Payme', 'Click', 'Telegram', 'eticket', 'Google', 'Play', 'Protect', 'Xiaomi', 'Redmi', 'POCO', 'Android', 'Web', 'App', 'Firebase', 'Talgo', 'English']);

// Ruschadan o'zlashgan oy nomlari kirillda boshqacha yoziladi
const EXCEPT = {
  yanvar: 'январь', fevral: 'февраль', aprel: 'апрель', iyun: 'июнь', iyul: 'июль',
  sentabr: 'сентябрь', oktabr: 'октябрь', noyabr: 'ноябрь', dekabr: 'декабрь',
};

function word(token) {
  if (KEEP.has(token) || (token.length > 1 && token === token.toUpperCase())) return token;
  const lower = token.toLowerCase();
  if (EXCEPT[lower]) return token[0] !== lower[0] ? EXCEPT[lower][0].toUpperCase() + EXCEPT[lower].slice(1) : EXCEPT[lower];
  let out = '';
  for (let i = 0; i < lower.length;) {
    const ch = lower[i];
    const next = lower[i + 1] || '';
    let cyr;
    let len = 1;
    const after = lower[i + 2] || '';
    if ((ch === 'o' || ch === 'g') && next && APOS.includes(next)) { cyr = ch === 'o' ? 'ў' : 'ғ'; len = 2; }
    else if (ch === 's' && next === 'h') { cyr = 'ш'; len = 2; }
    else if (ch === 'c' && next === 'h') { cyr = 'ч'; len = 2; }
    else if (ch === 'y' && (next === 'a' || next === 'u' || (next === 'o' && !(after && APOS.includes(after))))) { cyr = { a: 'я', u: 'ю', o: 'ё' }[next]; len = 2; }
    else if (ch === 'y' && next === 'e') { cyr = 'е'; len = 2; }
    else if (ch === 'e') cyr = i === 0 ? 'э' : 'е';
    else if (APOS.includes(ch)) cyr = 'ъ';
    else cyr = MAP[ch] ?? ch;
    out += token[i] !== ch ? cyr.toUpperCase() : cyr;
    i += len;
  }
  return out;
}

// Himoyalanadigan qismlar: havolalar, domenlar, email, /buyruq, @nom, HTML belgilari
const PROTECT = /https?:\/\/\S+|[\w.-]+@[\w.-]+|\b[\w-]+\.(?:uz|kz|ru|com|me|org|net)\b\S*|\/[a-z_]+|@\w+|&\w+;/g;
const WORD = /[A-Za-z](?:[A-Za-z]|['ʻ‘’`](?=[A-Za-z]))*/g;

function plain(text) {
  const kept = [];
  const masked = text.replace(PROTECT, (m) => `\u0000${kept.push(m) - 1}\u0000`);
  return masked.replace(WORD, word).replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]);
}

/** Matn (HTML bo'lishi mumkin) → kirill; teglar ichi o'zgarmaydi */
export function toCyrillic(text) {
  return String(text).split(/(<[^>]*>)/).map((part, i) => (i % 2 ? part : plain(part))).join('');
}

export default { toCyrillic };
