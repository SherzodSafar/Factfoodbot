// O'zbek lotin → kirill transliteratsiyasi (ilova va bot uchun umumiy).
const VOWELS = 'aeiouAEIOUоОўЎаАеЕиИуУэЭюЮяЯёЁ';
const APOS = "['‘’ʻʼ`]";
const MULTI = [
  [new RegExp(`O${APOS}`, 'g'), 'Ў'], [new RegExp(`o${APOS}`, 'g'), 'ў'],
  [new RegExp(`G${APOS}`, 'g'), 'Ғ'], [new RegExp(`g${APOS}`, 'g'), 'ғ'],
  [/SH/g, 'Ш'], [/Sh/g, 'Ш'], [/sh/g, 'ш'],
  [/CH/g, 'Ч'], [/Ch/g, 'Ч'], [/ch/g, 'ч'],
  [/YO/g, 'Ё'], [/Yo/g, 'Ё'], [/yo/g, 'ё'],
  [/YU/g, 'Ю'], [/Yu/g, 'Ю'], [/yu/g, 'ю'],
  [/YA/g, 'Я'], [/Ya/g, 'Я'], [/ya/g, 'я'],
  [/YE/g, 'Е'], [/Ye/g, 'Е'], [/ye/g, 'е'],
];
const SINGLE = {
  a: 'а', b: 'б', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п',
  q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', x: 'х', y: 'й', z: 'з', c: 'с', w: 'в',
};

function word(w) {
  // so'z boshidagi "e" → "э"
  let s = w.replace(/^E/, 'Э').replace(/^e/, 'э');
  for (const [re, to] of MULTI) s = s.replace(re, to);
  s = s.replace(new RegExp(APOS, 'g'), 'ъ');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const low = ch.toLowerCase();
    if (SINGLE[low]) {
      // unlidan keyin kelgan "e" ham "э" bo'ladi (masalan: "poeziya" → "поэзия")
      if (low === 'e' && i > 0 && VOWELS.includes(s[i - 1])) out += ch === low ? 'э' : 'Э';
      else out += ch === low ? SINGLE[low] : SINGLE[low].toUpperCase();
    } else out += ch;
  }
  return out;
}

/** Matnni kirillga o'giradi. {o'zgaruvchi}, HTML teglari va havolalar o'zgarmaydi. */
export function toCyrillic(text) {
  return String(text).replace(/(<[^>]*>|\{[^}]*\}|https?:\/\/\S+|@\w+|\/\w+|[A-Za-z'‘’ʻʼ`]+)/g, (m) =>
    /^[A-Za-z]/.test(m) && !m.startsWith('http') ? word(m) : m,
  );
}
