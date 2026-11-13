// "Qayerda ko'rish": faqat rasmiy, litsenziyali manbalar.
// 1) Wikidata'dagi aniq sahifalar (Кинопоиск, Netflix, Apple TV, ... va TMDB "qayerda ko'rish" sahifasi)
// 2) Ular bo'lmasa — rasmiy servislarning o'z qidiruvi (JustWatch, Кинопоиск) va YouTube qidiruvi
import { officialLinks } from './wiki.js';

const enc = encodeURIComponent;

export const LANG = {
  uz: { flag: '🇺🇿', name: "o'zbek" },
  ru: { flag: '🇷🇺', name: 'rus' },
  en: { flag: '🇬🇧', name: 'ingliz' },
};

/**
 * @param {'uz'|'ru'|'en'} lang
 * @param {{qid?: string|null, uz: string, ru: string, en: string, year?: number|null}} film
 * @returns {Promise<Array<{name: string, url: string, direct?: boolean, free?: boolean}>>}
 */
export async function watchLinks(lang, film) {
  let official = [];
  if (film.qid) {
    try {
      official = await officialLinks(film.qid);
    } catch (err) {
      console.warn('Wikidata havolalari xatosi:', err.message);
    }
  }
  const mine = official.filter((l) => l.lang === lang);
  const direct = mine.filter((l) => !l.tmdb && !l.info).map((l) => ({ ...l, direct: true }));
  const tmdb = mine.find((l) => l.tmdb);
  const info = mine.filter((l) => l.info);
  const has = (name) => direct.some((l) => l.name === name);
  const year = film.year ? ` ${film.year}` : '';

  const out = [...direct];
  if (lang === 'ru') {
    if (tmdb) out.push(tmdb);
    if (!has('Кинопоиск')) {
      out.push({ name: 'Кинопоиск (qidiruv)', url: `https://www.kinopoisk.ru/index.php?kp_query=${enc(film.ru)}` });
    }
    out.push({ name: 'YouTube (rus tilida)', url: `https://www.youtube.com/results?search_query=${enc(`${film.ru}${year} фильм`)}` });
  } else if (lang === 'en') {
    if (tmdb) out.push(tmdb);
    if (!has('JustWatch')) {
      out.push({ name: 'JustWatch (qidiruv)', url: `https://www.justwatch.com/us/search?q=${enc(film.en)}` });
    }
    out.push(...info);
  } else {
    out.push({
      name: "YouTube (o'zbek tilida)",
      url: `https://www.youtube.com/results?search_query=${enc(`${film.uz}${year} o'zbek tilida`)}`,
    });
  }
  return out.slice(0, 8);
}
