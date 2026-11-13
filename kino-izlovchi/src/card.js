import { Markup } from 'telegraf';

export const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/** Subtitrdan foydalanuvchiga ko'rsatish uchun qisqa iqtibos. */
function quoteFrom(transcript) {
  const sentence = transcript
    .replace(/\[[\d:.]+\]/g, '\n') // vaqt belgilarini olib tashlaymiz
    .split(/\n|(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .find((s) => s.length > 8);
  return sentence ? cut(sentence, 110) : '';
}

// ---------- Kartochka ----------
// Kartochka matni keyin tugmalar uchun ham o'qiladi (server qayta ishga tushsa ham ishlashi uchun),
// shuning uchun bayroqli qatorlar formati o'zgarmasligi kerak — parseCard() ga qarang.
export function buildCard(guess, details, transcript) {
  const isTv = guess.kind === 'tv';
  const head = [`✅ ${isTv ? 'Serial' : 'Kino'}`];
  if (guess.year) head.push(String(guess.year));
  if (isTv && guess.season) head.push(`${guess.season}-fasl${guess.episode ? `, ${guess.episode}-qism` : ''} (taxminan)`);

  const lines = [
    head.join(' • '),
    `🇺🇿 <b>${esc(guess.title_uz)}</b>`,
    `🇷🇺 ${esc(guess.title_ru)}`,
    `🇬🇧 ${esc(guess.title_en)}`,
  ];
  const orig = guess.title_original;
  if (orig && ![guess.title_en, guess.title_ru, guess.title_uz].includes(orig)) {
    lines.push(`🎬 Asl nomi: ${esc(orig)}`);
  }
  if (guess.genres_uz.length) lines.push(`🎭 ${esc(guess.genres_uz.slice(0, 4).join(', '))}`);
  if (details?.rating) lines.push(`⭐ ${details.rating} (TMDB, ${details.votes.toLocaleString('ru-RU')} ovoz)`);
  if (guess.overview_uz) lines.push('', `📝 ${esc(cut(guess.overview_uz, 400))}`);

  const notes = [];
  if (guess.viaAudio && transcript) {
    const q = quoteFrom(transcript);
    notes.push(q ? `🎧 Dialog bo'yicha topildi: «${esc(q)}»` : "🎧 Dialog (subtitr) bo'yicha topildi");
  }
  if (guess.confidence < 0.7) notes.push("🤔 <i>Aniqligi o'rtacha — tekshirib ko'ring.</i>");
  if (notes.length) lines.push('', ...notes);
  lines.push('', "👇 Qaysi tilda ko'rmoqchisiz?");
  return lines.join('\n');
}

export function buildKeyboard(guess) {
  // Tugmada faqat Wikidata ID saqlanadi — havolalar bosilganda yangidan olinadi (holat saqlanmaydi)
  const cb = (lang) => `w:${lang}:${guess.qid || '-'}`;
  const trailer = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${guess.title_en} ${guess.year || ''} trailer`,
  )}`;
  const extra = [Markup.button.url('🎞 Treyler', trailer)];
  if (guess.wikiUrl) extra.push(Markup.button.url('📖 Batafsil', guess.wikiUrl));
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🇺🇿 O'zbekcha", cb('uz')),
      Markup.button.callback('🇷🇺 Ruscha', cb('ru')),
      Markup.button.callback('🇬🇧 Inglizcha', cb('en')),
    ],
    extra,
  ]);
}

/** Kartochka matnidan nomlarni qayta o'qiydi (holat saqlamasdan ishlash uchun). */
export function parseCard(text = '') {
  const lines = text.split('\n').map((l) => l.trim());
  const kind = lines[0]?.match(/^✅ (Kino|Serial)/);
  if (!kind) return null;
  const year = Number(lines[0].match(/\b(?:19|20)\d{2}\b/)?.[0]) || null;
  const get = (flag) => lines.find((l) => l.startsWith(flag))?.slice(flag.length).trim() || '';
  const t = { kind: kind[1] === 'Serial' ? 'tv' : 'movie', year, uz: get('🇺🇿'), ru: get('🇷🇺'), en: get('🇬🇧') };
  if (!t.en && !t.ru && !t.uz) return null;
  t.en ||= t.ru || t.uz;
  t.ru ||= t.en;
  t.uz ||= t.en;
  return t;
}
