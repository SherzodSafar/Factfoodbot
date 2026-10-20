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

// O'ylash darajasi: chat uchun minimal (tez), fayl uchun past. Model qo'llamasa keyingi variant sinanadi
// (Gemini 3: thinkingLevel, Gemini 2.5: thinkingBudget, eski modellar: umuman yo'q).
const THINK = {
  fast: [{ thinkingLevel: 'minimal' }, { thinkingBudget: 0 }, null],
  deep: [{ thinkingLevel: 'low' }, { thinkingBudget: 2048 }, null],
};
const thinkOk = new Map();
// O'lchov (Vercel fra1, bepul tarif): flash-lite chat ~3 s, fayl ~2.5 s; flash-latest 40 s+ (zaxira sifatida)
export const CHAT_MODELS = () => [...new Set([process.env.GEMINI_CHAT_MODEL, 'gemini-flash-lite-latest', 'gemini-flash-latest'].filter(Boolean))];
const FILE_MODELS = () => [...new Set([process.env.GEMINI_MODEL, 'gemini-flash-lite-latest', 'gemini-flash-latest'].filter(Boolean))];

export async function askGemini({ system, messages, max_tokens, json, mode = 'fast', models, timeout }) {
  let last;
  for (const model of models || (mode === 'fast' ? CHAT_MODELS() : FILE_MODELS())) {
    const variants = THINK[mode];
    for (let i = thinkOk.get(model + mode) ?? 0; i < variants.length; i++) {
      const tc = variants[i];
      let r, j;
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
          method: 'POST',
          signal: AbortSignal.timeout(timeout || (mode === 'fast' ? 20e3 : 120e3)),
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: system ? { parts: [{ text: system }] } : undefined,
            contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: toParts(m.content) })),
            generationConfig: { maxOutputTokens: max_tokens, ...(tc ? { thinkingConfig: tc } : {}), ...(json ? { responseMimeType: 'application/json' } : {}) },
          }),
        });
        j = await r.json().catch(() => ({}));
      } catch (e) {
        last = new Error(`Gemini ${model}: ${e.name === 'TimeoutError' ? 'vaqt tugadi' : e.message}`);
        break; // keyingi modelga
      }
      if (r.ok) {
        thinkOk.set(model + mode, i);
        const text = (j.candidates?.[0]?.content?.parts || []).filter((x) => !x.thought).map((x) => x.text || '').join('');
        return { model, content: [{ type: 'text', text }] };
      }
      last = new Error(`Gemini ${model} ${r.status}: ${j.error?.message || ''}`.slice(0, 300));
      if (r.status === 400 && i < variants.length - 1) continue; // o'ylash sozlamasini qo'llamadi
      if (r.status === 404 || r.status === 429 || r.status >= 500 || r.status === 400) break; // limit har model uchun alohida
      throw last;
    }
  }
  throw last;
}

