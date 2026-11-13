import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { config } from './config.js';
import { download, extractAudio, extractFrames, ffmpegBin, toJpeg } from './frames.js';

const run = promisify(execFile);

const URL_RE = /https?:\/\/[^\s<>"]+/i;
const SUPPORTED = [
  /(^|\.)instagram\.com$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)tiktok\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)fb\.watch$/i,
  /(^|\.)vk\.com$/i,
  /(^|\.)vkvideo\.ru$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)pinterest\.com$/i,
  /(^|\.)pin\.it$/i,
  /(^|\.)likee\.video$/i,
];

/** Matndan qo'llab-quvvatlanadigan video havolasini topadi. */
export function findVideoLink(text = '') {
  const m = text.match(URL_RE);
  if (!m) return null;
  try {
    const url = new URL(m[0].replace(/[).,!?]+$/, ''));
    return SUPPORTED.some((re) => re.test(url.hostname)) ? url.href : null;
  } catch {
    return null;
  }
}

export function platformName(link) {
  const h = new URL(link).hostname;
  if (/instagram/.test(h)) return 'Instagram';
  if (/youtu/.test(h)) return 'YouTube';
  if (/tiktok/.test(h)) return 'TikTok';
  return h.replace(/^www\./, '');
}

async function ytdlp(args, dir) {
  const full = ['--no-playlist', '--no-warnings', '--ignore-config', ...args];
  if (config.ytdlpCookies) {
    const cookieFile = path.join(dir, 'cookies.txt');
    await writeFile(cookieFile, config.ytdlpCookies);
    full.unshift('--cookies', cookieFile);
  }
  return run(config.ytdlpPath, full, { timeout: 150_000, maxBuffer: 64 * 1024 * 1024 });
}

/** YouTube/TikTok oEmbed — yuklab olish bloklansa ham nom va muqova beradi. */
async function oembed(link) {
  const host = new URL(link).hostname;
  let endpoint = null;
  if (/youtu/.test(host)) endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link)}`;
  else if (/tiktok/.test(host)) endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(link)}`;
  if (!endpoint) return null;
  const res = await fetch(endpoint);
  if (!res.ok) return null;
  return res.json();
}

/** yt-dlp chiqargan JSON'ni o'qiydi (bir nechta video bo'lsa — birinchisi). */
function parseInfo(stdout) {
  const line = String(stdout)
    .split('\n')
    .find((l) => l.trim().startsWith('{'));
  if (!line) return null;
  try {
    const info = JSON.parse(line);
    return info._type === 'playlist' && info.entries?.length ? { ...info, ...info.entries[0] } : info;
  } catch {
    return null;
  }
}

const decodeHtml = (s = '') =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

/** Instagram'ning ommaviy "embed" sahifasidan izoh va muqova (yt-dlp bloklansa). */
async function instagramEmbed(link) {
  const m = link.match(/instagram\.com\/(?:[^/]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const kind = m[1] === 'reels' ? 'reel' : m[1];
  const res = await fetch(`https://www.instagram.com/${kind}/${m[2]}/embed/captioned/`, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const thumb = html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/)?.[1];
  const caption = html.match(/<div class="Caption">([\s\S]*?)<div class="CaptionComments">/)?.[1];
  const author = html.match(/class="UsernameText">([^<]+)</)?.[1];
  if (!thumb && !caption) return null;
  return {
    title: '',
    author_name: author ? decodeHtml(author) : '',
    caption: caption ? decodeHtml(caption).slice(0, 1500) : '',
    thumbnail_url: thumb ? decodeHtml(thumb) : null,
  };
}

function hintText(meta) {
  return [
    meta.title && `Video sarlavhasi: ${meta.title}`,
    meta.uploader && `Muallif: ${meta.uploader}`,
    meta.description && `Tavsif: ${String(meta.description).slice(0, 1200)}`,
    meta.tags?.length && `Teglar: ${meta.tags.slice(0, 20).join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Havoladagi videodan kadrlar va matnli ishoralar (sarlavha, tavsif) oladi.
 * Qaytaradi: { frames: string[], text: string, gotVideo: boolean, getAudio: () => Promise<string|null> }
 */
export async function fromLink(link) {
  const dir = await mkdtemp(path.join(tmpdir(), 'link-'));
  try {
    let meta = {};
    let frames = [];
    let videoBuf = null;
    const t0 = Date.now();

    // Bitta chaqiruvda: ma'lumot (JSON) + videoning faqat boshidagi ~90 soniyasi, past sifatda
    try {
      const args = [
        '--no-simulate', '-j',
        '--download-sections', '*0-90',
        '-f', 'best[height<=480][ext=mp4]/best[height<=480]/worst[ext=mp4]/worst',
        '--max-filesize', '80M',
        '-o', path.join(dir, 'video.%(ext)s'),
        link,
      ];
      // Faqat to'liq yo'l berilganda ko'rsatamiz; "ffmpeg" (PATH'dagi) bo'lsa yt-dlp o'zi topadi
      if (ffmpegBin().includes('/')) args.unshift('--ffmpeg-location', ffmpegBin());
      const { stdout } = await ytdlp(args, dir);
      meta = parseInfo(stdout) || {};
      const file = (await readdir(dir)).find((f) => f.startsWith('video.') && !f.endsWith('.part'));
      if (file) {
        videoBuf = await readFile(path.join(dir, file));
        frames = await extractFrames(videoBuf, Math.min(meta.duration || 30, 90));
      }
    } catch (err) {
      console.warn('yt-dlp yuklash xatosi:', String(err.stderr || err.message).slice(0, 300));
      // Video bloklangan bo'lsa ham, ma'lumot (izoh, muqova) olinishi mumkin
      try {
        const { stdout } = await ytdlp(['-J', link], dir);
        meta = parseInfo(stdout) || {};
      } catch (err2) {
        console.warn('yt-dlp -J xatosi:', String(err2.stderr || err2.message).slice(0, 200));
      }
    }

    // Video olinmadi — hech bo'lmasa muqova rasmini olamiz
    if (!frames.length) {
      const extra = (await oembed(link).catch(() => null)) || (await instagramEmbed(link).catch(() => null));
      if (extra) meta = { title: extra.title, uploader: extra.author_name, description: extra.caption, ...meta };
      const thumb = meta.thumbnail || extra?.thumbnail_url;
      if (thumb) {
        const buf = await download(thumb).catch(() => null);
        const jpeg = buf && (await toJpeg(buf).catch(() => null));
        if (jpeg) frames = [jpeg];
      }
    }
    console.log(`📥 ${platformName(link)}: ${videoBuf ? 'video' : frames.length ? 'faqat muqova' : "olinmadi"}, ${Date.now() - t0}ms`);

    return {
      frames,
      text: hintText(meta),
      gotVideo: Boolean(videoBuf),
      // Audio faqat kerak bo'lganda (tasvirdan topilmasa) ajratiladi
      getAudio: videoBuf ? () => extractAudio(videoBuf, 90) : null,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
