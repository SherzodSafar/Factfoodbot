import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { config } from './config.js';

const run = promisify(execFile);

/** ffmpeg yo'li: FFMPEG_PATH > ffmpeg-static > tizimdagi "ffmpeg". */
export function ffmpegBin() {
  if (config.ffmpegPath) return config.ffmpegPath;
  if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic;
  return 'ffmpeg';
}

/** Havoladan baytlarni yuklab oladi. */
export async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Faylni yuklab bo'lmadi: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const SCALE = "scale='min(1024,iw)':-2";

/** Istalgan rasmni (webp, png, heic...) JPEG base64'ga o'giradi. */
export async function toJpeg(imageBuffer) {
  const dir = await mkdtemp(path.join(tmpdir(), 'img-'));
  try {
    const input = path.join(dir, 'in');
    const out = path.join(dir, 'out.jpg');
    await writeFile(input, imageBuffer);
    await run(ffmpegBin(), ['-v', 'error', '-i', input, '-frames:v', '1', '-vf', SCALE, '-q:v', '4', '-y', out], {
      timeout: 30_000,
    });
    return (await readFile(out)).toString('base64');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Videodan audio yo'lini ajratadi (mono, 16 kHz, mp3) — subtitr uchun.
 * Qaytaradi: base64 mp3 yoki null (ovoz bo'lmasa).
 */
export async function extractAudio(videoBuffer, maxSec = 120) {
  const dir = await mkdtemp(path.join(tmpdir(), 'aud-'));
  try {
    const input = path.join(dir, 'input');
    const out = path.join(dir, 'audio.mp3');
    await writeFile(input, videoBuffer);
    await run(ffmpegBin(), [
      '-v', 'error', '-i', input, '-t', String(maxSec),
      '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '32k', '-y', out,
    ], { timeout: 60_000 });
    const buf = await readFile(out);
    // 1 soniyadan qisqa audio (~4 KB) — amalda ovozsiz
    return buf.length > 4000 ? buf.toString('base64') : null;
  } catch {
    return null; // videoda audio yo'li yo'q
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Videodan teng oraliqlarda `count` ta kadr (JPEG) ajratadi.
 * Qaytaradi: base64 satrlar massivi.
 */
export async function extractFrames(videoBuffer, durationSec, count = 6) {
  const dir = await mkdtemp(path.join(tmpdir(), 'kino-'));
  try {
    const input = path.join(dir, 'input.mp4');
    await writeFile(input, videoBuffer);

    const duration = durationSec && durationSec > 0 ? durationSec : 10;
    const times = Array.from({ length: count }, (_, i) => Math.max(0, (duration * (i + 0.5)) / count));

    const frames = [];
    for (const [i, t] of times.entries()) {
      const out = path.join(dir, `f${i}.jpg`);
      try {
        await run(ffmpegBin(), [
          '-v', 'error', '-ss', t.toFixed(2), '-i', input,
          '-frames:v', '1', '-vf', SCALE, '-q:v', '4', '-y', out,
        ], { timeout: 30_000 });
        frames.push((await readFile(out)).toString('base64'));
      } catch {
        // Ba'zi vaqt nuqtalarida kadr bo'lmasligi mumkin — o'tkazib yuboramiz
      }
    }
    return frames;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
