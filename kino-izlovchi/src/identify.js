import { z } from 'zod';
import { generate, parseJson } from './ai.js';
import { PLATFORMS } from './platforms.js';

const keysOf = (lang) => Object.keys(PLATFORMS[lang]);

// Gemini'ga beriladigan javob sxemasi (JSON Schema)
const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean', description: 'Aniq yoki ehtimoliy nomzod topildimi' },
    kind: { type: 'string', enum: ['movie', 'tv'] },
    title_en: { type: 'string', description: 'Inglizcha nomi' },
    title_ru: { type: 'string', description: 'Ruscha prokat nomi' },
    title_uz: { type: 'string', description: "O'zbekcha nomi (lotin yozuvida)" },
    title_original: { type: 'string', description: 'Asl tildagi nomi' },
    year: { type: 'integer', description: 'Chiqqan yili, noma`lum bo`lsa 0' },
    season: { type: 'integer', description: 'Serial fasli, noma`lum bo`lsa 0' },
    episode: { type: 'integer', description: 'Serial qismi, noma`lum bo`lsa 0' },
    confidence: { type: 'number', description: '0..1 — qanchalik ishonchli' },
    genres_uz: { type: 'array', items: { type: 'string' } },
    overview_uz: { type: 'string', description: "1–2 gaplik spoilersiz mazmun, o'zbekcha" },
    evidence: { type: 'string', description: 'Qisqa: nimaga qarab aniqlandi' },
    platforms_uz: { type: 'array', items: { type: 'string', enum: keysOf('uz') } },
    platforms_ru: { type: 'array', items: { type: 'string', enum: keysOf('ru') } },
    platforms_en: { type: 'array', items: { type: 'string', enum: keysOf('en') } },
  },
  required: [
    'found', 'kind', 'title_en', 'title_ru', 'title_uz', 'title_original', 'year', 'season',
    'episode', 'confidence', 'genres_uz', 'overview_uz', 'evidence',
    'platforms_uz', 'platforms_ru', 'platforms_en',
  ],
};

// Model javobini tekshirish (xato maydonlar xavfsiz standart qiymatga tushadi)
const str = z.string().catch('');
const num = z.coerce.number().catch(0);
const keys = (lang) => z.array(z.string()).catch([]).transform((a) => a.filter((k) => PLATFORMS[lang][k]));
const Result = z.object({
  found: z.boolean().catch(false),
  kind: z.enum(['movie', 'tv']).catch('movie'),
  title_en: str,
  title_ru: str,
  title_uz: str,
  title_original: str,
  year: num,
  season: num,
  episode: num,
  confidence: num,
  genres_uz: z.array(z.string()).catch([]),
  overview_uz: str,
  evidence: str,
  platforms_uz: keys('uz'),
  platforms_ru: keys('ru'),
  platforms_en: keys('en'),
});

const SYSTEM = `Sen kino va seriallarni taniydigan mutaxassissan.
Foydalanuvchi kino/serialdan olingan kadrlar, video sarlavhasi/tavsifi, dialog subtitri yoki sahna tavsifini yuboradi.
Vazifang — aynan qaysi film yoki serial ekanini aniqlash.
- Aktyorlar yuzi, kostyumlar, joylar, kadrdagi yozuvlar va logotiplar, davr va operatorlik uslubiga e'tibor ber.
- Ijtimoiy tarmoq videosining sarlavhasi, tavsifi va teglari ko'pincha kino nomini o'z ichiga oladi — kadrlar bilan solishtir, lekin ko'r-ko'rona ishonma.
- Dialog subtitri berilsa, taniqli iboralar, qahramonlar ismlari va voqealarga tayan.
- Nomzoding bo'lsa found=true. confidence — haqiqiy ishonching (0..1): taxmin bo'lsa past qo'y. Umuman topa olmasang found=false va satrlarni bo'sh qoldir.
- title_en — inglizcha nomi, title_ru — rus prokatidagi nomi, title_uz — o'zbekcha nomi (rasmiy o'zbekcha nomi bo'lmasa, inglizchasini o'zbek lotin yozuviga moslab yoz), title_original — asl tildagi nomi.
- Serial bo'lsa kind="tv", aniqlay olsang season/episode ni ham yoz (bilmasang 0).
- genres_uz va overview_uz — o'zbek tilida (lotin), overview spoilersiz 1–2 gap.
- platforms_uz/ru/en — shu tilda bu kino QONUNIY ravishda bo'lishi ehtimoli yuqori bo'lgan platformalar (faqat ro'yxatdagi kalitlar, 0–4 ta). Bilmasang bo'sh qoldir.`;

/**
 * Kadrlar, matn va/yoki dialog subtitri bo'yicha kinoni aniqlaydi.
 * @param {{frames?: string[], text?: string, transcript?: string}} input
 * @returns {Promise<z.infer<typeof Result> | null>}
 */
export async function identifyMovie({ frames = [], text = '', transcript = '' }) {
  const parts = frames.map((data) => ({ inlineData: { mimeType: 'image/jpeg', data } }));
  const lines = [];
  if (frames.length > 1) lines.push(`Yuqorida bitta videodan olingan ${frames.length} ta kadr.`);
  else if (frames.length === 1) lines.push('Yuqorida kinodan olingan kadr (skrinshot).');
  if (text) lines.push(`Qo'shimcha ma'lumot (video sarlavhasi/tavsifi yoki foydalanuvchi yozgani):\n"""${text.slice(0, 2500)}"""`);
  if (transcript) lines.push(`Videodagi dialog subtitri:\n"""${transcript.slice(0, 4000)}"""`);
  lines.push('Bu qaysi film yoki serial?');
  parts.push({ text: lines.join('\n\n') });

  const { text: out, model } = await generate({ parts, system: SYSTEM, json: RESULT_SCHEMA });
  const parsed = Result.safeParse(parseJson(out) ?? {});
  if (!parsed.success) return null;
  const r = parsed.data;
  console.log(`🎯 [${model}] ${r.found ? `${r.title_en} (${r.year}) ${r.confidence}` : 'topilmadi'} — ${r.evidence.slice(0, 160)}`);
  if (!r.found || !(r.title_en || r.title_ru || r.title_original)) return null;
  r.title_en ||= r.title_original || r.title_ru;
  r.title_ru ||= r.title_en;
  r.title_uz ||= r.title_en;
  return r;
}

/**
 * Audioni subtitrga (matnga) aylantiradi.
 * @returns {Promise<string>} subtitr matni yoki bo'sh satr (nutq bo'lmasa)
 */
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
    thinking: 'LOW',
  });
  const t = text.trim();
  if (!t || /^NO_SPEECH/i.test(t)) return '';
  return t.slice(0, 5000);
}
