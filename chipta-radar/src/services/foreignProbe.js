/**
 * VAQTINCHA (foydalanuvchi ruxsati bilan): KTZ (bilet.railways.kz) qidiruvi qanday ishlashini tahlil.
 * Natija faqat logga yoziladi. Tahlildan keyin o'chiriladi.
 */
const BASE = 'https://bilet.railways.kz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const flat = (text) => String(text || '').replace(/\s+/g, ' ');
const uniq = (list, n = 40) => [...new Set(list)].slice(0, n);
const log = (label, value) => console.log(`[probe] ${label}: ${flat(value).slice(0, 2500)}`);

async function get(name, url, { headers = {} } = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json,*/*', 'Accept-Language': 'ru-RU,ru;q=0.9', ...headers },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    log(name, `${res.status} ${res.url} len=${text.length} ${text.slice(0, 300)}`);
    return text;
  } catch (error) {
    log(name, `XATO ${error.cause?.code || ''} ${error.message}`);
    return '';
  }
}

function around(text, word, count = 3, width = 250) {
  const out = [];
  let index = text.indexOf(word);
  while (index !== -1 && out.length < count) {
    out.push(text.slice(Math.max(0, index - width), index + width));
    index = text.indexOf(word, index + width);
  }
  return out.join(' ⟂ ');
}

export async function runForeignProbe() {
  const [y, m, d] = day(14).split('-');
  const home = await get('KTZ bosh', `${BASE}/ru`);
  log('KTZ formalar', uniq([...home.matchAll(/<form[^>]*>/g)].map((x) => x[0])).join(' | '));
  log('KTZ maydonlar', uniq([...home.matchAll(/name="([^"]+)"/g)].map((x) => x[1]), 60).join(', '));
  log('KTZ data-*', uniq([...home.matchAll(/data-[a-z-]+="([^"]*(?:\/|url|route)[^"]*)"/g)].map((x) => x[0]), 30).join(' | '));
  log('KTZ havolalar', uniq([...home.matchAll(/href="(\/[^"]{2,100})"/g)].map((x) => x[1]), 50).join(' | '));
  log('KTZ captcha', `sitekey=${(home.match(/data-sitekey="[^"]+"/) || [''])[0]} g-recaptcha=${home.includes('g-recaptcha')} grecaptcha.execute=${home.includes('grecaptcha.execute')}`);
  log('KTZ inline skript', around(home, 'Routing', 2) || around(home, 'station', 2));

  for (const path of ['/js/routing?callback=fos.Router.setData', '/js/routing.json']) {
    const text = await get(`KTZ routing ${path}`, BASE + path);
    if (text.includes('routes')) log('KTZ routes', uniq([...text.matchAll(/"([a-z0-9_]+)":\{"tokens":\[\["text","([^"]+)"/g)].map((x) => `${x[1]}=${x[2]}`), 120).join(' | '));
  }

  const assets = [...home.matchAll(/<script[^>]+src="(\/assets\/[^"]+)"/g)].map((x) => x[1]);
  for (const src of assets) {
    const js = await get(`KTZ js ${src}`, BASE + src);
    log(`KTZ js yo'llar ${src}`, uniq([...js.matchAll(/["'`](\/[a-z0-9_\-/{}.:]{3,90})["'`]/gi)].map((x) => x[1]), 60).join(' | '));
    log(`KTZ js url/generate ${src}`, uniq([...js.matchAll(/(?:url|action|endpoint)\s*:\s*["'`]([^"'`]{2,100})["'`]|generate\(\s*["']([^"']+)["']/g)].map((x) => x[1] || x[2]), 40).join(' | '));
  }

  const q = `route_search_form%5BdepartureStation%5D=2700000&route_search_form%5BarrivalStation%5D=2900000&route_search_form%5BforwardDepartureDate%5D=${d}-${m}-${y}`;
  for (const path of ['/sale/default/route/search', '/ru/sale/default/route/search']) {
    const html = await get(`KTZ qidiruv ${path}`, `${BASE}${path}?${q}`);
    log('KTZ qidiruv natija', `Ташкент=${(html.match(/Ташкент/g) || []).length} captcha=${html.includes('recaptcha')} formalar=${uniq([...html.matchAll(/<form[^>]*>/g)].map((x) => x[0]), 5).join(' | ')}`);
    log('KTZ qidiruv atrofi', around(html, 'Ташкент', 3));
  }
  for (const path of ['/sale/default/station/autocomplete?term=', '/ru/sale/default/station/autocomplete?term=', '/station/autocomplete?term=', '/api/stations?query=']) {
    await get(`KTZ bekat ${path}`, `${BASE}${path}${encodeURIComponent('Ташкент')}`, { headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } });
  }
}

export default { runForeignProbe };
