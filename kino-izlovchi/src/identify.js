import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { config } from './config.js';

let _client = null;
const client = () => (_client ??= new Anthropic());

// Rad etilgan (refusal) so'rovlar boshqa modelda avtomatik qayta bajariladi.
const FALLBACK = {
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default',
};

const IdentifySchema = z.object({
  found: z.boolean(),
  kind: z.enum(['movie', 'tv']),
  title_original: z.string(),
  title_ru: z.string(),
  year: z.number().int().nullable(),
  season: z.number().int().nullable(),
  episode: z.number().int().nullable(),
  confidence: z.number(),
  genres: z.array(z.string()),
  overview_uz: z.string(),
});

const SYSTEM = `Sen kino va seriallarni taniydigan mutaxassissan.
Foydalanuvchi kino/serialdan olingan kadrlar yoki sahna tavsifini yuboradi. Vazifang — aynan qaysi film yoki serial ekanini aniqlash.
- Aktyorlar, kostyumlar, joylar, kadrdagi yozuvlar, logotiplar, operatorlik uslubi va davrga e'tibor ber.
- Faqat ishonching yetarli bo'lsa found=true qilib qaytar. Taxmin qilayotgan bo'lsang confidence'ni past qo'y (0..1).
- Agar ijtimoiy tarmoq videosining sarlavhasi/tavsifi/teglari berilgan bo'lsa, ular ko'pincha kino nomini yoki ishorani o'z ichiga oladi — ularni kadrlar bilan solishtir, lekin ko'r-ko'rona ishonma.
- Topa olmasang found=false, qolgan satr maydonlarini bo'sh qoldir.
- title_original — asl nomi (odatda inglizcha), title_ru — ruscha prokat nomi.
- Serial bo'lsa kind="tv", aniqlay olsang season/episode ni ham yoz.
- genres — o'zbek tilida, overview_uz — syujetning 1–2 gaplik qisqa mazmuni o'zbek tilida (spoilersiz).`;

/**
 * Kadrlar va/yoki matn bo'yicha kinoni aniqlaydi.
 * @param {{frames?: string[], text?: string}} input
 */
export async function identifyMovie({ frames = [], text = '' }) {
  const content = [];
  for (const data of frames) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
  }
  const parts = [];
  if (frames.length) parts.push(`Yuqorida bitta videodan olingan ${frames.length} ta kadr.`);
  if (text) parts.push(`Foydalanuvchi izohi/tavsifi: """${text.slice(0, 1500)}"""`);
  parts.push('Bu qaysi film yoki serial?');
  content.push({ type: 'text', text: parts.join('\n') });

  const response = await client().beta.messages.parse({
    ...FALLBACK,
    model: config.model,
    max_tokens: 16000,
    output_config: { effort: 'medium', format: betaZodOutputFormat(IdentifySchema) },
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal' || !response.parsed_output) return null;
  const result = response.parsed_output;
  if (!result.found || !result.title_original || result.confidence < 0.35) return null;
  return result;
}

/** Matnni o'zbek tiliga tarjima qiladi. */
export async function translateToUzbek(text) {
  const response = await client().beta.messages.create({
    ...FALLBACK,
    model: config.model,
    max_tokens: 4000,
    output_config: { effort: 'low' },
    system:
      "Sen tarjimonsan. Berilgan matnni tabiiy, ravon o'zbek tiliga (lotin yozuvida) tarjima qil. Faqat tarjimaning o'zini qaytar.",
    messages: [{ role: 'user', content: text }],
  });
  if (response.stop_reason === 'refusal') return null;
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

const watchCache = new Map();

const WATCH_SYSTEM = `Sen foydalanuvchiga kino yoki serialni QONUNIY ravishda onlayn qayerda ko'rish mumkinligini topib beruvchi yordamchisan.
Qoidalar:
- Faqat rasmiy, litsenziyali manbalarni ko'rsat: rasmiy striming servislari (Netflix, Prime Video, Disney+, Apple TV, Kinopoisk, Okko, Ivi, Start, Amediateka, Wink, Premier, itv.uz, Splay va h.k.), studiya yoki rasmiy distribyutorning YouTube kanali, reklamali bepul servislar (Tubi, Pluto TV, Plex, Kanopy, Freevee, YouTube Movies bepul bo'limi).
- Piratlik saytlari, "bepul yuklab olish" saytlari, torrentlar va noqonuniy yuklangan videolarni HECH QACHON ko'rsatma.
- Avval BEPUL va qonuniy variantlarni qidir; topilmasa — obuna yoki ijaraga olinadigan rasmiy variantlarni ko'rsat.
- Iloji bo'lsa, o'zbek yoki rus tilidagi rasmiy variantni ham ko'rsat.
Javob formati (o'zbek tilida, oddiy matn, markdown ishlatma, 12 qatordan oshmasin):
🆓 Bepul (qonuniy):
• Platforma nomi — izoh — to'liq URL
💳 Obuna / ijara:
• Platforma nomi — izoh — to'liq URL
Bepul variant topilmasa, shuni ochiq ayt. Faqat qidiruvda tasdiqlangan havolalarni yoz, o'ylab topma.`;

/** Internetdan qonuniy (iloji bo'lsa bepul) ko'rish joylarini qidiradi. */
export async function findWhereToWatch({ title, originalTitle, year, kind }) {
  const key = `${originalTitle || title}|${year || ''}`;
  if (watchCache.has(key)) return watchCache.get(key);

  const what = `${kind === 'tv' ? 'Serial' : 'Film'}: "${originalTitle || title}"${title && title !== originalTitle ? ` (${title})` : ''}${year ? `, ${year}` : ''}`;
  const tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }];
  const messages = [{ role: 'user', content: `${what}\nUni qonuniy ravishda onlayn qayerda ko'rish mumkin? Avval bepul variantlarni top.` }];

  let response;
  const acc = []; // pause_turn bo'lsa, javob qismlarini yig'amiz
  for (let i = 0; i < 4; i++) {
    response = await client().beta.messages.create({
      ...FALLBACK,
      model: config.model,
      max_tokens: 8000,
      output_config: { effort: 'low' },
      system: WATCH_SYSTEM,
      tools,
      messages,
    });
    acc.push(...response.content);
    if (response.stop_reason !== 'pause_turn') break;
    // Server qidiruvni davom ettiradi — shu paytgacha bo'lgan javobni qaytarib yuboramiz
    messages.splice(1, messages.length - 1, { role: 'assistant', content: [...acc] });
  }
  if (response.stop_reason === 'refusal') return null;
  const text = acc
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (text) {
    watchCache.set(key, text);
    if (watchCache.size > 1000) watchCache.delete(watchCache.keys().next().value);
  }
  return text || null;
}
