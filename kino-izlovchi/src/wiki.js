// Wikipedia / Wikidata — bepul, kalitsiz, yangi (2025–2026) kinolar haqida ham ma'lumot beradi.
// Sun'iy intellekt bilimidan keyin chiqqan kinolarni topish uchun ishlatiladi.

const UA = 'KinoIzlovchiBot/1.2 (Telegram film identification bot)';
const TIMEOUT = 10_000;

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

const wikiApi = (lang, params) => {
  const u = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  u.search = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  return u;
};

const FILM_RE = /\b(film|movie|series|sitcom|miniseries|television|anime|documentary)\b|фильм|сериал|мультфильм|аниме/i;

/** Wikipedia'da to'liq matnli qidiruv. Qaytaradi: sahifa nomlari. */
export async function searchPages(query, lang = 'en', limit = 5) {
  const d = await getJson(
    wikiApi(lang, { action: 'query', list: 'search', srsearch: query, srlimit: String(limit), srnamespace: '0' }),
  );
  return (d.query?.search || []).map((s) => s.title);
}

/** Sahifalar haqida qisqa ma'lumot: tavsif, kirish qismi, poster, Wikidata ID. */
export async function pageDetails(titles, lang = 'en') {
  const list = [...new Set(titles)].slice(0, 20);
  if (!list.length) return [];
  const d = await getJson(
    wikiApi(lang, {
      action: 'query',
      prop: 'description|extracts|pageimages|pageprops',
      exintro: '1',
      explaintext: '1',
      exsentences: '4',
      exlimit: 'max',
      piprop: 'thumbnail',
      pithumbsize: '500',
      pilicense: 'any',
      pilimit: 'max',
      ppprop: 'wikibase_item',
      redirects: '1',
      titles: list.join('|'),
    }),
  );
  const pages = (d.query?.pages || []).filter((p) => !p.missing && !p.invalid);
  // Natijani so'ralgan tartibda qaytaramiz (birinchi o'rindagilar — eng ishonchli manbalardan)
  const order = new Map(list.map((t, i) => [t, i]));
  for (const r of d.query?.redirects || []) order.set(r.to, order.get(r.from) ?? 99);
  for (const n of d.query?.normalized || []) order.set(n.to, order.get(n.from) ?? 99);
  return pages
    .map((p) => ({
      title: p.title,
      lang,
      description: p.description || '',
      extract: (p.extract || '').replace(/\s+/g, ' ').slice(0, 700),
      thumb: p.thumbnail?.source || null,
      qid: p.pageprops?.wikibase_item || null,
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
    }))
    .filter((p) => FILM_RE.test(`${p.description} ${p.extract.slice(0, 200)}`))
    .sort((a, b) => (order.get(a.title) ?? 99) - (order.get(b.title) ?? 99));
}

