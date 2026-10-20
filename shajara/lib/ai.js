// AI yordamchi: bot haqidagi savollarga javob va har qanday fayldan shajara ro'yxatini tuzish.
// Provayder: GEMINI_API_KEY bo'lsa Google Gemini (bepul limit), aks holda Claude Haiku —
// ANTHROPIC_API_KEY bo'lsa to'g'ridan-to'g'ri, bo'lmasa Vercel AI Gateway (OIDC).
import zlib from 'node:zlib';
import Anthropic from '@anthropic-ai/sdk';
import { getVercelOidcToken } from '@vercel/functions/oidc';

const DIRECT = () => !!process.env.ANTHROPIC_API_KEY;
const GATEWAY_MODELS = ['anthropic/claude-haiku-5.5', 'anthropic/claude-haiku-5-5', 'anthropic/claude-haiku-4.5'];
let gwModel = null;

async function client() {
  if (DIRECT()) return new Anthropic();
  const token = process.env.AI_GATEWAY_API_KEY || (await getVercelOidcToken().catch(() => null)) || process.env.VERCEL_OIDC_TOKEN;
  if (!token) throw new Error('AI kaliti topilmadi');
  return new Anthropic({ apiKey: token, baseURL: 'https://ai-gateway.vercel.sh' });
}

// Claude kontent bloklarini Gemini "parts" ga aylantirish
const toParts = (content) => (typeof content === 'string' ? [{ text: content }] : content.map((b) =>
  b.type === 'text' ? { text: b.text } : { inline_data: { mime_type: b.source.media_type, data: b.source.data } }));

async function askGemini(params) {
  const models = [process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-2.5-flash'].filter(Boolean);
  let last;
  for (const model of models) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
      method: 'POST',
      signal: AbortSignal.timeout(params.json ? 240e3 : 45e3),
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: params.system ? { parts: [{ text: params.system }] } : undefined,
        contents: params.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: toParts(m.content) })),
        generationConfig: { maxOutputTokens: params.max_tokens, ...(params.json ? { responseMimeType: 'application/json' } : {}) },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return { model, content: [{ type: 'text', text: (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('') }] };
    last = new Error(`Gemini ${r.status}: ${j.error?.message || ''}`.slice(0, 300));
    if (r.status !== 404) throw last;
  }
  throw last;
}

async function ask({ json, ...params }) {
  if (process.env.GEMINI_API_KEY) return askGemini({ json, ...params });
  const c = await client();
  // uzun javoblar uchun oqim (stream) — HTTP vaqt chegarasiga tushmaslik uchun
  const run = (model) => c.messages.stream({ model, ...params }).finalMessage();
  if (DIRECT()) return run('claude-haiku-5-5');
  for (const model of gwModel ? [gwModel] : GATEWAY_MODELS) {
    try {
      const r = await run(model);
      gwModel = model;
      return r;
    } catch (e) {
      // noma'lum model nomi bo'lsa keyingisini sinaymiz
      if (!(e instanceof Anthropic.NotFoundError || e instanceof Anthropic.BadRequestError) || gwModel) throw e;
    }
  }
  throw new Error('AI modeli topilmadi');
}

