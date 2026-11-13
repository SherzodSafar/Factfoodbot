import { z } from 'zod';
import { generate, parseJson } from './ai.js';

// =====================================================================
// 1-bosqich: dalillarni tahlil qilish (kadrlar, izoh, subtitr)
// =====================================================================

const ANALYZE_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['movie', 'tv', 'unknown'] },
    scene: { type: 'string', description: 'Kadrda/dialogda nima borligi — 1–2 gap' },
    on_screen_text: { type: 'string', description: 'Kadrdagi yozuvlar (nom, titrlar), bo`lmasa bo`sh' },
    actors: {
      type: 'array',
      description: 'Tanilgan aktyorlar (ingliz tilidagi to`liq ismi), faqat ishonchli bo`lsa, 0–3 ta',
      items: { type: 'string' },
    },
    candidates: {
      type: 'array',
      description: 'O`z bilimingdan nomzod filmlar/seriallar, 0–3 ta',
      items: {
        type: 'object',
        properties: {
          title_en: { type: 'string' },
          year: { type: 'integer' },
          confidence: { type: 'number' },
        },
        required: ['title_en', 'year', 'confidence'],
      },
    },
    queries: {
      type: 'array',
      description:
        'Wikipedia`da qidirish uchun 1–3 ta qisqa so`rov: syujetning o`ziga xos kalit so`zlari, qahramon ismlari, aktyor + mavzu',
      items: {
        type: 'object',
        properties: { q: { type: 'string' }, lang: { type: 'string', enum: ['en', 'ru'] } },
        required: ['q', 'lang'],
      },
    },
  },
  required: ['kind', 'scene', 'on_screen_text', 'actors', 'candidates', 'queries'],
};

const Analysis = z.object({
  kind: z.enum(['movie', 'tv', 'unknown']).catch('unknown'),
  scene: z.string().catch(''),
  on_screen_text: z.string().catch(''),
  actors: z.array(z.string()).catch([]),
  candidates: z
    .array(z.object({ title_en: z.string().catch(''), year: z.coerce.number().catch(0), confidence: z.coerce.number().catch(0) }))
    .catch([]),
  queries: z.array(z.object({ q: z.string().catch(''), lang: z.enum(['en', 'ru']).catch('en') })).catch([]),
});

const ANALYZE_SYSTEM = `Sen kino va seriallarni taniydigan mutaxassissan. Vazifang — dalillarni tahlil qilish.
Foydalanuvchi kino/serialdan olingan kadrlar, ijtimoiy tarmoq videosining izohi, dialog subtitri yoki sahna tavsifini yuboradi.
- Aktyorlar yuzini, kadrdagi yozuvlarni, logotiplarni, kostyum va joylarni diqqat bilan ko'r.
- Izohda (caption) ko'pincha kino nomi, qahramon ismi yoki syujet yozilgan bo'ladi — undagi kalit so'zlarni ajrat.
- MUHIM: kino sening bilimingdan keyin (2025–2026) chiqqan bo'lishi mumkin. Shuning uchun nomzodlarga ko'r-ko'rona ishonma
  va queries'ga yangi filmni ham topa oladigan so'rovlar yoz: aktyor ismi + syujet kalit so'zlari, qahramon ismlari, o'ziga xos predmetlar.
- Ruscha izoh bo'lsa, lang="ru" so'rov ham qo'sh.`;

