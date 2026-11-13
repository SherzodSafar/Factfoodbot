// Faqat rasmiy, litsenziyali platformalar. Bot boshqa (pirat) saytlarni hech qachon ko'rsatmaydi.
// Har bir havola — shu platformaning o'zida (yoki Google orqali faqat shu saytda) qidiruv.

const enc = encodeURIComponent;
const google = (query, site) => `https://www.google.com/search?q=${enc(`${query} site:${site}`)}`;

/** @type {Record<'uz'|'ru'|'en', Record<string, {name: string, free?: boolean, url: (t: Titles) => string}>>} */
export const PLATFORMS = {
  uz: {
    itv: { name: 'ITV.uz', url: (t) => google(`(${t.uz} OR ${t.ru})`, 'itv.uz') },
    splay: { name: 'Splay', url: (t) => google(`(${t.uz} OR ${t.ru})`, 'splay.uz') },
    allplay: { name: 'Allplay', url: (t) => google(`(${t.uz} OR ${t.ru})`, 'allplay.uz') },
    youtube: {
      name: "YouTube (o'zbek tilida qidirish)",
      url: (t) => `https://www.youtube.com/results?search_query=${enc(`${t.uz} o'zbek tilida`)}`,
    },
  },
  ru: {
    kinopoisk: { name: 'Кинопоиск', url: (t) => `https://www.kinopoisk.ru/index.php?kp_query=${enc(t.ru)}` },
    ivi: { name: 'Иви', free: true, url: (t) => google(t.ru, 'ivi.ru') },
    okko: { name: 'Okko', url: (t) => google(t.ru, 'okko.tv') },
    start: { name: 'Start', url: (t) => google(t.ru, 'start.ru') },
    wink: { name: 'Wink', url: (t) => google(t.ru, 'wink.ru') },
    premier: { name: 'Premier', url: (t) => google(t.ru, 'premier.one') },
    kion: { name: 'Kion', url: (t) => google(t.ru, 'kion.ru') },
    amediateka: { name: 'Амедиатека', url: (t) => google(t.ru, 'amediateka.ru') },
    youtube: {
      name: 'YouTube (rus tilida qidirish)',
      url: (t) => `https://www.youtube.com/results?search_query=${enc(`${t.ru} фильм`)}`,
    },
  },
  en: {
    justwatch: {
      name: 'JustWatch — barcha platformalar',
      url: (t) => `https://www.justwatch.com/us/search?q=${enc(t.en)}`,
    },
    tubi: { name: 'Tubi', free: true, url: (t) => google(t.en, 'tubitv.com') },
    pluto: { name: 'Pluto TV', free: true, url: (t) => google(t.en, 'pluto.tv') },
    plex: { name: 'Plex', free: true, url: (t) => google(t.en, 'watch.plex.tv') },
    youtube: {
      name: 'YouTube Movies',
      url: (t) => `https://www.youtube.com/results?search_query=${enc(`${t.en} ${t.year || ''} movie`)}`,
    },
    netflix: { name: 'Netflix', url: (t) => `https://www.netflix.com/search?q=${enc(t.en)}` },
    prime: { name: 'Prime Video', url: (t) => `https://www.amazon.com/s?k=${enc(t.en)}&i=instant-video` },
    disney: { name: 'Disney+', url: (t) => google(t.en, 'disneyplus.com') },
    max: { name: 'Max', url: (t) => google(t.en, 'max.com') },
    appletv: { name: 'Apple TV', url: (t) => `https://tv.apple.com/search?term=${enc(t.en)}` },
    hulu: { name: 'Hulu', url: (t) => google(t.en, 'hulu.com') },
    paramount: { name: 'Paramount+', url: (t) => google(t.en, 'paramountplus.com') },
    peacock: { name: 'Peacock', url: (t) => google(t.en, 'peacocktv.com') },
  },
};

/** Model tavsiya qilmasa ham har doim ko'rsatiladiganlar. */
export const DEFAULTS = {
  uz: ['itv', 'splay', 'allplay', 'youtube'],
  ru: ['kinopoisk', 'ivi', 'okko', 'youtube'],
  en: ['justwatch', 'tubi', 'pluto', 'youtube'],
};

export const LANG = {
  uz: { flag: '🇺🇿', name: "o'zbek" },
  ru: { flag: '🇷🇺', name: 'rus' },
  en: { flag: '🇬🇧', name: 'ingliz' },
};

/** Platforma kalitlari ro'yxatini (model tavsiyasi + standartlar) tartiblab, 6 tagacha qaytaradi. */
export function pickPlatforms(lang, suggested = []) {
  const known = PLATFORMS[lang];
  const sugg = suggested.filter((k) => known[k]);
  const all = [...new Set([...sugg, ...DEFAULTS[lang]])].slice(0, 6);
  return all.map((key) => ({ key, ...known[key], suggested: sugg.includes(key) }));
}

/**
 * @typedef {{ uz: string, ru: string, en: string, year?: number|null }} Titles
 */