/** Aktyorning eng so'nggi film va seriallari (Wikidata SPARQL), yangilari birinchi. */
export async function actorFilms(name, limit = 12) {
  const safe = name.replace(/["\\\n]/g, '').trim();
  if (!safe) return [];
  const sparql = `SELECT ?title (MAX(?d) AS ?date) WHERE {
  ?actor rdfs:label "${safe}"@en ; wdt:P31 wd:Q5 .
  ?film wdt:P161 ?actor ; wdt:P31 ?type .
  VALUES ?type { wd:Q11424 wd:Q5398426 wd:Q506240 wd:Q1259759 wd:Q202866 wd:Q229390 }
  OPTIONAL { ?film wdt:P577 ?d }
  ?article schema:about ?film ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title .
} GROUP BY ?title ORDER BY DESC(?date) LIMIT ${limit}`;
  const u = new URL('https://query.wikidata.org/sparql');
  u.search = new URLSearchParams({ query: sparql, format: 'json' });
  const d = await getJson(u);
  return (d.results?.bindings || []).map((b) => b.title.value);
}

/** Bir nechta Wikidata obyektining nomlari (en / ru / uz). */
export async function labels(qids) {
  const ids = [...new Set(qids.filter(Boolean))].slice(0, 50);
  if (!ids.length) return {};
  const u = new URL('https://www.wikidata.org/w/api.php');
  u.search = new URLSearchParams({
    action: 'wbgetentities', ids: ids.join('|'), props: 'labels', languages: 'en|ru|uz', format: 'json',
  });
  const d = await getJson(u);
  const out = {};
  for (const [id, e] of Object.entries(d.entities || {})) {
    out[id] = { en: e.labels?.en?.value || '', ru: e.labels?.ru?.value || '', uz: e.labels?.uz?.value || '' };
  }
  return out;
}

// ---------- Rasmiy platformalardagi aniq sahifalar (Wikidata tashqi identifikatorlari) ----------

const propCache = new Map(); // P-raqam -> { label, formatter }
const entityCache = new Map(); // Q-raqam -> { at, entity }

async function getEntity(qid) {
  const hit = entityCache.get(qid);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.entity;
  const u = new URL('https://www.wikidata.org/w/api.php');
  u.search = new URLSearchParams({
    action: 'wbgetentities', ids: qid, props: 'labels|claims', languages: 'en|ru|uz', format: 'json',
  });
  const d = await getJson(u);
  const entity = d.entities?.[qid];
  entityCache.set(qid, { at: Date.now(), entity });
  if (entityCache.size > 500) entityCache.delete(entityCache.keys().next().value);
  return entity;
}

async function propInfo(pids) {
  const missing = pids.filter((p) => !propCache.has(p));
  for (let i = 0; i < missing.length; i += 50) {
    const chunk = missing.slice(i, i + 50);
    const u = new URL('https://www.wikidata.org/w/api.php');
    u.search = new URLSearchParams({
      action: 'wbgetentities', ids: chunk.join('|'), props: 'labels|claims', languages: 'en', format: 'json',
    });
    const d = await getJson(u);
    for (const pid of chunk) {
      const e = d.entities?.[pid];
      const formatter = e?.claims?.P1630?.find((c) => c.rank !== 'deprecated')?.mainsnak?.datavalue?.value || '';
      propCache.set(pid, { label: e?.labels?.en?.value || '', formatter });
    }
  }
  return Object.fromEntries(pids.map((p) => [p, propCache.get(p)]));
}

// Qaysi tashqi identifikator qaysi platforma va qaysi til uchun
const RULES = [
  { re: /netflix/i, name: 'Netflix', lang: 'en' },
  { re: /disney\+/i, name: 'Disney+', lang: 'en' },
  { re: /apple tv/i, name: 'Apple TV', lang: 'en' },
  { re: /prime video|amazon prime/i, name: 'Prime Video', lang: 'en' },
  { re: /\bhbo max\b|^max\b/i, name: 'Max', lang: 'en' },
  { re: /\bhulu\b/i, name: 'Hulu', lang: 'en' },
  { re: /paramount\+/i, name: 'Paramount+', lang: 'en' },
  { re: /\bpeacock\b/i, name: 'Peacock', lang: 'en' },
  { re: /\btubi\b/i, name: 'Tubi', lang: 'en', free: true },
  { re: /pluto ?tv/i, name: 'Pluto TV', lang: 'en', free: true },
  { re: /justwatch/i, name: 'JustWatch', lang: 'en' },
  { re: /kinopoisk/i, name: 'Кинопоиск', lang: 'ru' },
  { re: /\bivi\b/i, name: 'Иви', lang: 'ru' },
  { re: /\bokko\b/i, name: 'Okko', lang: 'ru' },
  { re: /\bwink\b/i, name: 'Wink', lang: 'ru' },
  { re: /\bpremier\b/i, name: 'Premier', lang: 'ru' },
  { re: /\bkion\b/i, name: 'Kion', lang: 'ru' },
  { re: /amediateka/i, name: 'Амедиатека', lang: 'ru' },
];

/**
 * Film uchun rasmiy sahifalar: platformalar, TMDB (qayerda ko'rish), IMDb.
 * Qaytaradi: [{ name, url, lang, free? }] yoki bo'sh massiv.
 */
export async function officialLinks(qid) {
  if (!/^Q\d+$/.test(qid || '')) return [];
  const e = await getEntity(qid);
  if (!e?.claims) return [];
  const ext = [];
  for (const [pid, claims] of Object.entries(e.claims)) {
    const snak = claims.find((c) => c.rank !== 'deprecated')?.mainsnak;
    if (snak?.datatype === 'external-id' && typeof snak.datavalue?.value === 'string') {
      ext.push({ pid, value: snak.datavalue.value });
    }
  }
  const info = await propInfo(ext.map((x) => x.pid));
  const links = [];
  const seen = new Set();
  for (const { pid, value } of ext) {
    const { label, formatter } = info[pid] || {};
    if (!label) continue;
    const enc = encodeURIComponent(value).replace(/%2F/g, '/');
    if (pid === 'P4947' || pid === 'P4983') {
      const kind = pid === 'P4947' ? 'movie' : 'tv';
      links.push({ name: 'TMDB — rasmiy platformalar', url: `https://www.themoviedb.org/${kind}/${value}/watch?locale=RU`, lang: 'ru', tmdb: true });
      links.push({ name: 'TMDB — rasmiy platformalar', url: `https://www.themoviedb.org/${kind}/${value}/watch?locale=US`, lang: 'en', tmdb: true });
      continue;
    }
    if (pid === 'P345') {
      links.push({ name: 'IMDb', url: `https://www.imdb.com/title/${enc}/`, lang: 'en', info: true });
      continue;
    }
    const rule = RULES.find((r) => r.re.test(label));
    if (!rule || !formatter.includes('$1') || seen.has(rule.name)) continue;
    seen.add(rule.name);
    links.push({ name: rule.name, url: formatter.replace('$1', enc), lang: rule.lang, free: rule.free });
  }
  return links;
}