export async function analyze({ frames = [], text = '', transcript = '' }) {
  const parts = frames.map((data) => ({ inlineData: { mimeType: 'image/jpeg', data } }));
  const lines = [];
  if (frames.length > 1) lines.push(`Yuqorida bitta videodan olingan ${frames.length} ta kadr.`);
  else if (frames.length === 1) lines.push('Yuqorida kinodan olingan kadr (skrinshot yoki video muqovasi).');
  if (text) lines.push(`Video izohi / foydalanuvchi yozgani:\n"""${text.slice(0, 2500)}"""`);
  if (transcript) lines.push(`Videodagi dialog subtitri:\n"""${transcript.slice(0, 4000)}"""`);
  lines.push('Dalillarni tahlil qil.');
  parts.push({ text: lines.join('\n\n') });

  const { text: out, model } = await generate({ parts, system: ANALYZE_SYSTEM, json: ANALYZE_SCHEMA, thinking: 'LOW' });
  const a = Analysis.safeParse(parseJson(out) ?? {});
  if (!a.success) return null;
  const r = a.data;
  r.actors = r.actors.filter(Boolean).slice(0, 3);
  r.candidates = r.candidates.filter((c) => c.title_en).slice(0, 3);
  r.queries = r.queries.filter((q) => q.q).slice(0, 3);
  console.log(
    `🔬 [${model}] aktyorlar: ${r.actors.join(', ') || '-'} | nomzodlar: ${r.candidates.map((c) => `${c.title_en} ${c.year}`).join('; ') || '-'} | so'rovlar: ${r.queries.map((q) => q.q).join(' / ') || '-'}`,
  );
  return r;
}

// =====================================================================
// 2-bosqich: Wikipedia nomzodlari orasidan tanlash
// =====================================================================

const CHOOSE_SCHEMA = {
  type: 'object',
  properties: {
    index: { type: 'integer', description: 'Mos nomzod raqami; hech biri mos kelmasa -1' },
    confidence: { type: 'number', description: '0..1' },
    kind: { type: 'string', enum: ['movie', 'tv'] },
    title_en: { type: 'string' },
    title_ru: { type: 'string', description: 'Rus prokatidagi nomi' },
    title_uz: { type: 'string', description: "O'zbekcha nomi (lotin); rasmiysi bo'lmasa ruscha nomining lotincha o'girmasi" },
    title_original: { type: 'string' },
    year: { type: 'integer', description: "Noma'lum bo'lsa 0" },
    season: { type: 'integer', description: "Noma'lum bo'lsa 0" },
    episode: { type: 'integer', description: "Noma'lum bo'lsa 0" },
    genres_uz: { type: 'array', items: { type: 'string' } },
    overview_uz: { type: 'string', description: "1–2 gaplik spoilersiz mazmun, o'zbekcha (lotin)" },
    evidence: { type: 'string', description: 'Qisqa: nimaga qarab tanlandi' },
  },
  required: [
    'index', 'confidence', 'kind', 'title_en', 'title_ru', 'title_uz', 'title_original',
    'year', 'season', 'episode', 'genres_uz', 'overview_uz', 'evidence',
  ],
};

const str = z.string().catch('');
const num = z.coerce.number().catch(0);
const Choice = z.object({
  index: z.coerce.number().int().catch(-1),
  confidence: num,
  kind: z.enum(['movie', 'tv']).catch('movie'),
  title_en: str,
  title_ru: str,
  title_uz: str,
  title_original: str,
  year: num,
  season: num,
  episode: num,
  genres_uz: z.array(z.string()).catch([]),
  overview_uz: str,
  evidence: str,
});

const CHOOSE_SYSTEM = `Sen kino va seriallarni taniydigan mutaxassissan.
Senga dalillar (kadrlar, izoh, subtitr, birinchi tahlil) va Wikipedia'dan topilgan nomzodlar ro'yxati beriladi.
- Dalillarga eng mos nomzodni tanla (index). Syujet, qahramonlar, aktyorlar, kadrdagi yozuvlar va yilni solishtir.
- Nomzod yonidagi [aktyor: X] — tanilgan aktyor X shu filmda o'ynagan degani. Bir nechta tanilgan aktyor birga
  o'ynagan nomzod — juda kuchli dalil.
- Video yangi (2025–2026) film bo'lishi mumkin va sen uni bilmasliging mumkin. Wikipedia nomzodlariga ishon,
  o'z bilimingdagi eski filmlarni afzal ko'rma.
- Ro'yxatda yo'q filmni (index=-1) faqat kadrdagi yozuv yoki izohda uning nomi aniq yozilgan bo'lsa tanla.
  Aks holda ro'yxatdan eng mosini tanla; hech biri mos kelmasa index=-1 va confidence ≤ 0.5.
- confidence — haqiqiy ishonching (0..1).
- Nomzod tanlansa, nomlar va yil uchun uning ma'lumotlaridan foydalan (ru/uz nomlari berilgan bo'lsa — ularni ol).
- title_ru — rus prokatidagi nomi; title_uz — o'zbekcha nomi: rasmiy o'zbekcha nomi bo'lmasa, rus prokatidagi nomini o'zbek lotin yozuviga o'gir (masalan «Курьер» → «Kuryer», «Бамблби» → «Bamblbi»).
- genres_uz va overview_uz — o'zbek tilida (lotin), overview spoilersiz 1–2 gap.`;

