/**
 * VAQTINCHA: xorijiy temir yo'l saytlari (RZD, KTZ, tutu) serverdan ochiladimi — sinov.
 * Natija faqat logga yoziladi. Tekshiruvdan keyin o'chiriladi.
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const short = (text, n = 400) => String(text || '').replace(/\s+/g, ' ').slice(0, n);

async function hit(name, url, { method = 'GET', body = null, headers = {} } = {}) {
  try {
    const res = await fetch(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: { 'User-Agent': UA, Accept: 'application/json, text/html, */*', 'Accept-Language': 'ru-RU,ru;q=0.9', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      signal: AbortSignal.timeout(20_000),
      redirect: 'follow',
    });
    const text = await res.text();
    console.log(`[probe] ${name}: ${res.status} len=${text.length} ${short(text)}`);
    return text;
  } catch (error) {
    console.log(`[probe] ${name}: XATO ${error.cause?.code || ''} ${error.message}`);
    return '';
  }
}

const uniq = (list, n = 30) => [...new Set(list)].slice(0, n);

export async function runForeignProbe() {
  const date = day(14);
  const [y, m, d] = date.split('-');
  // KTZ: qidiruv formasi, skriptlar ichidagi yo'llar
  const home = await hit('KTZ bosh sahifa', 'https://bilet.railways.kz/', {});
  console.log(`[probe] KTZ formalar: ${uniq([...home.matchAll(/<form[^>]*>/g)].map((x) => x[0])).join(' | ').slice(0, 800)}`);
  console.log(`[probe] KTZ maydonlar: ${uniq([...home.matchAll(/name="([^"]+)"/g)].map((x) => x[1])).join(', ').slice(0, 800)}`);
  console.log(`[probe] KTZ data-url: ${uniq([...home.matchAll(/data-[a-z-]*(?:url|path|route)[a-z-]*="([^"]+)"/g)].map((x) => x[1])).join(' | ').slice(0, 800)}`);
  const assets = [...home.matchAll(/<script[^>]+src="(\/assets\/[^"]+)"/g)].map((x) => x[1]);
  for (const src of assets) {
    const js = await hit(`KTZ js ${src}`, `https://bilet.railways.kz${src}`, {});
    const paths = uniq([...js.matchAll(/["'`](\/[a-z]{2}\/[a-z0-9_\/-]{3,80}|\/(?:sale|api|station|route|ajax|search|train)[a-z0-9_\/.-]{0,80})["'`]/gi)].map((x) => x[1]), 40);
    if (paths.length) console.log(`[probe] KTZ yo'llar (${src}): ${paths.join(' | ').slice(0, 1500)}`);
  }
  const q = `route_search_form%5BdepartureStation%5D=2700000&route_search_form%5BarrivalStation%5D=2900000&route_search_form%5BforwardDepartureDate%5D=${d}-${m}-${y}`;
  for (const path of ['/sale/default/route/search', '/ru/sale/default/route/search']) {
    const html = await hit(`KTZ qidiruv ${path}`, `https://bilet.railways.kz${path}?${q}`, {});
    console.log(`[probe] KTZ qidiruv poyezdlar: ${uniq(html.match(/\b\d{3}[А-ЯA-Z]{1,2}\b/g) || [], 20).join(', ')} | Ташкент: ${(html.match(/Ташкент/g) || []).length}`);
  }
  // tutu: jadval sahifasidagi poyezdlar va API yo'llari
  const tutu = await hit('tutu Moskva→Toshkent', 'https://www.tutu.ru/poezda/Moskva/Tashkent/', {});
  const next = tutu.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1] || '';
  console.log(`[probe] tutu NEXT len=${next.length} poyezdlar: ${uniq(next.match(/"(?:trainNumber|number|num)":"?([0-9]{3}[^",]{0,3})/g) || [], 20).join(', ')}`);
  console.log(`[probe] tutu api: ${uniq([...tutu.matchAll(/https?:\/\/[a-z0-9.-]*tutu\.ru\/[a-z0-9_\/.-]*api[a-z0-9_\/.-]*/gi)].map((x) => x[0]), 20).join(' | ')}`);
  await hit('tutu sanali qidiruv', `https://www.tutu.ru/poezda/rasp_d.php?nnst1=2000000&nnst2=2900000&date=${d}.${m}.${y}`, {});
}

export default { runForeignProbe };