const textOf = (r) => (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();

const LANG_NAME = { uz: "o'zbek (lotin)", uzc: 'o‘zbek (kirill)', ru: 'русский', en: 'English' };

const KNOWLEDGE = `Siz «Shajara iBot» (@Shajara_iBot) Telegram botining yordamchisisiz. Faqat shu bot, oila shajarasi va qarindoshlik mavzusida yordam berasiz.
Botning imkoniyatlari:
- Mini App (pastdagi «Shajara» tugmasi yoki /start): yangi shajara yaratish yoki shajara kodini kiritib kirish. Har shajarada 2 kod: kirish kodi (ko'rish uchun) va tahrir kodi (o'zgartirish uchun, 🔒 tugmasi orqali kiritiladi).
- Bo'limlar: Daraxt (bosh ajdoddan boshlanadi, ismni bosganda farzandlari ochiladi, ochilgan odamni yana bosganda ma'lumotlari; 🌳 tugmasi bilan «haqiqiy daraxt» ko'rinishi), Ro'yxat (avlodlar bo'yicha, qidiruv, filtrlar), Albom, Tahlil (statistika, tug'ilgan kunlar), Ko'proq (sozlamalar, a'zolar, taklif havolasi, eksport, premium).
- Odam qo'shish: tahrir rejimida «+» — bittalab yoki fayldan (CSV/JSON, namuna: ism;jins;tugilgan;vafot;ota;ona;turmush_ortogi;joy;telefon;izoh). Har bir odamga surat qo'yish mumkin.
- Botga /royxat yozib istalgan fayl (Excel, Word, PDF, rasm, matn) yuborilsa, AI uni shajara formatiga keltirib CSV qaytaradi va bir tugma bilan shajaraga qo'shib beradi (tahrirchilar uchun).
- Albom: fayllar shajaraga ulangan yopiq Telegram kanalda saqlanadi. Kanal ulash: yopiq kanal oching, botni admin qiling, ilovadagi «Kanalni ulash» kodini kanalga /ulash KOD deb yozing. Fayl qo'shish: botga rasm/video/audio/hujjat yuboring — bot albom va izohni so'raydi; guruhda faylga javoban /albom. Albomda tepaga-pastga surib ko'riladi, like, ko'rishlar soni, chatga yuborish bor.
- Oilaviy guruh: botni guruhga qo'shing va /ulash KOD yuboring. Guruh buyruqlari: /shajara, /albom, /tugilgan (yaqin 30 kundagi tug'ilgan kunlar, ismni bosib shu odamni ochish).
- Bildirishnomalar: yangi odam, albom, tug'ilgan kun va xotira kunlari (Ko'proq → sozlamalar).
- Tillar: o'zbek (lotin/kirill), rus, ingliz — /til yoki ilovadagi til tugmasi.
- Premium: Telegram Stars orqali, cheksiz albom va odamlar.
- Boshqa buyruqlar: /start, /yordam, /hikmat, /bekor, /royxat.
Qoidalar: qisqa va aniq javob bering (odatda 2-6 jumla, kerak bo'lsa qadamlar ro'yxati). Faqat oddiy matn, Markdown belgilarisiz. Bilmasangiz, to'qib chiqarmang — /yordam yoki ilovani tavsiya qiling. Boshqa mavzudagi savollarga xushmuomalalik bilan bot mavzusiga qaytaring.`;

/** Bot haqidagi savolga javob. history: [{role, content}] (oxirgi bir necha almashuv). */
export async function answerQuestion(question, history, lang) {
  const r = await ask({
    max_tokens: 2000,
    output_config: { effort: 'low' },
    system: `${KNOWLEDGE}\nJavob tili: ${LANG_NAME[lang] || LANG_NAME.uz}.`,
    messages: [...history, { role: 'user', content: question }],
  });
  return textOf(r) || '…';
}

// ------------------------------------------------------ Fayllarni o'qish --
/** Minimal ZIP o'quvchi (docx/xlsx uchun): { nom: Buffer } */
function unzip(buf) {
  const out = {};
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) return out;
  let p = buf.readUInt32LE(eocd + 16);
  const n = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < n && buf.readUInt32LE(p) === 0x02014b50; i++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const data = buf.subarray(off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28)).subarray(0, csize);
    try { out[name] = method === 8 ? zlib.inflateRawSync(data) : data; } catch {}
    p += 46 + nlen + elen + clen;
  }
  return out;
}
const unxml = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function docxText(buf) {
  const xml = unzip(buf)['word/document.xml']?.toString('utf8') || '';
  return unxml(xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t'));
}

function xlsxText(buf) {
  const z = unzip(buf);
  const shared = [...(z['xl/sharedStrings.xml']?.toString('utf8') || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unxml(m[1]));
  const sheets = Object.keys(z).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort();
  return sheets.map((k) => [...z[k].toString('utf8').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) =>
    [...row[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((c) => {
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] || '')?.[1] ?? unxml(/<is>([\s\S]*?)<\/is>/.exec(c[2] || '')?.[1] || '');
      return /t="s"/.test(c[1]) ? shared[Number(v)] ?? '' : v;
    }).join('\t')).join('\n')).join('\n\n');
}

/** Faylni Claude tushunadigan kontent bloklariga aylantirish. */
export function fileToContent(buffer, name = '', mime = '') {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (mime === 'application/pdf' || ext === 'pdf') return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }];
  const img = /^image\/(jpeg|png|gif|webp)$/.exec(mime)?.[0] || { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext];
  if (img) return [{ type: 'image', source: { type: 'base64', media_type: img, data: buffer.toString('base64') } }];
  let text;
  if (ext === 'docx') text = docxText(buffer);
  else if (ext === 'xlsx') text = xlsxText(buffer);
  else if (['doc', 'xls', 'ppt', 'pptx', 'zip', 'rar'].includes(ext)) return null;
  else text = buffer.toString('utf8');
  return [{ type: 'text', text: `Fayl «${name}»:\n\n${text.slice(0, 400000)}` }];
}