/**
 * @param {{frames?: string[], text?: string, transcript?: string, analysis: any, candidates: any[]}} p
 */
export async function choose({ frames = [], text = '', transcript = '', analysis, candidates }) {
  const parts = frames.map((data) => ({ inlineData: { mimeType: 'image/jpeg', data } }));
  const lines = [];
  if (frames.length) lines.push(`Yuqorida ${frames.length} ta kadr.`);
  if (text) lines.push(`Video izohi / foydalanuvchi yozgani:\n"""${text.slice(0, 2000)}"""`);
  if (transcript) lines.push(`Dialog subtitri:\n"""${transcript.slice(0, 3000)}"""`);
  if (analysis) {
    lines.push(
      `Birinchi tahlil: sahna — ${analysis.scene}; kadrdagi yozuv — ${analysis.on_screen_text || "yo'q"}; ` +
        `aktyorlar — ${analysis.actors.join(', ') || "noma'lum"}; ` +
        `taxminlar — ${analysis.candidates.map((c) => `${c.title_en} (${c.year})`).join(', ') || "yo'q"}.`,
    );
  }
  if (candidates.length) {
    lines.push(
      "Wikipedia nomzodlari:\n" +
        candidates
          .map((c, i) => {
            const names = [c.labels?.ru && `ru: ${c.labels.ru}`, c.labels?.uz && `uz: ${c.labels.uz}`].filter(Boolean).join(', ');
            const src = c.sources?.filter((x) => x.startsWith('aktyor')).join('; ');
            return `[${i}] ${c.title}${c.description ? ` — ${c.description}` : ''}${names ? ` (${names})` : ''}${src ? ` [${src}]` : ''}\n    ${c.extract.slice(0, 450)}`;
          })
          .join('\n'),
    );
  } else {
    lines.push("Wikipedia nomzodlari topilmadi — o'z bilimingdan javob ber (index=-1).");
  }
  lines.push('Qaysi film yoki serial?');
  parts.push({ text: lines.join('\n\n') });

  const { text: out, model } = await generate({ parts, system: CHOOSE_SYSTEM, json: CHOOSE_SCHEMA, thinking: 'LOW' });
  const parsed = Choice.safeParse(parseJson(out) ?? {});
  if (!parsed.success) return null;
  const r = parsed.data;
  if (r.index >= candidates.length) r.index = -1;
  console.log(
    `🎯 [${model}] #${r.index} ${r.title_en || '-'} (${r.year}) ${r.confidence} — ${r.evidence.slice(0, 160)}`,
  );
  if (!(r.title_en || r.title_ru || r.title_original)) return null;
  r.title_en ||= r.title_original || r.title_ru;
  r.title_ru ||= r.title_en;
  r.title_uz ||= r.title_en;
  return r;
}

// =====================================================================
// Audio -> subtitr
// =====================================================================

/** @returns {Promise<string>} subtitr matni yoki bo'sh satr (nutq bo'lmasa) */
export async function transcribe(audioBase64) {
  const { text } = await generate({
    parts: [
      { inlineData: { mimeType: 'audio/mp3', data: audioBase64 } },
      {
        text:
          'Audiodagi barcha nutqni o\'z tilida so\'zma-so\'z yozib ber, subtitr ko\'rinishida: "[00:03] matn". ' +
          "Musiqa yoki shovqinni yozma. Nutq umuman bo'lmasa, faqat NO_SPEECH deb javob ber.",
      },
    ],
  });
  const t = text.trim();
  if (!t || /^NO_SPEECH/i.test(t)) return '';
  return t.slice(0, 5000);
}
