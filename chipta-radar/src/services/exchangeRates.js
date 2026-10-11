/**
 * Valyuta kurslari — O'zbekiston Markaziy banki (cbu.uz). Xorijiy narxlar yonida
 * taxminiy so'm qiymatini ko'rsatish uchun. Har 12 soatda yangilanadi.
 */
const URL = 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/';
const REFRESH_MS = 12 * 60 * 60_000;
const rates = {};

/** 1 birlik valyuta necha so'm (noma'lum bo'lsa null) */
export function uzsRate(currency) {
  return rates[currency] || null;
}

export function setUzsRate(currency, rate) {
  if (rate > 0) rates[currency] = rate;
}

async function refresh() {
  const res = await fetch(URL, { signal: AbortSignal.timeout(15_000) });
  const list = await res.json();
  for (const row of Array.isArray(list) ? list : []) {
    if (row?.Ccy === 'KZT') setUzsRate('KZT', Number(row.Rate) / (Number(row.Nominal) || 1));
  }
  return rates.KZT;
}

export async function startExchangeRates() {
  const load = () => refresh()
    .then((rate) => console.log(`✅ Valyuta kursi (cbu.uz): 1 tenge = ${rate ?? '?'} so'm`))
    .catch((error) => console.error('[kurs] cbu.uz dan olib bo\'lmadi:', error.message));
  await load();
  setInterval(load, REFRESH_MS).unref?.();
}

export default { uzsRate, setUzsRate, startExchangeRates };