async function ask({ json, mode, ...params }) {
  if (process.env.GEMINI_API_KEY) return askGemini({ json, mode, ...params });
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

const KNOWLEDGE = `Siz «Shajara AI» (@ShajaraAiBot) Telegram botining yordamchisisiz. Faqat shu bot, oila shajarasi va qarindoshlik mavzusida yordam berasiz.
Botning imkoniyatlari:
- Mini App (pastdagi «Shajara» tugmasi yoki /start): yangi shajara yaratish yoki shajara kodini kiritib kirish. Har shajarada 2 kod: kirish kodi (ko'rish uchun) va tahrir kodi (o'zgartirish uchun, 🔒 tugmasi orqali kiritiladi).
- Bo'limlar: Daraxt (bosh ajdoddan boshlanadi, ismni bosganda farzandlari ochiladi, ochilgan odamni yana bosganda ma'lumotlari; 🌳 tugmasi bilan «haqiqiy daraxt» ko'rinishi), Ro'yxat (avlodlar bo'yicha, qidiruv, filtrlar), Albom, Tahlil (statistika, tug'ilgan kunlar), Ko'proq (sozlamalar, a'zolar, taklif havolasi, eksport, premium).
- Odam qo'shish: tahrir rejimida «+» — bittalab yoki fayldan (CSV/JSON, namuna: ism;jins;tugilgan;vafot;ota;ona;turmush_ortogi;joy;telefon;izoh). Har bir odamga surat qo'yish mumkin.
- Botga /royxat yozib istalgan fayl (Excel, Word, PDF, rasm, matn) yuborilsa, AI uni shajara formatiga keltirib CSV qaytaradi va bir tugma bilan shajaraga qo'shib beradi (tahrirchilar uchun).
- Albom: fayllar shajaraga ulangan yopiq Telegram kanalda saqlanadi. Kanal ulash: yopiq kanal oching, botni admin qiling, ilovadagi «Kanalni ulash» kodini kanalga /ulash KOD deb yozing. Fayl qo'shish: botga rasm/video/audio/hujjat yuboring — bot albom va izohni so'raydi; guruhda faylga javoban /albom. Albomda tepaga-pastga surib ko'riladi, like, ko'rishlar soni, chatga yuborish bor.
- Oilaviy guruh: botni guruhga qo'shing va /ulash KOD yuboring. Guruh buyruqlari: /shajara, /albom, /tugilgan (yaqin 30 kundagi tug'ilgan kunlar, ismni bosib shu odamni ochish).
- Bildirishnomalar: yangi odam, albom, tug'ilgan kun va xotira kunlari (Ko'proq → sozlamalar).
- Tillar: o'zbek (lotin/kirill), rus, ingliz — /til yoki ilovadagi til tugmasi.
- Fayldan import qilinganda shajarada bor odamlar qayta qo'shilmaydi; xato import AI oynasidagi «↩️ Bekor qilish» bilan qaytariladi. Ikkilangan odamlar: Ko'proq → «🧹 Takroriy odamlar» — birlashtirish.
- Albomda ochiladigan hajm: rasm 4 MB gacha, video va audio 20 MB gacha; kattaroq fayllar va hujjatlar «Chatga yuborish» tugmasi bilan asl sifatda chatga yuboriladi (Telegram bot cheklovi).
- Ilovada har sahifada 🤖 suzuvchi tugma — AI yordamchi (uni barmoq bilan surib boshqa joyga qo'yish mumkin).
- Premium: Telegram Stars orqali, cheksiz albom va odamlar.
- Boshqa buyruqlar: /start, /yordam, /hikmat, /bekor, /royxat.
Qoidalar: qisqa va aniq javob bering (odatda 2-6 jumla, kerak bo'lsa qadamlar ro'yxati). Faqat oddiy matn, Markdown belgilarisiz. Bilmasangiz, to'qib chiqarmang — /yordam yoki ilovani tavsiya qiling. Boshqa mavzudagi savollarga xushmuomalalik bilan bot mavzusiga qaytaring.`;

// Markdown belgilarini oddiy matnga aylantirish (Telegram va ilovada toza ko'rinsin)
const plain = (s) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/^#{1,6}\s*/gm, '')
  .replace(/^\s*[*-]\s+/gm, '• ').replace(/`([^`]+)`/g, '$1').trim();

/** Bot haqidagi savolga javob. history: [{role, content}] (oxirgi bir necha almashuv). */
export async function answerQuestion(question, history, lang) {
  const r = await ask({
    max_tokens: 3000,
    mode: 'fast',
    output_config: { effort: 'low' },
    system: `${KNOWLEDGE}\nJavob tili: ${LANG_NAME[lang] || LANG_NAME.uz}.`,
    messages: [...history, { role: 'user', content: question }],
  });
  const text = plain(textOf(r));
  if (!text) throw new Error('Bo‘sh javob');
  return text;
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

// Matnli fayl: UTF-8 bo'lmasa (eski Windows fayllari) Windows-1251 deb o'qiymiz — aks holda ‘ va kirill harflari buziladi
function decodeText(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1251').decode(buf); }
}

/** Faylni AI tushunadigan kontent bloklariga aylantirish (o'qib bo'lmasa null). */
export function fileToContent(buffer, name = '', mime = '') {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (mime === 'application/pdf' || ext === 'pdf') return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }];
  const img = /^image\/(jpeg|png|gif|webp)$/.exec(mime)?.[0] || { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext];
  if (img) return [{ type: 'image', source: { type: 'base64', media_type: img, data: buffer.toString('base64') } }];
  let text;
  if (ext === 'docx') text = docxText(buffer);
  else if (ext === 'xlsx') text = xlsxText(buffer);
  else if (['doc', 'xls', 'ppt', 'pptx', 'zip', 'rar', '7z', 'apk', 'exe'].includes(ext)) return null;
  else text = decodeText(buffer);
  return [{ type: 'text', text: `File «${name}»:\n\n${text.slice(0, 400000)}` }];
}

const PARSE_PROMPT = (lang) => `Extract EVERY person from the material above to build a family tree. The material can be in any form: a table, free text, a numbered outline (e.g. "1-2-3. Name"), a scanned or handwritten page, a chart. Spouses mentioned inline ("ayoli - X", "eri - Y", "wife", "husband") are separate people too.
Output one array per person: [id, name, gender, birth, death, father_id, mother_id, spouse_id, note]
- id: unique string "1", "2", ... Different people with the same name get different ids.
- name: the name exactly as written (only fix obvious encoding garbage), without the numbering.
- gender: "m" or "f" (infer from the name and words like o'g'li/qizi/eri/ayoli/son/daughter).
- birth, death: "YYYY" or "DD.MM.YYYY". Source dates may be written YYYY.DD.MM or YYYY.MM.DD — a number greater than 12 is the day. If day/month is unclear, give only the year. If the person is said to be dead but no date is given, death = "+".
- father_id, mother_id: ids of the parents from this same list. Numbering in the source may be inconsistent — resolve parents by meaning (a header like "X farzandlari:" means the children of X) and by names. A child's other parent is normally the spouse of the listed parent; when a man has several wives, give each child the right mother.
- spouse_id: id of the husband or wife.
- note: short extra info, or "".
Use "" for unknown fields. Never invent data. Skip entries that have no name.
IMPORTANT: output the COMPLETE list — every single person, to the very end. Do not summarize, shorten or stop early.
Return ONLY JSON: {"summary":"<1-2 sentences for the user in ${LANG_NAME[lang] || LANG_NAME.uz}>","people":[[...],...]}`;

const MORE_PROMPT = (n, next) => `Your list has ${n} people, but the material contains more. Continue: output ONLY the people who are not in your list yet, with new ids starting from "${next}", linking father_id/mother_id/spouse_id to ids already used. If nobody is missing, return {"people":[]}. Return ONLY JSON: {"people":[[...],...]}`;

// Javob kesilib qolsa ham to'liq qatorlarni ajratib olamiz
const ROW_RE = /\[(?:\s*(?:"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|null)\s*,){8}\s*(?:"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|null)\s*\]/g;
function parsePeople(raw) {
  let data = null;
  try { data = JSON.parse(raw); } catch { try { data = JSON.parse(raw.match(/[[{][\s\S]*[\]}]/)?.[0] || 'null'); } catch {} }
  let list = Array.isArray(data) ? data : Array.isArray(data?.people) ? data.people : Array.isArray(data?.rows) ? data.rows : null;
  if (!list) list = (raw.match(ROW_RE) || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
  const summary = typeof data?.summary === 'string' ? data.summary : /"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw)?.[1] || '';
  const str = (v) => String(v ?? '').trim();
  const rows = list.map((x) => (Array.isArray(x)
    ? { id: x[0], name: x[1], gender: x[2], birth: x[3], death: x[4], father: x[5], mother: x[6], spouse: x[7], note: x[8] }
    : { id: x?.id, name: x?.name ?? x?.ism, gender: x?.gender ?? x?.jins, birth: x?.birth ?? x?.tugilgan, death: x?.death ?? x?.vafot,
      father: x?.father_id ?? x?.father ?? x?.ota, mother: x?.mother_id ?? x?.mother ?? x?.ona, spouse: x?.spouse_id ?? x?.spouse, note: x?.note ?? x?.izoh }))
    .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, str(v)])))
    .filter((r) => r.name && /\p{L}/u.test(r.name));
  return { rows, summary };
}

// Matndagi taxminiy odamlar soni (to'liqlikni tekshirish uchun): ismli qatorlar + "eri/ayoli - Ism"
function estimatePeople(content) {
  const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  if (!text) return 0;
  let n = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!/\p{Lu}\p{Ll}{2,}/u.test(line) || /farzandlari\s*:?\s*$/i.test(line.trim())) continue;
    n += 1 + (/(ayoli|eri|xotini|wife|husband)\s*[-–:]?\s*\p{Lu}\p{Ll}/iu.test(line) ? 1 : 0);
  }
  return n;
}

// AI xatolarini kod bilan to'g'rilash: jinsga qarab ota/ona joyi, yo'q havolalar,
// ikkinchi ota-ona yozilmagan bo'lsa — yagona turmush o'rtog'i
function fixParents(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const r of rows) {
    for (const k of ['father', 'mother', 'spouse']) if (r[k] && (!byId.has(r[k]) || r[k] === r.id)) r[k] = '';
    if (r.mother && r.mother === r.father) r.mother = '';
  }
  const spouses = new Map();
  const addSp = (a, b) => {
    if (!a || !b || a === b) return;
    if (!spouses.has(a)) spouses.set(a, new Set());
    spouses.get(a).add(b);
  };
  for (const r of rows) if (r.spouse) { addSp(r.id, r.spouse); addSp(r.spouse, r.id); }
  const g = (id) => byId.get(id)?.gender;
  for (const r of rows) {
    if (g(r.father) === 'f' && (!r.mother || g(r.mother) === 'm')) [r.father, r.mother] = [r.mother, r.father];
    else if (!r.father && g(r.mother) === 'm') [r.father, r.mother] = [r.mother, ''];
    const one = r.father || r.mother;
    if (one && !(r.father && r.mother)) {
      const sp = [...(spouses.get(one) || [])].filter((x) => x !== r.id);
      if (sp.length === 1) {
        if (r.father) r.mother = sp[0];
        else r.father = sp[0];
      }
    }
  }
  return rows;
}

/** Materialdan shajara qatorlarini ajratish: rows[{id,name,gender,birth,death,father,mother,spouse,note}] (ota/ona/juft — id). */
export { fixParents };
export async function extractFamily(content, lang) {
  const system = 'You convert family records into structured family-tree data. Be exhaustive and precise.';
  const base = { role: 'user', content: [...content, { type: 'text', text: PARSE_PROMPT(lang) }] };
  const opts = { max_tokens: 60000, json: true, mode: 'deep', output_config: { effort: 'medium' }, system };
  const r = await ask({ ...opts, messages: [base] });
  let raw = textOf(r);
  const { rows, summary } = parsePeople(raw);
  const seen = new Set(rows.map((x) => x.id));
  const sig = (x) => `${x.name.toLowerCase()}|${x.birth.slice(-4)}`;
  const sigs = new Set(rows.map(sig));
  // Model ro'yxatni erta to'xtatsa — yetishmaganlarini so'rab davom ettiramiz
  const expected = estimatePeople(content);
  const needMore = () => (expected ? rows.length < expected * 0.85 : true);
  const turns = [base, { role: 'assistant', content: raw }];
  let round = 0;
  for (; round < 8 && rows.length && needMore(); round++) {
    const next = Math.max(0, ...[...seen].map(Number).filter(Number.isFinite)) + 1;
    turns.push({ role: 'user', content: MORE_PROMPT(rows.length, next) });
    const more = await ask({ ...opts, messages: turns });
    raw = textOf(more);
    turns.push({ role: 'assistant', content: raw });
    const add = parsePeople(raw).rows.filter((x) => !sigs.has(sig(x)));
    if (!add.length) break;
    for (const x of add) {
      if (seen.has(x.id)) x.id = `x${seen.size + 1}`;
      seen.add(x.id);
      sigs.add(sig(x));
      rows.push(x);
    }
  }
  return { rows: fixParents(rows.slice(0, 3000)), summary, rounds: round };
}

/** Qatorlarni namuna.csv formatida qaytarish (ota/ona/juft — ism bilan). */
export function rowsToCsv(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const nm = (id) => byId.get(id)?.name || '';
  const head = 'ism;jins;tugilgan;vafot;ota;ona;turmush_ortogi;joy;telefon;izoh';
  const cell = (v) => (/[;"\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
  return '﻿' + [head, ...rows.map((r) => [r.name, r.gender === 'f' ? 'ayol' : 'erkak', r.birth, r.death === '+' ? 'vafot' : r.death,
    nm(r.father), nm(r.mother), nm(r.spouse), '', '', r.note].map(cell).join(';'))].join('\n');
}

export async function aiHealth() {
  const t = Date.now();
  const r = await ask({ max_tokens: 300, mode: 'fast', output_config: { effort: 'low' }, messages: [{ role: 'user', content: 'Say OK' }] });
  return { ok: true, ms: Date.now() - t, model: r.model, provider: process.env.GEMINI_API_KEY ? 'gemini' : DIRECT() ? 'anthropic' : 'gateway' };
}
