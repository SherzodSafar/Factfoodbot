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

const routeUrl = (from, to, date) => {
  const [y, m, d] = date.split('-');
  return `${BASE}/sale/default/route/search?route_search_form%5BdepartureStation%5D=${from}&route_search_form%5BarrivalStation%5D=${to}&route_search_form%5BforwardDepartureDate%5D=${d}-${m}-${y}&_locale=ru`;
};
const trainsOf = (html) => uniq([...html.matchAll(/data-train="([^"]+)"/g)].map((x) => x[1])).join(', ');

export async function runForeignProbe() {
  const date = day(14);
  const page = await get('KTZ ru', routeUrl('2700000', '2900000', date));
  log('KTZ ru poyezdlar', trainsOf(page));
  const idx = page.indexOf('data-train="');
  const chunk = flat(page.slice(Math.max(0, idx - 2500), idx + 5000));
  for (let i = 0; i < chunk.length; i += 2400) log(`KTZ train html ${i / 2400 + 1}`, chunk.slice(i, i + 2400));
  log('KTZ minPrices', around(page, 'minPricesForDates-item', 2, 400));

  const codes = new Set();
  for (const q of ['Ташкент', 'Алматы', 'Шымкент', 'Туркестан', 'Астана', 'Тараз', 'Сарыагаш']) {
    const json = await get(`KTZ bekat ${q}`, `${BASE}/api/v1/ktj/station/search?q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
    for (const code of json.match(/\b2[0-9]\d{5}\b/g) || []) codes.add(code);
  }
  log('KTZ kodlar', [...codes].join(', '));
  const rev = await get('KTZ teskari', routeUrl('2900000', '2700000', date));
  log('KTZ teskari poyezdlar', trainsOf(rev));
  for (const code of [...codes].filter((c) => c.startsWith('27') && c !== '2700000').slice(0, 6)) {
    log(`KTZ ${code}→2900000`, trainsOf(await get(`KTZ yo'nalish ${code}`, routeUrl(code, '2900000', date))));
  }
}

export default { runForeignProbe };
