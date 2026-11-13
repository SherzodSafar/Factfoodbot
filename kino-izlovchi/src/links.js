import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { config } from './config.js';
import { download, extractAudio, extractFrames, ffmpegBin } from './frames.js';

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

    try {
      const { stdout } = await ytdlp(['-J', link], dir);
      meta = JSON.parse(stdout);
      // Ba'zi Instagram postlarida bir nechta video bo'ladi — birinchisini olamiz
      if (meta._type === 'playlist' && meta.entries?.length) meta = { ...meta, ...meta.entries[0] };
    } catch (err) {
      console.warn('yt-dlp -J xatosi:', err.stderr?.slice?.(0, 300) || err.message);
    }

    // Faqat boshidagi ~90 soniyani, past sifatda yuklaymiz — tez va yengil
    try {
      const args = [
        '-f', 'best[height<=480][ext=mp4]/best[height<=480]/worst[ext=mp4]/worst',
        '--max-filesize', '80M',
        '-o', path.join(dir, 'video.%(ext)s'),
        link,
      ];
      if (!meta.duration || meta.duration > 120) {
        args.unshift('--download-sections', '*0-90');
        // Faqat to'liq yo'l berilganda ko'rsatamiz; "ffmpeg" (PATH'dagi) bo'lsa yt-dlp o'zi topadi
        if (ffmpegBin().includes('/')) args.unshift('--ffmpeg-location', ffmpegBin());
      }
      await ytdlp(args, dir);
      const file = (await readdir(dir)).find((f) => f.startsWith('video.') && !f.endsWith('.part'));
      if (file) {
        videoBuf = await readFile(path.join(dir, file));
        frames = await extractFrames(videoBuf, Math.min(meta.duration || 30, 90));
      }
    } catch (err) {
      console.warn('yt-dlp yuklash xatosi:', err.stderr?.slice?.(0, 300) || err.message);
    }

    // Video olinmadi — hech bo'lmasa muqova rasmini olamiz
    if (!frames.length) {
      const oe = await oembed(link).catch(() => null);
      if (oe) meta = { title: oe.title, uploader: oe.author_name, ...meta };
      const thumb = meta.thumbnail || oe?.thumbnail_url;
      if (thumb) {
        const buf = await download(thumb).catch(() => null);
        if (buf) frames = [buf.toString('base64')];
      }
    }

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
