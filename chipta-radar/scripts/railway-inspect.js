/**
 * eticket.railway.uz saytining ochiq JS fayllaridan API yo'llarini topish (diagnostika).
 *
 * Sayt API hujjatini e'lon qilmagan. Bron qilish, yo'lovchi ma'lumotlari va to'lov
 * qaysi so'rovlar orqali ishlashini bilish uchun saytning brauzerga yuklanadigan
 * ochiq JS fayllari o'qiladi va ulardagi "/v1/..." ko'rinishidagi yo'llar hamda
 * ularning atrofidagi kod parchalari konsolga chiqariladi.
 *
 * Ishga tushirish:
 *   node scripts/railway-inspect.js          (lokal)
 *   RAILWAY_INSPECT=1                         (Render: server ishga tushganda bir marta)
 *
 * Faqat ochiq fayllar o'qiladi, fayllar orasida tanaffus qilinadi.
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.RAILWAY_BASE_URL || 'https://eticket.railway.uz').replace(/\/+$/, '');
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const MAX_FILES = 250;
const MAX_BYTES = 60 * 1024 * 1024;
const DELAY_MS = 250;

const INTEREST =
  /order|book|reserv|passeng|pay|card|basket|cart|auth|login|logout|token|refresh|profile|user|captcha|sms|otp|ticket|seat|place|cabinet|register|verify|confirm|cancel|return|refund|document|citizen|tariff|price/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const out = (...args) => console.log('[inspect]', ...args);

async function get(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: '*/*', 'Accept-Language': 'uz,ru;q=0.9,en;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  return { status: response.status, type: response.headers.get('content-type') || '', text, url: response.url };
}

