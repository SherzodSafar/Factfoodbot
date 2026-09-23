/**
 * Stansiyalarni qidirish (lotin, kirill va ruscha yozuvlar bilan).
 */
const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y',
  к: 'k', қ: 'q', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ў: 'o',
  ф: 'f', х: 'x', ҳ: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e',
  ю: 'yu', я: 'ya',
};

export function normalize(value) {
  let out = '';
  for (const char of String(value ?? '').toLowerCase()) out += CYRILLIC[char] ?? char;
  return out.replace(/['ʻʼ‘’`´]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function skeleton(value) {
  return normalize(value).replace(/kh/g, 'x').replace(/q/g, 'k').replace(/h/g, 'x').replace(/o/g, 'a').replace(/(.)\1+/g, '$1');
}

export function searchStations(stations, query) {
  const q = normalize(query);
  if (!q) return stations;
  const s = skeleton(query);

  return stations
    .map((station) => {
      const names = [station.nameUz, station.nameRu, ...(station.aliases || [])];
      let score = 0;
      for (const name of names) {
        const n = normalize(name);
        if (n === q) score = Math.max(score, 100);
        else if (n.startsWith(q)) score = Math.max(score, 80);
        else if (n.includes(q)) score = Math.max(score, 50);
        const k = skeleton(name);
        if (k.startsWith(s)) score = Math.max(score, 70);
      }
      return { station, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.station);
}
