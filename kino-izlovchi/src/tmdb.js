import { config } from './config.js';

const BASE = 'https://api.themoviedb.org/3';
export const IMG = 'https://image.tmdb.org/t/p/w500';

export const tmdbEnabled = () => Boolean(config.tmdbKey);

async function get(pathname, params = {}) {
  const url = new URL(BASE + pathname);
  // v4 "Read Access Token" (uzun JWT) yoki v3 api_key — ikkalasi ham qo'llab-quvvatlanadi
  const headers = { accept: 'application/json' };
  if (config.tmdbKey.length > 40) headers.authorization = `Bearer ${config.tmdbKey}`;
  else url.searchParams.set('api_key', config.tmdbKey);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB ${pathname}: ${res.status}`);
  return res.json();
}

/** Claude topgan nom bo'yicha TMDB'dan to'liq ma'lumot oladi. */
export async function findDetails(guess) {
  if (!tmdbEnabled()) return null;
  const kind = guess.kind === 'tv' ? 'tv' : 'movie';
  const yearKey = kind === 'tv' ? 'first_air_date_year' : 'year';

  const queries = [
    { query: guess.title_original, [yearKey]: guess.year },
    { query: guess.title_original },
    { query: guess.title_ru },
  ];
  let hit = null;
  for (const q of queries) {
    if (!q.query) continue;
    const data = await get(`/search/${kind}`, { ...q, language: 'ru-RU' });
    hit = data.results?.[0];
    if (hit) break;
  }
  if (!hit) return null;
  return getDetails(kind, hit.id);
}

export async function getDetails(kind, id) {
  const d = await get(`/${kind}/${id}`, { language: 'ru-RU' });
  const date = d.release_date || d.first_air_date || '';
  return {
    id: d.id,
    kind,
    title: d.title || d.name,
    originalTitle: d.original_title || d.original_name,
    year: date ? Number(date.slice(0, 4)) : null,
    genres: (d.genres || []).map((g) => g.name),
    rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
    votes: d.vote_count || 0,
    overview: d.overview || '',
    poster: d.poster_path ? IMG + d.poster_path : null,
    imdbId: d.imdb_id || null,
  };
}

/** Qonuniy ko'rish platformalari (TMDB / JustWatch ma'lumotlari). */
export async function getWatchProviders(kind, id) {
  if (!tmdbEnabled()) return null;
  const data = await get(`/${kind}/${id}/watch/providers`);
  const regions = [config.watchRegion, 'US'];
  for (const region of regions) {
    const r = data.results?.[region];
    if (!r) continue;
    const names = new Set();
    for (const list of [r.flatrate, r.free, r.ads, r.rent, r.buy]) {
      for (const p of list || []) names.add(p.provider_name);
    }
    if (names.size) return { region, link: r.link, providers: [...names].slice(0, 10) };
  }
  return null;
}
