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

const inlineScripts = (html) => [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]).filter((t) => !/gtag|dataLayer/.test(t));

export async function runForeignProbe() {
  const [y, m, d] = day(14).split('-');
  const home = await get('KTZ bosh', `${BASE}/`);
  const assets = [...home.matchAll(/<script[^>]+src="(\/assets\/[^"]+)"/g)].map((x) => x[1]);
  log('KTZ assets', assets.join(' | '));
  for (const src of assets) {
    const js = await get(`KTZ js ${src}`, BASE + src);
    log(`KTZ js yo'llar ${src}`, uniq([...js.matchAll(/["'`](\/[a-z0-9_\-/{}.:]{3,90})["'`]/gi)].map((x) => x[1]), 70).join(' | '));
    log(`KTZ js url ${src}`, uniq([...js.matchAll(/(?:url|action|endpoint|href)\s*[:=]\s*["'`]([^"'`]{2,120})["'`]/g)].map((x) => x[1]), 50).join(' | '));
    log(`KTZ js ajax ${src}`, around(js, 'ajax(', 3, 200) || around(js, 'fetch(', 3, 200));
  }

  const q = `route_search_form%5BdepartureStation%5D=2700000&route_search_form%5BarrivalStation%5D=2900000&route_search_form%5BforwardDepartureDate%5D=${d}-${m}-${y}`;
  const page = await get('KTZ qidiruv sahifa', `${BASE}/sale/default/route/search?${q}`);
  log('KTZ sahifa data-*', uniq([...page.matchAll(/data-[a-z-]+="([^"]{3,300})"/g)].map((x) => x[0]), 40).join(' | '));
  log('KTZ sahifa inline', inlineScripts(page).map(flat).join(' ⟂ ').slice(0, 2500));
  log('KTZ departureStation', around(page, 'departureStation', 3, 300));
  log('KTZ 2900000', around(page, '2900000', 3, 200));
  log('KTZ poyezd/train', around(page, 'train', 4, 200));
  log('KTZ select option', uniq([...page.matchAll(/<option[^>]*value="(\d{7})"[^>]*>([^<]{2,40})</g)].map((x) => `${x[1]}=${x[2]}`), 80).join(', '));

  const ajax = await get('KTZ qidiruv ajax', `${BASE}/sale/default/route/search?${q}`, { headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/html' } });
  log('KTZ ajax atrofi', `Алматы=${(ajax.match(/Алматы/g) || []).length} Ташкент=${(ajax.match(/Ташкент/gi) || []).length} ${around(ajax, 'Алматы', 2, 300)}`);
}

export default { runForeignProbe };
