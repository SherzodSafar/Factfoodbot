// Ixtiyoriy: TMDB kaliti bo'lsa, kartochkaga poster va reyting qo'shiladi.
import { config } from './config.js';

const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/w500';

export const tmdbEnabled = () => Boolean(config.tmdbKey);

async function get(pathname, params = {}) {
  const url = new URL(BASE + pathname);
  // v4 "Read Access Token" (uzun JWT) yoki v3 api_key — ikkalasi ham qo'llab-quvvatlanadi
  const headers = { accept: 'application/json' };
  if (config.tmdbKey.length > 40) headers.authorization = `Bearer ${config.tmdbKey}`;
  else url.searchParams.set('api_key', config.tmdbKey);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== 0) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`TMDB ${pathname}: ${res.status}`);
  return res.json();
}

/** Aniqlangan kino bo'yicha poster va reytingni topadi. */
export async function findDetails(guess) {
  if (!tmdbEnabled()) return null;
  const kind = guess.kind === 'tv' ? 'tv' : 'movie';
  const yearKey = kind === 'tv' ? 'first_air_date_year' : 'year';
  const queries = [
    { query: guess.title_en, [yearKey]: guess.year },
    { query: guess.title_original, [yearKey]: guess.year },
    { query: guess.title_en },
  ];
  for (const q of queries) {
    if (!q.query) continue;
    const data = await get(`/search/${kind}`, { ...q, language: 'ru-RU' });
    const hit = data.results?.[0];
    if (hit) {
      return {
        poster: hit.poster_path ? IMG + hit.poster_path : null,
        rating: hit.vote_average ? Math.round(hit.vote_average * 10) / 10 : null,
        votes: hit.vote_count || 0,
      };
    }
  }
  return null;
}
