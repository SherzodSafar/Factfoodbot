// Kinoni aniqlashning to'liq jarayoni:
//   1) Gemini dalillarni tahlil qiladi (aktyorlar, kalit so'zlar, taxminlar)
//   2) Wikipedia/Wikidata'dan nomzodlar qidiriladi (yangi kinolar ham)
//   3) Gemini nomzodlar orasidan tanlaydi
//   4) Aniq bo'lmasa — ovoz subtitrga aylantirilib, jarayon dialog bilan qaytariladi
import { analyze, choose, transcribe } from './identify.js';
import { actorFilms, labels, pageDetails, searchPages, wikidataDetails } from './wiki.js';

const CONFIDENT = 0.7; // shundan past bo'lsa — ovoz (subtitr) bo'yicha ham tekshiramiz
export const MIN_CONFIDENCE = 0.4; // shundan past bo'lsa — "topilmadi"

const settled = async (promises) =>
  (await Promise.allSettled(promises)).flatMap((r) => {
    if (r.status === 'rejected') console.warn('Wiki xatosi:', r.reason?.message);
    return r.status === 'fulfilled' ? r.value : [];
  });

/** Tahlil natijasi bo'yicha Wikipedia'dan nomzod filmlar ro'yxati (15 tagacha). */
export async function retrieve(analysis) {
  if (!analysis) return [];
  const yearOf = (c) => (c.year ? ` ${c.year}` : '');

  // Har bir qidiruv manbasi: qaysi til, qayerdan (taxmin / qidiruv / aktyor) va natijasi
  const tasks = [
    ...analysis.candidates.slice(0, 2).map((c) => ({
      lang: 'en', src: 'taxmin', run: () => searchPages(`${c.title_en}${yearOf(c)} film`, 'en', 2),
    })),
    ...analysis.queries.filter((q) => q.lang === 'en').slice(0, 2).map((q) => ({
      lang: 'en', src: 'qidiruv', run: () => searchPages(q.q, 'en', 3),
    })),
    ...analysis.queries.filter((q) => q.lang === 'ru').slice(0, 1).map((q) => ({
      lang: 'ru', src: 'qidiruv', run: () => searchPages(q.q, 'ru', 3),
    })),
    ...analysis.actors.slice(0, 2).map((a) => ({
      lang: 'en', src: `aktyor: ${a}`, actor: true, run: () => actorFilms(a, 8),
    })),
  ];
  const results = await Promise.allSettled(tasks.map((t) => t.run()));

  const sources = new Map(); // "til:nom" -> manbalar
  const en = [];
  const ru = [];
  const actorItems = [];
  results.forEach((r, i) => {
    const t = tasks[i];
    if (r.status === 'rejected') {
      console.warn('Wiki xatosi:', r.reason?.message);
      return;
    }
    for (const item of r.value) {
      const title = t.actor ? item.title : item;
      if (t.actor) actorItems.push(item);
      (t.lang === 'ru' ? ru : en).push(title);
      const key = `${t.lang}:${title}`;
      if (!sources.has(key)) sources.set(key, new Set());
      sources.get(key).add(t.src);
    }
  });

  const [enRes, ruRes] = await Promise.allSettled([pageDetails(en, 'en'), pageDetails(ru, 'ru')]);
  let pages = [...(enRes.value || []), ...(ruRes.value || [])];
  if (enRes.status === 'rejected') {
    // Wikipedia javob bermadi — aktyor filmlari bo'yicha Wikidata'dan qisqa ma'lumot olamiz
    console.warn('Wikipedia xatosi:', enRes.reason?.message, '— Wikidata zaxirasi');
    pages = [...(await wikidataDetails(actorItems).catch(() => [])), ...pages];
  }
  for (const p of pages) p.sources = [...(sources.get(`${p.lang}:${p.title}`) || [])];

  // Tanilgan aktyorlardan ko'prog'i o'ynagan nomzodlar oldinga chiqadi
  const actorHits = (p) => p.sources.filter((x) => x.startsWith('aktyor')).length;
  pages = pages
    .map((p, i) => ({ p, i }))
    .sort((a, b) => actorHits(b.p) - actorHits(a.p) || a.i - b.i)
    .map((x) => x.p);

  // Bir xil film (Wikidata ID) takrorlanmasin; inglizcha sahifa afzal
  const seen = new Set();
  const unique = [];
  for (const p of pages) {
    const key = p.qid || `${p.lang}:${p.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
  }
  const list = unique.slice(0, 15);

  const need = list.filter((p) => !p.labels);
  try {
    const names = need.length ? await labels(need.map((p) => p.qid)) : {};
    for (const p of need) p.labels = names[p.qid] || null;
  } catch (err) {
    console.warn('Wikidata nomlari xatosi:', err.message);
  }
  console.log(`📚 Wikipedia nomzodlari: ${list.map((p) => p.title).join(' | ') || '-'}`);
  return list;
}

async function runOnce(input) {
  const analysis = await analyze(input);
  const candidates = await retrieve(analysis).catch((err) => {
    console.warn('Qidiruv (Wikipedia) xatosi:', err.message);
    return [];
  });
  const choice = await choose({ ...input, analysis, candidates });
  if (!choice) return null;
  const picked = choice.index >= 0 ? candidates[choice.index] : null;
  if (!picked) {
    // Nomzodlar orasidan tanlanmadi — faqat model bilimi. Kadrda yoki izohda nomi aniq yozilmagan
    // bo'lsa, ishonchni cheklaymiz (yangi kinolarni eskisi bilan adashtirmaslik uchun).
    const evidence = `${input.text || ''} ${analysis?.on_screen_text || ''}`.toLowerCase();
    const named = [choice.title_en, choice.title_ru, choice.title_original]
      .filter((t) => t && t.length > 2)
      .some((t) => evidence.includes(t.toLowerCase()));
    if (!named) choice.confidence = Math.min(choice.confidence, 0.6);
  }
  if (picked?.labels) {
    // Wikidata'dagi rasmiy nomlar modelning taxminidan ishonchliroq
    choice.title_ru = picked.labels.ru || choice.title_ru;
    choice.title_en = picked.labels.en || choice.title_en;
    choice.title_uz = picked.labels.uz || choice.title_uz;
  }
  return {
    ...choice,
    qid: picked?.qid || null,
    poster: picked?.thumb || null,
    wikiUrl: picked?.url || null,
  };
}

/**
 * @param {{frames: string[], text: string, getAudio?: () => Promise<string|null>}} input
 * @param {(text: string) => Promise<void>} setStatus
 */
export async function identify(input, setStatus = async () => {}) {
  let result = null;
  if (input.frames?.length || input.text) {
    result = await runOnce({ frames: input.frames || [], text: input.text || '' });
  }

  if ((!result || result.confidence < CONFIDENT) && input.getAudio) {
    await setStatus('🎧 Tasvirdan aniq topilmadi — ovozini subtitrga aylantiryapman..');
    const audio = await input.getAudio();
    const transcript = audio ? await transcribe(audio) : '';
    if (transcript) {
      await setStatus("🔎 Dialog (subtitr) bo'yicha qidiryapman..");
      const byAudio = await runOnce({ frames: input.frames || [], text: input.text || '', transcript });
      if (byAudio && (!result || byAudio.confidence >= result.confidence)) {
        result = { ...byAudio, viaAudio: true, transcript };
      }
    }
  }
  return result && result.confidence >= MIN_CONFIDENCE ? result : null;
}
