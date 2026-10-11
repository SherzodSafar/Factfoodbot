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

export async function runForeignProbe() {
  const date = day(14);
  const [y, m, d] = date.split('-');
  const rzdHeaders = { Origin: 'https://ticket.rzd.ru', Referer: 'https://ticket.rzd.ru/' };
  await hit('RZD-new Moskva→Toshkent', 'https://ticket.rzd.ru/apib2b/p/Railway/V1/Search/TrainPricing?service_provider=B2B_RZD', {
    method: 'POST',
    headers: rzdHeaders,
    body: { Origin: '2000000', Destination: '2900000', DepartureDate: `${date}T00:00:00`, TimeFrom: 0, TimeTo: 24, CarGrouping: 'DontGroup', GetByLocalTime: true, SpecialPlacesDemand: 'StandardPlacesAndForDisabledPersons', CarIssuingType: 'All', GetTrainsFromSchedule: true },
  });
  await hit('RZD-suggest Toshkent', 'https://ticket.rzd.ru/api/v1/suggests?Query=%D0%A2%D0%B0%D1%88%D0%BA%D0%B5%D0%BD%D1%82&TransportType=rail&GroupResults=true&RailwaySortPriority=true&Language=ru', { headers: rzdHeaders });
  await hit('RZD-old Moskva→Toshkent', `https://pass.rzd.ru/timetable/public/ru?layer_id=5827&dir=0&tfl=3&checkSeats=1&code0=2000000&code1=2900000&dt0=${d}.${m}.${y}`);
  const ktz = await hit('KTZ bosh sahifa', 'https://bilet.railways.kz/');
  const scripts = [...ktz.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]).slice(0, 6);
  console.log(`[probe] KTZ skriptlar: ${scripts.join(' | ')}`);
  for (const src of scripts.slice(0, 3)) {
    const js = await hit(`KTZ js ${src.slice(-40)}`, new URL(src, 'https://bilet.railways.kz/').href);
    const apis = [...new Set([...js.matchAll(/["'`]((?:https?:\/\/[a-z0-9.-]+)?\/api[^"'`\s]{0,80})["'`]/gi)].map((match) => match[1]))].slice(0, 25);
    if (apis.length) console.log(`[probe] KTZ api yo'llari: ${apis.join(' | ')}`);
  }
  await hit('tutu Moskva→Toshkent', 'https://www.tutu.ru/poezda/Moskva/Tashkent/');
}

export default { runForeignProbe };