const PARSE_PROMPT = `Quyidagi materialdan oila shajarasi uchun odamlar ro'yxatini ajratib oling. Material har qanday ko'rinishda bo'lishi mumkin: jadval, matn, qo'lyozma rasmi, sxema.
Har bir odam uchun maydonlar:
name (ism, familiya bo'lsa qo'shib; bir xil ismli turli odamlarni ajratish uchun kerak bo'lsa qavsda farqlovchi belgi qo'shing, masalan «Ali (Karimning o'g'li)»),
gender ("erkak" yoki "ayol"; ismdan aniqlang),
birth (tug'ilgan yil yoki sana: "1958" yoki "20.03.1958"), death (vafot yili/sanasi; bo'lmasa bo'sh),
father, mother (otasi va onasining ismi — aynan ro'yxatdagi name bilan bir xil yozing), spouse (turmush o'rtog'i, ro'yxatdagi name bilan bir xil),
place (yashash joyi), phone, note (qo'shimcha ma'lumot).
Noma'lum maydonlarni bo'sh qoldiring, hech narsani to'qib chiqarmang. Ota-onasi materialda bo'lmasa bo'sh qoldiring.
Javobni FAQAT JSON ko'rinishida qaytaring: {"rows":[{...}], "summary":"foydalanuvchiga 1-2 jumlalik izoh (nechta odam, nimalarga e'tibor berish kerak)"}`;

const FIELDS = ['name', 'gender', 'birth', 'death', 'father', 'mother', 'spouse', 'place', 'phone', 'note'];

/** Materialdan shajara qatorlarini ajratish. content: Claude kontent bloklari. */
export async function extractFamily(content, lang) {
  const r = await ask({
    max_tokens: 32000,
    json: true,
    output_config: { effort: 'medium' },
    system: `Siz oila shajarasi ma'lumotlarini tartibga soluvchi yordamchisiz. summary maydonini ${LANG_NAME[lang] || LANG_NAME.uz} tilida yozing.`,
    messages: [{ role: 'user', content: [...content, { type: 'text', text: PARSE_PROMPT }] }],
  });
  const raw = textOf(r);
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  const data = JSON.parse(json);
  const rows = (Array.isArray(data.rows) ? data.rows : [])
    .map((x) => Object.fromEntries(FIELDS.map((k) => [k, String(x?.[k] ?? '').trim()])))
    .filter((x) => x.name);
  return { rows, summary: String(data.summary || '') };
}

/** Qatorlarni namuna.csv formatida qaytarish. */
export function rowsToCsv(rows) {
  const head = 'ism;jins;tugilgan;vafot;ota;ona;turmush_ortogi;joy;telefon;izoh';
  const cell = (v) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + [head, ...rows.map((r) => FIELDS.map((k) => cell(r[k] || '')).join(';'))].join('\n');
}

export async function aiHealth() {
  const r = await ask({ max_tokens: 200, output_config: { effort: 'low' }, messages: [{ role: 'user', content: 'Say OK' }] });
  return { ok: true, model: r.model, provider: process.env.GEMINI_API_KEY ? 'gemini' : DIRECT() ? 'anthropic' : 'gateway', text: textOf(r).slice(0, 20) };
}
