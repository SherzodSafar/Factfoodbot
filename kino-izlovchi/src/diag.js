// Bir martalik tekshiruv: server ishga tushganda DIAG=1 bo'lsa, tashqi xizmatlarga ulanishni
// va butun jarayonni sinab, natijani logga yozadi. Oddiy ishda o'chiq turadi.
import { fromLink } from './links.js';
import { identify } from './pipeline.js';
import { watchLinks } from './platforms.js';
import { actorFilms, officialLinks, pageDetails, searchPages } from './wiki.js';

const log = (...a) => console.log('[DIAG]', ...a);

async function step(name, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    const s = typeof r === 'string' ? r : JSON.stringify(r);
    log(`${name} OK ${Date.now() - t0}ms ${s.slice(0, 900)}`);
    return r;
  } catch (err) {
    log(`${name} FAIL ${Date.now() - t0}ms ${String(err?.message || err).slice(0, 300)}`);
    return null;
  }
}

export async function runDiag() {
  log('boshlandi');
  const full = process.env.DIAG_FULL === '1';
  if (full) {
    await step('wiki-search-en', () => searchPages('Alan Ritchson courier liver transplant film'));
    await step('wiki-search-ru', () => searchPages('Курьер фильм 2026 Ричсон', 'ru'));
    await step('actor-films', () => actorFilms('Alan Ritchson'));
  }
  const pages = !full ? null : await step('page-details', () =>
    pageDetails(['Bumblebee (film)', 'Ordinary Angels (film)']).then((p) =>
      p.map(({ title, description, qid, thumb }) => ({ title, description, qid, thumb: Boolean(thumb) })),
    ),
  );
  const qid = pages?.[0]?.qid;
  if (qid) {
    await step('official-links', () => officialLinks(qid));
    for (const lang of ['uz', 'ru', 'en']) {
      await step(`watch-${lang}`, () =>
        watchLinks(lang, { qid, uz: 'Bamblbi', ru: 'Бамблби', en: 'Bumblebee', year: 2018 }).then((l) =>
          l.map((x) => `${x.name} ${x.url}`),
        ),
      );
    }
  }
  await step('tmdb-api', async () => (await fetch('https://api.themoviedb.org/3/configuration')).status);

  const link = process.env.DIAG_LINK || 'https://www.instagram.com/reel/DfcN2JIxKpT/';
  let r = null;
  await step('link-download', async () => {
    r = await fromLink(link);
    log(`link-text: ${r.text.replace(/\s+/g, ' ').slice(0, 400)}`);
    return { frames: r.frames.length, gotVideo: r.gotVideo, hasAudio: Boolean(r.getAudio) };
  });
  if (r) {
    await step('identify', async () => {
      const g = await identify({ frames: r.frames, text: r.text, getAudio: r.getAudio }, async (s) => log(`status: ${s}`));
      return g && {
        en: g.title_en, ru: g.title_ru, uz: g.title_uz, year: g.year, conf: g.confidence,
        qid: g.qid, poster: Boolean(g.poster), viaAudio: Boolean(g.viaAudio),
      };
    });
  }
  log('tugadi');
}