/** JS fayl ichidagi boshqa JS fayllarga havolalar */
function jsLinks(text, fromUrl) {
  const found = new Set();
  const add = (raw) => {
    if (!raw || raw.length > 300 || /\s/.test(raw)) return;
    try {
      let url;
      if (/^https?:\/\//.test(raw)) url = new URL(raw);
      else if (raw.startsWith('/')) url = new URL(raw, BASE);
      else if (raw.startsWith('./') || raw.startsWith('../')) url = new URL(raw, fromUrl);
      else if (raw.startsWith('static/chunks/') || raw.startsWith('static/')) url = new URL(`/_next/${raw}`, BASE);
      else if (/^_nuxt\//.test(raw) || /^assets\//.test(raw)) url = new URL(`/${raw}`, BASE);
      else if (/^[\w-]+(\.[\w-]+)*\.js$/.test(raw)) url = new URL(raw, fromUrl);
      else return;
      if (url.origin !== new URL(BASE).origin) return;
      if (!/\.m?js(\?|$)/.test(url.pathname)) return;
      found.add(url.href);
    } catch {
      /* e'tiborsiz */
    }
  };
  for (const match of text.matchAll(/["'`]([^"'`\n]{3,300}?\.m?js)["'`]/g)) add(match[1]);
  for (const match of text.matchAll(/(?:src|href)=["']([^"']+\.m?js[^"']*)["']/g)) add(match[1]);

  // Next.js webpack: "static/chunks/"+e+"."+{123:"abcdef..."}[e]+".js"
  if (text.includes('static/chunks/')) {
    for (const map of text.matchAll(/\{((?:\d+:"[0-9a-f]{8,}",?){3,})\}\[e\]\+"\.js"/g)) {
      for (const pair of map[1].matchAll(/(\d+):"([0-9a-f]{8,})"/g)) add(`static/chunks/${pair[1]}.${pair[2]}.js`);
    }
  }
  return [...found];
}

function uniqueSorted(list) {
  return [...new Set(list)].sort();
}

export async function inspectRailwaySite() {
  const started = Date.now();
  out(`Boshlandi: ${BASE}`);

  const pages = [`${BASE}/uz/home`, `${BASE}/uz/cabinet`, `${BASE}/uz/pages/how-to-buy`];
  const queue = [];
  const seen = new Set();
  const files = [];
  let bytes = 0;

  for (const page of pages) {
    try {
      const html = await get(page);
      out(`Sahifa ${page} → ${html.status} ${html.type} ${html.text.length} bayt`);
      if (page === pages[0]) {
        const hints = ['__NEXT_DATA__', '_next/static', '__NUXT__', '_nuxt/', 'ng-version', 'data-v-app', 'id="root"', 'id="app"']
          .filter((hint) => html.text.includes(hint));
        out(`Framework belgilari: ${hints.join(', ') || '—'}`);
        const buildId = html.text.match(/"buildId":"([^"]+)"/)?.[1];
        if (buildId) {
          out(`Next.js buildId: ${buildId}`);
          queue.push(`${BASE}/_next/static/${buildId}/_buildManifest.js`);
        }
        for (const match of html.text.matchAll(/https?:\/\/[^"'\s<>]*?(?:captcha|recaptcha)[^"'\s<>]*/gi)) out(`Captcha havola: ${match[0]}`);
      }
      for (const link of jsLinks(html.text, page)) queue.push(link);
    } catch (error) {
      out(`Sahifa ${page} xato: ${error.message}`);
    }
  }

  while (queue.length && files.length < MAX_FILES && bytes < MAX_BYTES) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const file = await get(url);
      if (file.status !== 200) continue;
      files.push({ url, text: file.text });
      bytes += file.text.length;
      for (const link of jsLinks(file.text, url)) if (!seen.has(link)) queue.push(link);
    } catch (error) {
      out(`JS ${url} xato: ${error.message}`);
    }
    await sleep(DELAY_MS);
  }
  out(`JS fayllar: ${files.length} ta, ${(bytes / 1024 / 1024).toFixed(1)} MB (navbatda qoldi: ${queue.length})`);
  out(`Fayllar: ${files.map((file) => new URL(file.url).pathname.split('/').pop()).join(' ')}`);

  // 1) API yo'llari
  const pathRe = /["'`]((?:https?:\/\/[\w.-]+)?(?:\/api)?\/v\d{1,2}\/[\w\-/{}$.:?=&]{2,160})["'`]/g;
  const paths = [];
  for (const file of files) for (const match of file.text.matchAll(pathRe)) paths.push(match[1]);
  const allPaths = uniqueSorted(paths);
  out(`API yo'llari (${allPaths.length} ta):`);
  for (let i = 0; i < allPaths.length; i += 12) out(`  ${allPaths.slice(i, i + 12).join('  ')}`);

  // 2) API bazasi va sarlavhalar (axios/fetch sozlamalari)
  const configRe = /baseURL|device-type|Authorization|Bearer|X-XSRF|withCredentials|Accept-Language/g;
  let configShown = 0;
  for (const file of files) {
    for (const match of file.text.matchAll(configRe)) {
      if (configShown >= 25) break;
      const at = match.index;
      out(`KONFIG [${match[0]}] …${file.text.slice(Math.max(0, at - 220), at + 260).replace(/\s+/g, ' ')}…`);
      configShown += 1;
    }
  }

  // 3) Qiziq yo'llar atrofidagi kod (usul va yuboriladigan maydonlar ko'rinishi uchun)
  const interesting = allPaths.filter((path) => INTEREST.test(path));
  out(`Qiziq yo'llar: ${interesting.length} ta`);
  for (const path of interesting) {
    let shown = 0;
    for (const file of files) {
      let at = file.text.indexOf(path);
      while (at !== -1 && shown < 2) {
        out(`KOD [${path}] …${file.text.slice(Math.max(0, at - 350), at + 450).replace(/\s+/g, ' ')}…`);
        shown += 1;
        at = file.text.indexOf(path, at + path.length);
      }
      if (shown >= 2) break;
    }
  }

  // 4) Captcha / SMS / to'lov belgilari
  const markers = ['recaptcha', 'smartcaptcha', 'hcaptcha', 'turnstile', 'captcha', 'sitekey', 'otp', 'smsCode', 'paymentUrl', 'redirectUrl', 'expire', 'timer'];
  for (const marker of markers) {
    let count = 0;
    let sample = '';
    for (const file of files) {
      const re = new RegExp(marker, 'gi');
      const hits = file.text.match(re);
      if (hits) {
        count += hits.length;
        if (!sample) {
          const at = file.text.search(re);
          sample = file.text.slice(Math.max(0, at - 200), at + 250).replace(/\s+/g, ' ');
        }
      }
    }
    if (count) out(`BELGI [${marker}] ${count} marta: …${sample}…`);
  }

  // 5) Angular yo'nalishlari (sahifa manzillari: to'lov, kabinet va h.k.)
  const routes = [];
  for (const file of files) for (const match of file.text.matchAll(/path:"([^"]{1,80})"/g)) routes.push(match[1]);
  out(`Sahifa yo'llari: ${uniqueSorted(routes).join('  ')}`);

  // 6) Chuqur ko'rish: RAILWAY_INSPECT_NEEDLES="reserveSelectedExpressSeats(,addPassengerToOrder(" — har bir
  //    uchrashgan joy atrofidagi kod keng oynada (RAILWAY_INSPECT_WINDOW, standart 2500 belgi) chiqariladi
  const needles = (process.env.RAILWAY_INSPECT_NEEDLES || '').split('|').map((item) => item.trim()).filter(Boolean);
  const windowSize = Number(process.env.RAILWAY_INSPECT_WINDOW) || 2500;
  const maxHits = Number(process.env.RAILWAY_INSPECT_MAX_HITS) || 4;
  for (const needle of needles) {
    let hit = 0;
    for (const file of files) {
      let at = file.text.indexOf(needle);
      while (at !== -1 && hit < maxHits) {
        hit += 1;
        const chunk = file.text.slice(Math.max(0, at - windowSize), at + windowSize).replace(/\s+/g, ' ');
        const parts = Math.ceil(chunk.length / 1800);
        for (let i = 0; i < parts; i += 1) {
          out(`IGNA [${needle}] #${hit} ${i + 1}/${parts}: ${chunk.slice(i * 1800, (i + 1) * 1800)}`);
        }
        at = file.text.indexOf(needle, at + needle.length);
      }
    }
    if (!hit) out(`IGNA [${needle}] topilmadi`);
  }

  out(`Tugadi: ${Math.round((Date.now() - started) / 1000)} s`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  inspectRailwaySite().catch((error) => {
    console.error('[inspect] xato:', error);
    process.exit(1);
  });
}

export default inspectRailwaySite;
